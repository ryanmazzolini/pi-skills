import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import {
	INTERCOM_IDENTITY_CAPABILITY,
	INTERCOM_ROLE_CAPABILITY,
	INTERCOM_TAIL_CAPABILITY,
	IntercomClient,
	piSessionIdOf,
	type Attachment,
	type IntercomRole,
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
	targetSessionId: string;
	snapshot: SessionTailSnapshot;
}

export interface RuntimeRoleResult {
	sessionId: string;
	role?: IntercomRole;
}

export interface IntercomStatus {
	connected: boolean;
	sessionId: string | null;
	activeSessions?: number;
	pendingOutgoingAsks: number;
	pendingInboundAsks: number;
	tailCapability: boolean;
	advertisingPiSession: boolean;
	roleCapability: boolean;
	advertisingFirstMate: boolean;
	role?: IntercomRole;
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
		const sessions = await this.client.listSessions();
		const currentPiSessionId = this.client.currentPiSessionId();
		return sessions.map((session) => session.id === this.client.sessionId && currentPiSessionId && !session.piSessionId
			? { ...session, piSessionId: currentPiSessionId }
			: session);
	}

	async setRole(role: IntercomRole | null): Promise<RuntimeRoleResult> {
		await this.ensureConnected();
		if (!this.client.supportsCapability(INTERCOM_ROLE_CAPABILITY)) {
			throw new Error("The active intercom broker does not support First Mate roles; after it exits, wait for reconnect and invoke First Mate again");
		}
		const brokerSessionId = this.client.sessionId;
		const sessionId = this.client.currentPiSessionId();
		if (!brokerSessionId || !sessionId) throw new Error("Intercom client is not registered with a Pi session ID");
		const acknowledged = await this.client.setRole(role);
		if (!this.client.isConnected() || this.client.sessionId !== brokerSessionId || this.client.currentRole() !== acknowledged) {
			this.client.invalidateRoleSession("Intercom role acknowledgement no longer matches the current transport connection");
			throw new Error("Intercom role acknowledgement no longer matches the current transport connection");
		}
		return { sessionId, ...(acknowledged ? { role: acknowledged } : {}) };
	}

	invalidateRoleSession(reason?: string): void {
		this.client.invalidateRoleSession(reason);
	}

	async tail(to: string, limit: number, signal?: AbortSignal, scanBytes?: number): Promise<RuntimeTailResult> {
		throwIfAborted(signal);
		await this.ensureConnected();
		if (!this.client.supportsCapability(INTERCOM_TAIL_CAPABILITY)) {
			throw new Error("The active intercom broker does not support persisted session tails");
		}
		const callerPeerId = this.client.sessionId;
		if (!callerPeerId) throw new Error("Intercom client is not registered");
		const before = await this.client.listSessions(signal);
		const target = this.resolveTargetFromSessions(to, before);
		this.assertNotSelf(target.id);
		const presence = this.requireUniquePiSession(target, before);
		throwIfAborted(signal);
		const opened = await this.openTail({
			piSessionId: presence.sessionId,
			fileLocator: presence.fileLocator,
			activeLeafId: presence.activeLeafId,
			limit,
			...(signal === undefined ? {} : { signal }),
			...(scanBytes === undefined ? {} : { scanBytes }),
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
			return { target, targetSessionId: presence.sessionId, snapshot: opened.snapshot };
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
		onRouting?: () => void,
	): Promise<RuntimeSendResult> {
		throwIfAborted(signal);
		await this.ensureConnected();
		const target = await this.resolveTarget(to, signal);
		throwIfAborted(signal);
		this.assertNotSelf(target.id);
		const routed = await this.client.send(
			target.id,
			{ text, attachments, replyTo },
			signal,
			onRouting,
			this.expectedPiSessionId(target),
			this.expectedTargetSelector(to),
			this.expectedTransportId(target),
		);
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
		onRouting?: () => void,
		onDeliveryRejected?: () => void,
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
			onRouting,
			onDeliveryRejected,
			this.expectedPiSessionId(target),
			this.expectedTargetSelector(to),
			this.expectedTransportId(target),
		);
		return { ...response, requestedPeer: target, requestId };
	}

	async reply(
		text: string,
		options: { to?: string; replyTo?: string; attachments?: Attachment[] } = {},
		signal?: AbortSignal,
		onRouting?: () => void,
	): Promise<RuntimeSendResult & { replyTo: string }> {
		throwIfAborted(signal);
		await this.ensureConnected();
		// A transcript can outlive the local inbox. Fallback is deliberately limited to an absent
		// exact message ID and an exact Pi session ID. Broker IDs remain accepted only for old
		// transcript compatibility; names never authorize expired-inbox routing.
		if (options.to && options.replyTo !== undefined && !this.inbox.has(options.replyTo)) {
			const sessions = await this.client.listSessions(signal);
			const peer = this.resolveExactTargetFromSessions(options.to, sessions);
			if (!peer) throw new Error(`No pending intercom ask with message ID ${JSON.stringify(options.replyTo)}`);
			this.assertNotSelf(peer.id);
			const routed = await this.client.send(
				peer.id,
				{ text, attachments: options.attachments, replyTo: options.replyTo },
				signal,
				onRouting,
				this.expectedPiSessionId(peer),
				this.expectedTargetSelector(options.to),
				this.expectedTransportId(peer),
			);
			return { ...routed, to: peer, replyTo: options.replyTo };
		}
		const selected: InboxEntry = this.inbox.select(options);
		const target = options.to === undefined
			? await this.resolvePendingSender(selected.from, signal)
			: await this.resolveTarget(options.to, signal);
		if (!this.samePeerIdentity(selected.from, target)) {
			throw new Error(`Pending ask ${JSON.stringify(selected.message.id)} is not from the resolved target`);
		}
		this.assertNotSelf(target.id);
		const routed = await this.client.send(target.id, {
			text,
			attachments: options.attachments,
			replyTo: selected.message.id,
		}, signal, onRouting, this.expectedPiSessionId(target), this.expectedTargetSelector(options.to ?? piSessionIdOf(target) ?? target.id), this.expectedTransportId(target));
		if (routed.delivered) this.inbox.markReplied(selected.message.id, selected.from.id);
		return { ...routed, to: target, replyTo: selected.message.id };
	}

	pending(): InboxEntry[] {
		return this.inbox.list();
	}

	async status(): Promise<IntercomStatus> {
		const counts = this.client.pendingCounts();
		const initialConnectionError = this.initialConnectionError?.message;
		const offline = (error?: string): IntercomStatus => ({
			connected: false,
			sessionId: this.client.currentPiSessionId() ?? null,
			pendingOutgoingAsks: counts.asks,
			pendingInboundAsks: this.inbox.list().length,
			tailCapability: false,
			advertisingPiSession: false,
			roleCapability: false,
			advertisingFirstMate: false,
			...(initialConnectionError ? { initialConnectionError } : {}),
			...(error ? { error } : {}),
		});
		try {
			await this.ensureConnected();
		} catch (error) {
			return offline(error instanceof Error ? error.message : String(error));
		}
		const brokerSessionId = this.client.sessionId;
		const tailCapability = this.client.supportsCapability(INTERCOM_TAIL_CAPABILITY);
		const roleCapability = this.client.supportsCapability(INTERCOM_ROLE_CAPABILITY);
		try {
			const sessions = await this.client.listSessions();
			if (!brokerSessionId || !this.client.isConnected() || this.client.sessionId !== brokerSessionId) {
				return offline("Intercom transport connection changed during status inspection");
			}
			const current = sessions.find((session) => session.id === brokerSessionId);
			if (!current) return offline("Current session is missing from intercom session list");
			const sessionId = this.client.currentPiSessionId();
			const advertisedSessionId = piSessionIdOf(current);
			if (!sessionId || (advertisedSessionId !== undefined && advertisedSessionId !== sessionId)) {
				return offline("Current Intercom registration does not match its Pi session ID");
			}
			this.assertUniquePiSessionTarget(current, sessions);
			const role = roleCapability ? current.role : undefined;
			return {
				connected: true,
				sessionId,
				activeSessions: sessions.length,
				pendingOutgoingAsks: counts.asks,
				pendingInboundAsks: this.inbox.list().length,
				tailCapability,
				advertisingPiSession: tailCapability && current.piSession !== undefined,
				roleCapability,
				advertisingFirstMate: role === "first-mate",
				...(role ? { role } : {}),
				...(initialConnectionError ? { initialConnectionError } : {}),
			};
		} catch (error) {
			return {
				...offline(error instanceof Error ? error.message : String(error)),
				tailCapability,
				roleCapability,
			};
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

	private samePeerIdentity(left: SessionInfo, right: SessionInfo): boolean {
		const leftSessionId = piSessionIdOf(left);
		return leftSessionId === undefined ? left.id === right.id : leftSessionId === piSessionIdOf(right);
	}

	private async resolvePendingSender(sender: SessionInfo, signal?: AbortSignal): Promise<SessionInfo> {
		const sessionId = piSessionIdOf(sender);
		if (!sessionId) return sender;
		const current = this.resolveExactTargetFromSessions(sessionId, await this.client.listSessions(signal));
		if (!current || current.id !== sender.id) {
			throw new Error("Pending ask sender changed before the reply could be routed");
		}
		return current;
	}

	private resolveTargetFromSessions(value: string, sessions: readonly SessionInfo[]): SessionInfo {
		const target = value.trim();
		if (!target) throw new Error("Intercom target cannot be empty");
		const exact = this.resolveExactTargetFromSessions(target, sessions);
		const matches = sessions.filter((session) => session.name?.toLowerCase() === target.toLowerCase());
		if (matches.length > 1) throw new Error("Multiple sessions named the requested value are connected. Use the Pi session ID instead.");
		const resolved = exact ?? matches[0];
		if (resolved) {
			this.assertUniquePiSessionTarget(resolved, sessions);
			return resolved;
		}
		throw new Error("Session not found");
	}

	private resolveExactTargetFromSessions(value: string, sessions: readonly SessionInfo[]): SessionInfo | undefined {
		const stableMatches = sessions.filter((session) => piSessionIdOf(session) === value);
		if (stableMatches.length > 1) {
			throw new Error(`Multiple connected sessions advertise Pi session ID ${JSON.stringify(value)}`);
		}
		const legacyExact = sessions.find((session) => session.id === value);
		if (stableMatches[0] && legacyExact && stableMatches[0].id !== legacyExact.id) {
			throw new Error("Intercom target matches different Pi and legacy session IDs");
		}
		const exact = stableMatches[0] ?? legacyExact;
		if (exact) {
			const nameConflict = sessions.find((session) => session.id !== exact.id && session.name?.toLowerCase() === value.toLowerCase());
			if (nameConflict) {
				throw new Error("Intercom target matches both a session name and a different session ID");
			}
			this.assertUniquePiSessionTarget(exact, sessions);
		}
		return exact;
	}

	private expectedPiSessionId(target: SessionInfo): string | undefined {
		return this.client.supportsCapability(INTERCOM_IDENTITY_CAPABILITY) ? piSessionIdOf(target) : undefined;
	}

	private expectedTargetSelector(selector: string): string | undefined {
		return this.client.supportsCapability(INTERCOM_IDENTITY_CAPABILITY) ? selector.trim() : undefined;
	}

	private expectedTransportId(target: SessionInfo): string | undefined {
		return this.client.supportsCapability(INTERCOM_IDENTITY_CAPABILITY) ? target.id : undefined;
	}

	private assertUniquePiSessionTarget(target: SessionInfo, sessions: readonly SessionInfo[]): void {
		const sessionId = piSessionIdOf(target);
		if (!sessionId) return;
		if (sessions.filter((session) => piSessionIdOf(session) === sessionId).length !== 1) {
			throw new Error(`Multiple connected sessions advertise Pi session ID ${JSON.stringify(sessionId)}`);
		}
		const loweredSessionId = sessionId.toLowerCase();
		if (sessions.some((session) => session.id !== target.id && (
			session.id === sessionId
			|| session.name?.toLowerCase() === loweredSessionId
		))) {
			throw new Error(`Pi session ID ${JSON.stringify(sessionId)} conflicts with another connected session name or legacy ID`);
		}
	}

	private requireUniquePiSession(target: SessionInfo, sessions: readonly SessionInfo[]): PiSessionPresence {
		const presence = target.piSession;
		if (!presence) throw new Error("Target session does not advertise an available persisted Pi session");
		const advertisers = sessions.filter((session) => piSessionIdOf(session) === presence.sessionId);
		if (advertisers.length !== 1) throw new Error("Multiple connected sessions advertise the same Pi session ID");
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
