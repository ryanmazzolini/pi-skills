import { createHash } from "node:crypto";
import {
	closeSync,
	constants as fsConstants,
	fstatSync,
	lstatSync,
	openSync,
	read,
	type BigIntStats,
} from "node:fs";
import { isAbsolute } from "node:path";
import { TextDecoder } from "node:util";

/** Independent hard limits for untrusted local session files. */
export const SESSION_TAIL_LIMITS = Object.freeze({
	locatorBytes: 4_096,
	scanBytes: 512 * 1024 * 1024,
	lineBytes: 64 * 1024 * 1024,
	headerBytes: 64 * 1024,
	entries: 16_384,
	retainedBytes: 512 * 1024,
	events: 64,
	textEvents: 32,
	identifierBytes: 256,
});

export type SessionTailEvent =
	| { kind: "user"; text: string }
	| { kind: "assistant"; text: string }
	| { kind: "tool"; name: string; outcome: "succeeded" | "failed" }
	| { kind: "bash"; outcome: "succeeded" | "failed" | "cancelled" };

export interface SessionTailCounts {
	/** Complete physical entries validated while scanning backward, including other branches. */
	readonly scannedEntries: number;
	/** Entries followed on the advertised leaf-to-root chain. */
	readonly branchEntries: number;
	/** Eligible user/assistant text events found before the scan stopped. */
	readonly eligibleTextEvents: number;
	readonly returnedTextEvents: number;
	readonly toolEvents: number;
	readonly bashEvents: number;
}

export interface SessionTailSnapshot {
	readonly events: readonly SessionTailEvent[];
	readonly counts: SessionTailCounts;
	/** Epoch milliseconds from the newest eligible user/assistant entry in the scanned branch history. */
	readonly lastConversationalTimestamp: number | null;
	/** True only when eligible text was omitted by the requested text limit. */
	readonly truncated: boolean;
	/** Earlier branch entries were not scanned after the requested text was established. */
	readonly historyTruncated: boolean;
	/** Older completed tool or Bash outcomes were omitted by the event limit. */
	readonly outcomeEventsTruncated: boolean;
	/** A bounded, valid UTF-8 final fragment without a newline was ignored. */
	readonly ignoredFinalFragment: boolean;
}

export interface SessionReadHandle<T> {
	readonly snapshot: T;
	verifyStable(): void;
	/** Reopen and compare the original descriptor state after the handle has been closed. */
	verifyReopenedStable(): void;
	close(): void;
}

export type SessionTailHandle = SessionReadHandle<SessionTailSnapshot>;

/** Internal reader result. Only the filtered tail or page belongs in tool output. */
export interface SessionBranchSnapshot {
	readonly branch: readonly BranchEntry[];
	readonly skippedLeaf: Readonly<{ id: string; digest: string }> | null;
	readonly tail: SessionTailSnapshot;
	readonly eventEntryIds: readonly string[];
	readonly fileState: Readonly<StableFileState>;
}

export interface OpenSessionTailInput {
	piSessionId: string;
	fileLocator: string;
	activeLeafId: string | null;
	limit: number;
	/** Emergency ceiling for total file bytes read while finding the requested text. */
	scanBytes?: number;
	/** Cancels between asynchronous file reads. */
	signal?: AbortSignal;
}

const ERROR = Object.freeze({
	input: "Session tail input is invalid",
	unsafe: "Session file is unsafe",
	unstable: "Session file changed while its snapshot was open",
	malformed: "Session file is malformed",
	unsupported: "Session file format is unsupported",
	oversized: "Session file exceeds safety limits",
	window: "Session tail exceeds emergency read ceiling",
	cancelled: "Session tail operation cancelled",
	mismatch: "Session file does not match the advertised snapshot",
	closed: "Session tail handle is closed",
});

class SessionTailReaderError extends Error {}

function fail(message: string): never {
	throw new SessionTailReaderError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function utf8Bytes(value: string): number {
	return Buffer.byteLength(value, "utf8");
}

function boundedNonemptyString(value: unknown, maximumBytes = SESSION_TAIL_LIMITS.identifierBytes): value is string {
	return typeof value === "string" && value.length > 0 && utf8Bytes(value) <= maximumBytes;
}

interface StableFileState {
	dev: bigint;
	ino: bigint;
	uid: bigint;
	size: bigint;
	mtimeNs: bigint;
	ctimeNs: bigint;
}

function currentUid(): bigint {
	const uid = process.getuid?.();
	if (uid === undefined) fail(ERROR.unsafe);
	return BigInt(uid);
}

function stateOf(stats: BigIntStats): StableFileState {
	return {
		dev: stats.dev,
		ino: stats.ino,
		uid: stats.uid,
		size: stats.size,
		mtimeNs: stats.mtimeNs,
		ctimeNs: stats.ctimeNs,
	};
}

function sameIdentity(left: BigIntStats, right: BigIntStats): boolean {
	return left.dev === right.dev && left.ino === right.ino;
}

function sameState(stats: BigIntStats, expected: StableFileState): boolean {
	return stats.dev === expected.dev
		&& stats.ino === expected.ino
		&& stats.uid === expected.uid
		&& stats.size === expected.size
		&& stats.mtimeNs === expected.mtimeNs
		&& stats.ctimeNs === expected.ctimeNs;
}

function ownedRegularFile(stats: BigIntStats, uid: bigint): boolean {
	return stats.isFile() && !stats.isSymbolicLink() && stats.uid === uid;
}

function checkedLstat(locator: string): BigIntStats {
	try {
		return lstatSync(locator, { bigint: true });
	} catch {
		fail(ERROR.unsafe);
	}
}

function checkedFstat(fd: number, instability = false): BigIntStats {
	try {
		return fstatSync(fd, { bigint: true });
	} catch {
		fail(instability ? ERROR.unstable : ERROR.unsafe);
	}
}

function assertPathAndDescriptorStable(
	fd: number,
	locator: string,
	expected: StableFileState,
	uid: bigint,
): void {
	const descriptor = checkedFstat(fd, true);
	let path: BigIntStats;
	try {
		path = lstatSync(locator, { bigint: true });
	} catch {
		fail(ERROR.unstable);
	}
	if (!ownedRegularFile(descriptor, uid)
		|| !ownedRegularFile(path, uid)
		|| !sameIdentity(descriptor, path)
		|| !sameState(descriptor, expected)
		|| !sameState(path, expected)) {
		fail(ERROR.unstable);
	}
}

function assertReopenedPathStable(locator: string, expected: StableFileState, uid: bigint): void {
	let before: BigIntStats;
	try {
		before = lstatSync(locator, { bigint: true });
	} catch {
		fail(ERROR.unstable);
	}
	if (!ownedRegularFile(before, uid) || !sameState(before, expected)) fail(ERROR.unstable);
	const noFollow = fsConstants.O_NOFOLLOW;
	if (typeof noFollow !== "number") fail(ERROR.unsafe);
	let fd: number | undefined;
	try {
		try {
			fd = openSync(locator, fsConstants.O_RDONLY | noFollow | (fsConstants.O_NONBLOCK ?? 0));
		} catch {
			fail(ERROR.unstable);
		}
		assertPathAndDescriptorStable(fd, locator, expected, uid);
	} finally {
		if (fd !== undefined) {
			try {
				closeSync(fd);
			} catch {
				fail(ERROR.unsafe);
			}
		}
	}
}

interface LineSpan {
	start: number;
	end: number;
}

const FATAL_UTF8 = new TextDecoder("utf-8", { fatal: true });

function decodeUtf8(buffer: Buffer, span: LineSpan): string {
	try {
		return FATAL_UTF8.decode(buffer.subarray(span.start, span.end));
	} catch {
		fail(ERROR.malformed);
	}
}

function parseJsonLine(buffer: Buffer, span: LineSpan): Record<string, unknown> {
	const text = decodeUtf8(buffer, span);
	if (text.trim().length === 0) fail(ERROR.malformed);
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		fail(ERROR.malformed);
	}
	if (!isRecord(parsed)) fail(ERROR.malformed);
	return parsed;
}

function validateHeader(header: Record<string, unknown>, piSessionId: string): 2 | 3 {
	if (header.type !== "session") fail(ERROR.malformed);
	if (header.version !== 2 && header.version !== 3) fail(ERROR.unsupported);
	if (!boundedNonemptyString(header.id) || header.id !== piSessionId) fail(ERROR.mismatch);
	if (typeof header.timestamp !== "string" || typeof header.cwd !== "string") fail(ERROR.malformed);
	if (header.parentSession !== undefined && typeof header.parentSession !== "string") fail(ERROR.malformed);
	return header.version;
}

function validateTextOrImageContent(value: unknown): void {
	if (!Array.isArray(value)) fail(ERROR.malformed);
	if (value.length > SESSION_TAIL_LIMITS.events) fail(ERROR.oversized);
	for (const block of value) {
		if (!isRecord(block) || typeof block.type !== "string") fail(ERROR.malformed);
		if (block.type === "text") {
			if (typeof block.text !== "string") fail(ERROR.malformed);
		} else if (block.type === "image") {
			if (typeof block.data !== "string" || typeof block.mimeType !== "string") fail(ERROR.malformed);
		} else {
			fail(ERROR.unsupported);
		}
	}
}

function validateAssistantContent(value: unknown): void {
	if (!Array.isArray(value)) fail(ERROR.malformed);
	if (value.length > SESSION_TAIL_LIMITS.events) fail(ERROR.oversized);
	for (const block of value) {
		if (!isRecord(block) || typeof block.type !== "string") fail(ERROR.malformed);
		switch (block.type) {
			case "text":
				if (typeof block.text !== "string") fail(ERROR.malformed);
				break;
			case "thinking":
				if (typeof block.thinking !== "string") fail(ERROR.malformed);
				break;
			case "toolCall":
				if (!boundedNonemptyString(block.id)
					|| !boundedNonemptyString(block.name)
					|| !isRecord(block.arguments)) fail(ERROR.malformed);
				break;
			default:
				fail(ERROR.unsupported);
		}
	}
}

const ASSISTANT_STOP_REASONS = new Set(["stop", "length", "toolUse", "error", "aborted"]);

function validateMessage(message: unknown, version: 2 | 3): void {
	if (!isRecord(message) || typeof message.role !== "string") fail(ERROR.malformed);
	switch (message.role) {
		case "user":
			if (typeof message.content !== "string") validateTextOrImageContent(message.content);
			break;
		case "assistant":
			validateAssistantContent(message.content);
			if (!ASSISTANT_STOP_REASONS.has(String(message.stopReason))) fail(ERROR.malformed);
			break;
		case "toolResult":
			if (!boundedNonemptyString(message.toolCallId)
				|| !boundedNonemptyString(message.toolName)
				|| typeof message.isError !== "boolean") fail(ERROR.malformed);
			validateTextOrImageContent(message.content);
			break;
		case "bashExecution":
			if (typeof message.command !== "string"
				|| typeof message.output !== "string"
				|| typeof message.cancelled !== "boolean"
				|| typeof message.truncated !== "boolean"
				|| (message.exitCode !== undefined && (!Number.isSafeInteger(message.exitCode) || typeof message.exitCode !== "number"))
				|| (message.fullOutputPath !== undefined && typeof message.fullOutputPath !== "string")
				|| (message.excludeFromContext !== undefined && typeof message.excludeFromContext !== "boolean")) fail(ERROR.malformed);
			break;
		case "custom":
			if (!boundedNonemptyString(message.customType)
				|| typeof message.display !== "boolean"
				|| (typeof message.content !== "string" && !Array.isArray(message.content))) fail(ERROR.malformed);
			if (Array.isArray(message.content)) validateTextOrImageContent(message.content);
			break;
		case "hookMessage":
			if (version !== 2) fail(ERROR.unsupported);
			break;
		case "branchSummary":
			if (typeof message.summary !== "string" || !boundedNonemptyString(message.fromId)) fail(ERROR.malformed);
			break;
		case "compactionSummary":
			if (typeof message.summary !== "string" || typeof message.tokensBefore !== "number") fail(ERROR.malformed);
			break;
		default:
			fail(ERROR.unsupported);
	}
}

const SUPPORTED_ENTRY_TYPES = new Set([
	"message",
	"thinking_level_change",
	"model_change",
	"compaction",
	"branch_summary",
	"custom",
	"custom_message",
	"label",
	"session_info",
]);

function validateEntryShape(entry: Record<string, unknown>, version: 2 | 3): void {
	if (typeof entry.type !== "string" || !SUPPORTED_ENTRY_TYPES.has(entry.type)) fail(ERROR.unsupported);
	if (!boundedNonemptyString(entry.id)) fail(ERROR.malformed);
	if (entry.parentId !== null && !boundedNonemptyString(entry.parentId)) fail(ERROR.malformed);
	if (typeof entry.timestamp !== "string") fail(ERROR.malformed);

	switch (entry.type) {
		case "message":
			validateMessage(entry.message, version);
			break;
		case "thinking_level_change":
			if (typeof entry.thinkingLevel !== "string") fail(ERROR.malformed);
			break;
		case "model_change":
			if (typeof entry.provider !== "string" || typeof entry.modelId !== "string") fail(ERROR.malformed);
			break;
		case "compaction":
			if (typeof entry.summary !== "string"
				|| !boundedNonemptyString(entry.firstKeptEntryId)
				|| typeof entry.tokensBefore !== "number") fail(ERROR.malformed);
			break;
		case "branch_summary":
			if (!boundedNonemptyString(entry.fromId) || typeof entry.summary !== "string") fail(ERROR.malformed);
			break;
		case "custom":
			if (!boundedNonemptyString(entry.customType)) fail(ERROR.malformed);
			break;
		case "custom_message":
			if (!boundedNonemptyString(entry.customType) || typeof entry.display !== "boolean") fail(ERROR.malformed);
			if (typeof entry.content !== "string") validateTextOrImageContent(entry.content);
			break;
		case "label":
			if (!boundedNonemptyString(entry.targetId)
				|| (entry.label !== undefined && typeof entry.label !== "string")) fail(ERROR.malformed);
			break;
		case "session_info":
			if (entry.name !== undefined && typeof entry.name !== "string") fail(ERROR.malformed);
			break;
	}
}

interface BranchEntry {
	id: string;
	parentId: string | null;
	entry: Record<string, unknown>;
}

/** Fingerprint only the compact entry fields that the reader exposes or uses for ancestry. */
export function sessionEntryDigest(entry: Record<string, unknown>): string {
	return createHash("sha256").update(JSON.stringify(entry)).digest("hex");
}

function reserveRetained(current: number, ...values: string[]): number {
	let next = current;
	for (const value of values) next += utf8Bytes(value);
	if (next > SESSION_TAIL_LIMITS.retainedBytes) fail(ERROR.oversized);
	return next;
}

function compactValidatedEntry(entry: Record<string, unknown>): Record<string, unknown> {
	const compact: Record<string, unknown> = {
		type: entry.type,
		id: entry.id,
		parentId: entry.parentId,
		timestamp: entry.timestamp,
	};
	if (entry.type !== "message") return compact;
	const message = entry.message as Record<string, unknown>;
	switch (message.role) {
		case "user":
			compact.message = {
				role: "user",
				content: typeof message.content === "string"
					? message.content
					: (message.content as Record<string, unknown>[])
						.filter((block) => block.type === "text")
						.map((block) => ({ type: "text", text: block.text })),
			};
			break;
		case "assistant": {
			const content: Record<string, unknown>[] = [];
			for (const block of message.content as Record<string, unknown>[]) {
				if (block.type === "text") content.push({ type: "text", text: block.text });
				else if (block.type === "toolCall") content.push({ type: "toolCall", id: block.id, name: block.name });
			}
			compact.message = { role: "assistant", stopReason: message.stopReason, content };
			break;
		}
		case "toolResult":
			compact.message = {
				role: "toolResult",
				toolCallId: message.toolCallId,
				toolName: message.toolName,
				isError: message.isError,
			};
			break;
		case "bashExecution":
			compact.message = {
				role: "bashExecution",
				cancelled: message.cancelled,
				...(message.exitCode === undefined ? {} : { exitCode: message.exitCode }),
			};
			break;
		default:
			compact.message = { role: message.role };
	}
	return compact;
}

function textFromUser(message: Record<string, unknown>): string | undefined {
	if (typeof message.content === "string") return message.content.length === 0 ? undefined : message.content;
	const parts = (message.content as Record<string, unknown>[])
		.filter((block) => block.type === "text")
		.map((block) => block.text as string);
	if (parts.length === 0) return undefined;
	const text = parts.join("\n");
	return text.length === 0 ? undefined : text;
}

function textFromAssistant(message: Record<string, unknown>): string | undefined {
	const parts = (message.content as Record<string, unknown>[])
		.filter((block) => block.type === "text")
		.map((block) => block.text as string);
	if (parts.length === 0) return undefined;
	const text = parts.join("\n");
	return text.length === 0 ? undefined : text;
}

function reserveCompactEntry(current: number, entry: Record<string, unknown>): number {
	let retained = reserveRetained(current, entry.timestamp as string);
	if (entry.type !== "message") return retained;
	const message = entry.message as Record<string, unknown>;
	if (message.role === "user") {
		const text = textFromUser(message);
		return text === undefined ? retained : reserveRetained(retained, text);
	}
	if (message.role === "assistant") {
		const text = textFromAssistant(message);
		if (text !== undefined) retained = reserveRetained(retained, text);
		for (const block of message.content as Record<string, unknown>[]) {
			if (block.type === "toolCall") retained = reserveRetained(retained, block.id as string, block.name as string);
		}
		return retained;
	}
	if (message.role === "toolResult") {
		return reserveRetained(retained, message.toolCallId as string, message.toolName as string);
	}
	return retained;
}

interface PositionedEvent {
	entryId: string;
	position: number;
	sequence: number;
	event: SessionTailEvent;
}

interface PendingToolResult {
	entryId: string;
	position: number;
	sequence: number;
	name: string;
	outcome: "succeeded" | "failed";
}

function canonicalTimestamp(value: unknown): number {
	if (typeof value !== "string") fail(ERROR.malformed);
	const epoch = Date.parse(value);
	if (!Number.isSafeInteger(epoch) || new Date(epoch).toISOString() !== value) fail(ERROR.malformed);
	return epoch;
}

function projectBranch(
	leafToRoot: readonly BranchEntry[],
	limit: number,
): SessionTailSnapshot & { readonly eventEntryIds: readonly string[] } {
	let eligibleTextEvents = 0;
	let lastConversationalTimestamp: number | null = null;
	let selectedTextEvents = 0;
	let sequence = 0;
	const candidates: PositionedEvent[] = [];
	const pendingToolResults = new Map<string, PendingToolResult[]>();

	for (let reverseIndex = 0; reverseIndex < leafToRoot.length; reverseIndex++) {
		const indexed = leafToRoot[reverseIndex];
		const position = leafToRoot.length - reverseIndex - 1;
		const entry = indexed.entry;
		if (entry.type !== "message") continue;
		const message = entry.message as Record<string, unknown>;

		if (message.role === "toolResult") {
			if (selectedTextEvents < limit) {
				const id = message.toolCallId as string;
				const name = message.toolName as string;
				const pending = pendingToolResults.get(id) ?? [];
				pending.push({
					entryId: indexed.id,
					position,
					sequence: sequence++,
					name,
					outcome: message.isError === true ? "failed" : "succeeded",
				});
				pendingToolResults.set(id, pending);
			}
			continue;
		}

		if (message.role === "bashExecution") {
			if (selectedTextEvents < limit) {
				let outcome: "succeeded" | "failed" | "cancelled" | undefined;
				if (message.cancelled === true) outcome = "cancelled";
				else if (typeof message.exitCode === "number") outcome = message.exitCode === 0 ? "succeeded" : "failed";
				if (outcome) candidates.push({ entryId: indexed.id, position, sequence: sequence++, event: { kind: "bash", outcome } });
			}
			continue;
		}

		if (message.role === "assistant") {
			const content = message.content as Record<string, unknown>[];
			const calls = content.filter((block) => block.type === "toolCall");
			const failedAssistant = message.stopReason === "error" || message.stopReason === "aborted";
			for (const call of calls) {
				const id = call.id as string;
				const results = pendingToolResults.get(id);
				if (!results) continue;
				if (!failedAssistant) {
					for (let resultIndex = results.length - 1; resultIndex >= 0; resultIndex--) {
						const result = results[resultIndex];
						if (result.name !== call.name) continue;
						candidates.push({
							entryId: result.entryId,
							position: result.position,
							sequence: result.sequence,
							event: { kind: "tool", name: result.name, outcome: result.outcome },
						});
						break;
					}
				}
				// A call ID owns its results. Mismatches, duplicates, and results for
				// aborted/error calls are deliberately omitted rather than re-paired.
				pendingToolResults.delete(id);
			}
			if (failedAssistant) continue;
			const text = textFromAssistant(message);
			if (text === undefined) continue;
			const timestamp = canonicalTimestamp(entry.timestamp);
			if (lastConversationalTimestamp === null || timestamp > lastConversationalTimestamp) lastConversationalTimestamp = timestamp;
			eligibleTextEvents++;
			if (selectedTextEvents < limit) {
				candidates.push({ entryId: indexed.id, position, sequence: sequence++, event: { kind: "assistant", text } });
				selectedTextEvents++;
			}
			continue;
		}

		if (message.role === "user") {
			const text = textFromUser(message);
			if (text === undefined) continue;
			const timestamp = canonicalTimestamp(entry.timestamp);
			if (lastConversationalTimestamp === null || timestamp > lastConversationalTimestamp) lastConversationalTimestamp = timestamp;
			eligibleTextEvents++;
			if (selectedTextEvents < limit) {
				candidates.push({ entryId: indexed.id, position, sequence: sequence++, event: { kind: "user", text } });
				selectedTextEvents++;
			}
		}
	}

	const selectedTextPositions = candidates
		.filter((candidate) => candidate.event.kind === "user" || candidate.event.kind === "assistant")
		.map((candidate) => candidate.position);
	const earliestTextPosition = selectedTextPositions.length === 0 ? undefined : Math.min(...selectedTextPositions);
	let selected = (earliestTextPosition === undefined
		? candidates
		: candidates.filter((candidate) => candidate.position >= earliestTextPosition))
		.sort((left, right) => left.position - right.position || left.sequence - right.sequence);
	let outcomeEventsTruncated = false;
	if (selected.length > SESSION_TAIL_LIMITS.events) {
		let outcomesToOmit = selected.length - SESSION_TAIL_LIMITS.events;
		selected = selected.filter((candidate) => {
			if (candidate.event.kind === "user" || candidate.event.kind === "assistant" || outcomesToOmit === 0) return true;
			outcomesToOmit--;
			outcomeEventsTruncated = true;
			return false;
		});
	}
	if (selected.length > SESSION_TAIL_LIMITS.events) fail(ERROR.oversized);

	const events = selected.map((candidate) => Object.freeze(candidate.event));
	const toolEvents = events.filter((event) => event.kind === "tool").length;
	const bashEvents = events.filter((event) => event.kind === "bash").length;
	const counts: SessionTailCounts = Object.freeze({
		scannedEntries: 0, // Replaced by the caller after scanning physical entries.
		branchEntries: leafToRoot.length,
		eligibleTextEvents,
		returnedTextEvents: selectedTextEvents,
		toolEvents,
		bashEvents,
	});
	return Object.freeze({
		events: Object.freeze(events),
		eventEntryIds: Object.freeze(selected.map((candidate) => candidate.entryId)),
		counts,
		lastConversationalTimestamp,
		truncated: eligibleTextEvents > selectedTextEvents,
		historyTruncated: false,
		outcomeEventsTruncated,
		ignoredFinalFragment: false,
	});
}

function throwIfCancelled(signal?: AbortSignal): void {
	if (signal?.aborted) fail(ERROR.cancelled);
}

function readOnce(
	fd: number,
	buffer: Buffer,
	offset: number,
	length: number,
	position: bigint,
): Promise<number> {
	if (position < 0n || position > BigInt(Number.MAX_SAFE_INTEGER)) fail(ERROR.oversized);
	return new Promise((resolve, reject) => {
		read(fd, buffer, offset, length, Number(position), (error, bytesRead) => {
			if (error) reject(error);
			else resolve(bytesRead);
		});
	});
}

async function readExactRange(
	fd: number,
	position: bigint,
	length: number,
	signal?: AbortSignal,
): Promise<Buffer> {
	if (position < 0n || !Number.isSafeInteger(length) || length < 0) fail(ERROR.unstable);
	const buffer = Buffer.alloc(length);
	let offset = 0;
	while (offset < buffer.length) {
		throwIfCancelled(signal);
		let bytesRead: number;
		try {
			bytesRead = await readOnce(fd, buffer, offset, buffer.length - offset, position + BigInt(offset));
		} catch {
			fail(ERROR.unstable);
		}
		throwIfCancelled(signal);
		if (bytesRead === 0) fail(ERROR.unstable);
		offset += bytesRead;
	}
	return buffer;
}

interface HeaderWindow {
	buffer: Buffer;
	span: LineSpan;
	bodyStart: bigint;
	leadingBody: Buffer;
	scannedBytes: number;
}

const HEADER_SCAN_CHUNK_BYTES = 4 * 1024;
const REVERSE_SCAN_CHUNK_BYTES = 256 * 1024;

async function readHeaderWindow(
	fd: number,
	size: bigint,
	scanBytes: number,
	signal?: AbortSignal,
): Promise<HeaderWindow> {
	const maximum = Number([
		size,
		BigInt(scanBytes),
		BigInt(SESSION_TAIL_LIMITS.headerBytes + 1),
	].reduce((smallest, candidate) => candidate < smallest ? candidate : smallest));
	if (maximum <= 0) fail(ERROR.window);

	const buffer = Buffer.alloc(maximum);
	let offset = 0;
	while (offset < buffer.length) {
		const length = Math.min(HEADER_SCAN_CHUNK_BYTES, buffer.length - offset);
		const chunk = await readExactRange(fd, BigInt(offset), length, signal);
		chunk.copy(buffer, offset);
		offset += length;
		const newline = buffer.indexOf(0x0a, offset - length);
		if (newline >= 0) {
			if (newline > SESSION_TAIL_LIMITS.headerBytes) fail(ERROR.oversized);
			return {
				buffer: buffer.subarray(0, newline),
				span: { start: 0, end: newline },
				bodyStart: BigInt(newline + 1),
				leadingBody: Buffer.from(buffer.subarray(newline + 1, offset)),
				scannedBytes: offset,
			};
		}
	}

	if (buffer.length > SESSION_TAIL_LIMITS.headerBytes) fail(ERROR.oversized);
	if (buffer.length === scanBytes && BigInt(buffer.length) < size) fail(ERROR.window);
	fail(ERROR.malformed);
}

class ReverseLineReader {
	private readonly fd: number;
	private readonly bodyStart: bigint;
	private readonly scanBytes: number;
	private readonly signal?: AbortSignal;
	private readonly leadingEnd: bigint;
	private position: bigint;
	private available: Buffer = Buffer.alloc(0);
	private availableEnd = 0;
	private leadingBody: Buffer;
	private initialized = false;
	private scanned: number;
	ignoredFinalFragment = false;

	constructor(
		fd: number,
		bodyStart: bigint,
		size: bigint,
		scanBytes: number,
		initialScannedBytes: number,
		leadingBody: Buffer,
		signal?: AbortSignal,
	) {
		this.fd = fd;
		this.bodyStart = bodyStart;
		this.leadingBody = leadingBody;
		this.leadingEnd = bodyStart + BigInt(leadingBody.length);
		this.position = size;
		this.scanBytes = scanBytes;
		this.scanned = initialScannedBytes;
		this.signal = signal;
	}

	private async loadEarlier(): Promise<boolean> {
		if (this.position <= this.bodyStart) return false;
		if (this.leadingBody.length > 0 && this.position === this.leadingEnd) {
			this.available = this.leadingBody;
			this.availableEnd = this.available.length;
			this.leadingBody = Buffer.alloc(0);
			this.position = this.bodyStart;
			return true;
		}
		const remainingBudget = this.scanBytes - this.scanned;
		if (remainingBudget <= 0) fail(ERROR.window);
		const floor = this.leadingBody.length > 0 ? this.leadingEnd : this.bodyStart;
		const remainingFile = this.position - floor;
		const length = Math.min(
			REVERSE_SCAN_CHUNK_BYTES,
			remainingBudget,
			Number(remainingFile > BigInt(REVERSE_SCAN_CHUNK_BYTES) ? BigInt(REVERSE_SCAN_CHUNK_BYTES) : remainingFile),
		);
		if (length <= 0) fail(ERROR.window);
		const start = this.position - BigInt(length);
		this.available = await readExactRange(this.fd, start, length, this.signal);
		this.availableEnd = this.available.length;
		this.position = start;
		this.scanned += length;
		return true;
	}

	private async takeRawLine(): Promise<Buffer | null> {
		const reversedParts: Buffer[] = [];
		let lineBytes = 0;
		while (true) {
			if (this.availableEnd > 0) {
				const newline = this.available.lastIndexOf(0x0a, this.availableEnd - 1);
				if (newline >= 0) {
					const part = this.available.subarray(newline + 1, this.availableEnd);
					lineBytes += part.length;
					if (lineBytes > SESSION_TAIL_LIMITS.lineBytes) fail(ERROR.oversized);
					if (part.length > 0) reversedParts.push(part);
					this.availableEnd = newline;
					if (this.availableEnd === 0) this.available = Buffer.alloc(0);
					return Buffer.concat(reversedParts.reverse(), lineBytes);
				}
				const part = this.available.subarray(0, this.availableEnd);
				lineBytes += part.length;
				if (lineBytes > SESSION_TAIL_LIMITS.lineBytes) fail(ERROR.oversized);
				reversedParts.push(part);
				this.available = Buffer.alloc(0);
				this.availableEnd = 0;
			}

			if (!await this.loadEarlier()) {
				if (reversedParts.length === 0) return null;
				return Buffer.concat(reversedParts.reverse(), lineBytes);
			}
		}
	}

	async initialize(): Promise<void> {
		if (this.initialized) return;
		this.initialized = true;
		const finalFragment = await this.takeRawLine();
		if (finalFragment === null || finalFragment.length === 0) return;
		decodeUtf8(finalFragment, { start: 0, end: finalFragment.length });
		this.ignoredFinalFragment = true;
	}

	async nextLine(): Promise<Buffer | null> {
		await this.initialize();
		return this.takeRawLine();
	}
}

interface BranchScanResult {
	branch: BranchEntry[];
	skippedLeaf: Readonly<{ id: string; digest: string }> | null;
	scannedEntries: number;
	historyTruncated: boolean;
	ignoredFinalFragment: boolean;
}

function isEligibleTextEntry(entry: Record<string, unknown>): boolean {
	if (entry.type !== "message") return false;
	const message = entry.message as Record<string, unknown>;
	if (message.role === "user") return textFromUser(message) !== undefined;
	if (message.role !== "assistant" || message.stopReason === "error" || message.stopReason === "aborted") return false;
	return textFromAssistant(message) !== undefined;
}

async function scanAdvertisedBranch(
	reader: ReverseLineReader,
	activeLeafId: string | null,
	limit: number,
	version: 2 | 3,
	skipLeaf: boolean,
): Promise<BranchScanResult> {
	await reader.initialize();
	if (activeLeafId === null) {
		return {
			branch: [],
			skippedLeaf: null,
			scannedEntries: 0,
			historyTruncated: false,
			ignoredFinalFragment: reader.ignoredFinalFragment,
		};
	}

	const seen = new Set<string>();
	const branch: BranchEntry[] = [];
	let skippedLeaf: BranchScanResult["skippedLeaf"] = null;
	let retainedBytes = 0;
	let scannedEntries = 0;
	let expectedId: string | null = activeLeafId;
	let foundLeaf = false;
	let eligibleTextEvents = 0;
	const unresolvedToolResultIds = new Set<string>();

	while (true) {
		const line = await reader.nextLine();
		if (line === null) {
			if (!foundLeaf) fail(ERROR.mismatch);
			if (expectedId !== null) fail(ERROR.malformed);
			break;
		}
		if (line.length === 0) fail(ERROR.malformed);
		scannedEntries++;
		if (scannedEntries > SESSION_TAIL_LIMITS.entries) fail(ERROR.oversized);
		const entry = parseJsonLine(line, { start: 0, end: line.length });
		validateEntryShape(entry, version);
		const id = entry.id as string;
		const parentId = entry.parentId as string | null;
		if (seen.has(id)) fail(ERROR.malformed);
		seen.add(id);
		retainedBytes = reserveRetained(retainedBytes, id, ...(parentId === null ? [] : [parentId]));

		if (id !== expectedId) continue;
		foundLeaf = true;
		if (parentId !== null && seen.has(parentId)) fail(ERROR.malformed);
		const compact = compactValidatedEntry(entry);
		expectedId = parentId;
		// Verify a consumed boundary without retaining its text against the next page's budget.
		if (skipLeaf && id === activeLeafId) {
			skippedLeaf = Object.freeze({ id, digest: sessionEntryDigest(compact) });
			retainedBytes = reserveRetained(retainedBytes, skippedLeaf.digest);
			if (expectedId === null) break;
			continue;
		}
		retainedBytes = reserveCompactEntry(retainedBytes, compact);
		branch.push({ id, parentId, entry: compact });
		if (compact.type === "message") {
			const message = compact.message as Record<string, unknown>;
			// Only results newer than the selected text boundary can be projected.
			// Continue far enough to find the older calls that authenticate them.
			if (message.role === "toolResult" && eligibleTextEvents < limit) {
				unresolvedToolResultIds.add(message.toolCallId as string);
			} else if (message.role === "assistant" && unresolvedToolResultIds.size > 0) {
				for (const block of message.content as Record<string, unknown>[]) {
					if (block.type === "toolCall") unresolvedToolResultIds.delete(block.id as string);
				}
			}
		}
		if (isEligibleTextEntry(compact)) eligibleTextEvents++;
		if (expectedId === null || (eligibleTextEvents >= limit && unresolvedToolResultIds.size === 0)) break;
	}

	return {
		branch,
		skippedLeaf,
		scannedEntries,
		historyTruncated: expectedId !== null,
		ignoredFinalFragment: reader.ignoredFinalFragment,
	};
}

function validateInput(input: OpenSessionTailInput): void {
	if (!isRecord(input)
		|| !boundedNonemptyString(input.piSessionId)
		|| typeof input.fileLocator !== "string"
		|| !isAbsolute(input.fileLocator)
		|| input.fileLocator.includes("\0")
		|| utf8Bytes(input.fileLocator) > SESSION_TAIL_LIMITS.locatorBytes
		|| (input.activeLeafId !== null && !boundedNonemptyString(input.activeLeafId))
		|| !Number.isInteger(input.limit)
		|| input.limit < 1
		|| input.limit > SESSION_TAIL_LIMITS.textEvents
		|| (input.scanBytes !== undefined && (!Number.isInteger(input.scanBytes)
			|| input.scanBytes < 1
			|| input.scanBytes > SESSION_TAIL_LIMITS.scanBytes))) fail(ERROR.input);
}

/**
 * Open and project one stable, descriptor-backed Pi v2/v3 session tail.
 * Records are streamed backward until the requested text is established; the
 * caller must verify stability immediately before use and close the handle.
 */
export async function openSessionTail(input: OpenSessionTailInput): Promise<SessionTailHandle> {
	const handle = await openSessionBranch(input);
	return { ...handle, snapshot: handle.snapshot.tail };
}

/** Shared bounded scan for the legacy tail and the paged reader. */
export async function openSessionBranch(
	input: OpenSessionTailInput,
	skipLeaf = false,
): Promise<SessionReadHandle<SessionBranchSnapshot>> {
	validateInput(input);
	const uid = currentUid();
	const noFollow = fsConstants.O_NOFOLLOW;
	if (typeof noFollow !== "number") fail(ERROR.unsafe);

	let fd: number | undefined;
	try {
		const beforePath = checkedLstat(input.fileLocator);
		if (!ownedRegularFile(beforePath, uid)) fail(ERROR.unsafe);
		try {
			fd = openSync(
				input.fileLocator,
				fsConstants.O_RDONLY | noFollow | (fsConstants.O_NONBLOCK ?? 0),
			);
		} catch {
			fail(ERROR.unsafe);
		}

		const beforeRead = checkedFstat(fd);
		if (!ownedRegularFile(beforeRead, uid) || !sameIdentity(beforePath, beforeRead)) fail(ERROR.unsafe);
		const stableState = stateOf(beforeRead);
		const openedPath = checkedLstat(input.fileLocator);
		if (!ownedRegularFile(openedPath, uid)
			|| !sameIdentity(beforeRead, openedPath)
			|| !sameState(openedPath, stableState)) fail(ERROR.unstable);

		if (stableState.size < 0n) fail(ERROR.oversized);
		const scanBytes = input.scanBytes ?? SESSION_TAIL_LIMITS.scanBytes;
		const headerWindow = await readHeaderWindow(fd, stableState.size, scanBytes, input.signal);
		const header = parseJsonLine(headerWindow.buffer, headerWindow.span);
		const version = validateHeader(header, input.piSessionId);
		const reader = new ReverseLineReader(
			fd,
			headerWindow.bodyStart,
			stableState.size,
			scanBytes,
			headerWindow.scannedBytes,
			headerWindow.leadingBody,
			input.signal,
		);
		const scanned = await scanAdvertisedBranch(reader, input.activeLeafId, input.limit, version, skipLeaf);
		throwIfCancelled(input.signal);
		assertPathAndDescriptorStable(fd, input.fileLocator, stableState, uid);
		const projected = projectBranch(scanned.branch, input.limit);
		const snapshot: SessionTailSnapshot = Object.freeze({
			events: projected.events,
			counts: Object.freeze({
				...projected.counts,
				scannedEntries: scanned.scannedEntries,
			}),
			lastConversationalTimestamp: projected.lastConversationalTimestamp,
			truncated: projected.truncated,
			historyTruncated: scanned.historyTruncated,
			outcomeEventsTruncated: projected.outcomeEventsTruncated,
			ignoredFinalFragment: scanned.ignoredFinalFragment,
		});

		let open = true;
		const handleFd = fd;
		fd = undefined;
		return {
			snapshot: {
				branch: scanned.branch,
				skippedLeaf: scanned.skippedLeaf,
				tail: snapshot,
				eventEntryIds: projected.eventEntryIds,
				fileState: Object.freeze(stableState),
			},
			verifyStable(): void {
				if (!open) fail(ERROR.closed);
				assertPathAndDescriptorStable(handleFd, input.fileLocator, stableState, uid);
			},
			verifyReopenedStable(): void {
				assertReopenedPathStable(input.fileLocator, stableState, uid);
			},
			close(): void {
				if (!open) return;
				open = false;
				try {
					closeSync(handleFd);
				} catch {
					fail(ERROR.unsafe);
				}
			},
		};
	} catch (error) {
		if (fd !== undefined) {
			try {
				closeSync(fd);
			} catch {
				// Preserve the original static error.
			}
		}
		if (error instanceof SessionTailReaderError) throw error;
		fail(ERROR.unsafe);
	}
}
