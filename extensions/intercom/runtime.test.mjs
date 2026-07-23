import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { IntercomRuntime } from "./runtime.ts";

function peer(id, name) {
	return { id, name, cwd: "/repo", model: "test", pid: 1, startedAt: 1, lastActivity: 1 };
}

class FakeClient extends EventEmitter {
	constructor(sessions) {
		super();
		this.sessionId = "self";
		this.sessions = sessions;
		this.listResponses = [];
		this.sent = [];
		this.tailCapability = true;
	}
	isConnected() { return true; }
	supportsCapability() { return this.tailCapability; }
	currentPiSessionPresence() { return undefined; }
	pendingCounts() { return { sends: 0, lists: 0, asks: 0 }; }
	async ensureConnected() {}
	async listSessions() { return this.listResponses.shift() ?? this.sessions; }
	async send(to, options) {
		this.sent.push({ to, options });
		return { id: `sent-${this.sent.length}`, delivered: true };
	}
	async ask(to, options, _signal, onRouted) {
		this.sent.push({ to, options });
		onRouted?.({ id: options.messageId, delivered: true });
		const from = this.sessions.find((session) => session.id === to);
		return {
			from,
			message: { id: `reply-${this.sent.length}`, timestamp: 3, replyTo: options.messageId, content: { text: "answer" } },
		};
	}
	setRegistration() {}
	updatePresence() {}
	async disconnect() {}
}

test("runtime reads a stable advertised tail without messaging the target", async () => {
	const presence = { sessionId: "pi-target", fileLocator: "/tmp/session.jsonl", activeLeafId: "leaf", revision: 4 };
	const target = { ...peer("target", "worker"), piSession: presence };
	const client = new FakeClient([peer("self", "caller"), target]);
	let verified = 0;
	let closed = 0;
	const snapshot = { events: [{ kind: "user", text: "confirmed" }], availableTextMessages: 1, returnedTextMessages: 1, truncated: false };
	const runtime = new IntercomRuntime({
		client,
		openTail: (request) => {
			assert.deepEqual(request, { piSessionId: "pi-target", fileLocator: "/tmp/session.jsonl", activeLeafId: "leaf", limit: 8 });
			return { snapshot, verifyStable: () => { verified++; }, close: () => { closed++; } };
		},
	});
	const result = await runtime.tail("worker", 8);
	assert.equal(result.target.id, "target");
	assert.equal(result.snapshot, snapshot);
	assert.equal(verified, 1);
	assert.equal(closed, 1);
	assert.equal(client.sent.length, 0);
	await runtime.dispose();
});

test("runtime rejects unavailable, duplicate, and changed tail advertisements", async () => {
	const presence = { sessionId: "pi-target", fileLocator: "/tmp/session.jsonl", activeLeafId: "leaf", revision: 1 };
	const target = { ...peer("target", "worker"), piSession: presence };
	const opener = () => ({
		snapshot: { events: [], availableTextMessages: 0, returnedTextMessages: 0, truncated: false },
		verifyStable() {},
		close() {},
	});

	const legacyClient = new FakeClient([peer("self", "caller"), target]);
	legacyClient.tailCapability = false;
	await assert.rejects(new IntercomRuntime({ client: legacyClient, openTail: opener }).tail("worker", 8), /does not support/);

	const missingClient = new FakeClient([peer("self", "caller"), peer("target", "worker")]);
	await assert.rejects(new IntercomRuntime({ client: missingClient, openTail: opener }).tail("worker", 8), /does not advertise/);

	const selfClient = new FakeClient([{ ...peer("self", "caller"), piSession: presence }]);
	await assert.rejects(new IntercomRuntime({ client: selfClient, openTail: opener }).tail("self", 8), /Cannot target the current session/);

	const duplicateClient = new FakeClient([peer("self", "caller"), target, { ...peer("duplicate", "other"), piSession: { ...presence, revision: 2 } }]);
	await assert.rejects(new IntercomRuntime({ client: duplicateClient, openTail: opener }).tail("worker", 8), /Multiple connected sessions/);

	const changedClient = new FakeClient([peer("self", "caller"), target]);
	changedClient.listResponses = [changedClient.sessions, [peer("self", "caller"), { ...target, piSession: { ...presence, activeLeafId: "new", revision: 2 } }]];
	let changedClosed = 0;
	await assert.rejects(new IntercomRuntime({ client: changedClient, openTail: () => ({ ...opener(), close: () => { changedClosed++; } }) }).tail("worker", 8), /advertisement changed/);
	assert.equal(changedClosed, 1);

	const disconnectedClient = new FakeClient([peer("self", "caller"), target]);
	disconnectedClient.listResponses = [disconnectedClient.sessions, [peer("self", "caller")]];
	await assert.rejects(new IntercomRuntime({ client: disconnectedClient, openTail: opener }).tail("worker", 8), /advertisement changed/);
});

test("runtime refuses ambiguous duplicate peer names instead of routing arbitrarily", async () => {
	const client = new FakeClient([peer("self", "caller"), peer("one", "worker"), peer("two", "worker")]);
	const runtime = new IntercomRuntime({ client });
	await assert.rejects(runtime.send("worker", "hello"), /Multiple sessions named/);
	assert.equal(client.sent.length, 0);
	assert.equal((await runtime.send("two", "hello")).delivered, true);
	assert.equal(client.sent[0].to, "two");
	await runtime.dispose();
});

test("runtime keeps inbound asks pending until an exact routed reply", async () => {
	const sender = peer("sender", "worker");
	const client = new FakeClient([peer("self", "caller"), sender]);
	const runtime = new IntercomRuntime({ client });
	client.emit("message", sender, { id: "ask-a", timestamp: 1, expectsReply: true, content: { text: "A" } });
	client.emit("message", sender, { id: "ask-b", timestamp: 2, expectsReply: true, content: { text: "B" } });
	assert.deepEqual(runtime.pending().map((entry) => entry.message.id), ["ask-a", "ask-b"]);
	await assert.rejects(runtime.reply("ambiguous", { to: "worker" }), /select one with replyTo/);
	const result = await runtime.reply("answer", { replyTo: "ask-b" });
	assert.equal(result.replyTo, "ask-b");
	assert.deepEqual(client.sent[0], { to: "sender", options: { text: "answer", attachments: undefined, replyTo: "ask-b" } });
	assert.deepEqual(runtime.pending().map((entry) => entry.message.id), ["ask-a"]);
	client.emit("disconnected", new Error("broker stopped"));
	assert.deepEqual(runtime.pending(), []);
	await runtime.dispose();
});

test("delayed reply acknowledgement cannot clear a reused ID from another authoritative sender", async () => {
	const first = peer("first-full-id", "first");
	const second = peer("second-full-id", "second");
	const client = new FakeClient([peer("self", "caller"), first, second]);
	const runtime = new IntercomRuntime({ client });
	let releaseSend;
	let sendStarted;
	const started = new Promise((resolve) => { sendStarted = resolve; });
	client.send = async (to, options) => {
		client.sent.push({ to, options });
		sendStarted();
		await new Promise((resolve) => { releaseSend = resolve; });
		return { id: "delayed-reply", delivered: true };
	};

	client.emit("message", first, { id: "reused-id", timestamp: 1, expectsReply: true, content: { text: "first ask" } });
	const replying = runtime.reply("answer", { replyTo: "reused-id" });
	await started;
	client.emit("session_left", first.id);
	client.emit("message", second, { id: "reused-id", timestamp: 2, expectsReply: true, content: { text: "second ask" } });
	releaseSend();
	await replying;
	assert.equal(runtime.pending().length, 1);
	assert.equal(runtime.pending()[0].from.id, second.id);
	await runtime.dispose();
});

test("expired transcript replies direct-route only with an exact target and reply ID", async () => {
	const sender = peer("sender-full-id", "worker");
	const client = new FakeClient([peer("self", "caller"), sender]);
	const runtime = new IntercomRuntime({ client });
	await assert.rejects(runtime.reply("answer", { replyTo: "expired-ask" }), /No pending/);
	const result = await runtime.reply("answer", { to: sender.id, replyTo: "expired-ask" });
	assert.equal(result.to.id, sender.id);
	assert.equal(result.replyTo, "expired-ask");
	assert.deepEqual(client.sent[0], { to: sender.id, options: { text: "answer", attachments: undefined, replyTo: "expired-ask" } });
	await runtime.dispose();
});

test("expired reply fallback refuses names and inbox sender mismatches", async () => {
	const sender = peer("sender-full-id", "worker");
	const other = peer("other-full-id", "other");
	const client = new FakeClient([peer("self", "caller"), sender, other]);
	const runtime = new IntercomRuntime({ client });
	await assert.rejects(runtime.reply("answer", { to: "worker", replyTo: "expired" }), /No pending/);
	client.emit("message", sender, { id: "ask", timestamp: 1, expectsReply: true, content: { text: "question" } });
	await assert.rejects(runtime.reply("answer", { to: other.id, replyTo: "ask" }), /is not from/);
	assert.equal(client.sent.length, 0);
	await runtime.dispose();
});

test("generic send and ask clear an exact inbox ID only for the resolved authoritative sender", async () => {
	const sender = peer("sender-full-id", "worker");
	const other = peer("other-full-id", "other");
	const client = new FakeClient([peer("self", "caller"), sender, other]);
	const runtime = new IntercomRuntime({ client });

	client.emit("message", sender, { id: "", timestamp: 1, expectsReply: true, content: { text: "empty ID" } });
	await runtime.send("other", "wrong target", undefined, "");
	assert.equal(runtime.pending()[0].message.id, "");
	const sent = await runtime.send("worker", "correct target", undefined, "");
	assert.equal(sent.to.id, "sender-full-id");
	assert.deepEqual(runtime.pending(), []);

	client.emit("message", sender, { id: "ask-2", timestamp: 2, expectsReply: true, content: { text: "second" } });
	await runtime.ask("other", "wrong ask target", undefined, "ask-2");
	assert.equal(runtime.pending()[0].message.id, "ask-2");
	const asked = await runtime.ask("worker", "correct ask target", undefined, "ask-2");
	assert.equal(asked.requestedPeer.id, "sender-full-id");
	assert.deepEqual(runtime.pending(), []);
	await runtime.dispose();
});
