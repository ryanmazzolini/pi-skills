import { watch, type FSWatcher } from "node:fs";
import { basename, dirname } from "node:path";
import { keyHint, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Box, Text } from "@earendil-works/pi-tui";
import { Type, type Static } from "typebox";
import { INTERCOM_ROLE_CAPABILITY, IntercomClient, piSessionIdOf, type Attachment, type IntercomRole, type Message, type SessionInfo } from "./client.ts";
import { getIntercomPaths } from "./broker/paths.ts";
import { spawnBrokerIfNeeded } from "./broker/spawn.ts";
import type { InboxEntry } from "./inbox.ts";
import { IntercomRuntime, type IntercomStatus } from "./runtime.ts";
import { INTERCOM_OPERATION_LIMITS, IntercomOperations, type IntercomOperationSnapshot } from "./operations.ts";
import { lastConversationalTimestamp, PiSessionPresenceTracker } from "./presence.ts";
import { SESSION_TAIL_LIMITS } from "./session-tail.ts";
import {
	INTERCOM_PROJECTION_MAX_BYTES,
	INTERCOM_TAIL_PROJECTION_MIN_BYTES,
	assertProjectionBound,
	compactInboundDetails,
	compactSessionName,
	formatAttachments,
	projectAskReply,
	projectInboundEntry,
	projectPendingEntries,
	projectSession,
	projectSessionList,
	projectSessionTail,
	projectionBytes,
	sanitizeSelfDeclaredMetadata,
	truncateUtf8,
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
	action: Type.String({ enum: ["list", "tail", "send", "ask", "reply", "pending", "operations", "cancel", "status", "role"] }),
	role: Type.Optional(Type.String({ enum: ["first-mate"], description: "Publish first-mate for the role action; omit to clear the current role" })),
	to: Type.Optional(Type.String({ minLength: 1, description: "Target Pi session name or ID; may narrow reply selection" })),
	message: Type.Optional(Type.String({ minLength: 1, description: "Message text for send, ask, or reply" })),
	attachments: Type.Optional(Type.Array(AttachmentParams, { maxItems: 16 })),
	replyTo: Type.Optional(Type.String({ description: "Exact inbound message ID for reply selection, or thread ID for send/ask" })),
	operationId: Type.Optional(Type.String({ minLength: 1, maxLength: 128, description: "Operation ID for operations inspection or cancellation" })),
	limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 32, description: "Maximum operation snapshots or tail text messages to return; ignored for list" })),
	tailScanBytes: Type.Optional(Type.Integer({ minimum: 1, maximum: SESSION_TAIL_LIMITS.scanBytes, description: "For tail only: emergency ceiling for file bytes read while finding requested text (default 512 MiB)" })),
	tailProjectionBytes: Type.Optional(Type.Integer({ minimum: INTERCOM_TAIL_PROJECTION_MIN_BYTES, maximum: INTERCOM_PROJECTION_MAX_BYTES, description: "For tail only: maximum UTF-8 bytes in the model projection (default 48 KiB)" })),
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
	const withTarget = input.action === "send" || input.action === "ask" || input.action === "reply" || input.action === "tail";
	if (withMessage && !input.message?.trim()) throw new Error(`${input.action} requires message`);
	if (!withMessage && input.message !== undefined) throw new Error(`message is not valid for ${input.action}`);
	if (input.action === "cancel" && !input.operationId?.trim()) throw new Error("cancel requires operationId");
	if (input.action !== "operations" && input.action !== "cancel" && input.operationId !== undefined) throw new Error(`operationId is not valid for ${input.action}`);
	// The flat tool schema exposes limit to list callers. Accept but ignore it so an
	// accidental hint cannot hide peers from the complete session inventory.
	if (input.action !== "operations" && input.action !== "tail" && input.action !== "list" && input.limit !== undefined) throw new Error(`limit is not valid for ${input.action}`);
	if (input.action !== "tail" && input.tailScanBytes !== undefined) throw new Error(`tailScanBytes is not valid for ${input.action}`);
	if (input.action !== "tail" && input.tailProjectionBytes !== undefined) throw new Error(`tailProjectionBytes is not valid for ${input.action}`);
	if (input.action !== "role" && input.role !== undefined) throw new Error(`role is not valid for ${input.action}`);
	if (input.action === "role" && input.role !== undefined && input.role !== "first-mate") throw new Error("Invalid intercom role");
	if ((input.action === "send" || input.action === "ask" || input.action === "tail") && !input.to?.trim()) throw new Error(`${input.action} requires to`);
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
	const details = { count: 1, entries: [projected.details], views: [projected.view], truncated: projected.truncated };
	assertProjectionBound(details, "Inbound intercom details");
	const requestsReply = entry.replyable && entry.message.expectsReply === true;
	pi.sendMessage(
		{ customType: "intercom_message", content: projected.text, display: true, details },
		{ deliverAs: requestsReply ? "steer" : "followUp", triggerTurn: requestsReply },
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
	passiveBatches: 4,
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
	private passiveBatches = 0;
	private overflowNotified = false;
	private passiveBatchDelivered = false;
	private turnOutstanding = false;
	private agentActive = false;
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
		const candidateDetails = {
			count: this.pending.length + 1,
			entries: [...this.pending.map((item) => item.details), projected.details],
			views: [...this.pending.map((item) => item.view), projected.view],
			truncated: this.pending.some((item) => item.truncated) || projected.truncated,
		};
		if (
			sender.messages + 1 > this.limits.perSenderMessages
			// A first valid frame is projected instead of being rejected merely because its raw envelope
			// is larger than a rolling byte budget. No raw envelope is retained in this queue.
			|| (sender.messages > 0 && sender.bytes + rawBytes > this.limits.perSenderBytes)
			|| this.globalMessages + 1 > this.limits.globalMessages
			|| (this.globalMessages > 0 && this.globalBytes + rawBytes > this.limits.globalBytes)
			|| this.pending.length + 1 > this.limits.pendingMessages
			|| (this.pending.length > 0 && this.pendingBytes + separatorBytes + projected.bytes > projectionLimit)
			|| projectionBytes(candidateDetails) > INTERCOM_PROJECTION_MAX_BYTES
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

	started(): void {
		if (!this.disposed) this.agentActive = true;
	}

	settled(): void {
		if (this.disposed) return;
		this.agentActive = false;
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
		this.passiveBatches = 0;
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
		const requestsReply = this.pending.some((entry) => entry.details.expectsReply && entry.details.replyable);
		// Pi processes a streaming follow-up as another model turn even when triggerTurn is false.
		// Hold passive traffic until agent_settled so it can be appended without continuing the run.
		if (this.agentActive && !requestsReply) return;
		const entries = this.pending;
		this.pending = [];
		this.pendingBytes = 0;
		const content = entries.map((entry) => entry.text).join("\n\n========\n\n");
		const details = {
			count: entries.length,
			entries: entries.map((entry) => entry.details),
			views: entries.map((entry) => entry.view),
			truncated: entries.some((entry) => entry.truncated),
		};
		assertProjectionBound(content, "Inbound intercom batch");
		assertProjectionBound(details, "Inbound intercom batch details");
		if (!requestsReply) {
			if (this.passiveBatches >= this.limits.passiveBatches) {
				this.noticeOverflow();
				return;
			}
			this.passiveBatches++;
			this.pi.sendMessage(
				{ customType: "intercom_message", content, display: true, details },
				{ deliverAs: "followUp", triggerTurn: false },
			);
			return;
		}
		if (this.automaticTurns < this.limits.automaticTurns) {
			this.automaticTurns++;
			this.turnOutstanding = true;
			this.pi.sendMessage(
				{ customType: "intercom_message", content, display: true, details },
				{ deliverAs: "steer", triggerTurn: true },
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
	details: { targetSessionId?: string; targetNameSelfDeclared?: string; targetNameTruncated: boolean };
} {
	const sessionId = piSessionIdOf(session);
	const name = compactSessionName(session.name);
	return {
		text: `Pi session ID ${sessionId ? JSON.stringify(sessionId) : "unavailable"} (self-declared name: ${declared(name.value)}${name.truncated ? "; truncated" : ""})`,
		details: {
			...(sessionId === undefined ? {} : { targetSessionId: sessionId }),
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

function boundedOperationSnapshots(snapshots: IntercomOperationSnapshot[], limit: number): { snapshots: IntercomOperationSnapshot[]; truncated: boolean } {
	const selected: IntercomOperationSnapshot[] = [];
	for (const snapshot of snapshots.slice(0, limit)) {
		const candidate = [...selected, snapshot];
		if (projectionBytes({ operations: candidate, truncated: false }) > INTERCOM_PROJECTION_MAX_BYTES) break;
		selected.push(snapshot);
	}
	return { snapshots: selected, truncated: selected.length < snapshots.length };
}

export function boundedSessionIdentityDetails(sessions: readonly SessionInfo[], current: SessionInfo, projectedTruncated: boolean) {
	const identified = sessions.filter((session) => piSessionIdOf(session) !== undefined);
	const selectedBrokerIds = new Set<string>([current.id]);
	const build = () => {
		const selected = sessions.filter((session) => selectedBrokerIds.has(session.id));
		const sessionIds = selected.flatMap((session) => {
			const sessionId = piSessionIdOf(session);
			return sessionId ? [sessionId] : [];
		});
		const firstMateSessionIds = selected.flatMap((session) => {
			const sessionId = piSessionIdOf(session);
			return session.role === "first-mate" && sessionId ? [sessionId] : [];
		});
		const omittedSessionIds = identified.length - sessionIds.length;
		return {
			currentSessionId: piSessionIdOf(current)!,
			sessionIds,
			firstMateSessionIds,
			unidentifiedSessions: sessions.length - identified.length,
			omittedSessionIds,
			count: sessions.length,
			truncated: projectedTruncated || omittedSessionIds > 0,
		};
	};
	for (const session of identified) {
		if (selectedBrokerIds.has(session.id)) continue;
		selectedBrokerIds.add(session.id);
		if (projectionBytes(build()) > INTERCOM_PROJECTION_MAX_BYTES) selectedBrokerIds.delete(session.id);
	}
	return build();
}

function firstText(result: { content?: Array<{ type: string; text?: string }> }): string {
	return result.content?.find((item) => item.type === "text")?.text ?? "Intercom";
}

interface OperationMessageView {
	preview: string;
	previewTruncated: boolean;
	contentCompacted: boolean;
	attachmentCount: number;
}

interface OperationNotificationDetails extends IntercomOperationSnapshot {
	targetSessionId?: string;
	payloadStored: boolean;
}

interface PassiveOperationNotification {
	content: string;
	details: OperationNotificationDetails;
}

function operationMessageView(
	message: string,
	attachments?: readonly { type: string; name: string; content: string; language?: string }[],
): OperationMessageView {
	const fullPreview = sanitizeSelfDeclaredMetadata(message);
	const preview = truncateUtf8(fullPreview, 256);
	return {
		preview,
		previewTruncated: preview !== fullPreview,
		contentCompacted: preview !== message,
		attachmentCount: attachments?.length ?? 0,
	};
}

function expandedOperationInput(
	message: string,
	attachments?: readonly { type: string; name: string; content: string; language?: string }[],
): string {
	let text = message;
	for (const attachment of attachments ?? []) {
		const type = sanitizeSelfDeclaredMetadata(attachment.type);
		const name = sanitizeSelfDeclaredMetadata(attachment.name);
		const language = attachment.language ? ` · ${sanitizeSelfDeclaredMetadata(attachment.language)}` : "";
		text += `\n\nAttachment · ${type} · ${name}${language}\n${attachment.content}`;
	}
	return text;
}

function operationNotificationView(
	content: string,
	kind: IntercomOperationSnapshot["kind"],
): (OperationMessageView & { label: "message" | "reply" }) | undefined {
	if (kind === "ask") {
		const replyHeader = content.indexOf("**Reply to intercom ask**");
		const replyDelimiter = "\n\n---\n\n";
		const replyIndex = replyHeader < 0 ? -1 : content.indexOf(replyDelimiter, replyHeader);
		if (replyIndex >= 0) {
			return { ...operationMessageView(content.slice(replyIndex + replyDelimiter.length)), label: "reply" };
		}
	}
	const request = content.match(/\n\n(?:Question|Message) preview:\n([^\n]*)/);
	return request?.[1] ? { ...operationMessageView(request[1]), label: "message" } : undefined;
}

export default function intercomExtension(pi: ExtensionAPI): void {
	let runtime: IntercomRuntime | undefined;
	let inboundDelivery: InboundDelivery | undefined;
	let operations: IntercomOperations | undefined;
	const operationViews = new Map<string, OperationMessageView>();
	const passiveOperationNotifications: PassiveOperationNotification[] = [];
	let context: ExtensionContext | undefined;
	let piPresence: PiSessionPresenceTracker | undefined;
	let bashPresenceWatcher: FSWatcher | undefined;
	let generation = 0;
	let roleLifecycleGeneration = 0;
	let piSessionId: string | undefined;
	let model = "unknown";
	let startedAt = 0;
	let agentRunning = false;
	let conversationalLeafId: string | null | undefined;
	let conversationalTimestamp: number | null = null;
	const activeTools = new Map<string, string>();

	const lifecycleStatus = () => {
		const tool = activeTools.values().next().value;
		return tool ? `tool:${tool}` : agentRunning ? "thinking" : "idle";
	};

	const currentConversationalTimestamp = (): number | null => {
		if (!context) return null;
		const leafId = context.sessionManager.getLeafId();
		if (leafId !== conversationalLeafId) {
			conversationalLeafId = leafId;
			conversationalTimestamp = lastConversationalTimestamp(context.sessionManager);
		}
		return conversationalTimestamp;
	};

	const registration = (): Omit<SessionInfo, "id"> => {
		if (!context || !piSessionId) throw new Error("Intercom session is not initialized");
		const persisted = piPresence?.current();
		return {
			piSessionId,
			name: presenceName(pi, piSessionId),
			cwd: context.cwd,
			model,
			pid: process.pid,
			startedAt,
			lastActivity: Date.now(),
			lastConversationalTimestamp: currentConversationalTimestamp(),
			status: lifecycleStatus(),
			...(persisted ? { piSession: persisted } : {}),
		};
	};

	const refreshPiPresence = (): boolean => {
		if (!runtime || !context || !piSessionId || !piPresence) return false;
		const refresh = piPresence.refresh(context.sessionManager);
		if (!refresh.changed) return false;
		runtime.updateRegistration(registration());
		runtime.updatePresence({ piSession: refresh.presence ?? null });
		return true;
	};

	const syncPresence = () => {
		if (!runtime || !context || !piSessionId) return;
		const tailChanged = piPresence?.refresh(context.sessionManager);
		const current = registration();
		runtime.updateRegistration(current);
		runtime.updatePresence({
			name: current.name,
			model: current.model,
			status: current.status,
			lastConversationalTimestamp: current.lastConversationalTimestamp ?? null,
			...(tailChanged?.changed ? { piSession: tailChanged.presence ?? null } : {}),
		});
	};

	const clearRole = async () => {
		const lifecycleGeneration = ++roleLifecycleGeneration;
		const active = runtime;
		if (!active?.client.isConnected() || !active.client.supportsCapability(INTERCOM_ROLE_CAPABILITY)) return;
		try {
			await active.setRole(null);
			if (lifecycleGeneration !== roleLifecycleGeneration || runtime !== active) {
				throw new Error("Intercom role clear was superseded by a session lifecycle change");
			}
		} catch (error) {
			active.invalidateRoleSession(error instanceof Error ? error.message : "Intercom lifecycle role clear failed");
		}
	};

	const appendAudit = (customType: string, data: unknown) => {
		pi.appendEntry(customType, data);
		refreshPiPresence();
	};

	const stopBashPresenceWatcher = () => {
		bashPresenceWatcher?.close();
		bashPresenceWatcher = undefined;
	};

	const startBashPresenceWatcher = () => {
		stopBashPresenceWatcher();
		const source = context?.sessionManager;
		const sessionFile = source?.getSessionFile();
		if (!source || !sessionFile) return;
		const knownBashEntries = new Set(source.getEntries()
			.filter((entry) => entry.type === "message" && entry.message.role === "bashExecution")
			.map((entry) => entry.id));
		const advertisedFile = piPresence?.current()?.fileLocator;
		const watchPath = advertisedFile ?? dirname(sessionFile);
		const expectedFilename = advertisedFile ? undefined : basename(sessionFile);
		try {
			const watcher = watch(watchPath, { persistent: false }, (_event, filename) => {
				if (expectedFilename && filename && filename.toString() !== expectedFilename) return;
				const hasNewBashEntry = source.getEntries().some((entry) =>
					entry.type === "message"
					&& entry.message.role === "bashExecution"
					&& !knownBashEntries.has(entry.id));
				refreshPiPresence();
				if (hasNewBashEntry && piPresence?.current()) stopBashPresenceWatcher();
			});
			watcher.on("error", stopBashPresenceWatcher);
			bashPresenceWatcher = watcher;
		} catch {
			// A later lifecycle event still refreshes presence if the platform cannot watch this file.
		}
	};

	const requireRuntime = (): IntercomRuntime => {
		if (!runtime) throw new Error("Intercom runtime is not ready");
		return runtime;
	};

	const requireOperations = (): IntercomOperations => {
		if (!operations) throw new Error("Intercom operations are not ready");
		return operations;
	};

	const sendOperationNotification = (
		content: string,
		details: OperationNotificationDetails,
		triggerTurn: boolean,
	) => {
		// A follow-up queued while streaming always continues the model loop. Defer passive
		// terminal notifications until agent_settled, then append them without a turn.
		if (!triggerTurn && context?.isIdle?.() === false) {
			passiveOperationNotifications.push({ content, details });
			if (passiveOperationNotifications.length > INTERCOM_OPERATION_LIMITS.maxRetained) {
				passiveOperationNotifications.shift();
			}
			return;
		}
		pi.sendMessage(
			{ customType: "intercom_operation", content, display: true, details },
			{ deliverAs: "followUp", triggerTurn },
		);
	};

	const flushPassiveOperationNotifications = () => {
		for (const notification of passiveOperationNotifications.splice(0)) {
			pi.sendMessage(
				{ customType: "intercom_operation", content: notification.content, display: true, details: notification.details },
				{ deliverAs: "followUp", triggerTurn: false },
			);
		}
	};

	pi.registerTool({
		name: "intercom",
		label: "Intercom",
		description: "Coordinate with other local Pi sessions through the legacy-compatible intercom broker. send, ask, and reply accept bounded background operations and automatically deliver terminal results; successful delivery means routed to the peer socket, not peer processing. Passive messages and send/reply outcomes do not start agent turns; explicit asks do. tail reads a bounded confirmed snapshot from an active persisted Pi session without messaging it and accepts an optional text-message limit. role synchronously publishes or clears the ephemeral First Mate role when the broker advertises support; list discovers peers, roles, stable Pi session IDs, and available conversational timestamps; pending lists inbound asks; operations inspects outbound work; cancel stops local waiting; status reports the current Pi session ID, connectivity, capabilities, and startup diagnostics.",
		promptSnippet: "List, tail, message, ask, reply, or publish the First Mate role for local Pi sessions",
		promptGuidelines: [
			"intercom send, ask, and reply return receipts immediately and deliver terminal results automatically; continue independent work instead of polling operations.",
			"Use intercom status for the current Pi session ID and intercom list to discover other sessions.",
			"Use intercom role with role first-mate only when the user invokes the First Mate skill; omit role to clear it. Role support is broker-capability gated and role state is cleared by session lifecycle changes or disconnects.",
			"Prefer durable project or work-item updates for routine progress and outcomes. Use intercom only when a live peer needs information or action before it can read that durable record.",
			"Before asking a peer for status or context, use intercom tail with a small limit and increase it only when needed. Contact the peer only when the tail and durable project record do not answer the question.",
			"Treat intercom notices and routing receipts as one-way. Reply only to an explicit ask or when new information or action is required; do not acknowledge routine updates or receipts.",
			"Use intercom ask when a peer reply is useful but not immediately blocking. Use pending and an exact replyTo when more than one inbound ask is waiting; use to plus replyTo if a displayed ask has expired locally.",
			"Model-visible intercom messages, batches, lists, pending results, and ask replies are projected below a 48 KiB UTF-8 cap; truncation is explicit and stable Pi session IDs remain available.",
			"Intercom broker health probing intentionally checks socket acceptance without a noisy legacy registration. If an incompatible listener accepts, intercom status surfaces the connection error and refuses takeover rather than risking replacement of a live broker.",
		],
		parameters: IntercomParams,
		async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
			try {
				validateIntercomAction(params);
				if (params.action === "status" && !runtime) {
					const status: IntercomStatus = {
						connected: false,
						sessionId: piSessionId ?? null,
						pendingOutgoingAsks: 0,
						pendingInboundAsks: 0,
						tailCapability: false,
						advertisingPiSession: false,
						roleCapability: false,
						advertisingFirstMate: false,
						error: "Intercom runtime is not initialized",
					};
					return {
						content: [{ type: "text" as const, text: `**Intercom Status:**\nConnected: No\nPi session ID: ${status.sessionId ?? "none"}\nActive sessions: unknown\nTail capability: Unavailable\nPersisted session advertised: No\nFirst Mate role capability: Unavailable\nFirst Mate role advertised: No\nPending outgoing asks: 0\nPending inbound asks: 0\nError: ${status.error}` }],
						details: status,
					};
				}
				const active = requireRuntime();
				switch (params.action) {
					case "role": {
						const lifecycleGeneration = roleLifecycleGeneration;
						const result = await active.setRole((params.role as IntercomRole | undefined) ?? null);
						if (lifecycleGeneration !== roleLifecycleGeneration || runtime !== active) {
							active.invalidateRoleSession("Intercom role change was superseded by a session lifecycle change");
							throw new Error("Intercom role change was superseded by a session lifecycle change");
						}
						const details = {
							sessionId: result.sessionId,
							roleCapability: true,
							role: result.role ?? null,
							advertisingFirstMate: result.role === "first-mate",
						};
						assertCompactRecord(details, "Intercom role details");
						const text = result.role
							? `Published First Mate role for Pi session ID ${JSON.stringify(result.sessionId)}.`
							: `Cleared First Mate role for Pi session ID ${JSON.stringify(result.sessionId)}.`;
						return { content: [{ type: "text" as const, text }], details };
					}
					case "list": {
						const sessions = await active.list();
						const current = sessions.find((session) => session.id === active.client.sessionId);
						if (!current) throw new Error("Current session is missing from intercom session list");
						const currentSessionId = piSessionIdOf(current);
						if (!currentSessionId) throw new Error("Current Intercom registration is missing its Pi session ID");
						const projected = projectSessionList(sessions, current);
						const details = boundedSessionIdentityDetails(sessions, current, projected.truncated);
						assertCompactRecord(details, "Intercom list details");
						return { content: [{ type: "text" as const, text: projected.text }], details };
					}
					case "tail": {
						const result = await active.tail(params.to!, params.limit ?? 8, signal, params.tailScanBytes);
						const projected = projectSessionTail(result.snapshot, result.target, params.tailProjectionBytes);
						const details = {
							targetSessionId: result.targetSessionId,
							requestedMessages: params.limit ?? 8,
							requestedScanBytes: params.tailScanBytes ?? SESSION_TAIL_LIMITS.scanBytes,
							requestedProjectionBytes: params.tailProjectionBytes ?? INTERCOM_PROJECTION_MAX_BYTES,
							...(result.snapshot.historyTruncated
								? { observedTextMessages: result.snapshot.counts.eligibleTextEvents }
								: { availableTextMessages: result.snapshot.counts.eligibleTextEvents }),
							returnedTextMessages: result.snapshot.counts.returnedTextEvents,
							lastConversationalTimestamp: result.snapshot.lastConversationalTimestamp,
							timelineEvents: result.snapshot.events.length,
							branchHistoryTruncated: result.snapshot.historyTruncated,
							truncated: result.snapshot.truncated || result.snapshot.historyTruncated || result.snapshot.outcomeEventsTruncated || result.snapshot.ignoredFinalFragment || projected.truncated,
						};
						assertCompactRecord(details, "Intercom tail details");
						return { content: [{ type: "text" as const, text: projected.text }], details };
					}
					case "send":
					case "ask":
					case "reply": {
						if (signal?.aborted) throw new Error("Intercom operation cancelled before acceptance");
						const kind = params.action;
						// Resolve user input inside the operation; snapshots must never retain a transport ID.
						const receipt = requireOperations().start(kind, undefined, async (operationSignal, update) => {
							if (kind === "send") {
								const result = await active.send(params.to!, params.message!, params.attachments as Attachment[] | undefined, params.replyTo, operationSignal, () => update("routing"));
								if (!result.delivered) {
									update("delivery_rejected");
									throw new Error(result.reason ?? "Message was not routed");
								}
								const identity = targetIdentity(result.to);
								const audit = { ...identity.details, ...compactAuditMessage({ id: result.id, timestamp: Date.now(), replyTo: params.replyTo, attachments: params.attachments }) };
								assertCompactRecord(audit, "Intercom send audit");
								appendAudit("intercom_sent", audit);
								const targetSessionId = piSessionIdOf(result.to);
								return { target: targetSessionId ?? identity.text, ...(targetSessionId ? { targetSessionId } : {}) };
							}
							if (kind === "reply") {
								const result = await active.reply(params.message!, { to: params.to, replyTo: params.replyTo, attachments: params.attachments as Attachment[] | undefined }, operationSignal, () => update("routing"));
								if (!result.delivered) {
									update("delivery_rejected");
									throw new Error(result.reason ?? "Reply was not routed");
								}
								const identity = targetIdentity(result.to);
								const audit = { ...identity.details, ...compactAuditMessage({ id: result.id, timestamp: Date.now(), replyTo: result.replyTo, attachments: params.attachments }) };
								assertCompactRecord(audit, "Intercom reply audit");
								appendAudit("intercom_sent", audit);
								const targetSessionId = piSessionIdOf(result.to);
								return { target: targetSessionId ?? identity.text, ...(targetSessionId ? { targetSessionId } : {}) };
							}
							const result = await active.ask(params.to!, params.message!, params.attachments as Attachment[] | undefined, params.replyTo, operationSignal, (requestId, target) => {
								update("waiting_reply");
								const audit = { ...targetIdentity(target).details, ...compactAuditMessage({ id: requestId, timestamp: Date.now(), replyTo: params.replyTo, expectsReply: true, attachments: params.attachments }) };
								assertCompactRecord(audit, "Intercom ask audit");
								appendAudit("intercom_sent", audit);
							}, () => update("routing"), () => update("delivery_rejected"));
							const projected = projectAskReply(result.from, result.message);
							const fromSessionId = piSessionIdOf(result.from);
							const receivedAudit = { ...(fromSessionId === undefined ? {} : { fromSessionId }), ...compactAuditMessage({ id: result.message.id, timestamp: result.message.timestamp, replyTo: result.message.replyTo, attachments: result.message.content.attachments }), truncated: projected.truncated };
							assertCompactRecord(receivedAudit, "Intercom received audit");
							appendAudit("intercom_received", receivedAudit);
							return {
								target: fromSessionId ?? targetIdentity(result.from).text,
								...(fromSessionId ? { targetSessionId: fromSessionId } : {}),
								reply: true,
								completionText: projected.text,
							};
						});
						operationViews.set(receipt.operationId, operationMessageView(params.message!, params.attachments));
						const details = { ...receipt, payloadStored: false };
						assertCompactRecord(details, "Intercom operation receipt");
						return { content: [{ type: "text" as const, text: `Intercom ${kind} accepted as ${receipt.operationId}. Completion will be delivered automatically; continue independent work.` }], details };
					}
					case "operations": {
						const listed = requireOperations().list(params.operationId);
						const bounded = boundedOperationSnapshots(listed, params.limit ?? 32);
						const details = { operations: bounded.snapshots, truncated: bounded.truncated };
						assertCompactRecord(details, "Intercom operations details");
						const suffix = bounded.truncated ? "\n[Additional operation snapshots omitted to stay below 48 KiB.]" : "";
						return { content: [{ type: "text" as const, text: `${bounded.snapshots.length ? bounded.snapshots.map((item) => `${item.operationId} · ${item.kind} · ${item.state}`).join("\n") : "No intercom operations."}${suffix}` }], details };
					}
					case "cancel": {
						const snapshot = requireOperations().cancel(params.operationId!);
						assertCompactRecord(snapshot, "Intercom cancellation details");
						return { content: [{ type: "text" as const, text: `Intercom operation ${snapshot.operationId} is ${snapshot.state}.` }], details: snapshot };
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
						const text = `**Intercom Status:**\nConnected: ${status.connected ? "Yes" : "No"}\nPi session ID: ${status.sessionId ?? "none"}\nActive sessions: ${status.activeSessions ?? "unknown"}\nTail capability: ${status.tailCapability ? "Available" : "Unavailable"}\nPersisted session advertised: ${status.advertisingPiSession ? "Yes" : "No"}\nFirst Mate role capability: ${status.roleCapability ? "Available" : "Unavailable"}\nFirst Mate role advertised: ${status.advertisingFirstMate ? "Yes" : "No"}\nPending outgoing asks: ${status.pendingOutgoingAsks}\nPending inbound asks: ${status.pendingInboundAsks}${status.initialConnectionError ? `\nInitial connection error: ${status.initialConnectionError}` : ""}${status.error ? `\nError: ${status.error}` : ""}`;
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
						sessionId: piSessionId ?? null,
						pendingOutgoingAsks: 0,
						pendingInboundAsks: 0,
						tailCapability: false,
						advertisingPiSession: false,
						roleCapability: false,
						advertisingFirstMate: false,
						error: cause.message,
					};
					return { content: [{ type: "text" as const, text: `**Intercom Status:**\nConnected: No\nPi session ID: ${status.sessionId ?? "none"}\nActive sessions: unknown\nTail capability: Unavailable\nPersisted session advertised: No\nFirst Mate role capability: Unavailable\nFirst Mate role advertised: No\nPending outgoing asks: 0\nPending inbound asks: 0\nError: ${cause.message}` }], details: status };
				}
				throw new Error(`Intercom ${params.action} failed: ${errorMessage(cause)}`, { cause });
			}
		},
		renderCall(args, theme, renderContext) {
			const target = args.to ? ` → ${args.to}` : "";
			let text = `${theme.fg("toolTitle", theme.bold("intercom "))}${theme.fg(args.action === "ask" ? "warning" : args.action === "reply" ? "success" : "accent", args.action)}${theme.fg("muted", target)}`;
			if (args.message) {
				const view = operationMessageView(args.message, args.attachments);
				if (renderContext.expanded) {
					text += `\n\n${expandedOperationInput(args.message, args.attachments)}`;
				} else {
					text += ` · ${theme.fg("muted", view.preview)}${view.previewTruncated ? "…" : ""}`;
					if (view.contentCompacted || view.attachmentCount > 0) {
						text += ` (${keyHint("app.tools.expand", "to expand")})`;
					}
				}
			}
			return new Text(text, 0, 0);
		},
		renderResult(result, { isPartial, expanded }, theme, renderContext) {
			if (isPartial) return new Text(theme.fg("warning", "Intercom working…"), 0, 0);
			const failed = renderContext.isError || (result.details as { error?: unknown } | undefined)?.error === true;
			const output = firstText(result);
			if (expanded) {
				return new Text(`${theme.fg(failed ? "error" : "success", failed ? "✗ " : "✓ ")}${theme.fg(failed ? "error" : "text", output)}`, 0, 0);
			}
			const firstLine = output.split(/\r?\n/, 1)[0] ?? "Intercom";
			const compact = sanitizeSelfDeclaredMetadata(firstLine);
			const summary = truncateUtf8(compact, 256);
			const expandable = output.includes("\n") || compact !== output || summary !== compact;
			const hint = expandable ? ` (${keyHint("app.tools.expand", "to expand")})` : "";
			return new Text(`${theme.fg(failed ? "error" : "success", failed ? "✗ " : "✓ ")}${theme.fg(failed ? "error" : "text", summary)}${summary !== compact ? "…" : ""}${hint}`, 0, 0);
		},
	});

	pi.registerMessageRenderer<{ entries?: CompactInboundDetails[]; views?: Array<{ fromName?: string; preview: string; previewTruncated: boolean }> }>("intercom_message", (message, { expanded, outputPad }, theme) => {
		const content = typeof message.content === "string" ? message.content : "Intercom message";
		const views = message.details?.views ?? [];
		const entries = message.details?.entries ?? [];
		const box = new Box(outputPad, 0, (text) => theme.bg("customMessageBg", text));
		if (views.length === 0 || expanded) { box.addChild(new Text(content, 0, 0)); return box; }
		const hint = `(${keyHint("app.tools.expand", "to expand")})`;
		if (views.length > 1) {
			const visible = views.slice(0, 2);
			const remaining = views.length - visible.length;
			const previews = visible.map((view, index) => `${theme.fg("muted", view.fromName ?? entries[index]?.fromSessionId ?? "peer")} · ${view.preview}${view.previewTruncated ? "…" : ""}`);
			if (remaining > 0) previews.push(theme.fg("dim", `… ${remaining} more`));
			box.addChild(new Text(`${theme.fg("customMessageLabel", theme.bold(`📨 intercom · ${views.length} messages`))} ${hint}\n${previews.join("\n")}`, 0, 0));
			return box;
		}
		const view = views[0]!;
		const entry = entries[0];
		let text = `${theme.fg("customMessageLabel", theme.bold("📨 intercom"))} ${theme.fg("muted", "←")} ${theme.fg("muted", view.fromName ?? entry?.fromSessionId ?? "peer")} ${hint}\n${view.preview}${view.previewTruncated ? "…" : ""}`;
		if (entry?.expectsReply && entry.replyable) text += `\n${theme.fg("warning", "reply requested")}`;
		box.addChild(new Text(text, 0, 0));
		return box;
	});

	pi.registerMessageRenderer<IntercomOperationSnapshot & { targetSessionId?: string }>("intercom_operation", (message, { expanded, outputPad }, theme) => {
		const snapshot = message.details;
		const content = typeof message.content === "string" ? message.content : "Intercom operation";
		const box = new Box(outputPad, 0, (text) => theme.bg("customMessageBg", text));
		if (!snapshot || expanded) { box.addChild(new Text(content, 0, 0)); return box; }
		const state = snapshot.state === "completed"
			? theme.fg("success", "completed")
			: theme.fg(snapshot.state === "failed" || snapshot.state === "timed_out" ? "error" : "warning", snapshot.state);
		const view = operationNotificationView(content, snapshot.kind);
		const preview = view ? `\n${theme.fg("muted", `${view.label}: ${view.preview}${view.previewTruncated ? "…" : ""}`)}` : "";
		const reason = snapshot.reason ? `\n${theme.fg("error", snapshot.reason)}` : "";
		const hint = `(${keyHint("app.tools.expand", "to expand")})`;
		box.addChild(new Text(`${theme.fg("customMessageLabel", theme.bold("intercom"))} · ${snapshot.kind} ${state} ${hint}${preview}${reason}`, 0, 0));
		return box;
	});

	pi.on("session_start", async (_event, ctx) => {
		generation++;
		const sessionGeneration = generation;
		context = ctx;
		piSessionId = ctx.sessionManager.getSessionId();
		piPresence = new PiSessionPresenceTracker();
		piPresence.refresh(ctx.sessionManager);
		model = ctx.model?.id ?? "unknown";
		startedAt = Date.now();
		roleLifecycleGeneration++;
		agentRunning = false;
		conversationalLeafId = undefined;
		conversationalTimestamp = null;
		activeTools.clear();
		passiveOperationNotifications.length = 0;
		inboundDelivery?.dispose();
		inboundDelivery = undefined;
		if (runtime) await runtime.dispose();
		const paths = getIntercomPaths();
		const next = new IntercomRuntime({ client: new IntercomClient({ socketPath: paths.socketPath }) });
		const delivery = new InboundDelivery(pi);
		runtime = next;
		inboundDelivery = delivery;
		operations?.dispose();
		operations = new IntercomOperations((snapshot, result) => {
			const requestView = operationViews.get(snapshot.operationId);
			operationViews.delete(snapshot.operationId);
			if (generation !== sessionGeneration || runtime !== next) return;
			const target = result?.targetSessionId
				? `Pi session ID ${JSON.stringify(result.targetSessionId)}`
				: result?.target ?? snapshot.target ?? "unknown peer";
			const outcome = snapshot.state === "completed"
				? result?.reply
					? `ask reply received from ${target}.`
					: `${snapshot.kind} routed to ${target}. This confirms socket routing, not peer processing.`
				: `${snapshot.kind} ${snapshot.state}: ${snapshot.reason ?? "operation ended"}`;
			const details = {
				...snapshot,
				...(result?.targetSessionId ? { targetSessionId: result.targetSessionId } : {}),
				payloadStored: false,
			};
			assertCompactRecord(details, "Intercom operation completion");
			const reply = result?.completionText ? truncateUtf8(result.completionText, 40 * 1024) : "";
			const requestPreview = requestView
				? `\n\n${snapshot.kind === "ask" ? "Question" : "Message"} preview:\n${requestView.preview}${requestView.previewTruncated ? "…" : ""}${requestView.attachmentCount > 0 ? `\n${requestView.attachmentCount} attachment(s)` : ""}`
				: "";
			const content = `**Intercom operation ${snapshot.operationId}**\n\n${outcome}${snapshot.deliveryUncertain ? "\n\nDelivery is uncertain; the peer may or may not have received it." : ""}${snapshot.remoteMayProcess ? "\n\nThe peer may still process an already-routed message." : ""}${requestPreview}${reply ? `\n\n${reply}` : ""}`;
			assertProjectionBound(content, "Intercom operation completion");
			sendOperationNotification(content, details, snapshot.kind === "ask");
		});
		next.on("message",  (entry: InboxEntry) => {
			if (generation !== sessionGeneration || runtime !== next || context !== ctx || inboundDelivery !== delivery) return;
			delivery.record(entry);
		});
		next.on("disconnected", () => {
			if (generation !== sessionGeneration || runtime !== next || context !== ctx) return;
			roleLifecycleGeneration++;
		});
		void next.start(registration(), () => spawnBrokerIfNeeded({ paths }).then(() => undefined)).catch((error) => {
			if (generation === sessionGeneration && runtime === next) next.recordInitialConnectionError(error);
		});
	});

	pi.on("session_shutdown", async () => {
		generation++;
		roleLifecycleGeneration++;
		context = undefined;
		piSessionId = undefined;
		piPresence = undefined;
		stopBashPresenceWatcher();
		agentRunning = false;
		conversationalLeafId = undefined;
		conversationalTimestamp = null;
		activeTools.clear();
		const previousDelivery = inboundDelivery;
		inboundDelivery = undefined;
		previousDelivery?.dispose();
		operations?.dispose();
		operations = undefined;
		operationViews.clear();
		passiveOperationNotifications.length = 0;
		const previous = runtime;
		runtime = undefined;
		if (previous) await previous.dispose();
	});

	pi.on("session_info_changed", () => syncPresence());
	pi.on("session_compact", async () => {
		await clearRole();
		syncPresence();
	});
	pi.on("session_tree", async () => {
		await clearRole();
		syncPresence();
	});
	pi.on("thinking_level_select", () => syncPresence());
	pi.on("message_end", () => {
		const scheduledGeneration = generation;
		setImmediate(() => {
			if (generation === scheduledGeneration) syncPresence();
		});
	});
	pi.on("turn_end", () => syncPresence());
	pi.on("user_bash", () => startBashPresenceWatcher());
	pi.on("model_select", (event) => {
		model = event.model.id;
		syncPresence();
	});
	pi.on("agent_start", () => {
		agentRunning = true;
		activeTools.clear();
		inboundDelivery?.started();
		syncPresence();
	});
	pi.on("agent_end", () => {
		agentRunning = false;
		activeTools.clear();
		syncPresence();
	});
	pi.on("agent_settled", () => {
		inboundDelivery?.settled();
		flushPassiveOperationNotifications();
		syncPresence();
	});
	pi.on("tool_execution_start", (event) => {
		activeTools.set(event.toolCallId, event.toolName);
		syncPresence();
	});
	pi.on("tool_execution_end", (event) => {
		activeTools.delete(event.toolCallId);
		syncPresence();
	});
}
