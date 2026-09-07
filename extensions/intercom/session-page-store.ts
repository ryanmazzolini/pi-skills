import { randomUUID } from "node:crypto";
import type { IntercomRuntime } from "./runtime.ts";
import {
	openSessionPage,
	sessionPageJson,
	type SessionPage,
	type SessionPageCursor,
	type SessionPageSource,
} from "./session-page.ts";
import { INTERCOM_PROJECTION_MAX_BYTES, INTERCOM_TAIL_PROJECTION_MIN_BYTES } from "./projection.ts";

export const SESSION_PAGE_CURSOR_LIMITS = Object.freeze({ count: 128, ttlMs: 30 * 60 * 1000 });

interface CursorRecord {
	cursor: SessionPageCursor;
	sessionId: string;
	branchLeafId: string | null;
	expiresAt: number;
}

export type SessionPageRequest =
	| { to: string; runtime: Pick<IntercomRuntime, "readSession"> }
	| { cursor: string };

export interface SessionPageOptions {
	limit: number;
	projectionBytes: number;
	scanBytes?: number;
	signal?: AbortSignal;
}

function packet(page: Pick<SessionPage, "sessionId" | "branchLeafId" | "events" | "outcomeEventsTruncated" | "ignoredFinalFragment">, nextCursor: string | null, expiresAt: number) {
	return {
		sessionId: page.sessionId,
		branchLeafId: page.branchLeafId,
		events: page.events,
		nextCursor,
		cursorExpiresAt: nextCursor === null ? null : new Date(expiresAt).toISOString(),
		outcomeEventsTruncated: page.outcomeEventsTruncated,
		ignoredFinalFragment: page.ignoredFinalFragment,
	};
}

function eventBudget(sessionId: string, branchLeafId: string | null, token: string, expiresAt: number, projectionBytes: number): number {
	// false and a real next cursor reserve the largest metadata representation.
	const envelope = packet({ sessionId, branchLeafId, events: [], outcomeEventsTruncated: false, ignoredFinalFragment: false }, token, expiresAt);
	return projectionBytes - Buffer.byteLength(sessionPageJson(envelope), "utf8") + 2;
}

/** Session-owned cursor tokens. No timers, persisted source locators, or transcript cache. */
export class SessionPageStore {
	private readonly cursors = new Map<string, CursorRecord>();
	private generation = 0;
	private readonly now: () => number;
	private readonly openPage: typeof openSessionPage;

	constructor(options: { now?: () => number; openPage?: typeof openSessionPage } = {}) {
		this.now = options.now ?? Date.now;
		this.openPage = options.openPage ?? openSessionPage;
	}

	clear(): void {
		this.generation++;
		this.cursors.clear();
	}

	private checkCurrent(generation: number, signal?: AbortSignal): void {
		if (generation !== this.generation) throw new Error("Session changed while reading a page; start a new paginated tail");
		if (signal?.aborted) throw new Error("Session page read cancelled");
	}

	private prune(): void {
		const now = this.now();
		for (const [token, record] of this.cursors) {
			if (record.expiresAt <= now) this.cursors.delete(token);
		}
	}

	async read(request: SessionPageRequest, options: SessionPageOptions) {
		if (!Number.isInteger(options.projectionBytes)
			|| options.projectionBytes < INTERCOM_TAIL_PROJECTION_MIN_BYTES
			|| options.projectionBytes > INTERCOM_PROJECTION_MAX_BYTES) {
			throw new Error("Session page projection byte limit is invalid");
		}
		const generation = this.generation;
		this.checkCurrent(generation, options.signal);
		this.prune();
		const token = randomUUID();
		let expiresAt = this.now() + SESSION_PAGE_CURSOR_LIMITS.ttlMs;
		const readOptions = {
			limit: options.limit,
			...(options.scanBytes === undefined ? {} : { scanBytes: options.scanBytes }),
			...(options.signal === undefined ? {} : { signal: options.signal }),
		};
		let page: SessionPage;
		if ("cursor" in request) {
			const record = this.cursors.get(request.cursor);
			if (!record) throw new Error("Session page cursor is invalid or expired; start a new paginated tail from a connected session");
			const opened = await this.openPage({
				cursor: record.cursor,
				maxEventBytes: eventBudget(record.sessionId, record.branchLeafId, token, expiresAt, options.projectionBytes),
				...readOptions,
			});
			try {
				opened.verifyStable();
				page = opened.snapshot;
			} finally {
				opened.close();
			}
		} else {
			const result = await request.runtime.readSession(request.to, (source: SessionPageSource) => this.openPage({
				source,
				maxEventBytes: eventBudget(source.piSessionId, source.activeLeafId, token, expiresAt, options.projectionBytes),
				...readOptions,
			}), options.signal);
			page = result.snapshot;
		}
		this.checkCurrent(generation, options.signal);
		expiresAt = this.now() + SESSION_PAGE_CURSOR_LIMITS.ttlMs;
		const nextCursor = page.next ? token : null;
		const value = packet(page, nextCursor, expiresAt);
		const text = sessionPageJson(value);
		if (Buffer.byteLength(text, "utf8") > options.projectionBytes) throw new Error("Session page exceeds its projection byte limit");
		// Register only after source verification and final output sizing have succeeded.
		if (page.next) {
			this.prune();
			while (this.cursors.size >= SESSION_PAGE_CURSOR_LIMITS.count) this.cursors.delete(this.cursors.keys().next().value!);
			this.cursors.set(token, { cursor: page.next, sessionId: page.sessionId, branchLeafId: page.branchLeafId, expiresAt });
		}
		return {
			text,
			details: {
				paged: true,
				targetSessionId: page.sessionId,
				branchLeafId: page.branchLeafId,
				returnedTextMessages: page.events.filter((event) => event.kind === "user" || event.kind === "assistant").length,
				timelineEvents: page.events.length,
				requestedProjectionBytes: options.projectionBytes,
				projectionBytes: Buffer.byteLength(text, "utf8"),
				nextCursor,
				cursorExpiresAt: value.cursorExpiresAt,
				truncated: nextCursor !== null || page.outcomeEventsTruncated || page.ignoredFinalFragment,
			},
		};
	}
}
