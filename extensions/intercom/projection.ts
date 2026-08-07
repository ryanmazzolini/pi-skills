import { piSessionIdOf, type Attachment, type Message, type SessionInfo } from "./client.ts";
import type { InboxEntry } from "./inbox.ts";
import type { SessionTailSnapshot } from "./session-tail.ts";

/** Pi caps tool output at about 50 KiB. Every model-visible intercom projection stays below it. */
export const INTERCOM_PROJECTION_MAX_BYTES = 48 * 1024;
/** Enough for authoritative peer ID, timestamp/truncation facts, and one maximum-size outcome label. */
export const INTERCOM_TAIL_PROJECTION_MIN_BYTES = 4 * 1024;
export const INTERCOM_TRUNCATION_NOTICE = "\n\n[Intercom projection truncated: peer text, attachments, or self-declared metadata was omitted to stay below 48 KiB of UTF-8 output.]";
const INTERCOM_TAIL_TRUNCATION_NOTICE = "\n\n[Intercom tail projection truncated to the requested UTF-8 ceiling.]";

interface ProjectionSegment {
	text: string;
	optional?: boolean;
	/** Include the complete optional segment or omit it; identifiers must never be cut in half. */
	atomic?: boolean;
	/** Once this segment cannot fit, omit later optional segments to preserve a coherent prefix. */
	stopOptionalOnOmission?: boolean;
}

export interface TextProjection {
	text: string;
	bytes: number;
	truncated: boolean;
}

export interface CompactInboundDetails {
	fromSessionId?: string;
	messageId: string;
	replyTo?: string;
	timestamp: number;
	receivedAt: number;
	expectsReply: boolean;
	triggerTurn: boolean;
	replyable: boolean;
	attachmentCount: number;
	truncated: boolean;
}

/** Bounded display-only fields. Stable Pi identity and message metadata stay in CompactInboundDetails. */
export interface IntercomMessageView {
	fromName?: string;
	preview: string;
	previewTruncated: boolean;
}

export interface InboundProjection extends TextProjection {
	details: CompactInboundDetails;
	view: IntercomMessageView;
}

function byteLength(value: string): number {
	return Buffer.byteLength(value, "utf8");
}

export function truncateUtf8(value: string, maximumBytes: number): string {
	if (maximumBytes <= 0) return "";
	if (byteLength(value) <= maximumBytes) return value;
	let result = "";
	let used = 0;
	for (const character of value) {
		const bytes = byteLength(character);
		if (used + bytes > maximumBytes) break;
		result += character;
		used += bytes;
	}
	return result;
}

function projectSegments(segments: readonly ProjectionSegment[]): TextProjection {
	const complete = segments.map((segment) => segment.text).join("");
	const completeBytes = byteLength(complete);
	if (completeBytes <= INTERCOM_PROJECTION_MAX_BYTES) {
		return { text: complete, bytes: completeBytes, truncated: false };
	}

	const requiredBytes = segments.reduce((total, segment) => total + (segment.optional ? 0 : byteLength(segment.text)), 0);
	const noticeBytes = byteLength(INTERCOM_TRUNCATION_NOTICE);
	if (requiredBytes + noticeBytes > INTERCOM_PROJECTION_MAX_BYTES) {
		throw new Error("Required intercom metadata exceeds the model-visible projection bound");
	}

	let optionalBytes = INTERCOM_PROJECTION_MAX_BYTES - requiredBytes - noticeBytes;
	let optionalStopped = false;
	let text = "";
	for (const segment of segments) {
		if (!segment.optional) {
			text += segment.text;
			continue;
		}
		if (optionalStopped) continue;
		const segmentBytes = byteLength(segment.text);
		if (segment.atomic && segmentBytes > optionalBytes) {
			if (segment.stopOptionalOnOmission) optionalStopped = true;
			continue;
		}
		const projected = segment.atomic ? segment.text : truncateUtf8(segment.text, optionalBytes);
		text += projected;
		optionalBytes -= byteLength(projected);
	}
	text += INTERCOM_TRUNCATION_NOTICE;
	return { text, bytes: byteLength(text), truncated: true };
}

export function sanitizeSelfDeclaredMetadata(value: string | undefined): string {
	if (value === undefined) return "(not declared)";
	return value
		.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ")
		.replace(/\s+/g, " ")
		.trim();
}

export function sanitizeTailText(value: string): string {
	return value
		.replace(/\r\n?/g, "\n")
		.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, (character) => character === "\n" || character === "\t" ? character : " ");
}

function declared(value: string | undefined): string {
	return JSON.stringify(sanitizeSelfDeclaredMetadata(value));
}

export function formatAttachments(attachments: Attachment[] | undefined): string {
	if (!attachments?.length) return "";
	return attachments.map((attachment) => attachment.language
		? `\n\n---\nAttachment (self-declared name: ${declared(attachment.name)}, language: ${declared(attachment.language)})\n~~~\n${attachment.content}\n~~~`
		: `\n\n---\nAttachment (self-declared name: ${declared(attachment.name)})\n${attachment.content}`).join("");
}

function peerMessageSegments(
	title: string,
	from: SessionInfo,
	message: Message,
	replyable: boolean,
): ProjectionSegment[] {
	const sessionId = piSessionIdOf(from);
	const replyHint = message.expectsReply && replyable
		? sessionId
			? `\n\nTo reply explicitly, use intercom({ action: "reply", to: ${JSON.stringify(sessionId)}, replyTo: ${JSON.stringify(message.id)}, message: "..." }).`
			: `\n\nTo reply explicitly while this ask remains pending, use intercom({ action: "reply", replyTo: ${JSON.stringify(message.id)}, message: "..." }).`
		: "";
	return [
		{ text: `${title}\nPi session ID: ${sessionId ? JSON.stringify(sessionId) : "unavailable"}` },
		{ text: `\nSelf-declared name: ${declared(from.name)}`, optional: true },
		{ text: `\nSelf-declared cwd: ${declared(from.cwd)}`, optional: true },
		{ text: replyHint },
		{ text: "\n\n---\n\n" },
		{ text: message.content.text, optional: true },
		{ text: formatAttachments(message.content.attachments), optional: true },
	];
}

export function compactInboundDetails(entry: InboxEntry, truncated: boolean): CompactInboundDetails {
	const sessionId = piSessionIdOf(entry.from);
	return {
		...(sessionId === undefined ? {} : { fromSessionId: sessionId }),
		messageId: entry.message.id,
		...(entry.message.replyTo === undefined ? {} : { replyTo: entry.message.replyTo }),
		timestamp: entry.message.timestamp,
		receivedAt: entry.receivedAt,
		expectsReply: entry.message.expectsReply === true,
		triggerTurn: entry.message.triggerTurn === true,
		replyable: entry.replyable,
		attachmentCount: entry.message.content.attachments?.length ?? 0,
		truncated,
	};
}

function intercomMessageView(from: SessionInfo, message: Message): IntercomMessageView {
	const fullPreview = sanitizeSelfDeclaredMetadata(message.content.text);
	const preview = truncateUtf8(fullPreview, 256);
	return {
		...(from.name === undefined ? {} : { fromName: truncateUtf8(sanitizeSelfDeclaredMetadata(from.name), 256) }),
		preview,
		previewTruncated: preview !== fullPreview,
	};
}

export function projectInboundEntry(entry: InboxEntry): InboundProjection {
	const projected = projectSegments(peerMessageSegments("**📨 Intercom message**", entry.from, entry.message, entry.replyable !== false));
	return { ...projected, details: compactInboundDetails(entry, projected.truncated), view: intercomMessageView(entry.from, entry.message) };
}

export function projectAskReply(from: SessionInfo, message: Message): InboundProjection {
	const entry: InboxEntry = { from, message, receivedAt: Date.now(), replyable: false };
	const projected = projectSegments(peerMessageSegments("**Reply to intercom ask**", from, message, false));
	return { ...projected, details: compactInboundDetails(entry, projected.truncated), view: intercomMessageView(from, message) };
}

export function projectSessionTail(
	snapshot: SessionTailSnapshot,
	target: SessionInfo,
	maximumBytes = INTERCOM_PROJECTION_MAX_BYTES,
): TextProjection {
	if (!Number.isInteger(maximumBytes) || maximumBytes < INTERCOM_TAIL_PROJECTION_MIN_BYTES || maximumBytes > INTERCOM_PROJECTION_MAX_BYTES) {
		throw new Error("Intercom tail projection ceiling is invalid");
	}
	const lastConversationalTimestamp = snapshot.lastConversationalTimestamp === null
		? "none"
		: new Date(snapshot.lastConversationalTimestamp).toISOString();
	const sessionId = piSessionIdOf(target);
	const header = `**Intercom confirmed session tail**\nPi session ID: ${sessionId ? JSON.stringify(sessionId) : "unavailable"}\nLast conversational timestamp: ${lastConversationalTimestamp}`;
	const fullHeader = `${header}\nSelf-declared name: ${declared(target.name)}`;
	const sourceFacts = `${snapshot.truncated ? "\nEarlier eligible text was omitted by the requested message limit." : ""}${snapshot.historyTruncated ? "\nEarlier branch history was not scanned after the requested text was found." : ""}${snapshot.outcomeEventsTruncated ? "\nOlder completed tool or Bash outcomes were omitted by the session-tail event limit." : ""}${snapshot.ignoredFinalFragment ? "\nOne incomplete trailing session entry was omitted." : ""}`;
	const fixed = snapshot.events.map((event) => {
		if (event.kind === "user") return "\n\n**User**\n";
		if (event.kind === "assistant") return "\n\n**Assistant**\n";
		if (event.kind === "tool") return `\n\nTool ${JSON.stringify(truncateUtf8(sanitizeSelfDeclaredMetadata(event.name), 256))}: ${event.outcome}`;
		return `\n\nUser Bash: ${event.outcome}`;
	});
	const eventText = snapshot.events.map((event) => event.kind === "user" || event.kind === "assistant" ? sanitizeTailText(event.text) : "");
	const empty = "\n\nNo eligible completed text or outcomes are present in the advertised branch.";
	const complete = fullHeader + (snapshot.events.length === 0 ? empty : fixed.map((part, index) => part + eventText[index]!).join("")) + sourceFacts;
	const sourceTruncated = snapshot.truncated || snapshot.historyTruncated || snapshot.outcomeEventsTruncated || snapshot.ignoredFinalFragment;
	if (byteLength(complete) <= maximumBytes) return { text: complete, bytes: byteLength(complete), truncated: sourceTruncated };

	// Keep required facts, then fill from the newest event backwards. Older events
	// are omitted before any ceiling is exceeded.
	const prefix = header + sourceFacts;
	let remaining = maximumBytes - byteLength(prefix) - byteLength(INTERCOM_TAIL_TRUNCATION_NOTICE);
	const selected: string[] = [];
	for (let index = snapshot.events.length - 1; index >= 0; index--) {
		const event = snapshot.events[index]!;
		const label = fixed[index]!;
		if (byteLength(label) > remaining) break;
		const text = event.kind === "user" || event.kind === "assistant"
			? truncateUtf8(eventText[index]!, remaining - byteLength(label))
			: "";
		selected.unshift(label + text);
		remaining -= byteLength(label) + byteLength(text);
	}
	const text = prefix + selected.join("") + INTERCOM_TAIL_TRUNCATION_NOTICE;
	return { text, bytes: byteLength(text), truncated: true };
}

export interface FirstMateTriageProjectionInput {
	currentSessionId: string;
	inventoryTruncated: boolean;
	omittedSessionIds: number;
	snapshotTimestamp: number;
	idleThresholdMs: number;
	selectedSweep: "older" | "fallback" | "none";
	roleCapability: boolean;
	firstMateSessionIds: readonly string[];
	pending: readonly InboxEntry[];
	tails: readonly {
		target: SessionInfo;
		targetSessionId: string;
		advertisedLastConversationalTimestamp?: number | null;
		snapshot?: SessionTailSnapshot;
		error?: string;
	}[];
	activePeersSkipped: number;
	firstMatePeersSkipped: number;
	pendingPeersSkipped: number;
	unidentifiedPeers: number;
	ambiguousPeers: number;
	cachedSummaries?: readonly {
		targetSessionId: string;
		text: string;
	}[];
	cachedSummariesDeferred?: number;
	potentiallyStaleCachedSummaries?: number;
	summaryCacheUnavailable?: number;
	summaryCandidates?: readonly { targetSessionId: string; token: string }[];
	summaryCandidatesDeferred?: number;
	summaryCandidatesUnavailable?: number;
}

function projectedTriageEvents(snapshot: SessionTailSnapshot, maximumBytes: number): TextProjection {
	const sourceTruncated = snapshot.truncated || snapshot.historyTruncated || snapshot.outcomeEventsTruncated || snapshot.ignoredFinalFragment;
	if (maximumBytes <= 0) return { text: "", bytes: 0, truncated: sourceTruncated || snapshot.events.length > 0 };
	const parts = snapshot.events.map((event) => {
		if (event.kind === "user") return `\n\n**User**\n${sanitizeTailText(event.text)}`;
		if (event.kind === "assistant") return `\n\n**Assistant**\n${sanitizeTailText(event.text)}`;
		if (event.kind === "tool") return `\n\nTool ${JSON.stringify(truncateUtf8(sanitizeSelfDeclaredMetadata(event.name), 256))}: ${event.outcome}`;
		return `\n\nUser Bash: ${event.outcome}`;
	});
	const complete = parts.join("");
	if (byteLength(complete) <= maximumBytes) {
		return { text: complete, bytes: byteLength(complete), truncated: sourceTruncated };
	}
	const fullNotice = "\n\n[Triage tail text truncated to the shared projection ceiling.]";
	const notice = truncateUtf8(fullNotice, maximumBytes);
	let remaining = Math.max(0, maximumBytes - byteLength(notice));
	const selected: string[] = [];
	for (let index = parts.length - 1; index >= 0; index--) {
		const part = parts[index]!;
		if (byteLength(part) > remaining) {
			if (selected.length === 0 && remaining > 0) selected.unshift(truncateUtf8(part, remaining));
			break;
		}
		selected.unshift(part);
		remaining -= byteLength(part);
	}
	const text = `${selected.join("")}${notice}`;
	return { text, bytes: byteLength(text), truncated: true };
}

export function projectFirstMateTriage(input: FirstMateTriageProjectionInput): TextProjection {
	const thresholdMinutes = input.idleThresholdMs / 60_000;
	const firstMateState = !input.roleCapability
		? "role capability unavailable"
		: input.firstMateSessionIds.length === 1 && input.firstMateSessionIds[0] === input.currentSessionId
			? "unique role verified"
			: `${input.firstMateSessionIds.length} advertised First Mate roles`;
	const inventoryState = input.inventoryTruncated || input.omittedSessionIds > 0
		? `incomplete (${input.omittedSessionIds} stable IDs omitted)`
		: "complete";
	let fixed = `**First Mate triage evidence**\nPi session ID: ${JSON.stringify(input.currentSessionId)}\nInventory: ${inventoryState}\nSnapshot: ${new Date(input.snapshotTimestamp).toISOString()}\nFirst Mate: ${firstMateState}\nFirst sweep: strictly more than ${thresholdMinutes} minutes idle\nSelected sweep: ${input.selectedSweep}`;
	fixed += `\nSkipped: ${input.activePeersSkipped} active, ${input.firstMatePeersSkipped} other First Mate, ${input.pendingPeersSkipped} with pending asks, ${input.unidentifiedPeers} unidentified, ${input.ambiguousPeers} ambiguous`;
	if (input.pending.length === 0) {
		fixed += "\n\nNo unresolved inbound asks.";
	} else {
		fixed += "\n\n**Pending asks:**";
		for (const entry of input.pending) {
			const sessionId = piSessionIdOf(entry.from);
			const preview = truncateUtf8(sanitizeSelfDeclaredMetadata(entry.message.content.text), 128);
			fixed += `\n- Pi session ID ${sessionId ? JSON.stringify(sessionId) : "unavailable"} · message ${JSON.stringify(entry.message.id)} · ${preview}`;
		}
	}
	let cachedShown = 0;
	if ((input.cachedSummaries?.length ?? 0) > 0) {
		fixed += "\n\n**Reusable cached summaries (advertised and confirmed last turn unchanged):**";
		for (const candidate of input.cachedSummaries ?? []) {
			const block = `\n\nPi session ID: ${JSON.stringify(candidate.targetSessionId)}\n${candidate.text}`;
			if (byteLength(fixed) + byteLength(block) > 32 * 1024) break;
			fixed += block;
			cachedShown++;
		}
	}
	const cachedOmittedByProjection = (input.cachedSummaries?.length ?? 0) - cachedShown;
	const cachedProjectionTruncated = cachedOmittedByProjection > 0;
	const cachedDeferred = (input.cachedSummariesDeferred ?? 0) + cachedOmittedByProjection;
	if (cachedDeferred > 0) fixed += `\n${cachedDeferred} additional unchanged cached summaries were deferred.`;
	if ((input.potentiallyStaleCachedSummaries ?? 0) > 0) {
		fixed += `\n${input.potentiallyStaleCachedSummaries} cached summary record(s) did not match the current advertised and confirmed last turn and were withheld as potentially stale.`;
	}
	if ((input.summaryCacheUnavailable ?? 0) > 0) {
		fixed += `\n${input.summaryCacheUnavailable} cached summary record(s) were unreadable and were not reused.`;
	}
	if ((input.summaryCandidates?.length ?? 0) > 0) {
		fixed += "\n\n**Single-use isolated summary grants (confirmed at least 24 hours stale):**";
		for (const candidate of input.summaryCandidates ?? []) {
			fixed += `\n- Pi session ID ${JSON.stringify(candidate.targetSessionId)} · summaryToken ${JSON.stringify(candidate.token)}`;
		}
	}
	if ((input.summaryCandidatesDeferred ?? 0) > 0) {
		fixed += `\n${input.summaryCandidatesDeferred} additional eligible summaries deferred by the per-agent safety limit.`;
	}
	if ((input.summaryCandidatesUnavailable ?? 0) > 0) {
		fixed += `\n${input.summaryCandidatesUnavailable} eligible expanded snapshot(s) became unavailable during grant capture.`;
	}

	const bases = input.tails.map((tail) => {
		const advertised = tail.advertisedLastConversationalTimestamp == null
			? "unavailable"
			: new Date(tail.advertisedLastConversationalTimestamp).toISOString();
		const confirmed = tail.snapshot?.lastConversationalTimestamp == null
			? "unavailable"
			: new Date(tail.snapshot.lastConversationalTimestamp).toISOString();
		const sourceFacts = tail.snapshot
			? `${tail.snapshot.truncated ? "; earlier eligible text omitted" : ""}${tail.snapshot.historyTruncated ? "; earlier branch history unscanned" : ""}${tail.snapshot.outcomeEventsTruncated ? "; older outcomes omitted" : ""}${tail.snapshot.ignoredFinalFragment ? "; incomplete final entry omitted" : ""}`
			: "";
		const error = tail.error ? `\nInspection error: ${truncateUtf8(sanitizeSelfDeclaredMetadata(tail.error), 256)}` : "";
		return `\n\n**Peer tail**\nPi session ID: ${JSON.stringify(tail.targetSessionId)}\nSelf-declared name: ${declared(compactSessionName(tail.target.name).value)}\nAdvertised conversational timestamp: ${advertised}\nConfirmed conversational timestamp: ${confirmed}${sourceFacts}${error}`;
	});
	const required = fixed + bases.join("");
	if (byteLength(required) > INTERCOM_PROJECTION_MAX_BYTES) {
		const notice = `\n\n[Triage peer metadata exceeded the projection ceiling; ${input.tails.length} selected tails could not be shown safely.]`;
		const text = truncateUtf8(fixed, INTERCOM_PROJECTION_MAX_BYTES - byteLength(notice)) + notice;
		return { text, bytes: byteLength(text), truncated: true };
	}

	const snapshots = input.tails.filter((tail) => tail.snapshot !== undefined).length;
	const remaining = INTERCOM_PROJECTION_MAX_BYTES - byteLength(required);
	const perTailBytes = snapshots === 0 ? 0 : Math.min(INTERCOM_TAIL_PROJECTION_MIN_BYTES, Math.floor(remaining / snapshots));
	let truncated = cachedProjectionTruncated;
	let text = fixed;
	for (const [index, tail] of input.tails.entries()) {
		text += bases[index]!;
		if (!tail.snapshot) continue;
		const events = projectedTriageEvents(tail.snapshot, perTailBytes);
		text += events.text;
		truncated ||= events.truncated;
	}
	return { text, bytes: byteLength(text), truncated };
}

function sessionSegments(session: SessionInfo, current: SessionInfo, prefix = "", optionalIdentity = false): ProjectionSegment[] {
	const sessionId = piSessionIdOf(session);
	const conversationalAge = session.lastConversationalTimestamp === undefined
		? undefined
		: session.lastConversationalTimestamp === null
			? "last conversational timestamp unavailable"
			: `last conversational timestamp: ${new Date(session.lastConversationalTimestamp).toISOString()}`;
	const tags = [
		session.id === current.id ? "self" : undefined,
		session.cwd === current.cwd && session.id !== current.id ? "same self-declared cwd" : undefined,
		session.status ? `self-declared status: ${declared(session.status)}` : undefined,
		conversationalAge,
		session.piSession ? "persisted tail advertised" : undefined,
	].filter((tag): tag is string => Boolean(tag));
	return [
		{
			text: `${prefix}• Pi session ID: ${sessionId ? JSON.stringify(sessionId) : "unavailable"} [role: ${session.role ?? "none"}]`,
			...(optionalIdentity ? { optional: true, atomic: true, stopOptionalOnOmission: true } : {}),
		},
		{
			text: ` — self-declared name: ${declared(session.name)}; self-declared cwd: ${declared(session.cwd)}; self-declared model: ${declared(session.model)}${tags.length ? ` [${tags.join(", ")}]` : ""}`,
			optional: true,
			atomic: true,
		},
	];
}

export function projectSession(session: SessionInfo, current: SessionInfo): TextProjection {
	return projectSegments(sessionSegments(session, current));
}

export function projectSessionList(sessions: readonly SessionInfo[], current: SessionInfo): TextProjection {
	const others = sessions.filter((session) => session.id !== current.id);
	const segments: ProjectionSegment[] = [
		{ text: "**Current session:**\n" },
		...sessionSegments(current, current),
		{ text: "\n\n**Other sessions:**\n" },
	];
	if (others.length === 0) segments.push({ text: "No other sessions connected." });
	for (const [index, session] of others.entries()) {
		segments.push(...sessionSegments(session, current, index === 0 ? "" : "\n", true));
	}
	return projectSegments(segments);
}

export function projectPendingEntries(entries: readonly InboxEntry[], now: number): TextProjection {
	if (entries.length === 0) return projectSegments([{ text: "No unresolved inbound asks." }]);
	const segments: ProjectionSegment[] = [{ text: "**Pending asks:**\n" }];
	for (const [index, entry] of entries.entries()) {
		const sessionId = piSessionIdOf(entry.from);
		segments.push({
			text: `${index === 0 ? "" : "\n"}- Pi session ID ${sessionId ? JSON.stringify(sessionId) : "unavailable"} · message ${JSON.stringify(entry.message.id)} · ${Math.max(0, Math.floor((now - entry.receivedAt) / 1000))}s ago`,
		});
		segments.push({ text: ` · self-declared name ${declared(entry.from.name)}`, optional: true });
		const preview = sanitizeSelfDeclaredMetadata(entry.message.content.text);
		segments.push({ text: ` · ${truncateUtf8(preview, 256)}`, optional: true });
	}
	return projectSegments(segments);
}

export function compactSessionName(name: string | undefined, maximumBytes = 256): { value?: string; truncated: boolean } {
	if (name === undefined) return { truncated: false };
	const sanitized = sanitizeSelfDeclaredMetadata(name);
	const value = truncateUtf8(sanitized, maximumBytes);
	return { value, truncated: value !== sanitized };
}

export function projectionBytes(value: unknown): number {
	return Buffer.byteLength(typeof value === "string" ? value : JSON.stringify(value), "utf8");
}

export function assertProjectionBound(value: unknown, label: string): void {
	const bytes = projectionBytes(value);
	if (bytes > INTERCOM_PROJECTION_MAX_BYTES) {
		throw new Error(`${label} exceeds the ${INTERCOM_PROJECTION_MAX_BYTES}-byte intercom projection bound`);
	}
}
