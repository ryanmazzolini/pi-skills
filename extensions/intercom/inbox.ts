import { piSessionIdOf, type Message, type SessionInfo } from "./client.ts";
import { INTERCOM_PROJECTION_MAX_BYTES } from "./projection.ts";

export interface InboxEntry {
	from: SessionInfo;
	message: Message;
	receivedAt: number;
	replyable: boolean;
}

export const INBOX_LIMITS = Object.freeze({
	maxPendingAsks: 64,
	maxPendingAskBytes: 1024 * 1024,
	// Reserve room for headings, separators, wrapper fields, and the truncation notice.
	maxPendingProjectionBytes: INTERCOM_PROJECTION_MAX_BYTES - 2_048,
});

function retainedBytes(from: SessionInfo, message: Message): number {
	return Buffer.byteLength(JSON.stringify({ from, message }), "utf8");
}

function retainedProjectionBytes(entry: InboxEntry): number {
	const sessionId = piSessionIdOf(entry.from);
	const pendingLine = `\n- Pi session ID ${sessionId ? JSON.stringify(sessionId) : "unavailable"} · message ${JSON.stringify(entry.message.id)} · 9999999999999s ago`;
	const compactDetails = {
		...(sessionId === undefined ? {} : { fromSessionId: sessionId }),
		messageId: entry.message.id,
		...(entry.message.replyTo === undefined ? {} : { replyTo: entry.message.replyTo }),
		timestamp: entry.message.timestamp,
		receivedAt: entry.receivedAt,
		expectsReply: entry.message.expectsReply === true,
		replyable: true,
		attachmentCount: entry.message.content.attachments?.length ?? 0,
		truncated: true,
	};
	return Math.max(
		Buffer.byteLength(pendingLine, "utf8"),
		Buffer.byteLength(JSON.stringify(compactDetails), "utf8"),
	) + 2;
}

function senderMatches(entry: InboxEntry, target: string): boolean {
	return piSessionIdOf(entry.from) === target
		|| entry.from.id === target // Compatibility with old transcript tool calls.
		|| entry.from.name?.toLowerCase() === target.toLowerCase();
}

export class IntercomInbox {
	private readonly asks = new Map<string, InboxEntry>();
	private readonly askSizes = new Map<string, number>();
	private readonly askProjectionSizes = new Map<string, number>();
	private pendingAskBytes = 0;
	private pendingProjectionBytes = 0;
	private readonly askTtlMs: number;
	private readonly now: () => number;
	private readonly maxPendingAsks: number;
	private readonly maxPendingAskBytes: number;
	private readonly maxPendingProjectionBytes: number;

	constructor(
		askTtlMs = 10 * 60 * 1000,
		now: () => number = Date.now,
		maxPendingAsks = INBOX_LIMITS.maxPendingAsks,
		maxPendingAskBytes = INBOX_LIMITS.maxPendingAskBytes,
		maxPendingProjectionBytes = INBOX_LIMITS.maxPendingProjectionBytes,
	) {
		this.askTtlMs = askTtlMs;
		this.now = now;
		this.maxPendingAsks = maxPendingAsks;
		this.maxPendingAskBytes = maxPendingAskBytes;
		this.maxPendingProjectionBytes = maxPendingProjectionBytes;
	}

	record(from: SessionInfo, message: Message): InboxEntry {
		this.prune();
		const size = retainedBytes(from, message);
		const receivedAt = this.now();
		const candidate = { from, message, receivedAt, replyable: true };
		const projectionSize = retainedProjectionBytes(candidate);
		const replyable = Boolean(
			message.expectsReply
			&& !this.asks.has(message.id)
			&& this.asks.size < this.maxPendingAsks
			&& this.pendingAskBytes + size <= this.maxPendingAskBytes
			&& this.pendingProjectionBytes + projectionSize <= this.maxPendingProjectionBytes,
		);
		const entry = { ...candidate, replyable };
		if (replyable) {
			this.asks.set(message.id, entry);
			this.askSizes.set(message.id, size);
			this.askProjectionSizes.set(message.id, projectionSize);
			this.pendingAskBytes += size;
			this.pendingProjectionBytes += projectionSize;
		}
		return entry;
	}

	select(options: { replyTo?: string; to?: string } = {}): InboxEntry {
		this.prune();
		if (options.replyTo !== undefined) {
			const exact = this.asks.get(options.replyTo);
			if (!exact) throw new Error(`No pending intercom ask with message ID ${JSON.stringify(options.replyTo)}`);
			if (options.to !== undefined && !senderMatches(exact, options.to)) {
				throw new Error(`Pending ask ${JSON.stringify(options.replyTo)} is not from the selected target`);
			}
			return exact;
		}
		const entries = [...this.asks.values()];
		const matches = options.to !== undefined ? entries.filter((entry) => senderMatches(entry, options.to!)) : entries;
		if (matches.length === 1) return matches[0]!;
		if (matches.length === 0) {
			throw new Error(options.to ? "No pending intercom ask from the selected target" : "No unresolved inbound intercom asks");
		}
		throw new Error(options.to
			? "Multiple pending asks from the selected target; select one with replyTo"
			: "Multiple pending intercom asks; select one with replyTo (or narrow with to)");
	}

	has(messageId: string): boolean {
		this.prune();
		return this.asks.has(messageId);
	}

	markReplied(messageId: string, authoritativeSenderId?: string): boolean {
		const entry = this.asks.get(messageId);
		if (!entry || (authoritativeSenderId !== undefined && entry.from.id !== authoritativeSenderId)) return false;
		this.deleteAsk(messageId);
		return true;
	}

	removeSender(sessionId: string): void {
		for (const [messageId, entry] of this.asks) {
			if (entry.from.id === sessionId) this.deleteAsk(messageId);
		}
	}

	list(): InboxEntry[] {
		this.prune();
		return [...this.asks.values()].sort((left, right) => left.receivedAt - right.receivedAt);
	}

	clear(): void {
		this.asks.clear();
		this.askSizes.clear();
		this.askProjectionSizes.clear();
		this.pendingAskBytes = 0;
		this.pendingProjectionBytes = 0;
	}

	retainedAskBytes(): number {
		this.prune();
		return this.pendingAskBytes;
	}

	retainedProjectionBytes(): number {
		this.prune();
		return this.pendingProjectionBytes;
	}

	private deleteAsk(messageId: string): void {
		if (!this.asks.delete(messageId)) return;
		this.pendingAskBytes = Math.max(0, this.pendingAskBytes - (this.askSizes.get(messageId) ?? 0));
		this.pendingProjectionBytes = Math.max(0, this.pendingProjectionBytes - (this.askProjectionSizes.get(messageId) ?? 0));
		this.askSizes.delete(messageId);
		this.askProjectionSizes.delete(messageId);
	}

	private prune(): void {
		const cutoff = this.now() - this.askTtlMs;
		for (const [messageId, entry] of this.asks) {
			if (entry.receivedAt < cutoff) this.deleteAsk(messageId);
		}
	}
}
