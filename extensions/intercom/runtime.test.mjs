import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { IntercomRuntime } from "./runtime.ts";

function peer(id, name, piSessionId = `pi-${id}`) {
	return { id, piSessionId, name, cwd: "/repo", model: "test", pid: 1, startedAt: 1, lastActivity: 1 };
}

class FakeClient extends EventEmitter {
	constructor(sessions) {
		super();
		this.sessionId = "self";
		this.sessions = sessions;
		this.listResponses = [];
		this.listCalls = 0;
		this.sent = [];
		this.expectedIds = [];
		this.expectedSelectors = [];
		this.expectedTransportIds = [];
		this.tailCapability = true;
		this.roleCapability = true;
		this.role = undefined;
		this.connected = true;
		this.invalidated = 0;
	}
	isConnected() { return this.connected; }
	supportsCapability(capability) {
		if (capability === "pi-session-tail-v1") return this.tailCapability;
		if (capability === "first-mate-role-v1") return this.roleCapability;
		if (capability === "pi-session-identity-v1") return true;
		return false;
	}
	currentPiSessionId() { return this.sessions.find((session) => session.id === this.sessionId)?.piSessionId ?? "pi-self"; }
	currentPiSessionPresence() { return undefined; }
	currentRole() { return this.role; }
	pendingCounts() { return { sends: 0, lists: 0, asks: 0 }; }
	async ensureConnected() {}
	async listSessions() { this.listCalls++; return this.listResponses.shift() ?? this.sessions; }
	async send(to, options, _signal, _onQueued, expectedPiSessionId, expectedTargetSelector, expectedTransportId) {
		this.sent.push({ to, options });
		this.expectedIds.push(expectedPiSessionId);
		this.expectedSelectors.push(expectedTargetSelector);
		this.expectedTransportIds.push(expectedTransportId);
		return { id: `sent-${this.sent.length}`, delivered: true };
	}
	async ask(to, options, _signal, onRouted, _onQueued, _onDeliveryRejected, expectedPiSessionId, expectedTargetSelector, expectedTransportId) {
		this.sent.push({ to, options });
		this.expectedIds.push(expectedPiSessionId);
		this.expectedSelectors.push(expectedTargetSelector);
		this.expectedTransportIds.push(expectedTransportId);
		onRouted?.({ id: options.messageId, delivered: true });
		const from = this.sessions.find((session) => session.id === to);
		return {
			from,
			message: { id: `reply-${this.sent.length}`, timestamp: 3, replyTo: options.messageId, content: { text: "answer" } },
		};
	}
	async setRole(role) { this.role = role ?? undefined; return this.role; }
	invalidateRoleSession() { this.invalidated++; this.role = undefined; this.connected = false; }
	setRegistration() {}
	updatePresence() {}
	async disconnect() {}
}

test("runtime synchronously publishes and clears the capability-gated First Mate role without taking a list", async () => {
	const client = new FakeClient([peer("self", "caller")]);
	const runtime = new IntercomRuntime({ client });
	assert.deepEqual(await runtime.setRole("first-mate"), { sessionId: "pi-self", role: "first-mate" });
	assert.equal(client.role, "first-mate");
	assert.deepEqual(await runtime.setRole(null), { sessionId: "pi-self" });
	assert.equal(client.role, undefined);
	assert.equal(client.listCalls, 0);

	client.tailCapability = true;
	client.roleCapability = false;
	const status = await runtime.status();
	assert.equal(status.tailCapability, true);
	assert.equal(status.roleCapability, false);
	assert.equal(status.advertisingFirstMate, false);
	assert.equal(client.listCalls, 1);
	await assert.rejects(runtime.setRole("first-mate"), /wait for reconnect and invoke First Mate again/);
	await runtime.dispose();
});

test("status awaits initial connection and derives role truth from the current broker list", async () => {
	const client = new FakeClient([{ ...peer("self", "caller"), role: "first-mate" }]);
	client.connected = false;
	let releaseConnection;
	let connectionStarted;
	const started = new Promise((resolve) => { connectionStarted = resolve; });
	client.ensureConnected = async () => {
		if (client.connected) return;
		connectionStarted();
		await new Promise((resolve) => { releaseConnection = resolve; });
		client.connected = true;
	};
	client.role = undefined;
	const runtime = new IntercomRuntime({ client });
	let settled = false;
	const pending = runtime.status().finally(() => { settled = true; });
	await started;
	await new Promise((resolve) => setImmediate(resolve));
	assert.equal(settled, false);
	releaseConnection();
	const advertised = await pending;
	assert.equal(advertised.sessionId, "pi-self");
	assert.equal(advertised.advertisingFirstMate, true);
	assert.equal(advertised.role, "first-mate");

	client.sessions = [peer("self", "caller")];
	client.role = "first-mate";
	const absent = await runtime.status();
	assert.equal(absent.advertisingFirstMate, false);
	assert.equal(absent.role, undefined);

	client.sessions = [peer("self", "caller"), peer("duplicate-self", "duplicate", "pi-self")];
	const duplicate = await runtime.status();
	assert.equal(duplicate.connected, false);
	assert.match(duplicate.error, /Multiple connected sessions advertise Pi session ID/);
	await runtime.dispose();
});

test("role acknowledgement fails when reconnect replaces the acknowledged transport connection", async () => {
	const client = new FakeClient([peer("self", "caller")]);
	client.setRole = async (role) => {
		client.role = role;
		client.sessionId = "replacement";
		return role;
	};
	const runtime = new IntercomRuntime({ client });
	await assert.rejects(runtime.setRole("first-mate"), /no longer matches the current transport connection/);
	assert.equal(client.invalidated, 1);
	assert.equal(client.role, undefined);
	assert.equal(client.connected, false);
	await runtime.dispose();
});

test("runtime reads a stable legacy-presence tail without messaging the target", async () => {
	const presence = { sessionId: "pi-target", fileLocator: "/tmp/session.jsonl", activeLeafId: "leaf", revision: 4 };
	const { piSessionId: _legacyIdentity, ...legacyPeer } = peer("target", "worker");
	const target = { ...legacyPeer, piSession: presence };
	const client = new FakeClient([peer("self", "caller"), target]);
	let verified = 0;
	let closed = 0;
	const snapshot = { events: [{ kind: "user", text: "confirmed" }], availableTextMessages: 1, returnedTextMessages: 1, truncated: false };
	const runtime = new IntercomRuntime({
		client,
		openTail: (request) => {
			assert.deepEqual(request, { piSessionId: "pi-target", fileLocator: "/tmp/session.jsonl", activeLeafId: "leaf", limit: 8, scanBytes: 1_024 });
			return { snapshot, verifyStable: () => { verified++; }, close: () => { closed++; } };
		},
	});
	const result = await runtime.tail("worker", 8, undefined, 1_024);
	assert.equal(result.target.id, "target");
	assert.equal(result.target.piSessionId, undefined);
	assert.equal(result.targetSessionId, "pi-target");
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

	const duplicateClient = new FakeClient([peer("self", "caller"), target, { ...peer("duplicate", "other", "pi-target"), piSession: { ...presence, revision: 2 } }]);
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

test("runtime rejects a target that matches a stable ID and a different legacy name", async () => {
	const named = peer("named-connection", "victim", "pi-named");
	const shadow = peer("shadow-connection", "shadow", "victim");
	const client = new FakeClient([peer("self", "caller"), named, shadow]);
	const runtime = new IntercomRuntime({ client });
	await assert.rejects(runtime.send("victim", "ambiguous namespace"), /matches both a session name and a different session ID/);
	await assert.rejects(
		runtime.reply("expired", { to: "victim", replyTo: "expired-ask" }),
		/matches both a session name and a different session ID/,
	);
	assert.equal(client.sent.length, 0);
	await runtime.dispose();
});

test("runtime applies cross-namespace ambiguity checks when a target narrows pending replies", async () => {
	const { piSessionId: _removed, ...legacy } = peer("legacy-connection", "victim", "unused");
	const shadow = peer("shadow-connection", "shadow", "victim");
	const client = new FakeClient([peer("self", "caller"), legacy, shadow]);
	const runtime = new IntercomRuntime({ client });
	client.emit("message", legacy, { id: "legacy-ask", timestamp: 1, expectsReply: true, content: { text: "question" } });
	await assert.rejects(
		runtime.reply("answer", { to: "victim", replyTo: "legacy-ask" }),
		/matches both a session name and a different session ID/,
	);
	assert.equal(client.sent.length, 0);
	assert.equal(runtime.pending().length, 1);
	await runtime.dispose();
});

test("runtime resolves stable Pi session IDs to the current transport connection and rejects duplicates", async () => {
	const first = peer("old-connection", "worker", "pi-worker");
	const client = new FakeClient([peer("self", "caller"), first]);
	const runtime = new IntercomRuntime({ client });
	assert.equal((await runtime.send("pi-worker", "before reload")).to.id, "old-connection");

	const replacement = peer("new-connection", "worker", "pi-worker");
	client.sessions = [peer("self", "caller"), replacement];
	assert.equal((await runtime.send("pi-worker", "after reload")).to.id, "new-connection");
	assert.deepEqual(client.sent.map((entry) => entry.to), ["old-connection", "new-connection"]);
	assert.deepEqual(client.expectedIds, ["pi-worker", "pi-worker"]);
	assert.deepEqual(client.expectedSelectors, ["pi-worker", "pi-worker"]);
	assert.deepEqual(client.expectedTransportIds, ["old-connection", "new-connection"]);

	client.sessions.push(peer("duplicate-connection", "other", "pi-worker"));
	await assert.rejects(runtime.send("pi-worker", "ambiguous stable ID"), /Multiple connected sessions advertise Pi session ID/);
	await assert.rejects(runtime.send("worker", "ambiguous unique name"), /Multiple connected sessions advertise Pi session ID/);
	await assert.rejects(runtime.send("new-connection", "ambiguous legacy ID"), /Multiple connected sessions advertise Pi session ID/);
	assert.equal(client.sent.length, 2);
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

test("runtime fails closed when a pending reply sender has duplicate live Pi session advertisements", async () => {
	const sender = peer("sender-connection", "worker", "pi-worker");
	const duplicate = peer("duplicate-connection", "other", "pi-worker");
	const client = new FakeClient([peer("self", "caller"), sender, duplicate]);
	const runtime = new IntercomRuntime({ client });
	client.emit("message", sender, { id: "ask", timestamp: 1, expectsReply: true, content: { text: "question" } });
	await assert.rejects(runtime.reply("answer", { replyTo: "ask" }), /Multiple connected sessions advertise Pi session ID/);
	assert.equal(client.sent.length, 0);
	assert.equal(runtime.pending().length, 1);
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
	const result = await runtime.reply("answer", { to: sender.piSessionId, replyTo: "expired-ask" });
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
