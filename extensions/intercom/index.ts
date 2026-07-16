import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type, type Static } from "typebox";
import { IntercomClient, type Attachment, type Message, type SessionInfo } from "./client.ts";
import { getIntercomPaths } from "./broker/paths.ts";
import { spawnBrokerIfNeeded } from "./broker/spawn.ts";
import type { InboxEntry } from "./inbox.ts";
import { IntercomRuntime, type IntercomStatus } from "./runtime.ts";
import {
	INTERCOM_PROJECTION_MAX_BYTES,
	assertProjectionBound,
	compactInboundDetails,
	compactSessionName,
	formatAttachments,
	projectAskReply,
	projectInboundEntry,
	projectPendingEntries,
	projectSession,
	projectSessionList,
	projectionBytes,
	sanitizeSelfDeclaredMetadata,
	type CompactInboundDetails,
	type InboundProjection,
} from "./projection.ts";

export { INTERCOM_PROJECTION_MAX_BYTES, formatAttachments, sanitizeSelfDeclaredMetadata } from "./projection.ts";

const AttachmentParams = Type.Object({
	type: Type.String({ enum: ["file", "snippet", "context"] }),
	name: Type.String(),
	content: Type.String(),
	language: Type.Optional(Type.String()),
}, { additionalProperties: false });

export const IntercomParams = Type.Object({
	action: Type.String({ enum: ["list", "send", "ask", "reply", "pending", "status"] }),
	to: Type.Optional(Type.String({ minLength: 1, description: "Target session name or ID; may narrow reply selection" })),
	message: Type.Optional(Type.String({ minLength: 1, description: "Message text for send, ask, or reply" })),
	attachments: Type.Optional(Type.Array(AttachmentParams, { maxItems: 16 })),
	replyTo: Type.Optional(Type.String({ description: "Exact inbound message ID for reply selection, or thread ID for send/ask" })),
}, { additionalProperties: false });

export type IntercomToolInput = Static<typeof IntercomParams>;

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function fallbackName(sessionId: string): string {
	const normalized = sessionId.startsWith("session-") ? sessionId.slice("session-".length) : sessionId;
	return `subagent-chat-${normalized.slice(0, 8)}`;
}

export function presenceName(pi: Pick<ExtensionAPI, "getSessionName">, sessionId: string): string {
	return pi.getSessionName()?.trim() || fallbackName(sessionId);
}

function declared(value: string | undefined): string {
	return JSON.stringify(sanitizeSelfDeclaredMetadata(value));
}

export function validateIntercomAction(input: IntercomToolInput): void {
	const withMessage = input.action === "send" || input.action === "ask" || input.action === "reply";
	const withTarget = input.action === "send" || input.action === "ask" || input.action === "reply";
	if (withMessage && !input.message?.trim()) throw new Error(`${input.action} requires message`);
	if (!withMessage && input.message !== undefined) throw new Error(`message is not valid for ${input.action}`);
	if ((input.action === "send" || input.action === "ask") && !input.to?.trim()) throw new Error(`${input.action} requires to`);
	if (!withTarget && input.to !== undefined) throw new Error(`to is not valid for ${input.action}`);
	if (!withMessage && input.attachments !== undefined) throw new Error(`attachments are not valid for ${input.action}`);
	if (!(input.action === "send" || input.action === "ask" || input.action === "reply") && input.replyTo !== undefined) {
		throw new Error(`replyTo is not valid for ${input.action}`);
	}
}

export function formatSession(session: SessionInfo, current: SessionInfo): string {
	return projectSession(session, current).text;
}

export function incomingContent(entry: InboxEntry): string {
	return projectInboundEntry(entry).text;
}

export function deliverInboundMessage(pi: Pick<ExtensionAPI, "sendMessage">, entry: InboxEntry): void {
	const projected = projectInboundEntry(entry);
	const details = { count: 1, entries: [projected.details], truncated: projected.truncated };
	assertProjectionBound(details, "Inbound intercom details");
	const deliverAs = entry.replyable && entry.message.expectsReply === true ? "steer" : "followUp";
	pi.sendMessage(
		{ customType: "intercom_message", content: projected.text, display: true, details },
		{ deliverAs, triggerTurn: true },
	);
}

export const INBOUND_DELIVERY_LIMITS = Object.freeze({
	windowMs: 60_000,
	perSenderMessages: 16,
	perSenderBytes: 512 * 1024,
	globalMessages: 32,
	globalBytes: 1024 * 1024,
	pendingMessages: 16,
	pendingBytes: INTERCOM_PROJECTION_MAX_BYTES,
	automaticTurns: 4,
	flushDelayMs: 10,
});

type InboundDeliveryLimits = typeof INBOUND_DELIVERY_LIMITS;

interface SenderBudget {
	messages: number;
	bytes: number;
}

export class InboundDelivery {
	private windowStartedAt: number;
	private readonly senderBudgets = new Map<string, SenderBudget>();
	private globalMessages = 0;
	private globalBytes = 0;
	private automaticTurns = 0;
	private overflowNotified = false;
	private passiveBatchDelivered = false;
	private turnOutstanding = false;
	private pending: InboundProjection[] = [];
	private pendingBytes = 0;
	private flushTimer: NodeJS.Timeout | null = null;
	private disposed = false;
	private readonly pi: Pick<ExtensionAPI, "sendMessage">;
	private readonly now: () => number;
	private readonly limits: InboundDeliveryLimits;

	constructor(
		pi: Pick<ExtensionAPI, "sendMessage">,
		now: () => number = Date.now,
		limits: InboundDeliveryLimits = INBOUND_DELIVERY_LIMITS,
	) {
		this.pi = pi;
		this.now = now;
		this.limits = limits;
		this.windowStartedAt = now();
	}

	record(entry: InboxEntry): boolean {
		if (this.disposed) return false;
		this.rotateWindow();
		if (entry.message.expectsReply === true && !entry.replyable) {
			this.noticeOverflow();
			return false;
		}
		const rawBytes = Buffer.byteLength(JSON.stringify({ from: entry.from, message: entry.message }), "utf8");
		const projected = projectInboundEntry(entry);
		const sender = this.senderBudgets.get(entry.from.id) ?? { messages: 0, bytes: 0 };
		const separatorBytes = this.pending.length === 0 ? 0 : projectionBytes("\n\n========\n\n");
		const projectionLimit = Math.min(this.limits.pendingBytes, INTERCOM_PROJECTION_MAX_BYTES);
		if (
			sender.messages + 1 > this.limits.perSenderMessages
			// A first valid frame is projected instead of being rejected merely because its raw envelope
			// is larger than a rolling byte budget. No raw envelope is retained in this queue.
			|| (sender.messages > 0 && sender.bytes + rawBytes > this.limits.perSenderBytes)
			|| this.globalMessages + 1 > this.limits.globalMessages
			|| (this.globalMessages > 0 && this.globalBytes + rawBytes > this.limits.globalBytes)
			|| this.pending.length + 1 > this.limits.pendingMessages
			|| (this.pending.length > 0 && this.pendingBytes + separatorBytes + projected.bytes > projectionLimit)
			|| (this.automaticTurns >= this.limits.automaticTurns && this.passiveBatchDelivered)
		) {
			this.noticeOverflow();
			return false;
		}
		sender.messages++;
		sender.bytes += rawBytes;
		this.senderBudgets.set(entry.from.id, sender);
		this.globalMessages++;
		this.globalBytes += rawBytes;
		this.pending.push(projected);
		this.pendingBytes += separatorBytes + projected.bytes;
		if (!this.turnOutstanding) this.scheduleFlush();
		return true;
	}

	settled(): void {
		if (this.disposed) return;
		this.turnOutstanding = false;
		if (this.pending.length > 0) this.scheduleFlush();
	}

	dispose(): void {
		this.disposed = true;
		if (this.flushTimer) clearTimeout(this.flushTimer);
		this.flushTimer = null;
		this.pending = [];
		this.pendingBytes = 0;
		this.senderBudgets.clear();
	}

	private rotateWindow(): void {
		const current = this.now();
		if (current - this.windowStartedAt < this.limits.windowMs) return;
		this.windowStartedAt = current;
		this.senderBudgets.clear();
		this.globalMessages = 0;
		this.globalBytes = 0;
		this.automaticTurns = 0;
		this.passiveBatchDelivered = false;
	}

	private scheduleFlush(): void {
		if (this.flushTimer || this.disposed || this.turnOutstanding) return;
		this.flushTimer = setTimeout(() => {
			this.flushTimer = null;
			this.flush();
		}, this.limits.flushDelayMs);
	}

	private flush(): void {
		if (this.disposed || this.turnOutstanding || this.pending.length === 0) return;
		const entries = this.pending;
		this.pending = [];
		this.pendingBytes = 0;
		const content = entries.map((entry) => entry.text).join("\n\n========\n\n");
		const details = {
			count: entries.length,
			entries: entries.map((entry) => entry.details),
			truncated: entries.some((entry) => entry.truncated),
		};
		assertProjectionBound(content, "Inbound intercom batch");
		assertProjectionBound(details, "Inbound intercom batch details");
		if (this.automaticTurns < this.limits.automaticTurns) {
			this.automaticTurns++;
			this.turnOutstanding = true;
			const deliverAs = entries.some((entry) => entry.details.expectsReply && entry.details.replyable)
				? "steer"
				: "followUp";
			this.pi.sendMessage(
				{ customType: "intercom_message", content, display: true, details },
				{ deliverAs, triggerTurn: true },
			);
			return;
		}
		if (!this.passiveBatchDelivered) {
			this.passiveBatchDelivered = true;
			this.pi.sendMessage(
				{ customType: "intercom_message", content, display: true, details },
				{ deliverAs: "nextTurn", triggerTurn: false },
			);
			return;
		}
		this.noticeOverflow();
	}

	private noticeOverflow(): void {
		if (this.overflowNotified || this.disposed) return;
		this.overflowNotified = true;
		this.pi.sendMessage(
			{
				customType: "intercom_message",
				content: "**Intercom overflow notice**\n\nExcess inbound peer traffic was dropped or deferred by local count, byte, sender, and automatic-turn limits. Pending asks that fit the inbox bound remain available through `intercom({ action: \"pending\" })`.",
				display: true,
				details: { overflow: true },
			},
			{ deliverAs: "nextTurn", triggerTurn: false },
		);
	}
}

function targetIdentity(session: SessionInfo): {
	text: string;
	details: { targetPeerId: string; targetNameSelfDeclared?: string; targetNameTruncated: boolean };
} {
	const name = compactSessionName(session.name);
	return {
		text: `broker session ID ${JSON.stringify(session.id)} (self-declared name: ${declared(name.value)}${name.truncated ? "; truncated" : ""})`,
		details: {
			targetPeerId: session.id,
			...(name.value === undefined ? {} : { targetNameSelfDeclared: name.value }),
			targetNameTruncated: name.truncated,
		},
	};
}

function compactAuditMessage(message: {
	id: string;
	timestamp: number;
	replyTo?: string;
	expectsReply?: boolean;
	attachments?: readonly unknown[];
}): {
	messageId: string;
	timestamp: number;
	replyTo?: string;
	expectsReply: boolean;
	attachmentCount: number;
	payloadStored: false;
} {
	return {
		messageId: message.id,
		timestamp: message.timestamp,
		...(message.replyTo === undefined ? {} : { replyTo: message.replyTo }),
		expectsReply: message.expectsReply === true,
		attachmentCount: message.attachments?.length ?? 0,
		payloadStored: false,
	};
}

function assertCompactRecord(value: unknown, label: string): void {
	assertProjectionBound(value, label);
}

function firstText(result: { content?: Array<{ type: string; text?: string }> }): string {
	return result.content?.find((item) => item.type === "text")?.text ?? "Intercom";
}

export default function intercomExtension(pi: ExtensionAPI): void {
	let runtime: IntercomRuntime | undefined;
	let inboundDelivery: InboundDelivery | undefined;
	let context: ExtensionContext | undefined;
	let generation = 0;
	let piSessionId: string | undefined;
	let model = "unknown";
	let startedAt = 0;
	let agentRunning = false;
	const activeTools = new Map<string, string>();

	const lifecycleStatus = () => {
		const tool = activeTools.values().next().value;
		return tool ? `tool:${tool}` : agentRunning ? "thinking" : "idle";
	};

	const registration = (): Omit<SessionInfo, "id"> => {
		if (!context || !piSessionId) throw new Error("Intercom session is not initialized");
		return {
			name: presenceName(pi, piSessionId),
			cwd: context.cwd,
			model,
			pid: process.pid,
			startedAt,
			lastActivity: Date.now(),
			status: lifecycleStatus(),
		};
	};

	const syncPresence = () => {
		if (!runtime || !context || !piSessionId) return;
		const current = registration();
		runtime.updateRegistration(current);
		runtime.updatePresence({ name: current.name, model: current.model, status: current.status });
	};

	const requireRuntime = (): IntercomRuntime => {
		if (!runtime) throw new Error("Intercom runtime is not ready");
		return runtime;
	};

	pi.registerTool({
		name: "intercom",
		label: "Intercom",
		description: "Coordinate with other local Pi sessions through the legacy-compatible intercom broker. list discovers connected peers and full broker IDs; send confirms only that a message was routed to the peer socket; ask waits for an exactly correlated reply; reply answers a selected inbound ask; pending lists inbound asks; status reports connectivity and startup diagnostics.",
		promptSnippet: "List, message, ask, or explicitly reply to other local Pi sessions",
		promptGuidelines: [
			"Use intercom send for non-blocking updates; routed delivery does not prove the peer processed the message.",
			"Use intercom ask only when the current work must wait for a peer reply. Use pending and an exact replyTo when more than one inbound ask is waiting.",
			"Model-visible intercom messages, batches, lists, pending results, and ask replies are projected below a 48 KiB UTF-8 cap; truncation is explicit and authoritative broker IDs remain available.",
			"Intercom broker health probing intentionally checks socket acceptance without a noisy legacy registration. If an incompatible listener accepts, intercom status surfaces the connection error and refuses takeover rather than risking replacement of a live broker.",
		],
		parameters: IntercomParams,
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			context = ctx;
			try {
				validateIntercomAction(params);
				if (params.action === "status" && !runtime) {
					const status: IntercomStatus = {
						connected: false,
						sessionId: null,
						pendingOutgoingAsks: 0,
						pendingInboundAsks: 0,
						error: "Intercom runtime is not initialized",
					};
					return {
						content: [{ type: "text" as const, text: `**Intercom Status:**\nConnected: No\nSession ID: none\nActive sessions: unknown\nPending outgoing asks: 0\nPending inbound asks: 0\nError: ${status.error}` }],
						details: status,
					};
				}
				const active = requireRuntime();
				switch (params.action) {
					case "list": {
						const sessions = await active.list();
						const current = sessions.find((session) => session.id === active.client.sessionId);
						if (!current) throw new Error("Current session is missing from intercom session list");
						const projected = projectSessionList(sessions, current);
						const details = {
							currentSessionId: current.id,
							sessionIds: sessions.map((session) => session.id),
							count: sessions.length,
							truncated: projected.truncated,
						};
						assertCompactRecord(details, "Intercom list details");
						return { content: [{ type: "text" as const, text: projected.text }], details };
					}
					case "send": {
						const result = await active.send(params.to!, params.message!, params.attachments as Attachment[] | undefined, params.replyTo, signal);
						if (!result.delivered) throw new Error(`Message to "${params.to}" was not routed: ${result.reason ?? "Session unavailable"}`);
						const target = targetIdentity(result.to);
						const timestamp = Date.now();
						const audit = {
							...target.details,
							...compactAuditMessage({ id: result.id, timestamp, replyTo: params.replyTo, attachments: params.attachments }),
						};
						assertCompactRecord(audit, "Intercom sent audit");
						pi.appendEntry("intercom_sent", audit);
						const details = { ...target.details, messageId: result.id, delivered: true, processed: false };
						assertCompactRecord(details, "Intercom send details");
						return {
							content: [{ type: "text" as const, text: `Message routed to ${target.text}. This confirms socket routing, not peer processing.` }],
							details,
						};
					}
					case "ask": {
						const result = await active.ask(
							params.to!,
							params.message!,
							params.attachments as Attachment[] | undefined,
							params.replyTo,
							signal,
							(requestId, resolvedTarget) => {
								const target = targetIdentity(resolvedTarget);
								const audit = {
									...target.details,
									...compactAuditMessage({
										id: requestId,
										timestamp: Date.now(),
										replyTo: params.replyTo,
										expectsReply: true,
										attachments: params.attachments,
									}),
								};
								assertCompactRecord(audit, "Intercom ask audit");
								pi.appendEntry("intercom_sent", audit);
							},
						);
						const projected = projectAskReply(result.from, result.message);
						const receivedAudit = {
							fromPeerId: result.from.id,
							...compactAuditMessage({
								id: result.message.id,
								timestamp: result.message.timestamp,
								replyTo: result.message.replyTo,
								expectsReply: result.message.expectsReply,
								attachments: result.message.content.attachments,
							}),
							truncated: projected.truncated,
						};
						assertCompactRecord(receivedAudit, "Intercom received audit");
						pi.appendEntry("intercom_received", receivedAudit);
						const details = {
							requestId: result.requestId,
							replyMessageId: result.message.id,
							fromPeerId: result.from.id,
							replyTo: result.message.replyTo,
							timestamp: result.message.timestamp,
							attachmentCount: result.message.content.attachments?.length ?? 0,
							truncated: projected.truncated,
						};
						assertCompactRecord(details, "Intercom ask details");
						return {
							content: [{ type: "text" as const, text: projected.text }],
							details,
						};
					}
					case "reply": {
						const result = await active.reply(params.message!, { to: params.to, replyTo: params.replyTo, attachments: params.attachments as Attachment[] | undefined }, signal);
						if (!result.delivered) throw new Error(`Reply was not routed: ${result.reason ?? "Session unavailable"}`);
						const target = targetIdentity(result.to);
						const audit = {
							...target.details,
							...compactAuditMessage({ id: result.id, timestamp: Date.now(), replyTo: result.replyTo, attachments: params.attachments }),
						};
						assertCompactRecord(audit, "Intercom reply audit");
						pi.appendEntry("intercom_sent", audit);
						const details = { ...target.details, messageId: result.id, delivered: true, processed: false, replyTo: result.replyTo };
						assertCompactRecord(details, "Intercom reply details");
						return {
							content: [{ type: "text" as const, text: `Reply routed to ${target.text}. This confirms socket routing, not peer processing.` }],
							details,
						};
					}
					case "pending": {
						const entries = active.pending();
						const projected = projectPendingEntries(entries, Date.now());
						const pending: CompactInboundDetails[] = entries.map((entry) => compactInboundDetails(entry, projected.truncated));
						const details = { pending, count: pending.length, truncated: projected.truncated };
						assertCompactRecord(details, "Intercom pending details");
						return { content: [{ type: "text" as const, text: projected.text }], details };
					}
					case "status": {
						const status = await active.status();
						const text = `**Intercom Status:**\nConnected: ${status.connected ? "Yes" : "No"}\nSession ID: ${status.sessionId ?? "none"}\nActive sessions: ${status.activeSessions ?? "unknown"}\nPending outgoing asks: ${status.pendingOutgoingAsks}\nPending inbound asks: ${status.pendingInboundAsks}${status.initialConnectionError ? `\nInitial connection error: ${status.initialConnectionError}` : ""}${status.error ? `\nError: ${status.error}` : ""}`;
						return { content: [{ type: "text" as const, text }], details: status };
					}
					default:
						throw new Error(`Unknown intercom action: ${params.action}`);
				}
			} catch (error) {
				const cause = error instanceof Error ? error : new Error(String(error));
				if (params.action === "status") {
					const status: IntercomStatus = {
						connected: false,
						sessionId: null,
						pendingOutgoingAsks: 0,
						pendingInboundAsks: 0,
						error: cause.message,
					};
					return { content: [{ type: "text" as const, text: `**Intercom Status:**\nConnected: No\nSession ID: none\nActive sessions: unknown\nPending outgoing asks: 0\nPending inbound asks: 0\nError: ${cause.message}` }], details: status };
				}
				throw new Error(`Intercom ${params.action} failed: ${errorMessage(cause)}`, { cause });
			}
		},
		renderCall(args, theme) {
			const target = args.to ? ` → ${args.to}` : "";
			return new Text(`${theme.fg("toolTitle", theme.bold("intercom "))}${theme.fg(args.action === "ask" ? "warning" : args.action === "reply" ? "success" : "accent", args.action)}${theme.fg("muted", target)}`, 0, 0);
		},
		renderResult(result, { isPartial }, theme, renderContext) {
			if (isPartial) return new Text(theme.fg("warning", "Intercom working…"), 0, 0);
			const failed = renderContext.isError || (result.details as { error?: unknown } | undefined)?.error === true;
			return new Text(`${theme.fg(failed ? "error" : "success", failed ? "✗ " : "✓ ")}${theme.fg(failed ? "error" : "text", firstText(result))}`, 0, 0);
		},
	});

	pi.registerMessageRenderer<{ from: SessionInfo; message: Message }>("intercom_message", (message) => {
		return new Text(typeof message.content === "string" ? message.content : "Intercom message", 0, 0);
	});

	pi.on("session_start", async (_event, ctx) => {
		generation++;
		const sessionGeneration = generation;
		context = ctx;
		piSessionId = ctx.sessionManager.getSessionId();
		model = ctx.model?.id ?? "unknown";
		startedAt = Date.now();
		agentRunning = false;
		activeTools.clear();
		inboundDelivery?.dispose();
		inboundDelivery = undefined;
		if (runtime) await runtime.dispose();
		const paths = getIntercomPaths();
		const next = new IntercomRuntime({ client: new IntercomClient({ socketPath: paths.socketPath }) });
		const delivery = new InboundDelivery(pi);
		runtime = next;
		inboundDelivery = delivery;
		next.on("message", (entry: InboxEntry) => {
			if (generation !== sessionGeneration || runtime !== next || context !== ctx || inboundDelivery !== delivery) return;
			delivery.record(entry);
		});
		void next.start(registration(), () => spawnBrokerIfNeeded({ paths }).then(() => undefined)).catch((error) => {
			if (generation === sessionGeneration && runtime === next) next.recordInitialConnectionError(error);
		});
	});

	pi.on("session_shutdown", async () => {
		generation++;
		context = undefined;
		piSessionId = undefined;
		agentRunning = false;
		activeTools.clear();
		const previousDelivery = inboundDelivery;
		inboundDelivery = undefined;
		previousDelivery?.dispose();
		const previous = runtime;
		runtime = undefined;
		if (previous) await previous.dispose();
	});

	pi.on("session_info_changed", () => syncPresence());
	pi.on("model_select", (event) => {
		model = event.model.id;
		syncPresence();
	});
	pi.on("agent_start", () => {
		agentRunning = true;
		activeTools.clear();
		syncPresence();
	});
	pi.on("agent_end", () => {
		agentRunning = false;
		activeTools.clear();
		syncPresence();
	});
	pi.on("agent_settled", () => inboundDelivery?.settled());
	pi.on("tool_execution_start", (event) => {
		activeTools.set(event.toolCallId, event.toolName);
		syncPresence();
	});
	pi.on("tool_execution_end", (event) => {
		activeTools.delete(event.toolCallId);
		syncPresence();
	});
}
