import {
	openSessionBranch,
	sessionEntryDigest,
	type OpenSessionTailInput,
	type SessionBranchSnapshot,
	type SessionReadHandle,
	type SessionTailEvent,
} from "./session-tail.ts";

export const SESSION_PAGE_LIMITS = Object.freeze({ minEventBytes: 2, maxEventBytes: 48 * 1024 });

/** Lossless JSON with terminal controls and formatting characters escaped, not removed. */
export function sessionPageJson(value: object): string {
	return JSON.stringify(value).replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu,
		(character) => character.split("").map((unit) => `\\u${unit.charCodeAt(0).toString(16).padStart(4, "0")}`).join(""));
}

export type SessionPageSource = Pick<OpenSessionTailInput, "piSessionId" | "fileLocator" | "activeLeafId">;

declare const cursorBrand: unique symbol;
/** Process-local continuation. A tool adapter must keep this object private behind its own token. */
export interface SessionPageCursor {
	readonly [cursorBrand]: true;
}

export type SessionPageEvent =
	| {
		readonly entryId: string;
		readonly kind: "user" | "assistant";
		readonly text: string;
		/** UTF-16 string offsets in the original projected entry text, before display escaping. */
		readonly textRange: Readonly<{ start: number; end: number; total: number }>;
	}
	| (Extract<SessionTailEvent, { kind: "tool" | "bash" }> & { readonly entryId: string });

export interface SessionPage {
	readonly sessionId: string;
	readonly branchLeafId: string | null;
	readonly events: readonly SessionPageEvent[];
	/** Size of sessionPageJson(events), excluding adapter metadata and cursor tokens. */
	readonly eventBytes: number;
	/** May lead to an empty final page when the remaining history contains no eligible events. */
	readonly next: SessionPageCursor | null;
	readonly outcomeEventsTruncated: boolean;
	readonly ignoredFinalFragment: boolean;
}

export type OpenSessionPageInput = (
	| { source: SessionPageSource; cursor?: never }
	| { cursor: SessionPageCursor; source?: never }
) & {
	limit: number;
	maxEventBytes: number;
	scanBytes?: number;
	signal?: AbortSignal;
};

interface PagePosition {
	source: Readonly<SessionPageSource>;
	fileState: SessionBranchSnapshot["fileState"];
	entryId: string;
	entryDigest: string;
	/** Zero means the boundary entry was consumed completely. */
	textEnd: number;
}

// Weak keys keep cursors replayable without retaining transcripts or a growing registry.
const positions = new WeakMap<SessionPageCursor, PagePosition>();

function bytes(events: readonly SessionPageEvent[]): number {
	return Buffer.byteLength(sessionPageJson(events), "utf8");
}

function textEvent(
	entryId: string,
	kind: "user" | "assistant",
	text: string,
	start: number,
	end: number,
): SessionPageEvent {
	return Object.freeze({
		entryId,
		kind,
		text: text.slice(start, end),
		textRange: Object.freeze({ start, end, total: text.length }),
	});
}

function nextCharacterBoundary(text: string, offset: number): number {
	const current = text.charCodeAt(offset);
	const previous = text.charCodeAt(offset - 1);
	return current >= 0xdc00 && current <= 0xdfff && previous >= 0xd800 && previous <= 0xdbff
		? offset + 1
		: offset;
}

function fittingTextSuffix(
	entryId: string,
	kind: "user" | "assistant",
	text: string,
	end: number,
	selected: readonly SessionPageEvent[],
	maximumBytes: number,
): SessionPageEvent | undefined {
	let low = 0;
	let high = end;
	while (low < high) {
		const middle = Math.floor((low + high) / 2);
		const start = nextCharacterBoundary(text, middle);
		const candidate = textEvent(entryId, kind, text, start, end);
		if (bytes([candidate, ...selected]) <= maximumBytes) high = middle;
		else low = middle + 1;
	}
	const start = nextCharacterBoundary(text, low);
	return start < end ? textEvent(entryId, kind, text, start, end) : undefined;
}

function verifyContinuation(snapshot: SessionBranchSnapshot, position: PagePosition): void {
	const current = snapshot.fileState;
	const previous = position.fileState;
	const boundary = snapshot.skippedLeaf ?? (snapshot.branch[0] && {
		id: snapshot.branch[0].id,
		digest: sessionEntryDigest(snapshot.branch[0].entry),
	});
	// Ordinary appends are allowed. This pins ancestry, not an immutable file copy.
	// Each read must still be stable, and the exact previously returned boundary must survive.
	if (current.dev !== previous.dev || current.ino !== previous.ino || current.uid !== previous.uid
		|| current.size < previous.size
		|| (current.size === previous.size
			&& (current.mtimeNs !== previous.mtimeNs || current.ctimeNs !== previous.ctimeNs))
		|| boundary?.id !== position.entryId
		|| boundary.digest !== position.entryDigest) {
		throw new Error("Session page source changed; start a new read");
	}
}

function makePage(
	input: OpenSessionPageInput,
	source: Readonly<SessionPageSource>,
	snapshot: SessionBranchSnapshot,
	position?: PagePosition,
): SessionPage {
	if (position) verifyContinuation(snapshot, position);
	const selected: SessionPageEvent[] = [];
	for (let index = snapshot.tail.events.length - 1; index >= 0; index--) {
		const event = snapshot.tail.events[index]!;
		const entryId = snapshot.eventEntryIds[index]!;
		if (event.kind === "user" || event.kind === "assistant") {
			const end = position?.entryId === entryId ? position.textEnd : event.text.length;
			const part = fittingTextSuffix(entryId, event.kind, event.text, end, selected, input.maxEventBytes);
			if (!part) break;
			selected.unshift(part);
			if (part.kind === "user" || part.kind === "assistant") {
				if (part.textRange.start > 0) break;
			}
		} else {
			const candidate = Object.freeze({ ...event, entryId });
			if (bytes([candidate, ...selected]) > input.maxEventBytes) break;
			selected.unshift(candidate);
		}
	}

	if (selected.length === 0 && snapshot.tail.events.length > 0) {
		throw new Error("Session page cannot fit the next event; increase the projection byte limit");
	}
	let next: SessionPageCursor | null = null;
	const oldest = selected[0];
	if (oldest) {
		const boundary = snapshot.branch.find((entry) => entry.id === oldest.entryId)!;
		const textEnd = oldest.kind === "user" || oldest.kind === "assistant" ? oldest.textRange.start : 0;
		if (textEnd > 0 || boundary.parentId !== null) {
			next = Object.freeze({}) as SessionPageCursor;
			positions.set(next, {
				source,
				fileState: snapshot.fileState,
				entryId: boundary.id,
				entryDigest: sessionEntryDigest(boundary.entry),
				textEnd,
			});
		}
	}
	return Object.freeze({
		sessionId: source.piSessionId,
		branchLeafId: source.activeLeafId,
		events: Object.freeze(selected),
		eventBytes: bytes(selected),
		next,
		outcomeEventsTruncated: snapshot.tail.outcomeEventsTruncated,
		ignoredFinalFragment: snapshot.tail.ignoredFinalFragment,
	});
}

/**
 * Read older pages on the initial branch without asking a live peer again.
 * Cursors retain a verified entry boundary, not transcript text or open descriptors.
 * The caller must verify the handle before use and reserve output space for adapter metadata.
 */
export async function openSessionPage(input: OpenSessionPageInput): Promise<SessionReadHandle<SessionPage>> {
	if (!input || typeof input !== "object"
		|| !Number.isInteger(input.maxEventBytes)
		|| input.maxEventBytes < SESSION_PAGE_LIMITS.minEventBytes
		|| input.maxEventBytes > SESSION_PAGE_LIMITS.maxEventBytes
		|| (input.source === undefined) === (input.cursor === undefined)) {
		throw new Error("Session page input is invalid");
	}
	const position = input.cursor === undefined ? undefined : positions.get(input.cursor);
	if (input.cursor !== undefined && !position) throw new Error("Session page cursor is invalid or expired");
	const source = position?.source ?? Object.freeze({ ...input.source! });
	const handle = await openSessionBranch({
		...source,
		activeLeafId: position?.entryId ?? source.activeLeafId,
		limit: input.limit,
		...(input.scanBytes === undefined ? {} : { scanBytes: input.scanBytes }),
		...(input.signal === undefined ? {} : { signal: input.signal }),
	}, position?.textEnd === 0);
	try {
		const snapshot = makePage(input, source, handle.snapshot, position);
		handle.verifyStable();
		return { ...handle, snapshot };
	} catch (error) {
		handle.close();
		throw error;
	}
}
