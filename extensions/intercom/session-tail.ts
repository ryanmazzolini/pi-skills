import {
	closeSync,
	constants as fsConstants,
	fstatSync,
	lstatSync,
	openSync,
	readSync,
	type BigIntStats,
} from "node:fs";
import { isAbsolute } from "node:path";
import { TextDecoder } from "node:util";

/** Independent hard limits for untrusted local session files. */
export const SESSION_TAIL_LIMITS = Object.freeze({
	locatorBytes: 4_096,
	scanBytes: 16 * 1024 * 1024,
	lineBytes: 512 * 1024,
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
	/** All complete entries in the file, including entries on other branches. */
	readonly scannedEntries: number;
	/** Entries on the advertised leaf-to-root chain. */
	readonly branchEntries: number;
	/** Eligible user/assistant text events on that chain, before applying limit. */
	readonly eligibleTextEvents: number;
	readonly returnedTextEvents: number;
	readonly toolEvents: number;
	readonly bashEvents: number;
}

export interface SessionTailSnapshot {
	readonly events: readonly SessionTailEvent[];
	readonly counts: SessionTailCounts;
	/** Epoch milliseconds from the newest eligible user/assistant entry on this branch. */
	readonly lastConversationalTimestamp: number | null;
	/** True only when eligible text was omitted by the requested text limit. */
	readonly truncated: boolean;
	/** A bounded, valid UTF-8 final fragment without a newline was ignored. */
	readonly ignoredFinalFragment: boolean;
}

export interface SessionTailHandle {
	readonly snapshot: SessionTailSnapshot;
	verifyStable(): void;
	close(): void;
}

export interface OpenSessionTailInput {
	piSessionId: string;
	fileLocator: string;
	activeLeafId: string | null;
	limit: number;
	/** Maximum bytes to scan from this one session file (default: scanBytes hard limit). */
	scanBytes?: number;
}

const ERROR = Object.freeze({
	input: "Session tail input is invalid",
	unsafe: "Session file is unsafe",
	unstable: "Session file changed while its snapshot was open",
	malformed: "Session file is malformed",
	unsupported: "Session file format is unsupported",
	oversized: "Session file exceeds safety limits",
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

interface LineSpan {
	start: number;
	end: number;
}

interface SplitLinesResult {
	lines: LineSpan[];
	ignoredFinalFragment: boolean;
}

const FATAL_UTF8 = new TextDecoder("utf-8", { fatal: true });

function decodeUtf8(buffer: Buffer, span: LineSpan): string {
	try {
		return FATAL_UTF8.decode(buffer.subarray(span.start, span.end));
	} catch {
		fail(ERROR.malformed);
	}
}

function splitCompleteLines(buffer: Buffer): SplitLinesResult {
	const lines: LineSpan[] = [];
	let start = 0;
	for (let index = 0; index < buffer.length; index++) {
		if (buffer[index] !== 0x0a) continue;
		if (index - start > SESSION_TAIL_LIMITS.lineBytes) fail(ERROR.oversized);
		lines.push({ start, end: index });
		if (lines.length > SESSION_TAIL_LIMITS.entries + 1) fail(ERROR.oversized);
		start = index + 1;
	}

	const ignoredFinalFragment = start < buffer.length;
	if (ignoredFinalFragment) {
		if (buffer.length - start > SESSION_TAIL_LIMITS.lineBytes) fail(ERROR.oversized);
		// Even ignored bytes must not smuggle invalid encoding past the strict reader.
		decodeUtf8(buffer, { start, end: buffer.length });
	}
	if (lines.length === 0) fail(ERROR.malformed);
	return { lines, ignoredFinalFragment };
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

interface IndexedEntry {
	id: string;
	parentId: string | null;
	lineIndex: number;
	span: LineSpan;
}

interface EntryIndexResult {
	entries: Map<string, IndexedEntry>;
	retainedBytes: number;
}

function reserveRetained(current: number, ...values: string[]): number {
	let next = current;
	for (const value of values) next += utf8Bytes(value);
	if (next > SESSION_TAIL_LIMITS.retainedBytes) fail(ERROR.oversized);
	return next;
}

function indexEntries(
	buffer: Buffer,
	lines: readonly LineSpan[],
	version: 2 | 3,
): EntryIndexResult {
	const entries = new Map<string, IndexedEntry>();
	let retainedBytes = 0;
	// Parse backwards so the append-only tail is encountered first, while still
	// validating every complete line before trusting the advertised branch.
	for (let index = lines.length - 1; index >= 1; index--) {
		const entry = parseJsonLine(buffer, lines[index]);
		validateEntryShape(entry, version);
		const id = entry.id as string;
		const parentId = entry.parentId as string | null;
		if (entries.has(id)) fail(ERROR.malformed);
		retainedBytes = reserveRetained(retainedBytes, id, ...(parentId === null ? [] : [parentId]));
		entries.set(id, { id, parentId, lineIndex: index, span: lines[index] });
	}
	return { entries, retainedBytes };
}

function validateParentsAndCycles(entries: ReadonlyMap<string, IndexedEntry>): void {
	for (const entry of entries.values()) {
		if (entry.parentId === null) continue;
		const parent = entries.get(entry.parentId);
		if (!parent || parent.lineIndex >= entry.lineIndex) fail(ERROR.malformed);
	}

	const state = new Map<string, 1 | 2>();
	for (const first of entries.values()) {
		if (state.get(first.id) === 2) continue;
		const path: IndexedEntry[] = [];
		let current: IndexedEntry | undefined = first;
		while (current) {
			const currentState = state.get(current.id);
			if (currentState === 1) fail(ERROR.malformed);
			if (currentState === 2) break;
			state.set(current.id, 1);
			path.push(current);
			current = current.parentId === null ? undefined : entries.get(current.parentId);
		}
		for (const entry of path) state.set(entry.id, 2);
	}
}

function advertisedBranch(
	entries: ReadonlyMap<string, IndexedEntry>,
	activeLeafId: string | null,
): IndexedEntry[] {
	if (activeLeafId === null) return [];
	let current = entries.get(activeLeafId);
	if (!current) fail(ERROR.mismatch);
	const leafToRoot: IndexedEntry[] = [];
	while (current) {
		leafToRoot.push(current);
		current = current.parentId === null ? undefined : entries.get(current.parentId);
	}
	return leafToRoot;
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

interface PositionedEvent {
	position: number;
	sequence: number;
	event: SessionTailEvent;
}

interface PendingToolResult {
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
	buffer: Buffer,
	leafToRoot: readonly IndexedEntry[],
	limit: number,
	initialRetainedBytes: number,
): SessionTailSnapshot {
	let retainedBytes = initialRetainedBytes;
	let eligibleTextEvents = 0;
	let lastConversationalTimestamp: number | null = null;
	let selectedTextEvents = 0;
	let sequence = 0;
	const candidates: PositionedEvent[] = [];
	const pendingToolResults = new Map<string, PendingToolResult[]>();

	for (let reverseIndex = 0; reverseIndex < leafToRoot.length; reverseIndex++) {
		const indexed = leafToRoot[reverseIndex];
		const position = leafToRoot.length - reverseIndex - 1;
		const entry = parseJsonLine(buffer, indexed.span);
		if (entry.type !== "message") continue;
		const message = entry.message as Record<string, unknown>;

		if (message.role === "toolResult") {
			if (selectedTextEvents < limit) {
				const id = message.toolCallId as string;
				const name = message.toolName as string;
				retainedBytes = reserveRetained(retainedBytes, id, name);
				const pending = pendingToolResults.get(id) ?? [];
				pending.push({
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
				if (outcome) candidates.push({ position, sequence: sequence++, event: { kind: "bash", outcome } });
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
				retainedBytes = reserveRetained(retainedBytes, text);
				candidates.push({ position, sequence: sequence++, event: { kind: "assistant", text } });
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
				retainedBytes = reserveRetained(retainedBytes, text);
				candidates.push({ position, sequence: sequence++, event: { kind: "user", text } });
				selectedTextEvents++;
			}
		}
	}

	const selectedTextPositions = candidates
		.filter((candidate) => candidate.event.kind === "user" || candidate.event.kind === "assistant")
		.map((candidate) => candidate.position);
	const earliestTextPosition = selectedTextPositions.length === 0 ? undefined : Math.min(...selectedTextPositions);
	const selected = (earliestTextPosition === undefined
		? candidates
		: candidates.filter((candidate) => candidate.position >= earliestTextPosition))
		.sort((left, right) => left.position - right.position || left.sequence - right.sequence);
	if (selected.length > SESSION_TAIL_LIMITS.events) fail(ERROR.oversized);

	const events = selected.map((candidate) => Object.freeze(candidate.event));
	const toolEvents = events.filter((event) => event.kind === "tool").length;
	const bashEvents = events.filter((event) => event.kind === "bash").length;
	const counts: SessionTailCounts = Object.freeze({
		scannedEntries: 0, // Replaced by the caller after indexing all branches.
		branchEntries: leafToRoot.length,
		eligibleTextEvents,
		returnedTextEvents: selectedTextEvents,
		toolEvents,
		bashEvents,
	});
	return Object.freeze({
		events: Object.freeze(events),
		counts,
		lastConversationalTimestamp,
		truncated: eligibleTextEvents > selectedTextEvents,
		ignoredFinalFragment: false,
	});
}

function readExactSnapshot(fd: number, size: bigint, scanBytes: number): Buffer {
	if (size < 0n || size > BigInt(scanBytes)) fail(ERROR.oversized);
	const buffer = Buffer.alloc(Number(size));
	let offset = 0;
	while (offset < buffer.length) {
		let bytesRead: number;
		try {
			bytesRead = readSync(fd, buffer, offset, buffer.length - offset, offset);
		} catch {
			fail(ERROR.unstable);
		}
		if (bytesRead === 0) fail(ERROR.unstable);
		offset += bytesRead;
	}
	return buffer;
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
 * Open and project one exact, descriptor-backed Pi v2/v3 session snapshot.
 * The caller must verify stability immediately before using the projection and
 * close the handle in a finally block.
 */
export function openSessionTail(input: OpenSessionTailInput): SessionTailHandle {
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

		const buffer = readExactSnapshot(fd, stableState.size, input.scanBytes ?? SESSION_TAIL_LIMITS.scanBytes);
		assertPathAndDescriptorStable(fd, input.fileLocator, stableState, uid);
		const { lines, ignoredFinalFragment } = splitCompleteLines(buffer);
		const header = parseJsonLine(buffer, lines[0]);
		const version = validateHeader(header, input.piSessionId);
		const indexed = indexEntries(buffer, lines, version);
		validateParentsAndCycles(indexed.entries);
		const branch = advertisedBranch(indexed.entries, input.activeLeafId);
		const projected = projectBranch(buffer, branch, input.limit, indexed.retainedBytes);
		const snapshot: SessionTailSnapshot = Object.freeze({
			events: projected.events,
			counts: Object.freeze({
				...projected.counts,
				scannedEntries: indexed.entries.size,
			}),
			lastConversationalTimestamp: projected.lastConversationalTimestamp,
			truncated: projected.truncated,
			ignoredFinalFragment,
		});

		let open = true;
		const handleFd = fd;
		fd = undefined;
		return {
			snapshot,
			verifyStable(): void {
				if (!open) fail(ERROR.closed);
				assertPathAndDescriptorStable(handleFd, input.fileLocator, stableState, uid);
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
