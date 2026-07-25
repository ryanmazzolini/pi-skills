import assert from "node:assert/strict";
import test from "node:test";
import { FrameDecoder, INTERCOM_LIMITS, IntercomClient, encodeFrame, isIntercomRole, isMessage, isSessionInfo, piSessionIdOf } from "./client.ts";

function decoderFixture(maximum) {
	const messages = [];
	const errors = [];
	return {
		messages,
		errors,
		decoder: new FrameDecoder((message) => messages.push(message), (error) => errors.push(error), maximum),
	};
}

test("four-byte big-endian framing handles fragmentation and coalescing", () => {
	const first = encodeFrame({ type: "one", value: "α" });
	const second = encodeFrame({ type: "two", value: 2 });
	assert.equal(first.readUInt32BE(0), Buffer.byteLength(JSON.stringify({ type: "one", value: "α" })));
	const fixture = decoderFixture();
	fixture.decoder.push(first.subarray(0, 2));
	fixture.decoder.push(first.subarray(2, 7));
	assert.deepEqual(fixture.messages, []);
	fixture.decoder.push(Buffer.concat([first.subarray(7), second]));
	assert.deepEqual(fixture.messages, [{ type: "one", value: "α" }, { type: "two", value: 2 }]);
	assert.deepEqual(fixture.errors, []);
});

test("message and attachment envelopes are bounded without changing valid legacy shapes", () => {
	const valid = {
		id: "message-1",
		timestamp: Date.now(),
		replyTo: "request-1",
		expectsReply: true,
		content: { text: "hello", attachments: [{ type: "file", name: "a.txt", content: "body" }] },
	};
	assert.equal(isMessage(valid), true);
	assert.equal(isMessage({ ...valid, id: "", replyTo: "", content: { text: "", attachments: [{ type: "file", name: "", content: "" }] } }), true);
	assert.equal(isMessage({ ...valid, content: { text: "x".repeat(INTERCOM_LIMITS.maxMessageTextBytes + 1) } }), false);
	assert.equal(isMessage({ ...valid, content: { text: "ok", attachments: Array.from({ length: INTERCOM_LIMITS.maxAttachments + 1 }, () => ({ type: "file", name: "a", content: "b" })) } }), false);
	assert.equal(isMessage({ ...valid, content: { text: "ok", attachments: [{ type: "url", name: "a", content: "b" }] } }), false);
});

test("persisted Pi presence is an exact bounded optional session field", () => {
	const base = { id: "peer", cwd: "/tmp", model: "test", pid: 1, startedAt: 1, lastActivity: 1 };
	const piSession = { sessionId: "pi-session", fileLocator: "/tmp/session.jsonl", activeLeafId: null, revision: 1 };
	assert.equal(isSessionInfo({ ...base, piSession }), true);
	assert.equal(isSessionInfo({ ...base, piSession: { ...piSession, fileLocator: "relative.jsonl" } }), false);
	assert.equal(isSessionInfo({ ...base, piSession: { ...piSession, revision: 0 } }), false);
	assert.equal(isSessionInfo({ ...base, piSession: { ...piSession, snapshotBytes: 100 } }), false);
	assert.equal(isSessionInfo({ ...base, piSession: { ...piSession, activeLeafId: "x".repeat(INTERCOM_LIMITS.maxPiSessionLeafBytes + 1) } }), false);
});

test("stable Pi session identity is bounded and must match persisted presence", () => {
	const base = { id: "broker-connection", piSessionId: "pi-session", cwd: "/tmp", model: "test", pid: 1, startedAt: 1, lastActivity: 1 };
	const piSession = { sessionId: "pi-session", fileLocator: "/tmp/session.jsonl", activeLeafId: null, revision: 1 };
	assert.equal(isSessionInfo(base), true);
	assert.equal(isSessionInfo({ ...base, piSession }), true);
	assert.equal(isSessionInfo({ ...base, piSessionId: "different", piSession }), false);
	assert.equal(isSessionInfo({ ...base, piSessionId: "x".repeat(INTERCOM_LIMITS.maxPiSessionIdBytes + 1) }), false);
	assert.equal(isSessionInfo({ ...base, piSessionId: "pi-\u202ereordered" }), false);
	assert.equal(isSessionInfo({ ...base, piSessionId: "pi/session" }), false);
	assert.equal(isSessionInfo({ ...base, piSession: { ...piSession, sessionId: "pi-\u202ereordered" } }), false);
	assert.equal(piSessionIdOf(base), "pi-session");
	assert.equal(piSessionIdOf({ piSession }), "pi-session");
	assert.equal(piSessionIdOf({}), undefined);

	const client = new IntercomClient();
	const { id: _id, ...registration } = base;
	client.setRegistration(registration);
	assert.equal(client.currentPiSessionId(), "pi-session");
	assert.throws(() => client.setRegistration({ ...registration, piSessionId: "different", piSession }), /Invalid intercom session registration/);
});

test("session roles accept only the exact bounded First Mate value without changing piSession", () => {
	const base = { id: "peer", cwd: "/tmp", model: "test", pid: 1, startedAt: 1, lastActivity: 1 };
	const piSession = { sessionId: "pi-session", fileLocator: "/tmp/session.jsonl", activeLeafId: null, revision: 1 };
	assert.equal(isIntercomRole("first-mate"), true);
	assert.equal(isIntercomRole("supervisor"), false);
	assert.equal(isSessionInfo({ ...base, role: "first-mate", piSession }), true);
	assert.equal(isSessionInfo({ ...base, role: "supervisor", piSession }), false);
	assert.equal(isSessionInfo({ ...base, role: { name: "first-mate" }, piSession }), false);
	assert.deepEqual(piSession, { sessionId: "pi-session", fileLocator: "/tmp/session.jsonl", activeLeafId: null, revision: 1 });
});

test("session_left fails only asks for the departed authoritative peer and empty reply IDs still correlate", async () => {
	const client = new IntercomClient();
	client.registeredSessionId = "self";
	const peer = (id) => ({ id, name: id, cwd: "/tmp", model: "test", pid: 1, startedAt: 1, lastActivity: 1 });
	const reserve = (messageId, expectedPeerId) => {
		let resolveReply;
		let rejectReply;
		const promise = new Promise((resolve, reject) => { resolveReply = resolve; rejectReply = reject; });
		void promise.catch(() => undefined);
		client.askWaiters.set(messageId, {
			expectedPeerId,
			resolve: resolveReply,
			reject: rejectReply,
			timer: setTimeout(() => undefined, 60_000),
		});
		return promise;
	};
	const departed = reserve("departed-ask", "departed-full-id");
	const preserved = reserve("", "other-full-id");
	client.handleBrokerMessage({ type: "session_left", sessionId: "departed-full-id" });
	assert.deepEqual(client.pendingCounts(), { sends: 0, lists: 0, asks: 1 });
	await assert.rejects(departed, /Recipient disconnected before replying/);
	client.handleBrokerMessage({
		type: "message",
		from: peer("other-full-id"),
		message: { id: "reply", timestamp: 2, replyTo: "", content: { text: "empty correlation" } },
	});
	assert.equal((await preserved).message.content.text, "empty correlation");
	assert.deepEqual(client.pendingCounts(), { sends: 0, lists: 0, asks: 0 });
});

test("synchronous encoding failure cleans reserved send and ask waiters immediately", async () => {
	const client = new IntercomClient();
	client.registeredSessionId = "self";
	client.socket = { destroyed: false, writableEnded: false, writable: true };
	client.writeState = { socket: client.socket, tail: Promise.resolve(), queuedBytes: 0 };
	const attachments = Array.from({ length: INTERCOM_LIMITS.maxAttachments }, (_, index) => ({
		type: "file",
		name: `${index}${"n".repeat(INTERCOM_LIMITS.maxAttachmentNameBytes - String(index).length)}`,
		content: "a".repeat(INTERCOM_LIMITS.maxAttachmentTotalBytes / INTERCOM_LIMITS.maxAttachments),
	}));
	const options = { messageId: "oversized-envelope", text: "t".repeat(INTERCOM_LIMITS.maxMessageTextBytes), attachments };
	assert.equal(isMessage({ id: options.messageId, timestamp: 1, content: { text: options.text, attachments } }), true);
	const sending = client.send("peer", options);
	assert.deepEqual(client.pendingCounts(), { sends: 0, lists: 0, asks: 0 });
	await assert.rejects(sending, /frame length.*exceeds limit/);
	const asking = client.ask("peer", { ...options, messageId: "oversized-ask" });
	assert.deepEqual(client.pendingCounts(), { sends: 0, lists: 0, asks: 0 });
	await assert.rejects(asking, /frame length.*exceeds limit/);
	assert.deepEqual(client.pendingCounts(), { sends: 0, lists: 0, asks: 0 });
});

test("framing rejects zero, oversized, and malformed JSON frames once", () => {
	for (const frame of [
		Buffer.alloc(4),
		Buffer.from([0, 0, 0, 9, ...Buffer.from("not-json")]),
	]) {
		const fixture = decoderFixture(16);
		fixture.decoder.push(frame);
		fixture.decoder.push(encodeFrame({ ignored: true }));
		assert.equal(fixture.errors.length, 1);
		assert.deepEqual(fixture.messages, []);
	}
	const oversized = Buffer.alloc(4);
	oversized.writeUInt32BE(17);
	const fixture = decoderFixture(16);
	fixture.decoder.push(oversized);
	assert.match(fixture.errors[0].message, /frame length/);
	assert.throws(() => encodeFrame({ text: "x".repeat(INTERCOM_LIMITS.maxFrameBytes) }), /exceeds limit/);
});
