import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import {
	IntercomClient,
	type Attachment,
	type Message,
	type ReceivedMessage,
	type SendResult,
	type SessionInfo,
} from "./client.ts";
import { IntercomInbox, type InboxEntry } from "./inbox.ts";

export interface IntercomRuntimeOptions {
	client: IntercomClient;
	inbox?: IntercomInbox;
}

export interface RuntimeSendResult extends SendResult {
	to: SessionInfo;
}

export interface RuntimeAskResult extends ReceivedMessage {
	requestedPeer: SessionInfo;
	requestId: string;
}

export interface IntercomStatus {
	connected: boolean;
	sessionId: string | null;
	activeSessions?: number;
	pendingOutgoingAsks: number;
	pendingInboundAsks: number;
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
		const target = this.inbox.select(options);
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
		const base = {
			connected: this.client.isConnected(),
			sessionId: this.client.sessionId,
			pendingOutgoingAsks: counts.asks,
			pendingInboundAsks: this.inbox.list().length,
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

	updatePresence(updates: { name?: string; status?: string; model?: string }): void {
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
		const target = value.trim();
		if (!target) throw new Error("Intercom target cannot be empty");
		const sessions = await this.client.listSessions(signal);
		const exact = sessions.find((session) => session.id === target);
		if (exact) return exact;
		const matches = sessions.filter((session) => session.name?.toLowerCase() === target.toLowerCase());
		if (matches.length > 1) throw new Error(`Multiple sessions named "${value}" are connected. Use the session ID instead.`);
		if (matches[0]) return matches[0];
		throw new Error(`Session not found: ${value}`);
	}

	private assertNotSelf(sessionId: string): void {
		if (sessionId === this.client.sessionId) throw new Error("Cannot message the current session");
	}
}
