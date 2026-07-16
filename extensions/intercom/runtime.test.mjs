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
		this.sent = [];
	}
	isConnected() { return true; }
	pendingCounts() { return { sends: 0, lists: 0, asks: 0 }; }
	async ensureConnected() {}
	async listSessions() { return this.sessions; }
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
