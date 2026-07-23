import type { Attachment, Message, SessionInfo } from "./client.ts";
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
}

export interface TextProjection {
	text: string;
	bytes: number;
	truncated: boolean;
}

export interface CompactInboundDetails {
	fromPeerId: string;
	messageId: string;
	replyTo?: string;
	timestamp: number;
	receivedAt: number;
	expectsReply: boolean;
	replyable: boolean;
	attachmentCount: number;
	truncated: boolean;
}

/** Bounded display-only fields. Authoritative transport metadata stays in CompactInboundDetails. */
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
		throw new Error("Authoritative intercom IDs exceed the model-visible projection bound");
	}

	let optionalBytes = INTERCOM_PROJECTION_MAX_BYTES - requiredBytes - noticeBytes;
	let text = "";
	for (const segment of segments) {
		if (!segment.optional) {
			text += segment.text;
			continue;
		}
		const projected = truncateUtf8(segment.text, optionalBytes);
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
	const replyHint = message.expectsReply && replyable
		? `\n\nTo reply explicitly, use intercom({ action: "reply", to: ${JSON.stringify(from.id)}, replyTo: ${JSON.stringify(message.id)}, message: "..." }).`
		: "";
	return [
		{ text: `${title}\nBroker-derived session ID: ${JSON.stringify(from.id)}` },
		{ text: `\nSelf-declared name: ${declared(from.name)}`, optional: true },
		{ text: `\nSelf-declared cwd: ${declared(from.cwd)}`, optional: true },
		{ text: replyHint },
		{ text: "\n\n---\n\n" },
		{ text: message.content.text, optional: true },
		{ text: formatAttachments(message.content.attachments), optional: true },
	];
}

export function compactInboundDetails(entry: InboxEntry, truncated: boolean): CompactInboundDetails {
	return {
		fromPeerId: entry.from.id,
		messageId: entry.message.id,
		...(entry.message.replyTo === undefined ? {} : { replyTo: entry.message.replyTo }),
		timestamp: entry.message.timestamp,
		receivedAt: entry.receivedAt,
		expectsReply: entry.message.expectsReply === true,
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
	const header = `**Intercom confirmed session tail**\nBroker session ID: ${JSON.stringify(target.id)}\nLast conversational timestamp: ${lastConversationalTimestamp}`;
	const fullHeader = `${header}\nSelf-declared name: ${declared(target.name)}`;
	const sourceFacts = `${snapshot.truncated ? "\nEarlier eligible text was omitted by the requested message limit." : ""}${snapshot.ignoredFinalFragment ? "\nOne incomplete trailing session entry was omitted." : ""}`;
	const fixed = snapshot.events.map((event) => {
		if (event.kind === "user") return "\n\n**User**\n";
		if (event.kind === "assistant") return "\n\n**Assistant**\n";
		if (event.kind === "tool") return `\n\nTool ${JSON.stringify(truncateUtf8(sanitizeSelfDeclaredMetadata(event.name), 256))}: ${event.outcome}`;
		return `\n\nUser Bash: ${event.outcome}`;
	});
	const eventText = snapshot.events.map((event) => event.kind === "user" || event.kind === "assistant" ? sanitizeTailText(event.text) : "");
	const empty = "\n\nNo eligible completed text or outcomes are present in the advertised branch.";
	const complete = fullHeader + (snapshot.events.length === 0 ? empty : fixed.map((part, index) => part + eventText[index]!).join("")) + sourceFacts;
	const sourceTruncated = snapshot.truncated || snapshot.ignoredFinalFragment;
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

function sessionSegments(session: SessionInfo, current: SessionInfo, prefix = ""): ProjectionSegment[] {
	const tags = [
		session.id === current.id ? "self" : undefined,
		session.cwd === current.cwd && session.id !== current.id ? "same self-declared cwd" : undefined,
		session.status ? `self-declared status: ${declared(session.status)}` : undefined,
		session.piSession ? "persisted tail advertised" : undefined,
	].filter((tag): tag is string => Boolean(tag));
	return [
		{ text: `${prefix}• Broker session ID: ${JSON.stringify(session.id)} [role: ${session.role ?? "none"}]` },
		{
			text: ` — self-declared name: ${declared(session.name)}; self-declared cwd: ${declared(session.cwd)}; self-declared model: ${declared(session.model)}${tags.length ? ` [${tags.join(", ")}]` : ""}`,
			optional: true,
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
		segments.push(...sessionSegments(session, current, index === 0 ? "" : "\n"));
	}
	return projectSegments(segments);
}

export function projectPendingEntries(entries: readonly InboxEntry[], now: number): TextProjection {
	if (entries.length === 0) return projectSegments([{ text: "No unresolved inbound asks." }]);
	const segments: ProjectionSegment[] = [{ text: "**Pending asks:**\n" }];
	for (const [index, entry] of entries.entries()) {
		segments.push({
			text: `${index === 0 ? "" : "\n"}- broker session ID ${JSON.stringify(entry.from.id)} · message ${JSON.stringify(entry.message.id)} · ${Math.max(0, Math.floor((now - entry.receivedAt) / 1000))}s ago`,
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
