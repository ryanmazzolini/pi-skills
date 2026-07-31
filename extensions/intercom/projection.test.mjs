import assert from "node:assert/strict";
import test from "node:test";
import { INTERCOM_LIMITS, isMessage } from "./client.ts";
import { INBOUND_DELIVERY_LIMITS, InboundDelivery, deliverInboundMessage } from "./index.ts";
import { connectNew, isolatedIntercom, startOwnedBroker, stopChild, waitEvent } from "../../tests/intercom/helpers.mjs";
import {
	INTERCOM_PROJECTION_MAX_BYTES,
	INTERCOM_TAIL_PROJECTION_MIN_BYTES,
	INTERCOM_TRUNCATION_NOTICE,
	projectAskReply,
	projectFirstMateTriage,
	projectInboundEntry,
	projectPendingEntries,
	projectSessionList,
	projectSessionTail,
	projectionBytes,
	sanitizeTailText,
} from "./projection.ts";

function session(id, overrides = {}) {
	return { id, piSessionId: `pi-${id}`, name: `name-${id}`, cwd: "/repo", model: "test", pid: 1, startedAt: 1, lastActivity: 1, status: "idle", ...overrides };
}

function entry(from, message, receivedAt = 1) {
	return { from, message, receivedAt, replyable: message.expectsReply === true };
}

function assertBounded(value, label) {
	assert.ok(projectionBytes(value) <= INTERCOM_PROJECTION_MAX_BYTES, `${label} exceeded projection cap`);
}

test("multibyte inbound projection is UTF-8 bounded, actionable, quoted, and compactly persisted", () => {
	const messageId = "ask-\"\\\n";
	const inbound = entry(
		session("peer-full-authoritative-id", { name: "🙂".repeat(1_000), cwd: `/${"界".repeat(1_000)}` }),
		{ id: messageId, timestamp: 7, expectsReply: true, content: { text: "🙂".repeat(100_000) } },
	);
	const projected = projectInboundEntry(inbound);
	assertBounded(projected.text, "multibyte inbound text");
	assert.equal(projected.bytes, projectionBytes(projected.text));
	assert.equal(projected.truncated, true);
	assert.match(projected.text, /peer-full-authoritative-id/);
	assert.ok(projected.text.includes(`replyTo: ${JSON.stringify(messageId)}`));
	assert.ok(projected.text.endsWith(INTERCOM_TRUNCATION_NOTICE));
	assert.deepEqual(projected.details, {
		fromSessionId: "pi-peer-full-authoritative-id",
		messageId,
		timestamp: 7,
		receivedAt: 1,
		expectsReply: true,
		triggerTurn: false,
		replyable: true,
		attachmentCount: 0,
		truncated: true,
	});
	assertBounded(projected.details, "multibyte inbound details");
	assert.doesNotMatch(JSON.stringify(projected.details), /🙂/u);

	const calls = [];
	deliverInboundMessage({ sendMessage: (...args) => calls.push(args) }, inbound);
	assertBounded(calls[0][0].content, "persisted inbound content");
	assertBounded(calls[0][0].details, "persisted inbound details");
	assert.equal(calls[0][0].details.entries[0].fromSessionId, "pi-peer-full-authoritative-id");
	assert.equal("message" in calls[0][0].details.entries[0], false);
});

test("maximum field-legal text and attachment combination projects without retaining its wire payload", () => {
	const attachments = Array.from({ length: INTERCOM_LIMITS.maxAttachments }, (_, index) => ({
		type: "file",
		name: `${index}${"n".repeat(INTERCOM_LIMITS.maxAttachmentNameBytes - String(index).length)}`,
		content: "界".repeat(INTERCOM_LIMITS.maxAttachmentTotalBytes / INTERCOM_LIMITS.maxAttachments / 3),
		language: "typescript",
	}));
	const message = {
		id: "maximum-message-id",
		timestamp: 11,
		expectsReply: true,
		content: { text: "🙂".repeat(INTERCOM_LIMITS.maxMessageTextBytes / 4), attachments },
	};
	assert.equal(isMessage(message), true);
	const projected = projectInboundEntry(entry(session("maximum-peer-id"), message));
	assertBounded(projected.text, "maximum legal message");
	assert.equal(projected.truncated, true);
	assert.match(projected.text, /maximum-peer-id/);
	assert.match(projected.text, /maximum-message-id/);
	assert.equal(projected.details.attachmentCount, INTERCOM_LIMITS.maxAttachments);
	assert.ok(projectionBytes(projected.details) < 1_024);
});

test("maximum encodable message remains bounded after a real broker and client round trip", async (t) => {
	const { paths } = await isolatedIntercom(t, "projection-wire-");
	const broker = await startOwnedBroker(paths);
	t.after(() => stopChild(broker));
	const sender = await connectNew(paths, "sender");
	const recipient = await connectNew(paths, "recipient");
	t.after(async () => Promise.allSettled([sender.disconnect(), recipient.disconnect()]));
	const messageId = "maximum-wire-message";
	const received = waitEvent(recipient, "message", (_from, message) => message.id === messageId, 5_000);
	const result = await sender.send(recipient.sessionId, {
		messageId,
		text: "x".repeat(INTERCOM_LIMITS.maxMessageTextBytes),
		attachments: [{
			type: "file",
			name: "maximum.bin",
			content: "y".repeat(INTERCOM_LIMITS.maxAttachmentContentBytes),
		}],
	});
	assert.equal(result.delivered, true);
	const [from, message] = await received;
	const projected = projectInboundEntry(entry(from, message));
	assertBounded(projected.text, "maximum wire message");
	assert.equal(projected.truncated, true);
	assert.equal(projected.details.messageId, messageId);
});

test("list projection preserves adjacent role markers and stable IDs for 32 maximum-metadata roles", () => {
	const metadata = "界".repeat(Math.floor(INTERCOM_LIMITS.maxSessionStringBytes / 3));
	const sessions = Array.from({ length: 32 }, (_, index) => {
		const prefix = `broker-${String(index).padStart(2, "0")}-`;
		const id = `${prefix}${"i".repeat(INTERCOM_LIMITS.maxIdBytes - prefix.length)}`;
		return session(id, { name: metadata, cwd: metadata, model: metadata, status: metadata, role: "first-mate" });
	});
	const projected = projectSessionList(sessions, sessions[0]);
	assertBounded(projected.text, "32-session role list");
	assert.equal(projected.truncated, true);
	for (const peer of sessions) {
		assert.ok(projected.text.includes(`${JSON.stringify(peer.piSessionId)} [role: first-mate]`), `missing adjacent role marker for ${peer.piSessionId}`);
	}
	const details = {
		currentSessionId: sessions[0].piSessionId,
		sessionIds: sessions.map((peer) => peer.piSessionId),
		firstMateSessionIds: sessions.map((peer) => peer.piSessionId),
		count: sessions.length,
		truncated: true,
	};
	assertBounded(details, "32-session role details");
	assert.doesNotMatch(JSON.stringify(details), /界/u);
});

test("maximum valid session inventory truncates complete identities instead of failing", () => {
	const sessions = Array.from({ length: 256 }, (_, index) => {
		const prefix = `pi-${String(index).padStart(3, "0")}-`;
		return session(`broker-${index}`, {
			piSessionId: `${prefix}${"i".repeat(INTERCOM_LIMITS.maxPiSessionIdBytes - prefix.length)}`,
			name: `peer-${index}`,
		});
	});
	const projected = projectSessionList(sessions, sessions[0]);
	assertBounded(projected.text, "maximum session inventory");
	assert.equal(projected.truncated, true);
	assert.match(projected.text, new RegExp(sessions[0].piSessionId));
	assert.ok(projected.text.endsWith(INTERCOM_TRUNCATION_NOTICE));
	assert.doesNotMatch(projected.text, /Pi session ID: "[^"]*\n/u, "session IDs must not be cut in half");
});

test("session list projection exposes sortable conversational timestamps when advertised", () => {
	const timestamp = Date.parse("2026-01-01T00:00:00.000Z");
	const current = session("current", { lastConversationalTimestamp: null });
	const peer = session("peer", { lastConversationalTimestamp: timestamp });
	const legacy = session("legacy", { lastConversationalTimestamp: undefined });
	const projected = projectSessionList([current, peer, legacy], current);
	assert.match(projected.text, /last conversational timestamp unavailable/);
	assert.match(projected.text, /last conversational timestamp: 2026-01-01T00:00:00.000Z/);
	assert.doesNotMatch(projected.text.split("Pi session ID: \"pi-legacy\"")[1], /last conversational timestamp/);
});

test("session list projection uses stable IDs advertised through persisted presence", () => {
	const current = session("current");
	const compatiblePeer = session("compatible", {
		piSessionId: undefined,
		piSession: { sessionId: "pi-compatible", fileLocator: "/tmp/compatible.jsonl", activeLeafId: "leaf", revision: 1 },
	});
	const projected = projectSessionList([current, compatiblePeer], current);
	assert.match(projected.text, /Pi session ID: "pi-compatible"/);
	assert.doesNotMatch(projected.text, /legacy peer/);
	assert.doesNotMatch(projected.text, /compatible\.jsonl/);
});

test("session list projection exposes exact First Mate roles with stable Pi session IDs", () => {
	const current = session("current-full-id", { role: "first-mate" });
	const duplicate = session("duplicate-first-mate-full-id", { role: "first-mate" });
	const ordinary = session("ordinary-full-id");
	const projected = projectSessionList([current, duplicate, ordinary], current);
	assertBounded(projected.text, "role-tagged session list");
	assert.match(projected.text, /current-full-id.*role: first-mate/);
	assert.match(projected.text, /duplicate-first-mate-full-id.*role: first-mate/);
	assert.match(projected.text, /ordinary-full-id/);
});

test("session tail projection is bounded, locator-free, and preserves newest multibyte text", () => {
	const privateLocator = "/private/session/path.jsonl";
	const target = session("tail-peer-full-id", {
		piSessionId: "pi-session",
		name: "tail worker",
		piSession: { sessionId: "pi-session", fileLocator: privateLocator, activeLeafId: "leaf", revision: 1 },
	});
	const events = Array.from({ length: 32 }, (_, index) => ({
		kind: index % 2 === 0 ? "user" : "assistant",
		text: `${index === 31 ? "NEWEST_SENTINEL\u001b]52;c;CLIPBOARD\u0007\u202e\nkept\tformat" : `older-${index}`}-${"界".repeat(2_000)}`,
	}));
	events.splice(30, 0, { kind: "tool", name: `unsafe\n${"n".repeat(1_000)}`, outcome: "failed" });
	events.push({ kind: "bash", outcome: "cancelled" });
	const snapshot = {
		events,
		counts: { scannedEntries: 34, branchEntries: 34, eligibleTextEvents: 40, returnedTextEvents: 32, toolEvents: 1, bashEvents: 1 },
		lastConversationalTimestamp: null,
		truncated: true,
		outcomeEventsTruncated: false,
		ignoredFinalFragment: false,
	};
	const projected = projectSessionTail(snapshot, target);
	assertBounded(projected.text, "session tail");
	assert.equal(projected.truncated, true);
	assert.match(projected.text, /Pi session ID: "pi-session"/);
	assert.doesNotMatch(projected.text, /tail-peer-full-id/);
	assert.match(projected.text, /NEWEST_SENTINEL/);
	assert.match(projected.text, /kept\tformat/);
	assert.doesNotMatch(projected.text, /[\u001b\u0007\u202e]/u);
	assert.equal(sanitizeTailText("line\r\nnext\tcell\u001b[31m\u2066"), "line\nnext\tcell [31m ");
	assert.match(projected.text, /Tool "unsafe n/);
	assert.match(projected.text, /User Bash: cancelled/);
	assert.doesNotMatch(projected.text, /private\/session\/path/);
	assert.ok(projectSessionList([target], target).text.includes("persisted tail advertised"));
	assert.doesNotMatch(projectSessionList([target], target).text, /private\/session\/path/);
});

test("First Mate triage projection fairly bounds a multi-peer evidence sweep", () => {
	const snapshotTimestamp = Date.parse("2026-07-31T12:00:00.000Z");
	const tails = Array.from({ length: 12 }, (_, index) => {
		const target = session(`triage-${index}`, {
			piSessionId: `pi-triage-${index}`,
			name: `worker-${index}`,
			piSession: { sessionId: `pi-triage-${index}`, fileLocator: `/private/${index}.jsonl`, activeLeafId: `leaf-${index}`, revision: 1 },
		});
		return {
			target,
			targetSessionId: target.piSessionId,
			advertisedLastConversationalTimestamp: snapshotTimestamp - (index + 2) * 60 * 60 * 1_000,
			snapshot: {
				events: [
					{ kind: "user", text: `request-${index}-${"界".repeat(2_000)}` },
					{ kind: "assistant", text: `latest-${index}-${"🙂".repeat(2_000)}` },
				],
				counts: { scannedEntries: 2, branchEntries: 2, eligibleTextEvents: 2, returnedTextEvents: 2, toolEvents: 0, bashEvents: 0 },
				lastConversationalTimestamp: snapshotTimestamp - (index + 2) * 60 * 60 * 1_000,
				truncated: false,
				historyTruncated: false,
				outcomeEventsTruncated: false,
				ignoredFinalFragment: false,
			},
		};
	});
	const projected = projectFirstMateTriage({
		currentSessionId: "pi-current",
		inventoryTruncated: false,
		omittedSessionIds: 0,
		snapshotTimestamp,
		idleThresholdMs: 60 * 60 * 1_000,
		selectedSweep: "older",
		roleCapability: true,
		firstMateSessionIds: ["pi-current"],
		pending: [],
		tails,
		activePeersSkipped: 2,
		pendingPeersSkipped: 1,
		unidentifiedPeers: 0,
		ambiguousPeers: 0,
	});
	assertBounded(projected.text, "First Mate triage evidence");
	assert.equal(projected.bytes, Buffer.byteLength(projected.text, "utf8"));
	assert.equal(projected.truncated, true);
	assert.match(projected.text, /Inventory: complete/);
	for (let index = 0; index < tails.length; index++) {
		assert.match(projected.text, new RegExp(`pi-triage-${index}`));
		assert.match(projected.text, new RegExp(`latest-${index}`));
	}
	assert.doesNotMatch(projected.text, /\/private\//);
});

test("tail projection reports omitted outcome events as truncated source context", () => {
	const snapshot = {
		events: [{ kind: "assistant", text: "latest conclusion" }],
		counts: { scannedEntries: 100, branchEntries: 100, eligibleTextEvents: 1, returnedTextEvents: 1, toolEvents: 0, bashEvents: 0 },
		lastConversationalTimestamp: Date.parse("2026-01-01T00:00:02.000Z"),
		truncated: false,
		outcomeEventsTruncated: true,
		ignoredFinalFragment: false,
	};
	const projected = projectSessionTail(snapshot, session("outcome-heavy-peer"));
	assert.equal(projected.truncated, true);
	assert.match(projected.text, /Older completed tool or Bash outcomes were omitted/);
	assert.match(projected.text, /latest conclusion/);
});

test("tail projection distinguishes unscanned branch history from the message limit", () => {
	const snapshot = {
		events: [{ kind: "assistant", text: "bounded conclusion" }],
		counts: { scannedEntries: 10, branchEntries: 8, eligibleTextEvents: 1, returnedTextEvents: 1, toolEvents: 0, bashEvents: 0 },
		lastConversationalTimestamp: Date.parse("2026-01-01T00:00:02.000Z"),
		truncated: false,
		historyTruncated: true,
		outcomeEventsTruncated: false,
		ignoredFinalFragment: false,
	};
	const projected = projectSessionTail(snapshot, session("windowed-peer"));
	assert.equal(projected.truncated, true);
	assert.match(projected.text, /Earlier branch history was not scanned after the requested text was found/);
	assert.doesNotMatch(projected.text, /requested message limit/);
	assert.match(projected.text, /bounded conclusion/);
});

test("tail projection honors an exact caller ceiling with multibyte newest evidence", () => {
	const newest = `NEWEST_MULTIBYTE_SENTINEL-${"界".repeat(10_000)}`;
	const snapshot = {
		events: [
			{ kind: "user", text: "old evidence".repeat(1_000) },
			{ kind: "assistant", text: newest },
		],
		counts: { scannedEntries: 2, branchEntries: 2, eligibleTextEvents: 2, returnedTextEvents: 2, toolEvents: 0, bashEvents: 0 },
		lastConversationalTimestamp: Date.parse("2026-01-01T00:00:02.000Z"),
		truncated: false,
		outcomeEventsTruncated: false,
		ignoredFinalFragment: false,
	};
	const projected = projectSessionTail(snapshot, session("tail-peer"), INTERCOM_TAIL_PROJECTION_MIN_BYTES);
	assert.ok(projected.bytes <= INTERCOM_TAIL_PROJECTION_MIN_BYTES);
	assert.equal(projected.bytes, Buffer.byteLength(projected.text, "utf8"));
	assert.equal(projected.truncated, true);
	assert.match(projected.text, /NEWEST_MULTIBYTE_SENTINEL/);
	assert.match(projected.text, /Last conversational timestamp: 2026-01-01T00:00:02\.000Z/);
	assert.match(projected.text, /truncated to the requested UTF-8 ceiling/);
	assert.doesNotMatch(projected.text, /48 KiB/);
});

test("tail projection keeps a contiguous newest suffix when an older label cannot fit", () => {
	const events = [
		{ kind: "tool", name: "OLDER_SHOULD_NOT_SURVIVE", outcome: "succeeded" },
		{ kind: "tool", name: `BLOCKER_${"b".repeat(248)}`, outcome: "failed" },
		...Array.from({ length: 14 }, (_, index) => ({
			kind: "tool",
			name: `NEW_${index}_${"x".repeat(248)}`,
			outcome: "succeeded",
		})),
	];
	const snapshot = {
		events,
		counts: { scannedEntries: events.length, branchEntries: events.length, eligibleTextEvents: 0, returnedTextEvents: 0, toolEvents: events.length, bashEvents: 0 },
		lastConversationalTimestamp: null,
		truncated: false,
		outcomeEventsTruncated: false,
		ignoredFinalFragment: false,
	};
	const projected = projectSessionTail(snapshot, session("suffix-tail-peer"), INTERCOM_TAIL_PROJECTION_MIN_BYTES);
	assert.ok(projected.bytes <= INTERCOM_TAIL_PROJECTION_MIN_BYTES);
	assert.equal(projected.truncated, true);
	assert.match(projected.text, /NEW_13_/);
	assert.doesNotMatch(projected.text, /BLOCKER_/);
	assert.doesNotMatch(projected.text, /OLDER_SHOULD_NOT_SURVIVE/);
});

test("maximum reader-valid outcome metadata remains below the projection cap", () => {
	const events = Array.from({ length: 64 }, () => ({ kind: "tool", name: "\"".repeat(256), outcome: "succeeded" }));
	const snapshot = {
		events,
		counts: { scannedEntries: 64, branchEntries: 64, eligibleTextEvents: 0, returnedTextEvents: 0, toolEvents: 64, bashEvents: 0 },
		lastConversationalTimestamp: null,
		truncated: false,
		outcomeEventsTruncated: false,
		ignoredFinalFragment: false,
	};
	const projected = projectSessionTail(snapshot, session("maximum-tail-peer", { name: "\"".repeat(INTERCOM_LIMITS.maxSessionStringBytes) }));
	assertBounded(projected.text, "maximum tail metadata");
	assert.equal(projected.truncated, false);
});

test("large ask replies and 64-entry pending results retain authoritative IDs under the cap", () => {
	const from = session("replying-peer-full-id", { name: "界".repeat(1_000), cwd: "🙂".repeat(1_000) });
	const reply = { id: "large-reply-message-id", timestamp: 20, replyTo: "request-id", content: { text: "答".repeat(100_000) } };
	const projectedReply = projectAskReply(from, reply);
	assertBounded(projectedReply.text, "large ask reply");
	assert.match(projectedReply.text, /replying-peer-full-id/);
	assert.equal(projectedReply.details.messageId, "large-reply-message-id");
	assert.equal(projectedReply.details.fromSessionId, "pi-replying-peer-full-id");

	const pending = Array.from({ length: 64 }, (_, index) => entry(
		session(`pending-peer-full-id-${index}`, { name: "界".repeat(1_000) }),
		{ id: `pending-message-full-id-${index}`, timestamp: index, expectsReply: true, content: { text: "🙂".repeat(1_000) } },
		index,
	));
	const projectedPending = projectPendingEntries(pending, 1_000);
	assertBounded(projectedPending.text, "pending result");
	for (const item of pending) {
		assert.ok(projectedPending.text.includes(item.from.id));
		assert.ok(projectedPending.text.includes(item.message.id));
	}
});

test("inbound delivery independently bounds raw traffic, projected queue memory, batches, and details", async () => {
	const calls = [];
	const limits = {
		...INBOUND_DELIVERY_LIMITS,
		perSenderMessages: 10,
		perSenderBytes: 1_024,
		globalMessages: 10,
		globalBytes: 1_024,
		pendingMessages: 10,
		pendingBytes: INTERCOM_PROJECTION_MAX_BYTES,
		flushDelayMs: 0,
	};
	const delivery = new InboundDelivery({ sendMessage: (...args) => calls.push(args) }, () => 1, limits);
	const maximumFirst = entry(session("large-first-peer"), {
		id: "large-first-id",
		timestamp: 1,
		content: { text: `unique-start-${"🙂".repeat(100_000)}-unique-raw-tail` },
	});
	assert.equal(delivery.record(maximumFirst), true);
	assert.equal(delivery.pending.length, 1);
	assert.deepEqual(Object.keys(delivery.pending[0]).sort(), ["bytes", "details", "text", "truncated", "view"]);
	assert.equal("message" in delivery.pending[0], false);
	await new Promise((resolve) => setTimeout(resolve, 10));
	assertBounded(calls[0][0].content, "first delivered message");
	assertBounded(calls[0][0].details, "first delivered details");
	assert.equal(JSON.stringify(calls[0][0].details).includes("unique-raw-tail"), false);
	delivery.dispose();

	const batchCalls = [];
	const batch = new InboundDelivery(
		{ sendMessage: (...args) => batchCalls.push(args) },
		() => 1,
		{ ...INBOUND_DELIVERY_LIMITS, perSenderBytes: 200_000, globalBytes: 500_000, flushDelayMs: 0 },
	);
	for (let index = 0; index < 4; index++) {
		assert.equal(batch.record(entry(session(`batch-peer-${index}`), {
			id: `batch-message-${index}`,
			timestamp: index,
			content: { text: "界".repeat(3_000) },
		})), true);
	}
	await new Promise((resolve) => setTimeout(resolve, 10));
	const delivered = batchCalls.find((call) => !call[0].details?.overflow);
	assert.equal(delivered[1].triggerTurn, false);
	assert.equal(delivered[0].details.count, 4);
	assertBounded(delivered[0].content, "automatic inbound batch");
	assertBounded(delivered[0].details, "automatic inbound batch details");
	assert.equal("message" in delivered[0].details.entries[0], false);
	batch.dispose();
});
