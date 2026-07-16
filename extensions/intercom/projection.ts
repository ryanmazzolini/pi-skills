import type { Attachment, Message, SessionInfo } from "./client.ts";
import type { InboxEntry } from "./inbox.ts";

/** Pi caps tool output at about 50 KiB. Every model-visible intercom projection stays below it. */
export const INTERCOM_PROJECTION_MAX_BYTES = 48 * 1024;
export const INTERCOM_TRUNCATION_NOTICE = "\n\n[Intercom projection truncated: peer text, attachments, or self-declared metadata was omitted to stay below 48 KiB of UTF-8 output.]";

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

export interface InboundProjection extends TextProjection {
	details: CompactInboundDetails;
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
		? `\n\nTo reply explicitly, use intercom({ action: "reply", replyTo: ${JSON.stringify(message.id)}, message: "..." }).`
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

export function projectInboundEntry(entry: InboxEntry): InboundProjection {
	const projected = projectSegments(peerMessageSegments("**📨 Intercom message**", entry.from, entry.message, entry.replyable !== false));
	return { ...projected, details: compactInboundDetails(entry, projected.truncated) };
}

export function projectAskReply(from: SessionInfo, message: Message): InboundProjection {
	const entry: InboxEntry = { from, message, receivedAt: Date.now(), replyable: false };
	const projected = projectSegments(peerMessageSegments("**Reply to intercom ask**", from, message, false));
	return { ...projected, details: compactInboundDetails(entry, projected.truncated) };
}

function sessionSegments(session: SessionInfo, current: SessionInfo, prefix = ""): ProjectionSegment[] {
	const tags = [
		session.id === current.id ? "self" : undefined,
		session.cwd === current.cwd && session.id !== current.id ? "same self-declared cwd" : undefined,
		session.status ? `self-declared status: ${declared(session.status)}` : undefined,
	].filter((tag): tag is string => Boolean(tag));
	return [
		{ text: `${prefix}• Broker session ID: ${JSON.stringify(session.id)}` },
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
