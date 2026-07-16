import assert from "node:assert/strict";
import { mkdir, rm, symlink } from "node:fs/promises";
import test from "node:test";
import intercomExtension, {
	INBOUND_DELIVERY_LIMITS,
	INTERCOM_PROJECTION_MAX_BYTES,
	InboundDelivery,
	IntercomParams,
	deliverInboundMessage,
	formatAttachments,
	formatSession,
	incomingContent,
	presenceName,
	sanitizeSelfDeclaredMetadata,
	validateIntercomAction,
} from "./index.ts";
import { connectNew, isolatedIntercom, startOwnedBroker, stopChild, waitEvent, waitFor } from "../../tests/intercom/helpers.mjs";

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
	assert.deepEqual(IntercomParams.properties.action.enum, ["list", "send", "ask", "reply", "pending", "status"]);
	assert.deepEqual(Object.keys(IntercomParams.properties), ["action", "to", "message", "attachments", "replyTo"]);
	assert.deepEqual(commands, []);
	assert.deepEqual(shortcuts, []);
	assert.equal(tools.some((tool) => tool.name === "contact_supervisor"), false);
	assert.match(tools[0].description, /routed to the peer socket/);
	assert.match(tools[0].promptGuidelines.join("\n"), /exact replyTo/);
	assert.equal(events.some((event) => event.name === "session_start"), true);
	assert.equal(events.some((event) => event.name === "session_shutdown"), true);
});

test("validates action-specific fields while preserving attachment and reply selection inputs", () => {
	assert.doesNotThrow(() => validateIntercomAction({ action: "list" }));
	assert.doesNotThrow(() => validateIntercomAction({ action: "send", to: "worker", message: "update", attachments: [] }));
	assert.doesNotThrow(() => validateIntercomAction({ action: "reply", message: "answer", replyTo: "ask-1" }));
	assert.throws(() => validateIntercomAction({ action: "ask", message: "question" }), /requires to/);
	assert.throws(() => validateIntercomAction({ action: "pending", message: "extra" }), /not valid/);
	assert.throws(() => validateIntercomAction({ action: "status", replyTo: "extra" }), /not valid/);
});

test("uses the legacy unnamed alias and preserves attachment bodies", () => {
	assert.equal(presenceName({ getSessionName: () => undefined }, "session-1234567890"), "subagent-chat-12345678");
	assert.equal(presenceName({ getSessionName: () => " planner " }, "session-id"), "planner");
	assert.match(formatAttachments([{ type: "snippet", name: "a.ts", language: "ts", content: "const a = 1" }]), /const a = 1/);
});

test("delivers inbound peer messages through normal persistent Pi message behavior", () => {
	const calls = [];
	const entry = {
		from: { id: "peer-full-session-id", name: "worker", cwd: "/repo", model: "test", pid: 1, startedAt: 1, lastActivity: 1 },
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
});

test("renders authoritative full IDs and sanitizes self-declared identity metadata", () => {
	const current = { id: "01234567-full-current-id", name: "self", cwd: "/repo", model: "test", pid: 1, startedAt: 1, lastActivity: 1 };
	const hostile = {
		id: "89abcdef-full-authoritative-id",
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
	assert.doesNotMatch(rendered.split("---")[0], /\n\*\*Forged header/);
	assert.doesNotMatch(rendered, /[\u0000\u202e\u2066]/u);
	assert.equal(sanitizeSelfDeclaredMetadata("a\n\u202eb"), "a b");
	const listed = formatSession(hostile, current);
	assert.match(listed, /89abcdef-full-authoritative-id/);
	assert.doesNotMatch(listed, /\(89abcdef\)/);
	assert.doesNotMatch(listed, /[\u0000\u202e\u2066]/u);
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
		automaticTurns: 1,
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
	assert.equal(calls.filter((call) => call[1].triggerTurn).length, 1);
	assert.equal(calls.filter((call) => call[0].details?.overflow).length, 1);
	assert.match(calls.find((call) => call[1].triggerTurn)[0].content, /one/);
	assert.match(calls.find((call) => call[1].triggerTurn)[0].content, /three/);
	for (let index = 0; index < 100; index++) delivery.record(entry("peer-a", `flood-${index}`));
	assert.equal(calls.length, 2);
	delivery.settled();
	await new Promise((resolve) => setTimeout(resolve, 10));
	assert.ok(calls.length <= 3);
	assert.equal(calls.filter((call) => call[1].triggerTurn).length, 1);
	delivery.dispose();
});

test("replyable asks steer active work while ordinary updates remain follow-ups", async () => {
	const calls = [];
	const delivery = new InboundDelivery(
		{ sendMessage: (...args) => calls.push(args) },
		() => 1,
		{ ...INBOUND_DELIVERY_LIMITS, flushDelayMs: 0 },
	);
	const from = { id: "peer", name: "peer", cwd: "/repo", model: "test", pid: 1, startedAt: 1, lastActivity: 1 };
	delivery.record({
		from,
		message: { id: "update", timestamp: 1, content: { text: "ordinary update" } },
		receivedAt: 1,
		replyable: false,
	});
	await new Promise((resolve) => setTimeout(resolve, 10));
	assert.deepEqual(calls[0][1], { deliverAs: "followUp", triggerTurn: true });

	delivery.settled();
	delivery.record({
		from,
		message: { id: "question", timestamp: 2, expectsReply: true, content: { text: "question" } },
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

test("automatic inbound turns remain globally bounded across attacker-controlled batches", async () => {
	const calls = [];
	const limits = {
		...INBOUND_DELIVERY_LIMITS,
		perSenderMessages: 100,
		perSenderBytes: 100_000,
		globalMessages: 100,
		globalBytes: 100_000,
		pendingMessages: 10,
		pendingBytes: 100_000,
		automaticTurns: 2,
		flushDelayMs: 0,
	};
	const delivery = new InboundDelivery({ sendMessage: (...args) => calls.push(args) }, () => 1, limits);
	const entry = (id) => ({
		from: { id: "attacker", name: "attacker", cwd: "/repo", model: "test", pid: 1, startedAt: 1, lastActivity: 1 },
		message: { id, timestamp: 1, content: { text: id } },
		receivedAt: 1,
		replyable: false,
	});
	for (let index = 0; index < 8; index++) {
		delivery.record(entry(`batch-${index}`));
		await new Promise((resolve) => setTimeout(resolve, 5));
		delivery.settled();
	}
	await new Promise((resolve) => setTimeout(resolve, 5));
	assert.equal(calls.filter((call) => call[1].triggerTurn).length, 2);
	assert.equal(calls.filter((call) => call[0].details?.overflow).length, 1);
	assert.ok(calls.length <= 4);
	delivery.dispose();
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
	intercomExtension(pi);
	const ctx = {
		cwd: "/repo",
		model: { id: "fixture-model" },
		sessionManager: { getSessionId: () => "full-pi-session-id" },
	};
	await handlers.get("session_start")({}, ctx);
	t.after(() => handlers.get("session_shutdown")());
	const execute = (params) => tools[0].execute("call", params, undefined, undefined, ctx);
	await waitFor(async () => (await execute({ action: "status" })).details.connected, 2_000);
	const ownedId = (await peer.listSessions()).find((item) => item.name === "caller").id;

	const listed = await execute({ action: "list" });
	assert.ok(Buffer.byteLength(listed.content[0].text) <= INTERCOM_PROJECTION_MAX_BYTES);
	assert.equal(listed.details.sessionIds.includes(peer.sessionId), true);
	assert.equal("sessions" in listed.details, false);

	const incoming = waitEvent(peer, "message", (_from, message) => message.content.text === "compact-outgoing-secret");
	const sent = await execute({ action: "send", to: "worker", message: "compact-outgoing-secret" });
	await incoming;
	assert.match(sent.content[0].text, new RegExp(peer.sessionId));
	assert.match(sent.content[0].text, /self-declared name/);
	assert.equal(sent.details.targetPeerId, peer.sessionId);
	const sentAudit = audits.find((audit) => audit.type === "intercom_sent");
	assert.equal(sentAudit.data.targetPeerId, peer.sessionId);
	assert.equal(sentAudit.data.payloadStored, false);
	assert.equal(JSON.stringify(sentAudit).includes("compact-outgoing-secret"), false);

	const questionIncoming = waitEvent(peer, "message", (_from, message) => message.expectsReply === true);
	const asking = execute({ action: "ask", to: "worker", message: "large reply please" });
	const [, question] = await questionIncoming;
	await peer.send(ownedId, { messageId: "large-reply-message-id", text: "答".repeat(80_000), replyTo: question.id });
	const answer = await asking;
	assert.ok(Buffer.byteLength(answer.content[0].text) <= INTERCOM_PROJECTION_MAX_BYTES);
	assert.equal(answer.details.fromPeerId, peer.sessionId);
	assert.equal(answer.details.replyMessageId, "large-reply-message-id");
	assert.equal(answer.details.truncated, true);
	const receivedAudit = audits.find((audit) => audit.type === "intercom_received");
	assert.equal(receivedAudit.data.fromPeerId, peer.sessionId);
	assert.equal(receivedAudit.data.payloadStored, false);
	assert.equal(JSON.stringify(receivedAudit).includes("答"), false);
	for (const audit of audits) assert.ok(Buffer.byteLength(JSON.stringify(audit.data)) <= INTERCOM_PROJECTION_MAX_BYTES);

	await peer.send(ownedId, { messageId: "", text: "pending-secret".repeat(1_000), expectsReply: true });
	const pending = await waitFor(async () => {
		const result = await execute({ action: "pending" });
		return result.details.count === 1 ? result : undefined;
	});
	assert.equal(pending.details.pending[0].messageId, "");
	assert.equal(pending.details.pending[0].fromPeerId, peer.sessionId);
	assert.equal(JSON.stringify(pending.details).includes("pending-secret"), false);
	assert.ok(Buffer.byteLength(pending.content[0].text) <= INTERCOM_PROJECTION_MAX_BYTES);
	assert.ok(delivered.every((call) => Buffer.byteLength(call[0].content) <= INTERCOM_PROJECTION_MAX_BYTES));
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
	const pi = {
		registerTool: (tool) => tools.push(tool),
		registerMessageRenderer() {},
		on: (name, handler) => handlers.set(name, handler),
		getSessionName: () => "harness",
		appendEntry() {},
		sendMessage() {},
	};
	intercomExtension(pi);
	const ctx = {
		cwd: "/repo",
		model: { id: "fixture-model" },
		sessionManager: { getSessionId: () => "full-pi-session-id" },
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
	for (const [action, params] of [
		["list", { action: "list" }],
		["send", { action: "send", to: "peer", message: "hello" }],
		["ask", { action: "ask", to: "peer", message: "question" }],
		["reply", { action: "reply", message: "answer" }],
	]) {
		await assert.rejects(execute(params), new RegExp(`Intercom ${action} failed:`));
	}
	await handlers.get("session_shutdown")();
	await assert.rejects(execute({ action: "pending" }), /Intercom pending failed:/);
	const disconnected = await execute({ action: "status" });
	assert.equal(disconnected.details.connected, false);
	assert.match(disconnected.details.error, /not initialized/);
});
