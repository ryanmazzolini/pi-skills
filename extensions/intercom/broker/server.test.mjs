import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import test from "node:test";
import { INTERCOM_LIMITS, IntercomClient, encodeFrame } from "../client.ts";
import {
	connectNew,
	connectRaw,
	isolatedIntercom,
	registration,
	startOwnedBroker,
	stopChild,
	waitEvent,
	waitFor,
} from "../../../tests/intercom/helpers.mjs";

async function closeAll(...clients) {
	await Promise.allSettled(clients.map((client) => client?.disconnect()));
}

test("owned broker preserves registration, list, presence, attachments, disconnect, delivery failure, and sender identity", async (t) => {
	const { paths } = await isolatedIntercom(t);
	const broker = await startOwnedBroker(paths);
	t.after(() => stopChild(broker));
	const alice = await connectNew(paths, "alice");
	const bob = await connectNew(paths, "bob");
	t.after(() => closeAll(alice, bob));

	assert.equal(alice.supportsCapability("pi-session-tail-v1"), true);
	const sessions = await alice.listSessions();
	assert.equal(sessions.length, 2);
	assert.equal(sessions.find((session) => session.id === alice.sessionId).name, "alice");

	const presence = waitEvent(bob, "presence_update", (session) => session.id === alice.sessionId && session.status === "thinking");
	alice.updatePresence({ status: "thinking", model: "next-model" });
	assert.equal((await presence)[0].model, "next-model");

	const attachment = { type: "snippet", name: "answer.ts", content: "export const answer = 42", language: "typescript" };
	const received = waitEvent(bob, "message", (_from, message) => message.id === "attachment-1");
	assert.deepEqual(await alice.send(bob.sessionId, { messageId: "attachment-1", text: "review", attachments: [attachment] }), {
		id: "attachment-1",
		delivered: true,
	});
	const [from, message] = await received;
	assert.equal(from.id, alice.sessionId);
	assert.deepEqual(message.content.attachments, [attachment]);
	const failed = await alice.send("missing-peer", { text: "lost" });
	assert.equal(failed.delivered, false);
	assert.match(failed.reason, /Session not found/);
});

test("owned broker propagates and atomically updates persisted Pi session presence", async (t) => {
	const { paths } = await isolatedIntercom(t, "tail-pres-");
	const broker = await startOwnedBroker(paths);
	t.after(() => stopChild(broker));
	const observer = await connectNew(paths, "observer");
	const target = new IntercomClient({ socketPath: paths.socketPath });
	const first = { sessionId: "pi-session", fileLocator: "/tmp/session.jsonl", activeLeafId: "leaf-a", revision: 1 };
	await target.connect(registration("target", { piSession: first }));
	t.after(() => closeAll(observer, target));
	await waitFor(async () => (await observer.listSessions()).find((session) => session.id === target.sessionId).piSession?.revision === 1);
	assert.deepEqual((await observer.listSessions()).find((session) => session.id === target.sessionId).piSession, first);
	const changed = waitEvent(observer, "presence_update", (session) => session.id === target.sessionId && session.piSession?.revision === 2);
	target.updatePresence({ piSession: { ...first, activeLeafId: null, revision: 2 } });
	assert.equal((await changed)[0].piSession.activeLeafId, null);
	const cleared = waitEvent(observer, "presence_update", (session) => session.id === target.sessionId && session.piSession === undefined);
	target.updatePresence({ piSession: null });
	assert.equal((await cleared)[0].piSession, undefined);

	for (const [name, update] of [
		["stale", { ...first, revision: 3 }],
		["extra", { ...first, revision: 4, snapshotBytes: 100 }],
	]) {
		const raw = await connectRaw(paths.socketPath);
		raw.write({ type: "register", session: registration(name, { piSession: { ...first, revision: 3 } }) });
		await raw.wait((message) => message.type === "registered");
		const closed = new Promise((resolve) => raw.socket.once("close", resolve));
		raw.write({ type: "presence", piSession: update });
		await closed;
		assert.equal((await observer.listSessions()).some((session) => session.name === name), false);
	}
});

test("broker derives sender identity, handles fragmented/coalesced requests, and rejects malformed or oversized frames without crashing", async (t) => {
	const { paths } = await isolatedIntercom(t);
	const broker = await startOwnedBroker(paths);
	t.after(() => stopChild(broker));
	const recipient = await connectNew(paths, "recipient");
	t.after(() => recipient.disconnect());
	const raw = await connectRaw(paths.socketPath);
	t.after(() => raw.socket.destroy());

	const register = encodeFrame({ type: "register", session: { ...registration("raw"), id: "spoofed-id" } });
	raw.socket.write(register.subarray(0, 1));
	raw.socket.write(register.subarray(1, 5));
	raw.socket.write(register.subarray(5));
	const registered = await raw.wait((message) => message.type === "registered");
	assert.notEqual(registered.sessionId, "spoofed-id");

	const listOne = encodeFrame({ type: "list", requestId: "one" });
	const listTwo = encodeFrame({ type: "list", requestId: "two" });
	raw.socket.write(Buffer.concat([listOne, listTwo]));
	assert.equal((await raw.wait((message) => message.type === "sessions" && message.requestId === "one")).sessions.length, 2);
	assert.equal((await raw.wait((message) => message.type === "sessions" && message.requestId === "two")).sessions.length, 2);

	const spoofAttempt = waitEvent(recipient, "message", (_from, message) => message.id === "spoof-attempt");
	raw.write({
		type: "send",
		to: recipient.sessionId,
		from: { id: "forged" },
		message: { id: "spoof-attempt", timestamp: Date.now(), content: { text: "hello" } },
	});
	const [actualSender] = await spoofAttempt;
	assert.equal(actualSender.id, registered.sessionId);

	const coalescedInvalid = await connectRaw(paths.socketPath);
	const coalescedClosed = new Promise((resolve) => coalescedInvalid.socket.once("close", resolve));
	coalescedInvalid.socket.write(Buffer.concat([
		encodeFrame({ type: "unknown" }),
		encodeFrame({ type: "register", session: registration("must-not-register") }),
	]));
	await coalescedClosed;
	assert.equal((await recipient.listSessions()).some((session) => session.name === "must-not-register"), false);

	for (const bytes of [Buffer.from([0, 0, 0, 8, ...Buffer.from("not-json")]), (() => {
		const header = Buffer.alloc(4);
		header.writeUInt32BE(INTERCOM_LIMITS.maxFrameBytes + 1);
		return header;
	})()]) {
		const malformed = await connectRaw(paths.socketPath);
		malformed.socket.on("error", () => undefined);
		const closed = new Promise((resolve) => malformed.socket.once("close", resolve));
		malformed.socket.write(bytes);
		await closed;
	}
	const survivor = await connectNew(paths, "survivor");
	await survivor.disconnect();

	assert.equal((await stat(paths.runtimeDir)).mode & 0o777, 0o700);
	assert.equal((await stat(paths.socketPath)).mode & 0o777, 0o600);
});

test("unregister closes its socket and immediately releases the accepted connection slot", async (t) => {
	const { paths } = await isolatedIntercom(t, "unreg-slot-");
	const broker = await startOwnedBroker(paths, { PI_INTERCOM_MAX_CONNECTIONS: "1" });
	t.after(() => stopChild(broker));
	// Let the acceptance-only startup probe's socket close before occupying the sole test slot.
	await new Promise((resolve) => setTimeout(resolve, 50));
	const raw = await connectRaw(paths.socketPath);
	raw.write({ type: "register", session: registration("slot-owner") });
	await raw.wait((message) => message.type === "registered");
	const closed = new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error("broker retained an unregistered socket")), 1_000);
		raw.socket.once("close", () => { clearTimeout(timer); resolve(); });
	});
	raw.write({ type: "unregister" });
	await closed;
	const replacement = await connectNew(paths, "replacement");
	assert.equal(replacement.isConnected(), true);
	await replacement.disconnect();
});

test("broker bounds unregistered sockets, total connections, registration time, and pipelined ingress", async (t) => {
	{
		const { paths } = await isolatedIntercom(t, "idle-unreg-");
		const broker = await startOwnedBroker(paths, { PI_INTERCOM_IDLE_TIMEOUT_MS: "150", PI_INTERCOM_REGISTRATION_TIMEOUT_MS: "5_000" });
		const raw = await connectRaw(paths.socketPath);
		await waitFor(() => broker.exitCode !== null, 2_000);
		assert.equal(raw.socket.destroyed, true);
	}

	{
		const { paths } = await isolatedIntercom(t, "conn-cap-");
		const broker = await startOwnedBroker(paths, { PI_INTERCOM_MAX_CONNECTIONS: "2" });
		t.after(() => stopChild(broker));
		const first = await connectNew(paths, "first");
		const second = await connectNew(paths, "second");
		t.after(() => closeAll(first, second));
		const refused = new IntercomClient({ socketPath: paths.socketPath, connectTimeoutMs: 500 });
		await assert.rejects(refused.connect(registration("third")), /closed|disconnected|reset/i);
		assert.equal((await first.listSessions()).length, 2);
	}

	{
		const { paths } = await isolatedIntercom(t, "reg-timeout-");
		const broker = await startOwnedBroker(paths, { PI_INTERCOM_REGISTRATION_TIMEOUT_MS: "100" });
		t.after(() => stopChild(broker));
		const raw = await connectRaw(paths.socketPath);
		await new Promise((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error("unregistered socket did not expire")), 1_000);
			raw.socket.once("close", () => { clearTimeout(timer); resolve(); });
		});
	}

	for (const fixture of [
		{ prefix: "pipe-count-", env: { PI_INTERCOM_MAX_QUEUED_REQUESTS: "4", PI_INTERCOM_MAX_QUEUED_REQUEST_BYTES: "100000" }, frames: 12, requestId: (index) => `count-${index}` },
		{ prefix: "pipe-bytes-", env: { PI_INTERCOM_MAX_QUEUED_REQUESTS: "100", PI_INTERCOM_MAX_QUEUED_REQUEST_BYTES: "600" }, frames: 4, requestId: (index) => `${index}-${"x".repeat(220)}` },
	]) {
		const { paths } = await isolatedIntercom(t, fixture.prefix);
		const broker = await startOwnedBroker(paths, fixture.env);
		t.after(() => stopChild(broker));
		const raw = await connectRaw(paths.socketPath);
		raw.write({ type: "register", session: registration("pipeline") });
		await raw.wait((message) => message.type === "registered");
		const closed = new Promise((resolve) => raw.socket.once("close", resolve));
		raw.socket.write(Buffer.concat(Array.from({ length: fixture.frames }, (_, index) => encodeFrame({ type: "list", requestId: fixture.requestId(index) }))));
		await closed;
		const survivor = await connectNew(paths, "survivor");
		await survivor.disconnect();
	}
});

test("parallel asks correlate exactly out of order and clean up spoof, timeout, abort, and recipient disconnect", async (t) => {
	const { paths } = await isolatedIntercom(t);
	const broker = await startOwnedBroker(paths);
	t.after(() => stopChild(broker));
	const alice = await connectNew(paths, "alice", { askTimeoutMs: 500 });
	const bob = await connectNew(paths, "bob");
	const mallory = await connectNew(paths, "mallory");
	t.after(() => closeAll(alice, bob, mallory));

	const inbound = [];
	bob.on("message", (from, message) => inbound.push({ from, message }));
	const wrongSender = waitEvent(alice, "message", (from, message) => from.id === mallory.sessionId && message.replyTo === "ask-one");
	const first = alice.ask(bob.sessionId, { messageId: "ask-one", text: "first" });
	const second = alice.ask(bob.sessionId, { messageId: "ask-two", text: "second" });
	await waitFor(() => inbound.length === 2);
	await mallory.send(alice.sessionId, { text: "spoof", replyTo: "ask-one" });
	await wrongSender;
	assert.equal(alice.pendingCounts().asks, 2);
	await bob.send(alice.sessionId, { text: "second answer", replyTo: "ask-two" });
	await bob.send(alice.sessionId, { text: "first answer", replyTo: "ask-one" });
	assert.deepEqual((await Promise.all([first, second])).map((result) => result.message.content.text), ["first answer", "second answer"]);
	assert.equal(alice.pendingCounts().asks, 0);

	await assert.rejects(alice.ask(bob.sessionId, { messageId: "times-out", text: "no answer" }), /No reply/);
	assert.equal(alice.pendingCounts().asks, 0);

	const controller = new AbortController();
	const aborted = alice.ask(bob.sessionId, { messageId: "aborted", text: "cancel me" }, controller.signal);
	await waitFor(() => inbound.some((entry) => entry.message.id === "aborted"));
	controller.abort();
	await assert.rejects(aborted, /cancelled/);
	assert.equal(alice.pendingCounts().asks, 0);

	const disconnected = alice.ask(bob.sessionId, { messageId: "disconnects", text: "wait" });
	const disconnectedAssertion = assert.rejects(disconnected, /disconnected before replying/);
	await waitFor(() => inbound.some((entry) => entry.message.id === "disconnects"));
	await bob.disconnect();
	await disconnectedAssertion;
	assert.equal(alice.pendingCounts().asks, 0);
});

test("empty legacy request IDs correlate and clear exact broker request edges", async (t) => {
	const { paths } = await isolatedIntercom(t, "empty-ids-");
	const broker = await startOwnedBroker(paths);
	t.after(() => stopChild(broker));
	const alice = await connectNew(paths, "alice", { askTimeoutMs: 2_000 });
	const bob = await connectNew(paths, "bob", { askTimeoutMs: 2_000 });
	t.after(() => closeAll(alice, bob));
	const question = waitEvent(bob, "message", (_from, message) => message.id === "");
	const asked = alice.ask(bob.sessionId, { messageId: "", text: "empty" });
	await question;
	await bob.send(alice.sessionId, { messageId: "empty-reply", text: "answer", replyTo: "" });
	assert.equal((await asked).message.replyTo, "");
	const reverseAfterReply = bob.ask(alice.sessionId, { messageId: "after-empty", text: "new question" });
	await waitEvent(alice, "message", (_from, message) => message.id === "after-empty");
	await alice.send(bob.sessionId, { text: "new answer", replyTo: "after-empty" });
	assert.equal((await reverseAfterReply).message.content.text, "new answer");
});

test("broker rejects reverse blocking asks, permits ordinary sends and exact replies, and expires request edges", async (t) => {
	const { paths } = await isolatedIntercom(t);
	const broker = await startOwnedBroker(paths, { PI_INTERCOM_REQUEST_EDGE_TTL_MS: "300" });
	t.after(() => stopChild(broker));
	const alice = await connectNew(paths, "alice", { askTimeoutMs: 2_000 });
	const bob = await connectNew(paths, "bob", { askTimeoutMs: 2_000 });
	t.after(() => closeAll(alice, bob));

	const aliceAsk = alice.ask(bob.sessionId, { messageId: "alice-asks", text: "question" });
	const [, inbound] = await waitEvent(bob, "message", (_from, message) => message.id === "alice-asks");
	await assert.rejects(bob.ask(alice.sessionId, { messageId: "reverse-asks", text: "reverse" }), /Reverse blocking ask rejected/);
	assert.equal((await bob.send(alice.sessionId, { text: "ordinary update" })).delivered, true);
	await bob.send(alice.sessionId, { text: "answer", replyTo: inbound.id });
	assert.equal((await aliceAsk).message.content.text, "answer");

	const expires = alice.ask(bob.sessionId, { messageId: "expires", text: "expire" });
	await waitEvent(bob, "message", (_from, message) => message.id === "expires");
	await assert.rejects(expires, /expired before reply/);
	assert.equal(alice.pendingCounts().asks, 0);
});
