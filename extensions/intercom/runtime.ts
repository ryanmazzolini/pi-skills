import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import {
	IntercomClient,
	type Attachment,
	type Message,
	type PiSessionPresence,
	type ReceivedMessage,
	type SendResult,
	type SessionInfo,
} from "./client.ts";
import { openSessionTail, type SessionTailSnapshot } from "./session-tail.ts";
import { IntercomInbox, type InboxEntry } from "./inbox.ts";

export interface IntercomRuntimeOptions {
	client: IntercomClient;
	inbox?: IntercomInbox;
	openTail?: typeof openSessionTail;
}

export interface RuntimeSendResult extends SendResult {
	to: SessionInfo;
}

export interface RuntimeAskResult extends ReceivedMessage {
	requestedPeer: SessionInfo;
	requestId: string;
}

export interface RuntimeTailResult {
	target: SessionInfo;
	snapshot: SessionTailSnapshot;
}

export interface IntercomStatus {
	connected: boolean;
	sessionId: string | null;
	activeSessions?: number;
	pendingOutgoingAsks: number;
	pendingInboundAsks: number;
	tailCapability: boolean;
	advertisingPiSession: boolean;
	error?: string;
	initialConnectionError?: string;
}

function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted) throw new Error("Intercom operation cancelled");
}

export class IntercomRuntime extends EventEmitter {
	readonly client: IntercomClient;
	readonly inbox: IntercomInbox;
	private disposed = false;
	private initialConnectionError: Error | null = null;
	private readonly openTail: typeof openSessionTail;

	private readonly onMessage = (from: SessionInfo, message: Message) => {
		const entry = this.inbox.record(from, message);
		this.emit("message", entry);
	};

	private readonly onSessionLeft = (sessionId: string) => {
		this.inbox.removeSender(sessionId);
		this.emit("session_left", sessionId);
	};

	private readonly onDisconnected = (error: Error) => {
		this.inbox.clear();
		this.emit("disconnected", error);
	};

	constructor(options: IntercomRuntimeOptions) {
		super();
		this.client = options.client;
		this.inbox = options.inbox ?? new IntercomInbox();
		this.openTail = options.openTail ?? openSessionTail;
		this.client.on("message", this.onMessage);
		this.client.on("session_left", this.onSessionLeft);
		this.client.on("disconnected", this.onDisconnected);
	}

	start(registration: Omit<SessionInfo, "id">, beforeConnect: () => Promise<void>): Promise<void> {
		if (this.disposed) return Promise.reject(new Error("Intercom runtime disposed"));
		return this.client.start(registration, beforeConnect);
	}

	ensureConnected(): Promise<void> {
		if (this.disposed) return Promise.reject(new Error("Intercom runtime disposed"));
		return this.client.ensureConnected();
	}

	recordInitialConnectionError(error: unknown): void {
		if (this.initialConnectionError) return;
		this.initialConnectionError = error instanceof Error ? error : new Error(String(error));
	}

	async list(): Promise<SessionInfo[]> {
		await this.ensureConnected();
		return this.client.listSessions();
	}

	async tail(to: string, limit: number, signal?: AbortSignal): Promise<RuntimeTailResult> {
		throwIfAborted(signal);
		await this.ensureConnected();
		if (!this.client.supportsPrivatePresence()) {
			throw new Error("The active intercom broker does not support privacy-safe persisted session tails");
		}
		const callerPeerId = this.client.sessionId;
		if (!callerPeerId) throw new Error("Intercom client is not registered");
		const before = await this.client.listSessions(signal);
		const target = this.resolveTargetFromSessions(to, before);
		this.assertNotSelf(target.id);
		const presence = this.requireUniquePiSession(target, before);
		throwIfAborted(signal);
		const opened = this.openTail({
			piSessionId: presence.sessionId,
			fileLocator: presence.fileLocator,
			activeLeafId: presence.activeLeafId,
			limit,
		});
		try {
			throwIfAborted(signal);
			const after = await this.client.listSessions(signal);
			if (this.client.sessionId !== callerPeerId) throw new Error("Target session advertisement changed during tail inspection");
			const current = after.find((session) => session.id === target.id);
			if (!current) throw new Error("Target session advertisement changed during tail inspection");
			const currentPresence = this.requireUniquePiSession(current, after);
			if (!this.samePiSession(presence, currentPresence)) {
				throw new Error("Target session advertisement changed during tail inspection");
			}
			opened.verifyStable();
			return { target, snapshot: opened.snapshot };
		} finally {
			opened.close();
		}
	}

	async send(
		to: string,
		text: string,
		attachments?: Attachment[],
		replyTo?: string,
		signal?: AbortSignal,
	): Promise<RuntimeSendResult> {
		throwIfAborted(signal);
		await this.ensureConnected();
		const target = await this.resolveTarget(to, signal);
		throwIfAborted(signal);
		this.assertNotSelf(target.id);
		const routed = await this.client.send(target.id, { text, attachments, replyTo }, signal);
		if (routed.delivered && replyTo !== undefined) this.inbox.markReplied(replyTo, target.id);
		return { ...routed, to: target };
	}

	async ask(
		to: string,
		text: string,
		attachments?: Attachment[],
		replyTo?: string,
		signal?: AbortSignal,
		onRouted?: (requestId: string, target: SessionInfo) => void,
	): Promise<RuntimeAskResult> {
		throwIfAborted(signal);
		await this.ensureConnected();
		const target = await this.resolveTarget(to, signal);
		throwIfAborted(signal);
		this.assertNotSelf(target.id);
		const requestId = randomUUID();
		const response = await this.client.ask(
			target.id,
			{ text, attachments, replyTo, messageId: requestId },
			signal,
			() => {
				if (replyTo !== undefined) this.inbox.markReplied(replyTo, target.id);
				onRouted?.(requestId, target);
			},
		);
		return { ...response, requestedPeer: target, requestId };
	}

	async reply(
		text: string,
		options: { to?: string; replyTo?: string; attachments?: Attachment[] } = {},
		signal?: AbortSignal,
	): Promise<RuntimeSendResult & { replyTo: string }> {
		throwIfAborted(signal);
		await this.ensureConnected();
		// A transcript can outlive the local inbox. Fallback is deliberately limited to an absent
		// exact ID and an exact authoritative broker session ID; never reinterpret ambiguity,
		// sender mismatches, or a self-declared name as permission to route elsewhere.
		if (options.to && options.replyTo !== undefined && !this.inbox.has(options.replyTo)) {
			const sessions = await this.client.listSessions(signal);
			const peer = sessions.find((session) => session.id === options.to);
			if (!peer) throw new Error(`No pending intercom ask with message ID ${JSON.stringify(options.replyTo)}`);
			this.assertNotSelf(peer.id);
			const routed = await this.client.send(peer.id, { text, attachments: options.attachments, replyTo: options.replyTo }, signal);
			return { ...routed, to: peer, replyTo: options.replyTo };
		}
		const target: InboxEntry = this.inbox.select(options);
		this.assertNotSelf(target.from.id);
		const routed = await this.client.send(target.from.id, {
			text,
			attachments: options.attachments,
			replyTo: target.message.id,
		}, signal);
		if (routed.delivered) this.inbox.markReplied(target.message.id, target.from.id);
		return { ...routed, to: target.from, replyTo: target.message.id };
	}

	pending(): InboxEntry[] {
		return this.inbox.list();
	}

	async status(): Promise<IntercomStatus> {
		const counts = this.client.pendingCounts();
		const initialConnectionError = this.initialConnectionError?.message;
		const tailCapability = this.client.supportsPrivatePresence();
		const base = {
			connected: this.client.isConnected(),
			sessionId: this.client.sessionId,
			pendingOutgoingAsks: counts.asks,
			pendingInboundAsks: this.inbox.list().length,
			tailCapability,
			advertisingPiSession: tailCapability && this.client.currentPiSessionPresence() !== undefined,
			...(initialConnectionError ? { initialConnectionError } : {}),
		};
		if (!base.connected) return { ...base, ...(initialConnectionError ? { error: initialConnectionError } : {}) };
		try {
			const sessions = await this.client.listSessions();
			return { ...base, activeSessions: sessions.length };
		} catch (error) {
			return { ...base, error: error instanceof Error ? error.message : String(error) };
		}
	}

	updateRegistration(registration: Omit<SessionInfo, "id">): void {
		this.client.setRegistration(registration);
	}

	updatePresence(updates: { name?: string; status?: string; model?: string; piSession?: PiSessionPresence | null }): void {
		this.client.updatePresence(updates);
	}

	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		this.client.off("message", this.onMessage);
		this.client.off("session_left", this.onSessionLeft);
		this.client.off("disconnected", this.onDisconnected);
		this.inbox.clear();
		await this.client.disconnect();
		this.removeAllListeners();
	}

	private async resolveTarget(value: string, signal?: AbortSignal): Promise<SessionInfo> {
		return this.resolveTargetFromSessions(value, await this.client.listSessions(signal));
	}

	private resolveTargetFromSessions(value: string, sessions: readonly SessionInfo[]): SessionInfo {
		const target = value.trim();
		if (!target) throw new Error("Intercom target cannot be empty");
		const exact = sessions.find((session) => session.id === target);
		if (exact) return exact;
		const matches = sessions.filter((session) => session.name?.toLowerCase() === target.toLowerCase());
		if (matches.length > 1) throw new Error(`Multiple sessions named "${value}" are connected. Use the session ID instead.`);
		if (matches[0]) return matches[0];
		throw new Error(`Session not found: ${value}`);
	}

	private requireUniquePiSession(target: SessionInfo, sessions: readonly SessionInfo[]): PiSessionPresence {
		const presence = target.piSession;
		if (!presence) throw new Error("Target session does not advertise an available persisted Pi session");
		const advertisers = sessions.filter((session) => session.piSession?.sessionId === presence.sessionId);
		if (advertisers.length !== 1) throw new Error("Multiple connected sessions advertise the same persisted Pi session");
		return presence;
	}

	private samePiSession(left: PiSessionPresence, right: PiSessionPresence): boolean {
		return left.sessionId === right.sessionId
			&& left.fileLocator === right.fileLocator
			&& left.activeLeafId === right.activeLeafId
			&& left.revision === right.revision;
	}

	private assertNotSelf(sessionId: string): void {
		if (sessionId === this.client.sessionId) throw new Error("Cannot target the current session");
	}
}
