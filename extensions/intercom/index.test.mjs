import assert from "node:assert/strict";
import { initTheme, SessionManager } from "@earendil-works/pi-coding-agent";
import { appendFile, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import net from "node:net";
import test from "node:test";
import intercomExtension, {
	INBOUND_DELIVERY_LIMITS,
	INTERCOM_PROJECTION_MAX_BYTES,
	InboundDelivery,
	IntercomParams,
	boundedSessionIdentityDetails,
	deliverInboundMessage,
	formatAttachments,
	formatSession,
	incomingContent,
	presenceName,
	sanitizeSelfDeclaredMetadata,
	selectSessionSummaryCandidates,
	validateIntercomAction,
} from "./index.ts";
import { FrameDecoder, encodeFrame } from "./client.ts";
import { connectNew, isolatedIntercom, startOwnedBroker, stopChild, waitEvent, waitFor } from "../../tests/intercom/helpers.mjs";

initTheme("dark");

test("registers one compatible flat intercom tool and no deferred UI or bridge surface", () => {
	const tools = [];
	const events = [];
	const commands = [];
	const shortcuts = [];
	const pi = {
		registerTool: (tool) => tools.push(tool),
		registerMessageRenderer() {},
		registerCommand: (...args) => commands.push(args),
		registerShortcut: (...args) => shortcuts.push(args),
		on: (name, handler) => events.push({ name, handler }),
		getSessionName: () => undefined,
	};
	intercomExtension(pi);
	assert.deepEqual(tools.map((tool) => tool.name), ["intercom"]);
	assert.deepEqual(IntercomParams.properties.action.enum, ["list", "triage", "tail", "summarize", "send", "ask", "reply", "pending", "operations", "cancel", "status", "role"]);
	assert.deepEqual(Object.keys(IntercomParams.properties), ["action", "role", "to", "message", "attachments", "replyTo", "summaryToken", "operationId", "limit", "tailScanBytes", "tailProjectionBytes"]);
	assert.deepEqual(commands, []);
	assert.deepEqual(shortcuts, []);
	assert.equal(tools.some((tool) => tool.name === "contact_supervisor"), false);
	assert.match(tools[0].description, /routed to the peer socket/);
	assert.match(tools[0].promptGuidelines.join("\n"), /exact replyTo/);
	assert.match(tools[0].promptGuidelines.join("\n"), /status for the current Pi session ID/);
	assert.match(tools[0].promptGuidelines.join("\n"), /Prefer durable project or work-item updates/);
	assert.match(tools[0].promptGuidelines.join("\n"), /use intercom tail with a small limit/);
	assert.match(tools[0].promptGuidelines.join("\n"), /single-use summaryToken/);
	assert.match(tools[0].promptGuidelines.join("\n"), /do not acknowledge routine updates or receipts/);
	assert.equal(events.some((event) => event.name === "session_start"), true);
	assert.equal(events.some((event) => event.name === "session_shutdown"), true);
});

test("validates action-specific fields while preserving attachment and reply selection inputs", () => {
	assert.doesNotThrow(() => validateIntercomAction({ action: "list" }));
	assert.doesNotThrow(() => validateIntercomAction({ action: "list", limit: 1 }));
	assert.doesNotThrow(() => validateIntercomAction({ action: "pending", limit: 1 }));
	assert.doesNotThrow(() => validateIntercomAction({ action: "triage" }));
	assert.throws(() => validateIntercomAction({ action: "triage", limit: 1 }), /limit is not valid/);
	assert.doesNotThrow(() => validateIntercomAction({ action: "role", role: "first-mate" }));
	assert.doesNotThrow(() => validateIntercomAction({ action: "role" }));
	assert.throws(() => validateIntercomAction({ action: "role", role: "supervisor" }), /Invalid intercom role/);
	assert.throws(() => validateIntercomAction({ action: "list", role: "first-mate" }), /not valid/);
	assert.doesNotThrow(() => validateIntercomAction({ action: "send", to: "worker", message: "update", attachments: [] }));
	assert.doesNotThrow(() => validateIntercomAction({ action: "tail", to: "worker", limit: 8, tailScanBytes: 1_024, tailProjectionBytes: 4_096 }));
	assert.throws(() => validateIntercomAction({ action: "tail" }), /requires to/);
	assert.doesNotThrow(() => validateIntercomAction({ action: "summarize", summaryToken: "grant" }));
	assert.throws(() => validateIntercomAction({ action: "summarize" }), /requires summaryToken/);
	assert.throws(() => validateIntercomAction({ action: "summarize", summaryToken: "grant", to: "worker" }), /to is not valid/);
	assert.throws(() => validateIntercomAction({ action: "summarize", summaryToken: "grant", limit: 8 }), /limit is not valid/);
	assert.throws(() => validateIntercomAction({ action: "list", summaryToken: "grant" }), /summaryToken is not valid/);
	assert.throws(() => validateIntercomAction({ action: "list", tailScanBytes: 1_024 }), /tailScanBytes is not valid/);
	assert.throws(() => validateIntercomAction({ action: "send", to: "worker", message: "update", tailProjectionBytes: 4_096 }), /tailProjectionBytes is not valid/);
	assert.doesNotThrow(() => validateIntercomAction({ action: "reply", message: "answer", replyTo: "ask-1" }));
	assert.throws(() => validateIntercomAction({ action: "ask", message: "question" }), /requires to/);
	assert.throws(() => validateIntercomAction({ action: "pending", message: "extra" }), /not valid/);
	assert.throws(() => validateIntercomAction({ action: "status", replyTo: "extra" }), /not valid/);
	assert.doesNotThrow(() => validateIntercomAction({ action: "operations", limit: 1 }));
	assert.throws(() => validateIntercomAction({ action: "cancel" }), /requires operationId/);
});

test("selects at most four oldest confirmed 24-hour snapshots for isolated synthesis", () => {
	const now = Date.parse("2026-07-31T12:00:00.000Z");
	const makeTail = (id, ageHours, withEvidence = true) => ({
		target: {},
		targetSessionId: id,
		snapshot: {
			events: withEvidence ? [{ kind: "assistant", text: id }] : [],
			lastConversationalTimestamp: now - ageHours * 60 * 60 * 1_000,
		},
	});
	const result = {
		snapshotTimestamp: now,
		tails: [
			makeTail("25-hours", 25),
			makeTail("30-hours", 30),
			makeTail("29-hours", 29),
			makeTail("28-hours", 28),
			makeTail("27-hours", 27),
			makeTail("23-hours", 23),
			makeTail("empty", 40, false),
		],
	};
	const selected = selectSessionSummaryCandidates(result, 4);
	assert.deepEqual(selected.selected.map((tail) => tail.targetSessionId), ["30-hours", "29-hours", "28-hours", "27-hours"]);
	assert.equal(selected.omitted, 1);
	assert.deepEqual(selectSessionSummaryCandidates(result, 0), { selected: [], omitted: 5 });
	assert.throws(() => selectSessionSummaryCandidates(result, 5), /limit is invalid/);
});

test("uses the legacy unnamed alias and preserves attachment bodies", () => {
	assert.equal(presenceName({ getSessionName: () => undefined }, "session-1234567890"), "subagent-chat-12345678");
	assert.equal(presenceName({ getSessionName: () => " planner " }, "session-id"), "planner");
	assert.match(formatAttachments([{ type: "snippet", name: "a.ts", language: "ts", content: "const a = 1" }]), /const a = 1/);
});

test("delivers asks and explicit one-way sends as recipient turns", () => {
	const calls = [];
	const entry = {
		from: { id: "broker-connection-id", piSessionId: "peer-full-session-id", name: "worker", cwd: "/repo", model: "test", pid: 1, startedAt: 1, lastActivity: 1 },
		message: { id: "ask-1", timestamp: 1, expectsReply: true, content: { text: "Question", attachments: [{ type: "context", name: "note", content: "context body" }] } },
		receivedAt: 1,
		replyable: true,
	};
	deliverInboundMessage({ sendMessage: (...args) => calls.push(args) }, entry);
	assert.equal(calls.length, 1);
	assert.equal(calls[0][0].customType, "intercom_message");
	assert.equal(calls[0][0].display, true);
	assert.match(calls[0][0].content, /peer-full-session-id/);
	assert.match(calls[0][0].content, /replyTo: \"ask-1\"/);
	assert.match(calls[0][0].content, /context body/);
	assert.deepEqual(calls[0][1], { deliverAs: "steer", triggerTurn: true });

	deliverInboundMessage({ sendMessage: (...args) => calls.push(args) }, {
		...entry,
		message: { id: "send-1", timestamp: 2, triggerTurn: true, content: { text: "Continue the approved work" } },
		replyable: false,
	});
	assert.deepEqual(calls[1][1], { deliverAs: "followUp", triggerTurn: true });
});

test("intercom message renderer uses native expansion for compact bubbles and metadata", () => {
	const renderers = new Map();
	intercomExtension({ registerTool() {}, registerMessageRenderer: (type, renderer) => renderers.set(type, renderer), on() {}, getSessionName: () => undefined });
	const renderer = renderers.get("intercom_message");
	const theme = { fg: (_color, text) => text, bg: (_color, text) => text, bold: (text) => text };
	const message = { content: "**📨 Intercom message**\nPi session ID: peer-1\n\n---\n\nFirst body", details: { count: 4, entries: [
		{ fromSessionId: "peer-1", messageId: "ask-1", expectsReply: true, replyable: true },
		{ fromSessionId: "peer-2", messageId: "ask-2", expectsReply: false, replyable: false },
		{ fromSessionId: "peer-3", messageId: "ask-3", expectsReply: false, replyable: false },
		{ fromSessionId: "peer-4", messageId: "ask-4", expectsReply: false, replyable: false },
	], views: [
		{ fromName: "worker", preview: "First body", previewTruncated: false },
		{ preview: "Second body", previewTruncated: false },
		{ preview: "Third body", previewTruncated: false },
		{ preview: "Fourth body", previewTruncated: false },
	] } };
	const collapsed = renderer(message, { expanded: false, outputPad: 1 }, theme).render(120).join("\n");
	assert.match(collapsed, /4 messages/);
	assert.match(collapsed, /… 2 more/);
	assert.doesNotMatch(collapsed, /Third body/);
	assert.doesNotMatch(collapsed, /Pi session ID/);
	const expanded = renderer(message, { expanded: true, outputPad: 1 }, theme).render(120).join("\n");
	assert.match(expanded, /Pi session ID: peer-1/);
	assert.match(expanded, /First body/);
	assert.equal(message.content.includes("First body"), true);

	const single = { content: "**📨 Intercom message**\nPi session ID: peer-1\n\n---\n\nSafe preview plus hidden raw body and attachment", details: { entries: [{ fromSessionId: "peer-1", messageId: "message-1", expectsReply: false, replyable: false, attachmentCount: 1, truncated: false }], views: [{ fromName: "worker", preview: "Safe preview", previewTruncated: true }] } };
	const singleCollapsed = renderer(single, { expanded: false, outputPad: 1 }, theme).render(120).join("\n");
	assert.match(singleCollapsed, /Safe preview/);
	assert.match(singleCollapsed, /to expand/);
	assert.doesNotMatch(singleCollapsed, /hidden raw body/);
	assert.match(renderer(single, { expanded: true, outputPad: 1 }, theme).render(120).join("\n"), /hidden raw body/);

	const operationRenderer = renderers.get("intercom_operation");
	const failure = operationRenderer({ content: "**Intercom operation op**\n\nsend failed\n\nMessage preview:\nThe useful update", details: { operationId: "op", sequence: 1, kind: "send", state: "failed", acceptedAt: 1, targetSessionId: "peer-1", reason: "not connected" } }, { expanded: false, outputPad: 1 }, theme).render(120).join("\n");
	assert.match(failure, /send failed/);
	assert.match(failure, /message: The useful update/);
	assert.doesNotMatch(failure, /peer-1/);
	assert.match(failure, /not connected/);
	assert.match(failure, /to expand/);
	assert.match(operationRenderer({ content: "full failure with peer-1", details: { operationId: "op", sequence: 1, kind: "send", state: "failed", acceptedAt: 1, targetSessionId: "peer-1", reason: "not connected" } }, { expanded: true, outputPad: 1 }, theme).render(120).join("\n"), /peer-1/);
});

test("intercom tool rows keep messages visible while collapsing long results", () => {
	const tools = [];
	intercomExtension({ registerTool: (tool) => tools.push(tool), registerMessageRenderer() {}, on() {}, getSessionName: () => undefined });
	const tool = tools[0];
	const theme = { fg: (_color, text) => text, bold: (text) => text };
	const args = { action: "send", to: "peer", message: "A visible update", attachments: [{ type: "context", name: "context\nforged", language: "text\u001b", content: "hidden attachment" }] };
	const collapsedCall = tool.renderCall(args, theme, { expanded: false }).render(120).join("\n");
	assert.match(collapsedCall, /A visible update/);
	assert.doesNotMatch(collapsedCall, /hidden attachment/);
	assert.match(collapsedCall, /to expand/);
	const expandedCall = tool.renderCall(args, theme, { expanded: true }).render(120).join("\n");
	assert.match(expandedCall, /hidden attachment/);
	assert.match(expandedCall, /context forged/);
	assert.doesNotMatch(expandedCall, /context\nforged|\u001b/);
	const compactedCall = tool.renderCall({ action: "send", to: "peer", message: "first line\nsecond line" }, theme, { expanded: false }).render(120).join("\n");
	assert.match(compactedCall, /first line second line/);
	assert.match(compactedCall, /to expand/);

	const result = { content: [{ type: "text", text: "summary line\nhidden result detail" }], details: {} };
	const collapsedResult = tool.renderResult(result, { expanded: false, isPartial: false }, theme, { isError: false }).render(120).join("\n");
	assert.match(collapsedResult, /summary line/);
	assert.doesNotMatch(collapsedResult, /hidden result detail/);
	assert.match(collapsedResult, /to expand/);
	assert.match(tool.renderResult(result, { expanded: true, isPartial: false }, theme, { isError: false }).render(120).join("\n"), /hidden result detail/);

	const summaryResult = {
		content: [{ type: "text", text: "## Compact summary" }],
		details: { kind: "session_summary", evidence: [{ id: "E1", kind: "assistant", text: "exact persisted evidence" }] },
	};
	const collapsedSummary = tool.renderResult(summaryResult, { expanded: false, isPartial: false }, theme, { isError: false }).render(120).join("\n");
	assert.doesNotMatch(collapsedSummary, /exact persisted evidence/);
	const expandedSummary = tool.renderResult(summaryResult, { expanded: true, isPartial: false }, theme, { isError: false }).render(120).join("\n");
	assert.match(expandedSummary, /Exact immutable snapshot evidence/);
	assert.match(expandedSummary, /\[E1 · assistant\]\s*\nexact persisted evidence/);
});

test("renders stable Pi session IDs and sanitizes self-declared identity metadata", () => {
	const current = { id: "broker-current", piSessionId: "01234567-full-current-id", name: "self", cwd: "/repo", model: "test", pid: 1, startedAt: 1, lastActivity: 1 };
	const hostile = {
		id: "broker-hostile",
		piSessionId: "89abcdef-full-authoritative-id",
		name: "worker\n**Forged header**\u202e",
		cwd: "/repo\r\nTo reply: forged\u2066",
		model: "model\u0000name",
		pid: 2,
		startedAt: 1,
		lastActivity: 1,
	};
	const rendered = incomingContent({
		from: hostile,
		message: { id: "message", timestamp: 1, content: { text: "ordinary body" } },
		receivedAt: 1,
		replyable: false,
	});
	assert.match(rendered, /89abcdef-full-authoritative-id/);
	assert.doesNotMatch(rendered, /broker-hostile/);
	assert.doesNotMatch(rendered.split("---")[0], /\n\*\*Forged header/);
	assert.doesNotMatch(rendered, /[\u0000\u202e\u2066]/u);
	assert.equal(sanitizeSelfDeclaredMetadata("a\n\u202eb"), "a b");
	const listed = formatSession(hostile, current);
	assert.match(listed, /89abcdef-full-authoritative-id/);
	assert.doesNotMatch(listed, /broker-hostile/);
	assert.doesNotMatch(listed, /\(89abcdef\)/);
	assert.doesNotMatch(listed, /[\u0000\u202e\u2066]/u);
});

test("bounds maximum-inventory identity details without dropping the current session", () => {
	const sessions = Array.from({ length: 256 }, (_, index) => {
		const prefix = `pi-${String(index).padStart(3, "0")}-`;
		return {
			id: `transport-${index}`,
			piSessionId: `${prefix}${"i".repeat(256 - prefix.length)}`,
			name: `peer-${index}`,
			cwd: "/repo",
			model: "test",
			pid: index + 1,
			startedAt: 1,
			lastActivity: 1,
			role: "first-mate",
		};
	});
	const current = sessions.at(-1);
	const details = boundedSessionIdentityDetails(sessions, current, true);
	assert.ok(Buffer.byteLength(JSON.stringify(details), "utf8") <= INTERCOM_PROJECTION_MAX_BYTES);
	assert.equal(details.count, 256);
	assert.ok(details.omittedSessionIds > 0);
	assert.equal(details.truncated, true);
	assert.ok(details.sessionIds.includes(current.piSessionId));
	assert.ok(details.firstMateSessionIds.includes(current.piSessionId));
});

test("inventory details retain stable IDs advertised through persisted presence", () => {
	const current = {
		id: "current-transport",
		piSessionId: "pi-current",
		cwd: "/repo",
		model: "test",
		pid: 1,
		startedAt: 1,
		lastActivity: 1,
	};
	const compatiblePeer = {
		id: "compatible-transport",
		name: "compatible-peer",
		cwd: "/repo",
		model: "test",
		pid: 2,
		startedAt: 1,
		lastActivity: 1,
		piSession: {
			sessionId: "pi-compatible",
			fileLocator: "/tmp/compatible.jsonl",
			activeLeafId: "leaf",
			revision: 1,
		},
	};
	const details = boundedSessionIdentityDetails([current, compatiblePeer], current, false);
	assert.deepEqual(details.sessionIds, ["pi-current", "pi-compatible"]);
	assert.equal(details.unidentifiedSessions, 0);
	assert.equal(details.omittedSessionIds, 0);
	assert.equal(details.truncated, false);
});

test("bounds and coalesces inbound Pi delivery per sender and globally", async () => {
	const calls = [];
	const pi = { sendMessage: (...args) => calls.push(args) };
	const limits = {
		...INBOUND_DELIVERY_LIMITS,
		perSenderMessages: 2,
		perSenderBytes: 10_000,
		globalMessages: 3,
		globalBytes: 20_000,
		pendingMessages: 3,
		pendingBytes: 20_000,
		flushDelayMs: 0,
	};
	const delivery = new InboundDelivery(pi, () => 1, limits);
	const entry = (sender, id) => ({
		from: { id: sender, name: sender, cwd: "/repo", model: "test", pid: 1, startedAt: 1, lastActivity: 1 },
		message: { id, timestamp: 1, content: { text: id } },
		receivedAt: 1,
		replyable: false,
	});
	assert.equal(delivery.record(entry("peer-a", "one")), true);
	assert.equal(delivery.record(entry("peer-a", "two")), true);
	assert.equal(delivery.record(entry("peer-a", "per-peer-overflow")), false);
	assert.equal(delivery.record(entry("peer-b", "three")), true);
	assert.equal(delivery.record(entry("peer-c", "global-overflow")), false);
	await new Promise((resolve) => setTimeout(resolve, 10));
	assert.equal(calls.filter((call) => call[1].triggerTurn).length, 0);
	assert.equal(calls.filter((call) => call[0].details?.overflow).length, 1);
	const passive = calls.find((call) => !call[0].details?.overflow);
	assert.match(passive[0].content, /one/);
	assert.match(passive[0].content, /three/);
	for (let index = 0; index < 100; index++) delivery.record(entry("peer-a", `flood-${index}`));
	assert.equal(calls.length, 2);
	delivery.settled();
	await new Promise((resolve) => setTimeout(resolve, 10));
	assert.ok(calls.length <= 3);
	assert.equal(calls.filter((call) => call[1].triggerTurn).length, 0);
	delivery.dispose();
});

test("replyable asks steer active work while one-way sends wait for idle and then start a turn", async () => {
	const calls = [];
	const delivery = new InboundDelivery(
		{ sendMessage: (...args) => calls.push(args) },
		() => 1,
		{ ...INBOUND_DELIVERY_LIMITS, flushDelayMs: 0 },
	);
	const from = { id: "peer", name: "peer", cwd: "/repo", model: "test", pid: 1, startedAt: 1, lastActivity: 1 };
	delivery.started();
	delivery.record({
		from,
		message: { id: "update", timestamp: 1, triggerTurn: true, content: { text: "ordinary update" } },
		receivedAt: 1,
		replyable: false,
	});
	await new Promise((resolve) => setTimeout(resolve, 10));
	assert.equal(calls.length, 0);
	delivery.settled();
	await new Promise((resolve) => setTimeout(resolve, 10));
	assert.deepEqual(calls[0][1], { deliverAs: "followUp", triggerTurn: true });
	delivery.settled();

	delivery.started();
	delivery.record({
		from,
		message: { id: "question", timestamp: 2, expectsReply: true, triggerTurn: true, content: { text: "question" } },
		receivedAt: 2,
		replyable: true,
	});
	await new Promise((resolve) => setTimeout(resolve, 10));
	assert.deepEqual(calls[1][1], { deliverAs: "steer", triggerTurn: true });
	delivery.dispose();
});

test("unretained asks emit only one passive overflow notice and never trigger a turn", async () => {
	const calls = [];
	const delivery = new InboundDelivery(
		{ sendMessage: (...args) => calls.push(args) },
		() => 1,
		{ ...INBOUND_DELIVERY_LIMITS, flushDelayMs: 0 },
	);
	const rejected = delivery.record({
		from: { id: "peer", name: "peer", cwd: "/repo", model: "test", pid: 1, startedAt: 1, lastActivity: 1 },
		message: { id: "rejected", timestamp: 1, expectsReply: true, content: { text: "over limit or duplicate" } },
		receivedAt: 1,
		replyable: false,
	});
	await new Promise((resolve) => setTimeout(resolve, 10));
	assert.equal(rejected, false);
	assert.equal(calls.length, 1);
	assert.equal(calls[0][0].details.overflow, true);
	assert.deepEqual(calls[0][1], { deliverAs: "nextTurn", triggerTurn: false });
	delivery.dispose();
});

test("a mixed ordinary-and-ask batch steers once", async () => {
	const calls = [];
	const delivery = new InboundDelivery(
		{ sendMessage: (...args) => calls.push(args) },
		() => 1,
		{ ...INBOUND_DELIVERY_LIMITS, flushDelayMs: 0 },
	);
	const from = { id: "peer", name: "peer", cwd: "/repo", model: "test", pid: 1, startedAt: 1, lastActivity: 1 };
	assert.equal(delivery.record({ from, message: { id: "update", timestamp: 1, content: { text: "update" } }, receivedAt: 1, replyable: false }), true);
	assert.equal(delivery.record({ from, message: { id: "ask", timestamp: 2, expectsReply: true, content: { text: "ask" } }, receivedAt: 2, replyable: true }), true);
	await new Promise((resolve) => setTimeout(resolve, 10));
	assert.equal(calls.length, 1);
	assert.deepEqual(calls[0][1], { deliverAs: "steer", triggerTurn: true });
	assert.match(calls[0][0].content, /update/);
	assert.match(calls[0][0].content, /ask/);
	delivery.dispose();
});

test("recipient turns remain bounded by inbound message budgets", async () => {
	const calls = [];
	const limits = {
		...INBOUND_DELIVERY_LIMITS,
		perSenderMessages: 100,
		perSenderBytes: 100_000,
		globalMessages: 2,
		globalBytes: 100_000,
		pendingMessages: 10,
		pendingBytes: 100_000,
		flushDelayMs: 0,
	};
	const delivery = new InboundDelivery({ sendMessage: (...args) => calls.push(args) }, () => 1, limits);
	const entry = (id) => ({
		from: { id: "attacker", name: "attacker", cwd: "/repo", model: "test", pid: 1, startedAt: 1, lastActivity: 1 },
		message: { id, timestamp: 1, triggerTurn: true, content: { text: id } },
		receivedAt: 1,
		replyable: false,
	});
	for (let index = 0; index < 8; index++) {
		delivery.record(entry(`batch-${index}`));
		await new Promise((resolve) => setTimeout(resolve, 5));
		delivery.settled();
	}
	await new Promise((resolve) => setTimeout(resolve, 5));
	assert.equal(calls.filter((call) => call[1].triggerTurn).length, limits.globalMessages);
	assert.equal(calls.filter((call) => call[0].details?.overflow).length, 1);
	assert.equal(calls.length, limits.globalMessages + 1);
	delivery.dispose();
});

test("presence advertises only persisted snapshots and follows idle tree and user Bash changes", async (t) => {
	const fixture = await isolatedIntercom(t, "presence-life-");
	const previousHome = process.env.HOME;
	process.env.HOME = fixture.home;
	t.after(() => {
		if (previousHome === undefined) delete process.env.HOME;
		else process.env.HOME = previousHome;
	});
	const broker = await startOwnedBroker(fixture.paths);
	t.after(() => stopChild(broker));
	const observer = await connectNew(fixture.paths, "observer");
	t.after(() => observer.disconnect());
	const handlers = new Map();
	const pi = {
		registerTool() {},
		registerMessageRenderer() {},
		on: (name, handler) => handlers.set(name, handler),
		getSessionName: () => "tracked",
		appendEntry() {},
		sendMessage() {},
	};
	intercomExtension(pi);
	const sessionPath = `${fixture.base}/tracked.jsonl`;
	let leaf = null;
	const entries = [];
	const ctx = {
		cwd: "/repo",
		model: { id: "fixture-model" },
		sessionManager: {
			getSessionId: () => "tracked-pi-session",
			getSessionFile: () => sessionPath,
			getLeafId: () => leaf,
			getEntries: () => [...entries],
			getBranch: () => [...entries],
		},
	};
	await handlers.get("session_start")({}, ctx);
	t.after(() => handlers.get("session_shutdown")());
	await waitFor(async () => (await observer.listSessions()).some((session) => session.name === "tracked"));
	let tracked = (await observer.listSessions()).find((session) => session.name === "tracked");
	assert.equal(tracked.piSession, undefined);

	leaf = "first";
	await writeFile(sessionPath, `${JSON.stringify({ type: "session", version: 3, id: "tracked-pi-session", timestamp: "2026-01-01T00:00:00.000Z", cwd: "/repo" })}\n${JSON.stringify({ type: "message", id: "first", parentId: null, timestamp: "2026-01-01T00:00:01.000Z", message: { role: "user", content: "first", timestamp: 1 } })}\n`);
	handlers.get("agent_end")();
	tracked = await waitFor(async () => {
		const session = (await observer.listSessions()).find((item) => item.name === "tracked");
		return session?.piSession?.revision === 1 ? session : undefined;
	});
	assert.equal(tracked.piSession.activeLeafId, "first");

	leaf = null;
	handlers.get("session_tree")();
	tracked = await waitFor(async () => {
		const session = (await observer.listSessions()).find((item) => item.name === "tracked");
		return session?.piSession?.revision === 2 ? session : undefined;
	});
	assert.equal(tracked.piSession.activeLeafId, null);

	handlers.get("user_bash")();
	leaf = "bash-result";
	const bashEntry = { type: "message", id: "bash-result", parentId: "first", timestamp: "2026-01-01T00:00:02.000Z", message: { role: "bashExecution", command: "private", output: "private", exitCode: 0, cancelled: false, truncated: false, timestamp: 2 } };
	entries.push(bashEntry);
	await appendFile(sessionPath, `${JSON.stringify(bashEntry)}\n`);
	tracked = await waitFor(async () => {
		const session = (await observer.listSessions()).find((item) => item.name === "tracked");
		return session?.piSession?.revision === 3 ? session : undefined;
	});
	assert.equal(tracked.piSession.activeLeafId, "bash-result");
});

test("first user Bash stays unadvertised until Pi actually persists the session", async (t) => {
	const fixture = await isolatedIntercom(t, "first-bash-");
	const previousHome = process.env.HOME;
	process.env.HOME = fixture.home;
	t.after(() => {
		if (previousHome === undefined) delete process.env.HOME;
		else process.env.HOME = previousHome;
	});
	const broker = await startOwnedBroker(fixture.paths);
	t.after(() => stopChild(broker));
	const observer = await connectNew(fixture.paths, "observer");
	t.after(() => observer.disconnect());
	const sessionDir = `${fixture.base}/sessions`;
	await mkdir(sessionDir);
	const manager = SessionManager.create(fixture.base, sessionDir, { id: "first-bash-pi-session" });
	const handlers = new Map();
	intercomExtension({
		registerTool() {},
		registerMessageRenderer() {},
		on: (name, handler) => handlers.set(name, handler),
		getSessionName: () => "first-bash",
		appendEntry() {},
		sendMessage() {},
	});
	const ctx = { cwd: fixture.base, model: { id: "fixture-model" }, sessionManager: manager };
	await handlers.get("session_start")({}, ctx);
	t.after(() => handlers.get("session_shutdown")());
	await waitFor(async () => (await observer.listSessions()).some((session) =>
		session.name === "first-bash" && session.lastConversationalTimestamp === null));
	handlers.get("user_bash")();
	manager.appendMessage({ role: "bashExecution", command: "first", output: "done", exitCode: 0, cancelled: false, truncated: false, timestamp: 1 });
	await assert.rejects(readFile(manager.getSessionFile()), /ENOENT/);
	assert.equal((await observer.listSessions()).find((session) => session.name === "first-bash").piSession, undefined);

	manager.appendMessage({ role: "assistant", content: [{ type: "text", text: "persisted" }], stopReason: "stop", timestamp: 2 });
	handlers.get("agent_end")();
	const advertised = await waitFor(async () => {
		const session = (await observer.listSessions()).find((item) => item.name === "first-bash");
		return session?.piSession ? session : undefined;
	});
	assert.equal(advertised.piSession.sessionId, "first-bash-pi-session");
	assert.equal(advertised.piSession.activeLeafId, manager.getLeafId());
	assert.equal(advertised.lastConversationalTimestamp, Date.parse(manager.getLeafEntry().timestamp));
});

test("a Bash started before first persistence refreshes when it finishes after agent_end", async (t) => {
	const fixture = await isolatedIntercom(t, "stream-bash-");
	const previousHome = process.env.HOME;
	process.env.HOME = fixture.home;
	t.after(() => {
		if (previousHome === undefined) delete process.env.HOME;
		else process.env.HOME = previousHome;
	});
	const broker = await startOwnedBroker(fixture.paths);
	t.after(() => stopChild(broker));
	const observer = await connectNew(fixture.paths, "observer");
	t.after(() => observer.disconnect());
	const sessionDir = `${fixture.base}/sessions`;
	await mkdir(sessionDir);
	const manager = SessionManager.create(fixture.base, sessionDir, { id: "stream-bash-pi-session" });
	const handlers = new Map();
	intercomExtension({
		registerTool() {},
		registerMessageRenderer() {},
		on: (name, handler) => handlers.set(name, handler),
		getSessionName: () => "stream-bash",
		appendEntry() {},
		sendMessage() {},
	});
	const ctx = { cwd: fixture.base, model: { id: "fixture-model" }, sessionManager: manager };
	await handlers.get("session_start")({}, ctx);
	t.after(() => handlers.get("session_shutdown")());
	await waitFor(async () => (await observer.listSessions()).some((session) => session.name === "stream-bash"));
	manager.appendMessage({ role: "user", content: "question", timestamp: 1 });
	handlers.get("user_bash")();
	manager.appendMessage({ role: "assistant", content: [{ type: "text", text: "assistant finished" }], stopReason: "stop", timestamp: 2 });
	handlers.get("agent_end")();
	const assistantPresence = await waitFor(async () => {
		const session = (await observer.listSessions()).find((item) => item.name === "stream-bash");
		return session?.piSession ? session : undefined;
	});
	assert.equal(assistantPresence.piSession.activeLeafId, manager.getLeafId());
	const assistantLeaf = manager.getLeafId();

	manager.appendMessage({ role: "bashExecution", command: "slow", output: "done", exitCode: 0, cancelled: false, truncated: false, timestamp: 3 });
	const bashPresence = await waitFor(async () => {
		const session = (await observer.listSessions()).find((item) => item.name === "stream-bash");
		return session?.piSession?.activeLeafId === manager.getLeafId() ? session : undefined;
	});
	assert.notEqual(bashPresence.piSession.activeLeafId, assistantLeaf);
	assert.ok(bashPresence.piSession.revision > assistantPresence.piSession.revision);
});

test("real SessionManager lifecycle clears First Mate role until explicit reinvocation", async (t) => {
	const fixture = await isolatedIntercom(t, "role-life-");
	const previousHome = process.env.HOME;
	process.env.HOME = fixture.home;
	t.after(() => {
		if (previousHome === undefined) delete process.env.HOME;
		else process.env.HOME = previousHome;
	});
	let broker = await startOwnedBroker(fixture.paths);
	t.after(() => stopChild(broker));
	let observer = await connectNew(fixture.paths, "role-observer");
	t.after(() => observer.disconnect());
	const tools = [];
	const handlers = new Map();
	intercomExtension({
		registerTool: (tool) => tools.push(tool),
		registerMessageRenderer() {},
		on: (name, handler) => handlers.set(name, handler),
		getSessionName: () => "lifecycle-first-mate",
		appendEntry() {},
		sendMessage() {},
	});
	const sessionDir = `${fixture.base}/sessions`;
	await mkdir(sessionDir);
	const manager = SessionManager.create(fixture.base, sessionDir, { id: "role-life-a" });
	const firstEntry = manager.appendMessage({ role: "user", content: "first", timestamp: 1 });
	manager.appendMessage({ role: "assistant", content: [{ type: "text", text: "ready" }], stopReason: "stop", timestamp: 2 });
	let ctx = { cwd: fixture.base, model: { id: "fixture-model" }, sessionManager: manager };
	await handlers.get("session_start")({ reason: "startup" }, ctx);
	const execute = (params) => tools[0].execute("call", params, undefined, undefined, ctx);
	const listedSession = async (client = observer) => (await client.listSessions()).find((session) => session.name === "lifecycle-first-mate");
	const listedRole = async (client = observer) => (await listedSession(client))?.role;
	await waitFor(async () => (await observer.listSessions()).some((session) => session.name === "lifecycle-first-mate"));
	assert.equal((await listedSession()).piSessionId, "role-life-a");
	assert.equal(await listedRole(), undefined);

	const invoke = async (client = observer) => {
		const result = await execute({ action: "role", role: "first-mate" });
		assert.match(result.content[0].text, /Published First Mate role/);
		await waitFor(async () => await listedRole(client) === "first-mate");
	};
	await invoke();
	manager.branch(firstEntry);
	await handlers.get("session_tree")({ oldLeafId: undefined, newLeafId: firstEntry }, ctx);
	await waitFor(async () => await listedRole() === undefined);

	await invoke();
	manager.appendCompaction("compact", firstEntry, 10);
	await handlers.get("session_compact")({ reason: "manual" }, ctx);
	await waitFor(async () => await listedRole() === undefined);

	await invoke();
	await handlers.get("session_shutdown")({ reason: "reload" }, ctx);
	await waitFor(async () => !(await observer.listSessions()).some((session) => session.name === "lifecycle-first-mate"));
	await handlers.get("session_start")({ reason: "reload" }, ctx);
	await waitFor(async () => (await observer.listSessions()).some((session) => session.name === "lifecycle-first-mate"));
	assert.equal((await listedSession()).piSessionId, "role-life-a");
	assert.equal(await listedRole(), undefined);
	await invoke();

	await handlers.get("session_shutdown")({ reason: "new" }, ctx);
	const replacement = SessionManager.create(fixture.base, sessionDir, { id: "role-life-b" });
	replacement.appendMessage({ role: "user", content: "replacement", timestamp: 3 });
	ctx = { cwd: fixture.base, model: { id: "fixture-model" }, sessionManager: replacement };
	await handlers.get("session_start")({ reason: "new", previousSessionFile: manager.getSessionFile() }, ctx);
	await waitFor(async () => (await observer.listSessions()).some((session) => session.name === "lifecycle-first-mate"));
	assert.equal((await listedSession()).piSessionId, "role-life-b");
	assert.equal(await listedRole(), undefined);
	await invoke();

	await handlers.get("session_shutdown")({ reason: "resume" }, ctx);
	const resumed = SessionManager.create(fixture.base, sessionDir, { id: "role-life-c" });
	resumed.appendMessage({ role: "user", content: "resumed", timestamp: 4 });
	ctx = { cwd: fixture.base, model: { id: "fixture-model" }, sessionManager: resumed };
	await handlers.get("session_start")({ reason: "resume", previousSessionFile: replacement.getSessionFile() }, ctx);
	await waitFor(async () => (await observer.listSessions()).some((session) => session.name === "lifecycle-first-mate"));
	assert.equal((await listedSession()).piSessionId, "role-life-c");
	assert.equal(await listedRole(), undefined);
	await invoke();

	const disconnected = new Promise((resolve) => observer.once("disconnected", resolve));
	await stopChild(broker);
	await disconnected;
	broker = await startOwnedBroker(fixture.paths);
	observer = await connectNew(fixture.paths, "role-observer-reconnected");
	await waitFor(async () => (await observer.listSessions()).some((session) => session.name === "lifecycle-first-mate"), 5_000);
	assert.equal((await listedSession()).piSessionId, "role-life-c");
	assert.equal(await listedRole(), undefined);
	await invoke(observer);

	await handlers.get("session_shutdown")({ reason: "quit" }, ctx);
	await waitFor(async () => !(await observer.listSessions()).some((session) => session.name === "lifecycle-first-mate"));
});

test("tree and compaction fence both role publication race orders", async (t) => {
	const fixture = await isolatedIntercom(t, "role-race-");
	const previousHome = process.env.HOME;
	process.env.HOME = fixture.home;
	t.after(() => {
		if (previousHome === undefined) delete process.env.HOME;
		else process.env.HOME = previousHome;
	});
	const sockets = new Set();
	const roleRequests = [];
	let activeSocket;
	let activeSession;
	let activeRole;
	let nextId = 0;
	const server = net.createServer((socket) => {
		sockets.add(socket);
		socket.on("error", () => undefined);
		socket.on("close", () => {
			sockets.delete(socket);
			if (activeSocket === socket) {
				activeSocket = undefined;
				activeSession = undefined;
				activeRole = undefined;
			}
		});
		const decoder = new FrameDecoder((message) => {
			if (message?.type === "register") {
				activeSocket = socket;
				activeSession = { id: `role-race-${++nextId}`, ...message.session };
				socket.write(encodeFrame({ type: "registered", sessionId: activeSession.id, capabilities: ["first-mate-role-v1"] }));
				return;
			}
			if (message?.type === "presence" && message.role !== undefined) {
				const request = {
					role: message.role,
					complete() {
						if (socket.destroyed || activeSocket !== socket || !activeSession) return;
						activeRole = message.role ?? undefined;
						socket.write(encodeFrame({ type: "role_updated", requestId: message.requestId, role: message.role }));
					},
				};
				roleRequests.push(request);
				return;
			}
			if (message?.type === "list") {
				const session = activeSession && activeSocket === socket
					? { ...activeSession, ...(activeRole ? { role: activeRole } : {}) }
					: undefined;
				socket.write(encodeFrame({ type: "sessions", requestId: message.requestId, sessions: session ? [session] : [] }));
				return;
			}
			if (message?.type === "unregister") socket.destroy();
		}, () => socket.destroy());
		socket.on("data", (chunk) => decoder.push(chunk));
	});
	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(fixture.paths.socketPath, resolve);
	});
	t.after(async () => {
		for (const socket of sockets) socket.destroy();
		await new Promise((resolve) => server.close(resolve));
	});

	const tools = [];
	const handlers = new Map();
	intercomExtension({
		registerTool: (tool) => tools.push(tool),
		registerMessageRenderer() {},
		on: (name, handler) => handlers.set(name, handler),
		getSessionName: () => "role-race",
		appendEntry() {},
		sendMessage() {},
	});
	const ctx = {
		cwd: fixture.base,
		model: { id: "fixture-model" },
		sessionManager: { getSessionId: () => "role-race-pi", getSessionFile: () => undefined, getLeafId: () => null, getBranch: () => [] },
	};
	await handlers.get("session_start")({}, ctx);
	t.after(() => handlers.get("session_shutdown")());
	await waitFor(() => activeSession);
	const executeRole = () => tools[0].execute("call", { action: "role", role: "first-mate" }, undefined, undefined, ctx);

	const publishBeforeTree = executeRole();
	await waitFor(() => roleRequests.length === 1);
	const tree = handlers.get("session_tree")({}, ctx);
	await waitFor(() => roleRequests.length === 2);
	roleRequests[0].complete();
	await assert.rejects(publishBeforeTree, /superseded by a lifecycle transition/);
	roleRequests[1].complete();
	await tree;
	assert.equal(activeRole, undefined);

	const republish = executeRole();
	await waitFor(() => roleRequests.length === 3);
	roleRequests[2].complete();
	await republish;
	assert.equal(activeRole, "first-mate");

	const compact = handlers.get("session_compact")({}, ctx);
	await waitFor(() => roleRequests.length === 4);
	const publishAfterCompactStarted = executeRole();
	await waitFor(() => roleRequests.length === 5);
	roleRequests[3].complete();
	await compact;
	await assert.rejects(publishAfterCompactStarted, /disconnected|superseded/);
	roleRequests[4].complete();
	await waitFor(() => activeRole === undefined);
});

test("successful tool actions report resolved peer IDs and persist only compact authoritative audits", async (t) => {
	const fixture = await isolatedIntercom(t, "index-actions-");
	const previousHome = process.env.HOME;
	process.env.HOME = fixture.home;
	t.after(() => {
		if (previousHome === undefined) delete process.env.HOME;
		else process.env.HOME = previousHome;
	});
	const broker = await startOwnedBroker(fixture.paths);
	t.after(() => stopChild(broker));
	const peer = await connectNew(fixture.paths, "worker");
	t.after(() => peer.disconnect());
	const tools = [];
	const handlers = new Map();
	const audits = [];
	const delivered = [];
	const pi = {
		registerTool: (tool) => tools.push(tool),
		registerMessageRenderer() {},
		on: (name, handler) => handlers.set(name, handler),
		getSessionName: () => "caller",
		appendEntry: (type, data) => audits.push({ type, data }),
		sendMessage: (...args) => delivered.push(args),
	};
	let idle = true;
	const summaryModelCalls = [];
	const summaryUsage = {
		input: 10,
		output: 5,
		cacheRead: 2,
		cacheWrite: 1,
		reasoning: 3,
		totalTokens: 18,
		cost: { input: 0.01, output: 0.02, cacheRead: 0.003, cacheWrite: 0.004, total: 0.037 },
	};
	intercomExtension(pi, {
		summaryModel: {
			async complete(systemPrompt, prompt, timestamp, signal) {
				summaryModelCalls.push({ systemPrompt, prompt, timestamp, signal });
				return {
					text: JSON.stringify({
						title: "Tail decision",
						state: "awaiting_decision",
						mainPoint: "The persisted answer leaves one bounded decision.",
						safeToClose: "no",
						decision: {
							action: "Approve the exact follow-up.",
							fences: ["Preserve unrelated work"],
						},
						limitations: ["Persisted evidence is not live verification."],
						evidenceIds: ["E1", "E2"],
					}),
					usage: summaryUsage,
				};
			},
		},
	});
	const ctx = {
		cwd: "/repo",
		model: { id: "fixture-model" },
		modelRegistry: {},
		isIdle: () => idle,
		sessionManager: { getSessionId: () => "full-pi-session-id", getSessionFile: () => undefined, getLeafId: () => null, getBranch: () => [] },
	};
	await handlers.get("session_start")({}, ctx);
	t.after(() => handlers.get("session_shutdown")());
	// Pi creates a fresh ExtensionContext for each tool execution; exercising that contract
	// prevents a tool call from poisoning later asynchronous inbound delivery.
	const execute = (params, signal) => tools[0].execute("call", params, signal, undefined, { ...ctx });
	const connectedStatus = await execute({ action: "status" });
	assert.equal(connectedStatus.details.connected, true);
	assert.equal(connectedStatus.details.tailCapability, true);
	assert.equal(connectedStatus.details.advertisingPiSession, false);
	assert.equal(connectedStatus.details.roleCapability, true);
	assert.equal(connectedStatus.details.advertisingFirstMate, false);
	const ownedId = (await peer.listSessions()).find((item) => item.name === "caller").id;
	const peerSessionId = peer.currentPiSessionId();

	assert.equal(await peer.setRole("first-mate"), "first-mate");
	const advertisedRole = await execute({ action: "role", role: "first-mate" });
	assert.equal(advertisedRole.details.sessionId, "full-pi-session-id");
	assert.equal(advertisedRole.details.role, "first-mate");
	assert.equal(advertisedRole.details.advertisingFirstMate, true);
	assert.match(advertisedRole.content[0].text, /full-pi-session-id/);
	assert.doesNotMatch(advertisedRole.content[0].text, new RegExp(ownedId));
	await waitFor(async () => (await peer.listSessions()).find((item) => item.id === ownedId)?.role === "first-mate");

	const listed = await execute({ action: "list", limit: 1 });
	assert.ok(Buffer.byteLength(listed.content[0].text) <= INTERCOM_PROJECTION_MAX_BYTES);
	assert.equal(listed.details.count, 2);
	assert.equal(listed.details.currentSessionId, advertisedRole.details.sessionId);
	assert.equal(listed.details.sessionIds.includes(peerSessionId), true);
	assert.deepEqual(listed.details.firstMateSessionIds, [peerSessionId, "full-pi-session-id"]);
	assert.equal(listed.details.firstMateSessionIds.includes(advertisedRole.details.sessionId), true);
	for (const id of listed.details.firstMateSessionIds) assert.match(listed.content[0].text, new RegExp(id));
	assert.match(listed.content[0].text, /role: first-mate/);
	assert.equal("sessions" in listed.details, false);
	const clearedRole = await execute({ action: "role" });
	assert.equal(clearedRole.details.role, null);
	assert.equal(clearedRole.details.advertisingFirstMate, false);
	await waitFor(async () => (await peer.listSessions()).find((item) => item.id === ownedId)?.role === undefined);

	const privateSentinel = "PRIVATE_TAIL_SENTINEL";
	const sessionPath = `${fixture.base}/target-session.jsonl`;
	const sessionRecords = [
		{ type: "session", version: 3, id: peerSessionId, timestamp: "2026-01-01T00:00:00.000Z", cwd: "/repo" },
		{ type: "message", id: "tail-u", parentId: null, timestamp: "2026-01-01T00:00:01.000Z", message: { role: "user", content: "tail question", timestamp: 1 } },
		{ type: "message", id: "tail-a", parentId: "tail-u", timestamp: "2026-01-01T00:00:02.000Z", message: { role: "assistant", content: [{ type: "thinking", thinking: privateSentinel }, { type: "text", text: "tail answer" }, { type: "toolCall", id: "tail-call", name: "read", arguments: { path: privateSentinel } }], stopReason: "toolUse", timestamp: 2 } },
		{ type: "message", id: "tail-r", parentId: "tail-a", timestamp: "2026-01-01T00:00:03.000Z", message: { role: "toolResult", toolCallId: "tail-call", toolName: "read", content: [{ type: "text", text: privateSentinel }], isError: false, timestamp: 3 } },
	];
	await writeFile(sessionPath, `${sessionRecords.map((record) => JSON.stringify(record)).join("\n")}\n`);
	let targetMessages = 0;
	peer.on("message", () => { targetMessages++; });
	peer.updatePresence({
		status: "idle",
		lastConversationalTimestamp: Date.now() - 2 * 60 * 60 * 1_000,
		piSession: { sessionId: peerSessionId, fileLocator: sessionPath, activeLeafId: "tail-r", revision: 1 },
	});
	await waitFor(async () => (await peer.listSessions()).find((session) => session.id === peer.sessionId)?.piSession?.revision === 1);
	const coordinatorTriage = await execute({ action: "triage" });
	assert.equal(coordinatorTriage.details.advertisingFirstMate, true);
	assert.equal(coordinatorTriage.details.selectedSweep, "none");
	assert.equal(coordinatorTriage.details.firstMatePeersSkipped, 1);
	assert.equal(coordinatorTriage.details.tails.length, 0);

	assert.equal(await peer.setRole(null), undefined);
	await waitFor(async () => (await peer.listSessions()).find((session) => session.id === peer.sessionId)?.role === undefined);
	const triaged = await execute({ action: "triage" });
	assert.equal(triaged.details.advertisingFirstMate, true);
	assert.equal(triaged.details.selectedSweep, "older");
	assert.equal(triaged.details.firstMatePeersSkipped, 0);
	assert.equal(triaged.details.tails.length, 1);
	assert.equal(triaged.details.tails[0].targetSessionId, peerSessionId);
	assert.equal(triaged.details.summaryCandidateCount, 1);
	assert.equal(triaged.details.summaryCandidatesDeferred, 0);
	assert.equal(triaged.details.summaryCandidatesUnavailable, 0);
	let summaryToken = triaged.content[0].text.match(/summaryToken "([^"]+)"/)?.[1];
	assert.ok(summaryToken);
	assert.match(triaged.content[0].text, /confirmed at least 24 hours stale/);
	assert.match(triaged.content[0].text, /tail question/);
	assert.ok(Buffer.byteLength(triaged.content[0].text) <= INTERCOM_PROJECTION_MAX_BYTES);
	assert.ok(Buffer.byteLength(JSON.stringify(triaged.details)) <= INTERCOM_PROJECTION_MAX_BYTES);

	const cancelledRefreshTriage = new AbortController();
	cancelledRefreshTriage.abort();
	await assert.rejects(execute({ action: "triage" }, cancelledRefreshTriage.signal), /cancelled/);
	await waitFor(async () => (await peer.listSessions()).find((session) => session.id === ownedId)?.role === "first-mate");
	assert.equal((await execute({ action: "status" })).details.advertisingFirstMate, true);
	const survivedFailedTriage = await execute({ action: "summarize", summaryToken });
	assert.match(survivedFailedTriage.content[0].text, /## Tail decision/);
	assert.equal(summaryModelCalls.length, 1);
	const preRefreshTriage = await execute({ action: "triage" });
	summaryToken = preRefreshTriage.content[0].text.match(/summaryToken "([^"]+)"/)?.[1];
	assert.ok(summaryToken);

	await execute({ action: "role" });
	await waitFor(async () => (await peer.listSessions()).find((session) => session.id === ownedId)?.role === undefined);
	const previousSummaryToken = summaryToken;
	const firstConcurrentTriage = execute({ action: "triage" });
	await assert.rejects(execute({ action: "triage" }), /already in progress/);
	const refreshedTriage = await firstConcurrentTriage;
	summaryToken = refreshedTriage.content[0].text.match(/summaryToken "([^"]+)"/)?.[1];
	assert.ok(summaryToken);
	assert.notEqual(summaryToken, previousSummaryToken);
	await assert.rejects(execute({ action: "summarize", summaryToken: previousSummaryToken }), /invalid, expired, or already used/);
	await waitFor(async () => (await peer.listSessions()).find((session) => session.id === ownedId)?.role === "first-mate");

	await execute({ action: "role" });
	await waitFor(async () => (await peer.listSessions()).find((session) => session.id === ownedId)?.role === undefined);
	const cancelledTriage = new AbortController();
	cancelledTriage.abort();
	await assert.rejects(execute({ action: "triage" }, cancelledTriage.signal), /cancelled/);
	await waitFor(async () => (await peer.listSessions()).find((session) => session.id === ownedId)?.role === undefined);
	assert.equal((await execute({ action: "status" })).details.advertisingFirstMate, false);

	const beforeTail = await readFile(sessionPath);
	const tailed = await execute({
		action: "tail",
		to: peerSessionId,
		tailScanBytes: beforeTail.length,
		tailProjectionBytes: 4_096,
	});
	const afterTail = await readFile(sessionPath);
	assert.equal(tailed.details.targetSessionId, peerSessionId);
	assert.equal(tailed.details.requestedScanBytes, beforeTail.length);
	assert.equal(tailed.details.requestedProjectionBytes, 4_096);
	assert.equal(tailed.details.lastConversationalTimestamp, Date.parse("2026-01-01T00:00:02.000Z"));
	assert.equal(tailed.details.availableTextMessages, 2);
	assert.equal(tailed.details.branchHistoryTruncated, false);
	assert.equal(tailed.details.returnedTextMessages, 2);
	assert.ok(Buffer.byteLength(tailed.content[0].text, "utf8") <= 4_096);
	assert.match(tailed.content[0].text, /tail question/);
	assert.match(tailed.content[0].text, /tail answer/);
	assert.match(tailed.content[0].text, /Tool "read": succeeded/);
	assert.equal(tailed.content[0].text.includes(privateSentinel), false);
	assert.equal(JSON.stringify(tailed.details).includes(sessionPath), false);
	assert.equal(JSON.stringify(tailed.details).includes(privateSentinel), false);
	assert.deepEqual(afterTail, beforeTail);
	assert.equal(targetMessages, 0);

	const activeAfterGrant = "ACTIVE_AFTER_SUMMARY_GRANT";
	await appendFile(sessionPath, `${JSON.stringify({ type: "message", id: "after-grant", parentId: "tail-r", timestamp: "2026-01-01T00:00:04.000Z", message: { role: "assistant", content: [{ type: "text", text: activeAfterGrant }], stopReason: "stop", timestamp: 4 } })}\n`);
	peer.updatePresence({
		status: "thinking",
		lastConversationalTimestamp: Date.now(),
		piSession: { sessionId: peerSessionId, fileLocator: sessionPath, activeLeafId: "after-grant", revision: 2 },
	});
	await waitFor(async () => (await peer.listSessions()).find((session) => session.id === peer.sessionId)?.piSession?.revision === 2);
	const beforeSummary = await readFile(sessionPath);
	const summarized = await execute({ action: "summarize", summaryToken });
	const afterSummary = await readFile(sessionPath);
	assert.match(summarized.content[0].text, /## Tail decision/);
	assert.match(summarized.content[0].text, /\*\*Needs a decision\.\*\*/);
	assert.match(summarized.content[0].text, /\*\*Next:\*\* Inspect the owning session's current persisted request/);
	assert.match(summarized.content[0].text, /\*\*Proposed:\*\* Approve the exact follow-up\./);
	assert.match(summarized.content[0].text, /\*\*Keep:\*\* Preserve unrelated work\./);
	assert.match(summarized.content[0].text, /\*\*Then:\*\* First Mate rechecks/);
	assert.match(summarized.content[0].text, /source session not messaged/);
	assert.equal(summarized.details.kind, "session_summary");
	assert.equal(summarized.details.targetSessionId, peerSessionId);
	assert.equal(summarized.details.model, "openai-codex/gpt-5.6-luna");
	assert.equal(summarized.details.reasoning, "xhigh");
	assert.equal(summarized.details.sourceMessaged, false);
	assert.equal(summarized.details.attempts, 1);
	assert.deepEqual(summarized.usage, summaryUsage);
	assert.equal(summaryModelCalls.length, 2);
	const latestSummaryModelCall = summaryModelCalls.at(-1);
	assert.equal(latestSummaryModelCall.prompt.includes(privateSentinel), false);
	assert.equal(latestSummaryModelCall.prompt.includes(activeAfterGrant), false);
	assert.match(latestSummaryModelCall.prompt, /tail question/);
	assert.match(latestSummaryModelCall.prompt, /tail answer/);
	assert.deepEqual(summarized.details.evidence.map(({ id, kind, text }) => ({ id, kind, text })), [
		{ id: "E1", kind: "user", text: "tail question" },
		{ id: "E2", kind: "assistant", text: "tail answer" },
		{ id: "E3", kind: "outcome", text: 'Tool "read": succeeded' },
	]);
	assert.equal(JSON.stringify(summarized).includes(privateSentinel), false);
	assert.ok(Buffer.byteLength(JSON.stringify(summarized.details)) <= INTERCOM_PROJECTION_MAX_BYTES);
	assert.deepEqual(afterSummary, beforeSummary);
	assert.equal(targetMessages, 0);
	await assert.rejects(execute({ action: "summarize", summaryToken }), /invalid, expired, or already used/);

	const windowedRecords = [
		sessionRecords[0],
		{ type: "custom", id: "old-padding", parentId: null, timestamp: "2026-01-01T00:00:01.000Z", customType: "padding", data: privateSentinel.repeat(1_024) },
		{ type: "message", id: "recent-u", parentId: "old-padding", timestamp: "2026-01-01T00:00:04.000Z", message: { role: "user", content: "recent window question", timestamp: 4 } },
		{ type: "message", id: "recent-a", parentId: "recent-u", timestamp: "2026-01-01T00:00:05.000Z", message: { role: "assistant", content: [{ type: "text", text: "recent window answer" }], stopReason: "stop", timestamp: 5 } },
	];
	await writeFile(sessionPath, `${windowedRecords.map((record) => JSON.stringify(record)).join("\n")}\n`);
	peer.updatePresence({ status: "idle", lastConversationalTimestamp: Date.now() - 2 * 60 * 60 * 1_000, piSession: { sessionId: peerSessionId, fileLocator: sessionPath, activeLeafId: "recent-a", revision: 3 } });
	await waitFor(async () => (await peer.listSessions()).find((session) => session.id === peer.sessionId)?.piSession?.revision === 3);
	const windowedTail = await execute({ action: "tail", to: peerSessionId, limit: 2, tailScanBytes: 8_192 });
	assert.match(windowedTail.content[0].text, /recent window question/);
	assert.match(windowedTail.content[0].text, /recent window answer/);
	assert.match(windowedTail.content[0].text, /Earlier branch history was not scanned after the requested text was found/);
	assert.equal(windowedTail.content[0].text.includes(privateSentinel), false);
	assert.equal(windowedTail.details.branchHistoryTruncated, true);
	assert.equal(windowedTail.details.observedTextMessages, 2);
	assert.equal("availableTextMessages" in windowedTail.details, false);
	assert.equal(windowedTail.details.truncated, true);
	assert.equal(targetMessages, 0);

	idle = false;
	handlers.get("agent_start")({}, ctx);
	const incoming = waitEvent(peer, "message", (_from, message) => message.content.text === "compact-outgoing-secret");
	const sent = await execute({ action: "send", to: peerSessionId, message: "compact-outgoing-secret" });
	await incoming;
	assert.match(sent.content[0].text, /accepted as/);
	assert.equal(sent.details.state, "queued");
	await waitFor(() => audits.find((audit) => audit.type === "intercom_sent"), 2_000);
	const sentAudit = audits.find((audit) => audit.type === "intercom_sent");
	assert.equal(sentAudit.data.targetSessionId, peerSessionId);
	assert.equal(sentAudit.data.payloadStored, false);
	assert.equal(JSON.stringify(sentAudit).includes("compact-outgoing-secret"), false);
	assert.equal(delivered.some((call) => call[0].details?.operationId === sent.details.operationId), false);
	idle = true;
	handlers.get("agent_settled")({}, ctx);
	const sentCompletion = await waitFor(() => delivered.find((call) =>
		call[0].customType === "intercom_operation"
		&& call[0].details?.operationId === sent.details.operationId), 2_000);
	assert.match(sentCompletion[0].content, /Message preview:\ncompact-outgoing-secret/);
	assert.deepEqual(sentCompletion[1], { deliverAs: "followUp", triggerTurn: false });
	const operationList = await execute({ action: "operations", limit: 32 });
	assert.ok(Buffer.byteLength(JSON.stringify(operationList.details), "utf8") <= INTERCOM_PROJECTION_MAX_BYTES);
	assert.equal(JSON.stringify(operationList.details).includes("compact-outgoing-secret"), false);

	const privatePeerId = peer.sessionId;
	const legacyIncoming = waitEvent(peer, "message", (_from, message) => message.content.text === "legacy transcript route");
	const legacySent = await execute({ action: "send", to: privatePeerId, message: "legacy transcript route" });
	await legacyIncoming;
	assert.equal(JSON.stringify(legacySent).includes(privatePeerId), false);
	const legacyCompletion = await waitFor(() => delivered.find((call) =>
		call[0].customType === "intercom_operation"
		&& call[0].details?.operationId === legacySent.details.operationId), 2_000);
	assert.equal(JSON.stringify(legacyCompletion[0]).includes(privatePeerId), false);
	const operationsAfterLegacyRoute = await execute({ action: "operations", limit: 32 });
	assert.equal(JSON.stringify(operationsAfterLegacyRoute).includes(privatePeerId), false);

	const questionIncoming = waitEvent(peer, "message", (_from, message) => message.expectsReply === true);
	const asking = await execute({ action: "ask", to: peerSessionId, message: "large reply please" });
	assert.equal(asking.details.state, "queued");
	const [, question] = await questionIncoming;
	await peer.send(ownedId, { messageId: "large-reply-message-id", text: "答".repeat(80_000), replyTo: question.id });
	const completion = await waitFor(() => delivered.find((call) => call[0].customType === "intercom_operation" && /ask reply received/.test(call[0].content)), 2_000);
	assert.match(completion[0].content, /答/);
	assert.equal(JSON.stringify(completion[0].details).includes("答"), false);
	assert.deepEqual(completion[1], { deliverAs: "followUp", triggerTurn: true });
	const receivedAudit = audits.find((audit) => audit.type === "intercom_received");
	assert.equal(receivedAudit.data.fromSessionId, peerSessionId);
	assert.equal(receivedAudit.data.payloadStored, false);
	assert.equal(JSON.stringify(receivedAudit).includes("答"), false);
	for (const audit of audits) assert.ok(Buffer.byteLength(JSON.stringify(audit.data)) <= INTERCOM_PROJECTION_MAX_BYTES);

	await peer.send(ownedId, { messageId: "", text: "pending-secret".repeat(1_000), expectsReply: true });
	const inbound = await waitFor(() => delivered.find((call) => call[0].customType === "intercom_message"), 2_000);
	assert.match(inbound[0].content, /pending-secret/);
	const pending = await waitFor(async () => {
		const result = await execute({ action: "pending", limit: 1 });
		return result.details.count === 1 ? result : undefined;
	});
	assert.equal(pending.details.pending[0].messageId, "");
	assert.equal(pending.details.pending[0].fromSessionId, peerSessionId);
	assert.equal(JSON.stringify(pending.details).includes("pending-secret"), false);
	assert.ok(Buffer.byteLength(pending.content[0].text) <= INTERCOM_PROJECTION_MAX_BYTES);
	assert.ok(delivered.every((call) => Buffer.byteLength(call[0].content) <= INTERCOM_PROJECTION_MAX_BYTES));
});

test("broker delivery rejection is reported as definitive through the tool operation", async (t) => {
	const fixture = await isolatedIntercom(t, "reject-tool-");
	const previousHome = process.env.HOME;
	process.env.HOME = fixture.home;
	t.after(() => {
		if (previousHome === undefined) delete process.env.HOME;
		else process.env.HOME = previousHome;
	});
	const sockets = new Set();
	const target = { id: "departed-peer", name: "worker", cwd: "/repo", model: "fixture-model", pid: 2, startedAt: 1, lastActivity: 1 };
	const server = net.createServer((socket) => {
		sockets.add(socket);
		socket.on("error", () => undefined);
		socket.on("close", () => sockets.delete(socket));
		let caller;
		const decoder = new FrameDecoder((message) => {
			if (message?.type === "register") {
				caller = { ...message.session, id: "caller-peer" };
				socket.write(encodeFrame({ type: "registered", sessionId: caller.id }));
				return;
			}
			if (message?.type === "list") {
				socket.write(encodeFrame({ type: "sessions", requestId: message.requestId, sessions: [caller, target] }));
				return;
			}
			if (message?.type === "send") {
				socket.write(encodeFrame({ type: "delivery_failed", messageId: message.message.id, reason: "Session not found" }));
			}
		}, () => socket.destroy());
		socket.on("data", (chunk) => decoder.push(chunk));
	});
	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(fixture.paths.socketPath, resolve);
	});
	t.after(async () => {
		for (const socket of sockets) socket.destroy();
		await new Promise((resolve) => server.close(resolve));
	});

	const tools = [];
	const handlers = new Map();
	const delivered = [];
	intercomExtension({
		registerTool: (tool) => tools.push(tool),
		registerMessageRenderer() {},
		on: (name, handler) => handlers.set(name, handler),
		getSessionName: () => "caller",
		appendEntry() {},
		sendMessage: (...args) => delivered.push(args),
	});
	const ctx = {
		cwd: "/repo",
		model: { id: "fixture-model" },
		sessionManager: { getSessionId: () => "pi-session", getSessionFile: () => undefined, getLeafId: () => null, getBranch: () => [] },
	};
	await handlers.get("session_start")({}, ctx);
	t.after(() => handlers.get("session_shutdown")());
	const receipt = await tools[0].execute("call", { action: "send", to: "worker", message: "hello" }, undefined, undefined, ctx);
	assert.equal(receipt.details.state, "queued");
	const failure = await waitFor(
		() => delivered.find((call) => call[0].customType === "intercom_operation" && /send failed/.test(call[0].content)),
		2_000,
	);
	assert.equal(failure[0].details.deliveryUncertain, false);
	assert.match(failure[0].details.reason, /Session not found/);
	assert.doesNotMatch(failure[0].content, /Delivery is uncertain/);
});

test("tool execution throws action-qualified operational failures and status surfaces startup diagnostics", async (t) => {
	const fixture = await isolatedIntercom(t, "index-harness-");
	const target = `${fixture.base}/runtime-target`;
	await mkdir(target);
	await rm(fixture.paths.runtimeDir, { recursive: true });
	await symlink(target, fixture.paths.runtimeDir);
	const previousHome = process.env.HOME;
	process.env.HOME = fixture.home;
	t.after(() => {
		if (previousHome === undefined) delete process.env.HOME;
		else process.env.HOME = previousHome;
	});

	const tools = [];
	const handlers = new Map();
	const delivered = [];
	const pi = {
		registerTool: (tool) => tools.push(tool),
		registerMessageRenderer() {},
		on: (name, handler) => handlers.set(name, handler),
		getSessionName: () => "harness",
		appendEntry() {},
		sendMessage: (...args) => delivered.push(args),
	};
	intercomExtension(pi);
	const ctx = {
		cwd: "/repo",
		model: { id: "fixture-model" },
		sessionManager: { getSessionId: () => "full-pi-session-id", getSessionFile: () => undefined, getLeafId: () => null, getBranch: () => [] },
	};
	await handlers.get("session_start")({}, ctx);
	t.after(async () => handlers.get("session_shutdown")());
	const tool = tools[0];
	const execute = (params) => tool.execute("call", params, undefined, undefined, ctx);
	const status = await waitFor(async () => {
		const result = await execute({ action: "status" });
		return result.details.initialConnectionError ? result : undefined;
	}, 2_000);
	assert.equal(status.details.connected, false);
	assert.match(status.details.initialConnectionError, /not a real directory/);
	assert.match(status.content[0].text, /Initial connection error/);
	await assert.rejects(execute({ action: "list" }), /Intercom list failed:/);
	for (const params of [
		{ action: "send", to: "peer", message: "hello" },
		{ action: "ask", to: "peer", message: "question" },
		{ action: "reply", message: "answer" },
	]) {
		const receipt = await execute(params);
		assert.equal(receipt.details.state, "queued");
	}
	const failedBeforeRouting = await waitFor(
		() => delivered.find((call) => call[0].customType === "intercom_operation" && /failed/.test(call[0].content)),
		2_000,
	);
	assert.equal(failedBeforeRouting[0].details.deliveryUncertain, false);
	assert.doesNotMatch(failedBeforeRouting[0].content, /Delivery is uncertain/);
	await handlers.get("session_shutdown")();
	await assert.rejects(execute({ action: "pending" }), /Intercom pending failed:/);
	const disconnected = await execute({ action: "status" });
	assert.equal(disconnected.details.connected, false);
	assert.match(disconnected.details.error, /not initialized/);
});
