import assert from "node:assert/strict";
import test from "node:test";
import { IntercomInbox, INBOX_LIMITS } from "./inbox.ts";
import { INTERCOM_PROJECTION_MAX_BYTES, projectPendingEntries, projectionBytes } from "./projection.ts";

function session(id, name = id) {
	return { id, name, cwd: "/tmp", model: "test", pid: 1, startedAt: 1, lastActivity: 1 };
}

function ask(id, text = id) {
	return { id, timestamp: 1, expectsReply: true, content: { text } };
}

test("inbox requires exact reply selection when inbound asks are ambiguous and preserves empty legacy IDs", () => {
	const inbox = new IntercomInbox();
	inbox.record(session("peer-1", "worker"), ask("ask-1"));
	assert.equal(inbox.record(session("attacker", "other"), ask("ask-1", "duplicate")).replyable, false);
	inbox.record(session("peer-1", "worker"), ask(""));
	assert.throws(() => inbox.select(), /Multiple pending/);
	assert.throws(() => inbox.select({ to: "worker" }), /select one with replyTo/);
	assert.equal(inbox.select({ replyTo: "" }).message.id, "");
	assert.throws(() => inbox.select({ replyTo: "", to: "someone-else" }), /is not from/);
	assert.equal(inbox.markReplied("", "attacker"), false);
	assert.equal(inbox.select({ replyTo: "" }).message.id, "");
	assert.equal(inbox.markReplied("", "peer-1"), true);
	assert.equal(inbox.select().message.id, "ask-1");
});

test("inbox prunes expiry on receipt and clears asks from disconnected senders", () => {
	let now = 1_000;
	const inbox = new IntercomInbox(100, () => now);
	inbox.record(session("one"), ask("a"));
	assert.equal(inbox.has("a"), true);
	now = 1_101;
	assert.equal(inbox.has("a"), false);
	inbox.record(session("two"), ask("b"));
	assert.deepEqual(inbox.list().map((entry) => entry.message.id), ["b"]);
	inbox.removeSender("two");
	assert.deepEqual(inbox.list(), []);
	assert.equal(inbox.retainedAskBytes(), 0);
});

test("inbox enforces hard pending ask count and aggregate byte bounds", () => {
	const byCount = new IntercomInbox(1_000, () => 1, 2, 10_000);
	assert.equal(byCount.record(session("one"), ask("a")).replyable, true);
	assert.equal(byCount.record(session("two"), ask("b")).replyable, true);
	assert.equal(byCount.record(session("three"), ask("c")).replyable, false);
	assert.equal(byCount.list().length, 2);

	const oneSize = Buffer.byteLength(JSON.stringify({ from: session("one"), message: ask("a", "payload") }), "utf8");
	const byBytes = new IntercomInbox(1_000, () => 1, 10, oneSize);
	assert.equal(byBytes.record(session("one"), ask("a", "payload")).replyable, true);
	assert.equal(byBytes.record(session("two"), ask("b", "payload")).replyable, false);
	assert.equal(byBytes.retainedAskBytes(), oneSize);
	byBytes.markReplied("a");
	assert.equal(byBytes.retainedAskBytes(), 0);
});

test("inbox caps escaped authoritative IDs so pending text and details remain projectable", () => {
	const inbox = new IntercomInbox();
	for (let index = 0; index < INBOX_LIMITS.maxPendingAsks; index++) {
		const prefix = String(index).padStart(2, "0");
		inbox.record(session(`peer-${prefix}`), ask(`${prefix}${"\0".repeat(254)}`));
	}
	const retained = inbox.list();
	assert.ok(retained.length > 0);
	assert.ok(retained.length < INBOX_LIMITS.maxPendingAsks);
	assert.ok(inbox.retainedProjectionBytes() <= INBOX_LIMITS.maxPendingProjectionBytes);
	const projected = projectPendingEntries(retained, Date.now());
	assert.ok(projectionBytes(projected.text) <= INTERCOM_PROJECTION_MAX_BYTES);
	for (const entry of retained) {
		assert.ok(projected.text.includes(JSON.stringify(entry.message.id)));
	}
});
