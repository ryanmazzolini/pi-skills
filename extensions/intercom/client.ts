// Wire behavior is compatible with pi-intercom 0.6.0 (MIT, Copyright (c) 2026 Nico Bailon).
// See THIRD_PARTY_NOTICES.md and tests/fixtures/pi-intercom-0.6.0/PROVENANCE.md.
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import net, { type Socket } from "node:net";
import path from "node:path";
import { getBrokerSocketPath } from "./broker/paths.ts";

export const INTERCOM_TAIL_CAPABILITY = "pi-session-tail-v1";
export const INTERCOM_ROLE_CAPABILITY = "first-mate-role-v1";
export type IntercomRole = "first-mate";

export interface PiSessionPresence {
	sessionId: string;
	fileLocator: string;
	activeLeafId: string | null;
	revision: number;
}

export interface SessionInfo {
	id: string;
	name?: string;
	cwd: string;
	model: string;
	pid: number;
	startedAt: number;
	lastActivity: number;
	status?: string;
	role?: IntercomRole;
	piSession?: PiSessionPresence;
}

export interface Attachment {
	type: "file" | "snippet" | "context";
	name: string;
	content: string;
	language?: string;
}

export interface Message {
	id: string;
	timestamp: number;
	replyTo?: string;
	expectsReply?: boolean;
	content: {
		text: string;
		attachments?: Attachment[];
	};
}

export interface SendOptions {
	text: string;
	attachments?: Attachment[];
	replyTo?: string;
	expectsReply?: boolean;
	messageId?: string;
}

export interface SendResult {
	id: string;
	delivered: boolean;
	reason?: string;
}

export interface ReceivedMessage {
	from: SessionInfo;
	message: Message;
}

export const INTERCOM_LIMITS = Object.freeze({
	maxFrameBytes: 1024 * 1024,
	maxIdBytes: 256,
	maxTargetBytes: 1024,
	maxSessionStringBytes: 4096,
	maxCapabilities: 16,
	maxCapabilityBytes: 64,
	maxPiSessionIdBytes: 256,
	maxPiSessionFileBytes: 4096,
	maxPiSessionLeafBytes: 256,
	maxMessageTextBytes: 256 * 1024,
	maxAttachments: 16,
	maxAttachmentNameBytes: 4096,
	maxAttachmentContentBytes: 512 * 1024,
	maxAttachmentTotalBytes: 768 * 1024,
	maxPendingSends: 256,
	maxPendingLists: 64,
	maxPendingAsks: 64,
	maxPendingRoles: 64,
	maxQueuedWriteBytes: 2 * 1024 * 1024,
});

function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

function byteLength(value: string): number {
	return Buffer.byteLength(value, "utf8");
}

function boundedString(value: unknown, maximum: number, allowEmpty = false): value is string {
	return typeof value === "string"
		&& (allowEmpty || value.length > 0)
		&& byteLength(value) <= maximum;
}

function finiteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

export function isAttachment(value: unknown): value is Attachment {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const attachment = value as Record<string, unknown>;
	return (attachment.type === "file" || attachment.type === "snippet" || attachment.type === "context")
		&& boundedString(attachment.name, INTERCOM_LIMITS.maxAttachmentNameBytes, true)
		&& boundedString(attachment.content, INTERCOM_LIMITS.maxAttachmentContentBytes, true)
		&& (attachment.language === undefined || boundedString(attachment.language, 256, true));
}

export function areAttachments(value: unknown): value is Attachment[] {
	if (!Array.isArray(value) || value.length > INTERCOM_LIMITS.maxAttachments || !value.every(isAttachment)) return false;
	return value.reduce((total, attachment) => total + byteLength(attachment.content), 0) <= INTERCOM_LIMITS.maxAttachmentTotalBytes;
}

export function isMessage(value: unknown): value is Message {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const message = value as Record<string, unknown>;
	if (!boundedString(message.id, INTERCOM_LIMITS.maxIdBytes, true) || !finiteNumber(message.timestamp)) return false;
	if (message.replyTo !== undefined && !boundedString(message.replyTo, INTERCOM_LIMITS.maxIdBytes, true)) return false;
	if (message.expectsReply !== undefined && typeof message.expectsReply !== "boolean") return false;
	if (!message.content || typeof message.content !== "object" || Array.isArray(message.content)) return false;
	const content = message.content as Record<string, unknown>;
	return boundedString(content.text, INTERCOM_LIMITS.maxMessageTextBytes, true)
		&& (content.attachments === undefined || areAttachments(content.attachments));
}

export function isIntercomRole(value: unknown): value is IntercomRole {
	return value === "first-mate";
}

export function isPiSessionPresence(value: unknown): value is PiSessionPresence {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const presence = value as Record<string, unknown>;
	if (Object.keys(presence).length !== 4 || !["sessionId", "fileLocator", "activeLeafId", "revision"].every((key) => key in presence)) return false;
	return boundedString(presence.sessionId, INTERCOM_LIMITS.maxPiSessionIdBytes)
		&& boundedString(presence.fileLocator, INTERCOM_LIMITS.maxPiSessionFileBytes)
		&& path.isAbsolute(presence.fileLocator)
		&& (presence.activeLeafId === null || boundedString(presence.activeLeafId, INTERCOM_LIMITS.maxPiSessionLeafBytes))
		&& Number.isSafeInteger(presence.revision)
		&& (presence.revision as number) >= 1;
}

function areCapabilities(value: unknown): value is string[] {
	return Array.isArray(value)
		&& value.length <= INTERCOM_LIMITS.maxCapabilities
		&& value.every((item) => boundedString(item, INTERCOM_LIMITS.maxCapabilityBytes));
}

function samePiSession(left: PiSessionPresence | undefined, right: PiSessionPresence | undefined): boolean {
	return left?.sessionId === right?.sessionId
		&& left?.fileLocator === right?.fileLocator
		&& left?.activeLeafId === right?.activeLeafId
		&& left?.revision === right?.revision;
}

export function isSessionInfo(value: unknown): value is SessionInfo {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const session = value as Record<string, unknown>;
	return boundedString(session.id, INTERCOM_LIMITS.maxIdBytes, true)
		&& boundedString(session.cwd, INTERCOM_LIMITS.maxSessionStringBytes, true)
		&& boundedString(session.model, INTERCOM_LIMITS.maxSessionStringBytes, true)
		&& Number.isSafeInteger(session.pid)
		&& finiteNumber(session.startedAt)
		&& finiteNumber(session.lastActivity)
		&& (session.name === undefined || boundedString(session.name, INTERCOM_LIMITS.maxSessionStringBytes, true))
		&& (session.status === undefined || boundedString(session.status, INTERCOM_LIMITS.maxSessionStringBytes, true))
		&& (session.role === undefined || isIntercomRole(session.role))
		&& (session.piSession === undefined || isPiSessionPresence(session.piSession));
}

function validateRegistration(session: Omit<SessionInfo, "id">): void {
	if (!isSessionInfo({ ...session, id: "registration" })) throw new Error("Invalid intercom session registration");
}

function registrationForWire(session: Omit<SessionInfo, "id">): Omit<SessionInfo, "id"> {
	const { piSession: _piSession, role: _role, ...legacyCompatible } = session;
	return legacyCompatible;
}

function validateSendOptions(to: string, options: SendOptions): void {
	if (!boundedString(to, INTERCOM_LIMITS.maxTargetBytes, true)) throw new Error("Invalid intercom target");
	const message: Message = {
		id: options.messageId ?? "validation",
		timestamp: Date.now(),
		...(options.replyTo === undefined ? {} : { replyTo: options.replyTo }),
		...(options.expectsReply === undefined ? {} : { expectsReply: options.expectsReply }),
		content: {
			text: options.text,
			...(options.attachments === undefined ? {} : { attachments: options.attachments }),
		},
	};
	if (!isMessage(message)) throw new Error("Invalid or oversized intercom message");
}

export function encodeFrame(message: unknown, maximum = INTERCOM_LIMITS.maxFrameBytes): Buffer {
	let payload: Buffer;
	try {
		payload = Buffer.from(JSON.stringify(message), "utf8");
	} catch (error) {
		throw new Error(`Failed to encode intercom message: ${toError(error).message}`, { cause: error });
	}
	if (payload.length === 0 || payload.length > maximum) {
		throw new Error(`Intercom frame length ${payload.length} exceeds limit ${maximum}`);
	}
	const header = Buffer.allocUnsafe(4);
	header.writeUInt32BE(payload.length, 0);
	return Buffer.concat([header, payload]);
}

export class FrameDecoder {
	private buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
	private failed = false;
	private readonly onMessage: (message: unknown) => void;
	private readonly onError: (error: Error) => void;
	private readonly maximum: number;

	constructor(
		onMessage: (message: unknown) => void,
		onError: (error: Error) => void,
		maximum = INTERCOM_LIMITS.maxFrameBytes,
	) {
		this.onMessage = onMessage;
		this.onError = onError;
		this.maximum = maximum;
	}

	push(chunk: Buffer): void {
		if (this.failed || chunk.length === 0) return;
		this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
		try {
			while (this.buffer.length >= 4) {
				const length = this.buffer.readUInt32BE(0);
				if (length === 0 || length > this.maximum) {
					throw new Error(`Invalid intercom frame length: ${length}`);
				}
				if (this.buffer.length < length + 4) return;
				const payload = this.buffer.subarray(4, length + 4);
				this.buffer = this.buffer.subarray(length + 4);
				let message: unknown;
				try {
					message = JSON.parse(payload.toString("utf8"));
				} catch (error) {
					throw new Error(`Failed to parse intercom message: ${toError(error).message}`, { cause: error });
				}
				this.onMessage(message);
			}
		} catch (error) {
			this.failed = true;
			this.buffer = Buffer.alloc(0);
			this.onError(toError(error));
		}
	}
}

function writeFrame(socket: Socket, frame: Buffer, timeoutMs: number): Promise<void> {
	return new Promise((resolve, reject) => {
		let settled = false;
		const finish = (error?: Error | null) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			socket.off("close", onClose);
			if (error) reject(error);
			else resolve();
		};
		const onClose = () => finish(new Error("Intercom socket closed during write"));
		const timeout = setTimeout(() => {
			const error = new Error(`Intercom socket write timed out after ${timeoutMs}ms`);
			socket.destroy(error);
			finish(error);
		}, timeoutMs);
		socket.once("close", onClose);
		try {
			socket.write(frame, (error) => finish(error ?? undefined));
		} catch (error) {
			finish(toError(error));
		}
	});
}

interface WriteState {
	socket: Socket;
	tail: Promise<void>;
	queuedBytes: number;
}

interface Pending<T> {
	resolve: (value: T) => void;
	reject: (error: Error) => void;
	timer: NodeJS.Timeout;
	signal?: AbortSignal;
	onAbort?: () => void;
}

function cleanupPending<T>(pending: Pending<T>): void {
	clearTimeout(pending.timer);
	if (pending.signal && pending.onAbort) pending.signal.removeEventListener("abort", pending.onAbort);
}

interface AskWaiter extends Pending<ReceivedMessage> {
	expectedPeerId: string;
	signal?: AbortSignal;
	onAbort?: () => void;
}

interface RolePending extends Pending<IntercomRole | undefined> {
	expectedRole?: IntercomRole;
	generation: number;
	sessionId: string;
	socket: Socket;
}

export interface IntercomClientOptions {
	socketPath?: string;
	connectTimeoutMs?: number;
	listTimeoutMs?: number;
	sendTimeoutMs?: number;
	askTimeoutMs?: number;
	reconnectDelaysMs?: readonly number[];
	writeTimeoutMs?: number;
	maxQueuedWriteBytes?: number;
}

export class IntercomClient extends EventEmitter {
	private socket: Socket | null = null;
	private registeredSessionId: string | null = null;
	private registeredCapabilities = new Set<string>();
	private registration: Omit<SessionInfo, "id"> | null = null;
	private beforeConnect: (() => Promise<void>) | null = null;
	private connectPromise: Promise<void> | null = null;
	private registrationPending: { resolve: () => void; reject: (error: Error) => void } | null = null;
	private writeState: WriteState | null = null;
	private pendingSends = new Map<string, Pending<SendResult>>();
	private pendingLists = new Map<string, Pending<SessionInfo[]>>();
	private pendingRoles = new Map<string, RolePending>();
	private askWaiters = new Map<string, AskWaiter>();
	private advertisedRole: IntercomRole | undefined;
	private roleGeneration = 0;
	private desired = false;
	private lifecycleGeneration = 0;
	private reconnectTimer: NodeJS.Timeout | null = null;
	private reconnectAttempt = 0;
	private disconnectError: Error | null = null;
	private readonly socketPath: string;
	private readonly connectTimeoutMs: number;
	private readonly listTimeoutMs: number;
	private readonly sendTimeoutMs: number;
	private readonly askTimeoutMs: number;
	private readonly reconnectDelaysMs: readonly number[];
	private readonly writeTimeoutMs: number;
	private readonly maxQueuedWriteBytes: number;

	constructor(options: IntercomClientOptions = {}) {
		super();
		this.socketPath = options.socketPath ?? getBrokerSocketPath();
		this.connectTimeoutMs = options.connectTimeoutMs ?? 10_000;
		this.listTimeoutMs = options.listTimeoutMs ?? 5_000;
		this.sendTimeoutMs = options.sendTimeoutMs ?? 10_000;
		this.askTimeoutMs = options.askTimeoutMs ?? 10 * 60 * 1000;
		this.reconnectDelaysMs = options.reconnectDelaysMs ?? [1_000, 2_000, 5_000, 10_000, 30_000];
		this.writeTimeoutMs = options.writeTimeoutMs ?? 10_000;
		this.maxQueuedWriteBytes = options.maxQueuedWriteBytes ?? INTERCOM_LIMITS.maxQueuedWriteBytes;
		// EventEmitter treats an unhandled "error" specially; transport errors remain observable without crashing hosts.
		this.on("error", () => undefined);
	}

	get sessionId(): string | null {
		return this.registeredSessionId;
	}

	supportsCapability(capability: string): boolean {
		return this.registeredCapabilities.has(capability);
	}

	currentPiSessionPresence(): PiSessionPresence | undefined {
		return this.registration?.piSession ? { ...this.registration.piSession } : undefined;
	}

	currentRole(): IntercomRole | undefined {
		return this.advertisedRole;
	}

	isConnected(): boolean {
		const socket = this.socket;
		return Boolean(socket && this.registeredSessionId && !socket.destroyed && !socket.writableEnded && socket.writable);
	}

	pendingCounts(): { sends: number; lists: number; asks: number } {
		return { sends: this.pendingSends.size, lists: this.pendingLists.size, asks: this.askWaiters.size };
	}

	setRegistration(session: Omit<SessionInfo, "id">): void {
		validateRegistration(session);
		const { role: _ignoredRole, ...registration } = session;
		this.registration = {
			...registration,
			...(session.piSession ? { piSession: { ...session.piSession } } : {}),
		};
	}

	async start(session: Omit<SessionInfo, "id">, beforeConnect: () => Promise<void>): Promise<void> {
		this.setRegistration(session);
		this.beforeConnect = beforeConnect;
		this.desired = true;
		this.lifecycleGeneration++;
		await this.ensureConnected();
	}

	async ensureConnected(): Promise<void> {
		if (this.isConnected()) return;
		if (!this.registration) throw new Error("Intercom registration is not configured");
		if (this.connectPromise) return this.connectPromise;
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		const generation = this.lifecycleGeneration;
		const promise = (async () => {
			await this.beforeConnect?.();
			if (!this.desired || generation !== this.lifecycleGeneration) throw new Error("Intercom connection start was cancelled");
			const registration = this.registration;
			if (!registration) throw new Error("Intercom registration is not configured");
			const sent = registrationForWire(registration);
			await this.connect(sent);
			if (!this.desired || generation !== this.lifecycleGeneration) {
				await this.disconnect();
				throw new Error("Intercom connection start was cancelled");
			}
			await this.synchronizeRegistration(sent);
			const wasReconnect = this.reconnectAttempt > 0;
			this.reconnectAttempt = 0;
			if (wasReconnect) this.emit("reconnected", this.registeredSessionId);
		})().catch((error) => {
			throw toError(error);
		}).finally(() => {
			if (this.connectPromise === promise) this.connectPromise = null;
			if (this.desired && !this.isConnected()) this.scheduleReconnect();
		});
		this.connectPromise = promise;
		return promise;
	}

	connect(session: Omit<SessionInfo, "id">): Promise<void> {
		validateRegistration(session);
		const wireSession = registrationForWire(session);
		if (this.socket) return Promise.reject(new Error("Already connected"));
		const socket = net.connect(this.socketPath);
		this.socket = socket;
		this.registeredSessionId = null;
		this.registeredCapabilities.clear();
		this.disconnectError = null;
		this.writeState = { socket, tail: Promise.resolve(), queuedBytes: 0 };

		return new Promise<void>((resolve, reject) => {
			let settled = false;
			const finish = (error?: Error) => {
				if (settled) return;
				settled = true;
				clearTimeout(timeout);
				this.registrationPending = null;
				if (error) reject(error);
				else resolve();
			};
			const timeout = setTimeout(() => {
				const error = new Error("Intercom connection timeout");
				finish(error);
				socket.destroy(error);
			}, this.connectTimeoutMs);
			this.registrationPending = { resolve: () => finish(), reject: finish };

			const decoder = new FrameDecoder(
				(message) => this.handleBrokerMessage(message),
				(error) => socket.destroy(new Error(`Intercom protocol error: ${error.message}`, { cause: error })),
			);
			socket.on("data", (data) => decoder.push(data));
			socket.on("error", (error) => {
				this.disconnectError = error;
				this.emit("error", error);
			});
			socket.on("close", () => {
				const wasRegistered = this.registeredSessionId !== null;
				const error = this.disconnectError ?? new Error("Intercom client disconnected");
				if (!wasRegistered) finish(error);
				this.handleDisconnect(socket, error, wasRegistered);
			});
			socket.once("connect", () => {
				void this.enqueueOn(socket, { type: "register", session: wireSession }).catch((error) => {
					if (this.socket !== socket) return;
					// A full broker can send a useful rejection while its read side is already closing.
					// Preserve that inbound frame instead of destroying the socket on a concurrent EPIPE.
					this.disconnectError = toError(error);
					if (!socket.readable || socket.readableEnded) socket.destroy(error);
				});
			});
		}).then(async () => {
			if (session.piSession && this.supportsCapability(INTERCOM_TAIL_CAPABILITY)) {
				await this.enqueue({ type: "presence", piSession: session.piSession });
			}
		});
	}

	private enqueue(message: unknown, onQueued?: () => void): Promise<void> {
		const socket = this.requireActiveSocket();
		return this.enqueueOn(socket, message, onQueued);
	}

	private enqueueOn(socket: Socket, message: unknown, onQueued?: () => void): Promise<void> {
		const frame = encodeFrame(message);
		const state = this.writeState;
		if (!state || state.socket !== socket) return Promise.reject(new Error("Intercom client disconnected before write"));
		if (state.queuedBytes + frame.length > this.maxQueuedWriteBytes) {
			const error = new Error(`Intercom client write queue exceeds ${this.maxQueuedWriteBytes} bytes`);
			socket.destroy(error);
			return Promise.reject(error);
		}
		state.queuedBytes += frame.length;
		try { onQueued?.(); } catch {}
		const operation = state.tail.catch(() => undefined).then(async () => {
			if (this.socket !== socket || socket.destroyed || socket.writableEnded || !socket.writable) {
				throw new Error("Intercom client disconnected before write");
			}
			await writeFrame(socket, frame, this.writeTimeoutMs);
		}).finally(() => {
			state.queuedBytes = Math.max(0, state.queuedBytes - frame.length);
		});
		state.tail = operation;
		return operation;
	}

	private async synchronizeRegistration(sent: Omit<SessionInfo, "id">): Promise<void> {
		const desired = this.registration;
		if (!desired) return;
		const piSessionChanged = this.supportsCapability(INTERCOM_TAIL_CAPABILITY)
			&& !samePiSession(desired.piSession, sent.piSession);
		if (desired.name === sent.name && desired.model === sent.model && desired.status === sent.status && !piSessionChanged) return;
		await this.enqueue({
			type: "presence",
			...(desired.name === undefined ? {} : { name: desired.name }),
			...(desired.model === undefined ? {} : { model: desired.model }),
			...(desired.status === undefined ? {} : { status: desired.status }),
			...(piSessionChanged ? { piSession: desired.piSession ?? null } : {}),
		});
	}

	private requireActiveSocket(): Socket {
		const socket = this.socket;
		if (!socket || !this.registeredSessionId || socket.destroyed || socket.writableEnded || !socket.writable) {
			throw new Error("Intercom not connected");
		}
		return socket;
	}

	private enqueueReserved(
		message: unknown,
		onError: (error: Error) => void,
		onSynchronousError?: (error: Error) => void,
		onQueued?: () => void,
	): void {
		let operation: Promise<void>;
		try {
			operation = this.enqueue(message, onQueued);
		} catch (error) {
			const normalized = toError(error);
			onError(normalized);
			onSynchronousError?.(normalized);
			return;
		}
		void operation.catch((error) => onError(toError(error)));
	}

	private handleBrokerMessage(value: unknown): void {
		if (!value || typeof value !== "object" || Array.isArray(value) || typeof (value as { type?: unknown }).type !== "string") {
			throw new Error("Invalid broker message");
		}
		const message = value as Record<string, unknown> & { type: string };
		if (this.registeredSessionId === null && message.type !== "registered" && message.type !== "error") {
			throw new Error(`Received ${message.type} before registered`);
		}
		switch (message.type) {
			case "registered": {
				if (
					!boundedString(message.sessionId, INTERCOM_LIMITS.maxIdBytes, true)
					|| (message.capabilities !== undefined && !areCapabilities(message.capabilities))
					|| this.registeredSessionId !== null
				) {
					throw new Error("Invalid registered message");
				}
				this.registeredSessionId = message.sessionId;
				this.registeredCapabilities = new Set(message.capabilities ?? []);
				this.registrationPending?.resolve();
				this.emit("registered", message.sessionId);
				break;
			}
			case "sessions": {
				if (!boundedString(message.requestId, INTERCOM_LIMITS.maxIdBytes, true) || !Array.isArray(message.sessions) || !message.sessions.every(isSessionInfo)) {
					throw new Error("Invalid sessions message");
				}
				const pending = this.pendingLists.get(message.requestId);
				if (pending) {
					this.pendingLists.delete(message.requestId);
					cleanupPending(pending);
					pending.resolve(message.sessions);
				}
				break;
			}
			case "role_updated": {
				if (
					!boundedString(message.requestId, INTERCOM_LIMITS.maxIdBytes)
					|| (message.role !== null && !isIntercomRole(message.role))
				) {
					throw new Error("Invalid role_updated message");
				}
				const pending = this.pendingRoles.get(message.requestId);
				if (!pending) break;
				const role = message.role ?? undefined;
				if (role !== pending.expectedRole) {
					this.failRoleTransition(message.requestId, pending, new Error("Intercom broker acknowledged an unexpected role"), true);
					break;
				}
				if (
					pending.generation !== this.roleGeneration
					|| pending.socket !== this.socket
					|| pending.sessionId !== this.registeredSessionId
				) {
					this.failRoleTransition(message.requestId, pending, new Error("Intercom role change was superseded by a lifecycle transition"), false);
					break;
				}
				this.pendingRoles.delete(message.requestId);
				cleanupPending(pending);
				this.advertisedRole = role;
				pending.resolve(role);
				break;
			}
			case "message": {
				if (!isSessionInfo(message.from) || !isMessage(message.message)) throw new Error("Invalid message event");
				const replyTo = message.message.replyTo;
				const waiter = replyTo === undefined ? undefined : this.askWaiters.get(replyTo);
				if (replyTo !== undefined && waiter && message.from.id === waiter.expectedPeerId) {
					this.finishAsk(replyTo, { from: message.from, message: message.message });
					break;
				}
				this.emit("message", message.from, message.message);
				break;
			}
			case "delivered": {
				if (!boundedString(message.messageId, INTERCOM_LIMITS.maxIdBytes, true)) throw new Error("Invalid delivered message");
				this.finishSend(message.messageId, { id: message.messageId, delivered: true });
				break;
			}
			case "delivery_failed": {
				if (!boundedString(message.messageId, INTERCOM_LIMITS.maxIdBytes, true) || typeof message.reason !== "string") {
					throw new Error("Invalid delivery_failed message");
				}
				this.finishSend(message.messageId, { id: message.messageId, delivered: false, reason: message.reason });
				this.failAsk(message.messageId, new Error(message.reason));
				break;
			}
			case "session_joined":
			case "presence_update": {
				if (!isSessionInfo(message.session)) throw new Error(`Invalid ${message.type} message`);
				this.emit(message.type, message.session);
				break;
			}
			case "session_left": {
				if (!boundedString(message.sessionId, INTERCOM_LIMITS.maxIdBytes, true)) throw new Error("Invalid session_left message");
				for (const [messageId, waiter] of this.askWaiters) {
					if (waiter.expectedPeerId === message.sessionId) {
						this.failAsk(messageId, new Error("Recipient disconnected before replying"));
					}
				}
				this.emit("session_left", message.sessionId);
				break;
			}
			case "error": {
				if (typeof message.error !== "string") throw new Error("Invalid error message");
				const error = new Error(this.registeredSessionId === null
					? `Intercom broker rejected registration: ${message.error}`
					: `Intercom broker error: ${message.error}`);
				this.disconnectError = error;
				this.registrationPending?.reject(error);
				this.emit("error", error);
				this.socket?.destroy();
				break;
			}
			default:
				throw new Error(`Unknown broker message type: ${message.type}`);
		}
	}

	private finishSend(messageId: string, result: SendResult): void {
		const pending = this.pendingSends.get(messageId);
		if (!pending) return;
		this.pendingSends.delete(messageId);
		cleanupPending(pending);
		pending.resolve(result);
	}

	private finishAsk(messageId: string, result: ReceivedMessage): void {
		const waiter = this.askWaiters.get(messageId);
		if (!waiter) return;
		this.askWaiters.delete(messageId);
		clearTimeout(waiter.timer);
		if (waiter.signal && waiter.onAbort) waiter.signal.removeEventListener("abort", waiter.onAbort);
		waiter.resolve(result);
	}

	private failAsk(messageId: string, error: Error): void {
		const waiter = this.askWaiters.get(messageId);
		if (!waiter) return;
		this.askWaiters.delete(messageId);
		clearTimeout(waiter.timer);
		if (waiter.signal && waiter.onAbort) waiter.signal.removeEventListener("abort", waiter.onAbort);
		waiter.reject(error);
	}

	private failRoleTransition(requestId: string, pending: RolePending, error: Error, uncertain: boolean): void {
		if (this.pendingRoles.get(requestId) !== pending) return;
		this.pendingRoles.delete(requestId);
		cleanupPending(pending);
		if (pending.generation === this.roleGeneration) this.roleGeneration++;
		this.advertisedRole = undefined;
		pending.reject(error);
		if (uncertain && this.socket === pending.socket && !pending.socket.destroyed) pending.socket.destroy(error);
	}

	private failPending(error: Error): void {
		for (const [id, pending] of this.pendingSends) {
			this.pendingSends.delete(id);
			cleanupPending(pending);
			pending.reject(error);
		}
		for (const [id, pending] of this.pendingLists) {
			this.pendingLists.delete(id);
			cleanupPending(pending);
			pending.reject(error);
		}
		for (const [id, pending] of this.pendingRoles) {
			this.pendingRoles.delete(id);
			cleanupPending(pending);
			pending.reject(error);
		}
		for (const id of [...this.askWaiters.keys()]) this.failAsk(id, error);
	}

	private handleDisconnect(socket: Socket, error: Error, wasRegistered: boolean): void {
		if (this.socket !== socket) return;
		this.socket = null;
		this.registeredSessionId = null;
		this.registeredCapabilities.clear();
		this.roleGeneration++;
		this.advertisedRole = undefined;
		if (this.writeState?.socket === socket) this.writeState = null;
		this.registrationPending?.reject(error);
		this.registrationPending = null;
		this.disconnectError = null;
		this.failPending(error);
		if (wasRegistered) this.emit("disconnected", error);
		if (this.desired) this.scheduleReconnect();
	}

	private scheduleReconnect(): void {
		if (!this.desired || this.reconnectTimer || this.connectPromise) return;
		const index = Math.min(this.reconnectAttempt, this.reconnectDelaysMs.length - 1);
		const delay = this.reconnectDelaysMs[Math.max(0, index)] ?? 30_000;
		this.reconnectAttempt++;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			void this.ensureConnected().catch(() => undefined);
		}, delay);
	}

	listSessions(signal?: AbortSignal): Promise<SessionInfo[]> {
		this.requireActiveSocket();
		if (signal?.aborted) return Promise.reject(new Error("Intercom list cancelled"));
		if (this.pendingLists.size >= INTERCOM_LIMITS.maxPendingLists) return Promise.reject(new Error("Too many pending intercom list requests"));
		const requestId = randomUUID();
		return new Promise((resolve, reject) => {
			let pending: Pending<SessionInfo[]>;
			const finishError = (error: Error) => {
				if (this.pendingLists.get(requestId) !== pending) return;
				this.pendingLists.delete(requestId);
				cleanupPending(pending);
				reject(error);
			};
			const timer = setTimeout(() => finishError(new Error("List sessions timeout")), this.listTimeoutMs);
			pending = { resolve, reject, timer, ...(signal ? { signal } : {}) };
			if (signal) {
				pending.onAbort = () => finishError(new Error("Intercom list cancelled"));
				signal.addEventListener("abort", pending.onAbort, { once: true });
			}
			this.pendingLists.set(requestId, pending);
			this.enqueueReserved({ type: "list", requestId }, finishError);
		});
	}

	send(to: string, options: SendOptions, signal?: AbortSignal, onQueued?: () => void): Promise<SendResult> {
		return this.sendInternal(to, options, signal, undefined, onQueued);
	}

	private sendInternal(
		to: string,
		options: SendOptions,
		signal?: AbortSignal,
		onSynchronousEnqueueError?: (error: Error) => void,
		onQueued?: () => void,
	): Promise<SendResult> {
		this.requireActiveSocket();
		validateSendOptions(to, options);
		if (signal?.aborted) return Promise.reject(new Error("Intercom send cancelled"));
		const messageId = options.messageId ?? randomUUID();
		if (this.pendingSends.has(messageId)) return Promise.reject(new Error(`Duplicate intercom message ID: ${messageId}`));
		if (this.pendingSends.size >= INTERCOM_LIMITS.maxPendingSends) return Promise.reject(new Error("Too many pending intercom sends"));
		const message: Message = {
			id: messageId,
			timestamp: Date.now(),
			...(options.replyTo === undefined ? {} : { replyTo: options.replyTo }),
			...(options.expectsReply === undefined ? {} : { expectsReply: options.expectsReply }),
			content: {
				text: options.text,
				...(options.attachments === undefined ? {} : { attachments: options.attachments }),
			},
		};
		return new Promise((resolve, reject) => {
			let pending: Pending<SendResult>;
			const finishError = (error: Error) => {
				if (this.pendingSends.get(messageId) !== pending) return;
				this.pendingSends.delete(messageId);
				cleanupPending(pending);
				reject(error);
			};
			const timer = setTimeout(() => finishError(new Error("Send timeout")), this.sendTimeoutMs);
			pending = { resolve, reject, timer, ...(signal ? { signal } : {}) };
			if (signal) {
				pending.onAbort = () => finishError(new Error("Intercom send cancelled"));
				signal.addEventListener("abort", pending.onAbort, { once: true });
			}
			this.pendingSends.set(messageId, pending);
			this.enqueueReserved({ type: "send", to, message }, finishError, onSynchronousEnqueueError, onQueued);
		});
	}

	ask(
		to: string,
		options: Omit<SendOptions, "expectsReply">,
		signal?: AbortSignal,
		onRouted?: (result: SendResult) => void,
		onQueued?: () => void,
		onDeliveryRejected?: (result: SendResult) => void,
	): Promise<ReceivedMessage> {
		this.requireActiveSocket();
		validateSendOptions(to, { ...options, expectsReply: true });
		if (signal?.aborted) return Promise.reject(new Error("Intercom ask cancelled"));
		const messageId = options.messageId ?? randomUUID();
		if (this.askWaiters.has(messageId)) return Promise.reject(new Error(`Duplicate intercom ask ID: ${messageId}`));
		if (this.askWaiters.size >= INTERCOM_LIMITS.maxPendingAsks) return Promise.reject(new Error("Too many pending intercom asks"));

		let resolveReply!: (message: ReceivedMessage) => void;
		let rejectReply!: (error: Error) => void;
		const replyPromise = new Promise<ReceivedMessage>((resolve, reject) => {
			resolveReply = resolve;
			rejectReply = reject;
		});
		// The waiter is reserved before send() can enqueue a frame. Attach a rejection handler immediately.
		void replyPromise.catch(() => undefined);
		const timer = setTimeout(() => this.failAsk(messageId, new Error(`No reply within ${this.askTimeoutMs}ms`)), this.askTimeoutMs);
		const waiter: AskWaiter = { expectedPeerId: to, resolve: resolveReply, reject: rejectReply, timer, ...(signal ? { signal } : {}) };
		if (signal) {
			waiter.onAbort = () => this.failAsk(messageId, new Error("Intercom ask cancelled"));
			signal.addEventListener("abort", waiter.onAbort, { once: true });
		}
		this.askWaiters.set(messageId, waiter);

		return (async () => {
			try {
				if (signal?.aborted) throw new Error("Intercom ask cancelled");
				const routed = await this.sendInternal(
					to,
					{ ...options, messageId, expectsReply: true },
					signal,
					(error) => this.failAsk(messageId, error),
					onQueued,
				);
				if (!routed.delivered) {
					try { onDeliveryRejected?.(routed); } catch {}
					throw new Error(routed.reason ?? "Intercom message was not routed");
				}
				try {
					onRouted?.(routed);
				} catch {
					// Transcript bookkeeping must not turn a successfully routed ask into a transport failure.
				}
				return await replyPromise;
			} catch (error) {
				this.failAsk(messageId, toError(error));
				try {
					await replyPromise;
				} catch {
					// The caller receives the original routing, timeout, abort, or disconnect error.
				}
				throw toError(error);
			}
		})();
	}

	setRole(role: IntercomRole | null): Promise<IntercomRole | undefined> {
		const socket = this.requireActiveSocket();
		if (!this.supportsCapability(INTERCOM_ROLE_CAPABILITY)) {
			return Promise.reject(new Error("The active intercom broker does not support First Mate roles; after it exits, wait for reconnect and invoke First Mate again"));
		}
		if (role !== null && !isIntercomRole(role)) return Promise.reject(new Error("Invalid intercom role"));
		if (this.pendingRoles.size >= INTERCOM_LIMITS.maxPendingRoles) return Promise.reject(new Error("Too many pending intercom role changes"));
		const sessionId = this.registeredSessionId;
		if (!sessionId) return Promise.reject(new Error("Intercom client is not registered"));
		const requestId = randomUUID();
		const generation = ++this.roleGeneration;
		return new Promise((resolve, reject) => {
			let pending: RolePending;
			const finishError = (error: Error) => this.failRoleTransition(requestId, pending, error, true);
			const timer = setTimeout(() => finishError(new Error("Role update timeout")), this.sendTimeoutMs);
			pending = { resolve, reject, timer, generation, sessionId, socket, ...(role === null ? {} : { expectedRole: role }) };
			this.pendingRoles.set(requestId, pending);
			this.enqueueReserved({ type: "presence", requestId, role }, finishError);
		});
	}

	invalidateRoleSession(reason = "Intercom role invalidated by a session lifecycle change"): void {
		const error = new Error(reason);
		this.roleGeneration++;
		this.advertisedRole = undefined;
		for (const [requestId, pending] of [...this.pendingRoles]) {
			this.failRoleTransition(requestId, pending, error, false);
		}
		const socket = this.socket;
		if (socket && !socket.destroyed) socket.destroy(error);
	}

	updatePresence(updates: { name?: string; status?: string; model?: string; piSession?: PiSessionPresence | null }): void {
		for (const value of [updates.name, updates.status, updates.model]) {
			if (value !== undefined && !boundedString(value, INTERCOM_LIMITS.maxSessionStringBytes, true)) return;
		}
		if (updates.piSession !== undefined && updates.piSession !== null && !isPiSessionPresence(updates.piSession)) return;
		if (this.registration) {
			const next = { ...this.registration, ...updates, lastActivity: Date.now() } as Omit<SessionInfo, "id"> & { piSession?: PiSessionPresence | null };
			if (updates.piSession === null) delete next.piSession;
			else if (updates.piSession) next.piSession = { ...updates.piSession };
			this.registration = next;
		}
		if (!this.isConnected()) return;
		const outbound = {
			...(updates.name === undefined ? {} : { name: updates.name }),
			...(updates.status === undefined ? {} : { status: updates.status }),
			...(updates.model === undefined ? {} : { model: updates.model }),
			...(this.supportsCapability(INTERCOM_TAIL_CAPABILITY) && updates.piSession !== undefined ? { piSession: updates.piSession } : {}),
		};
		if (Object.keys(outbound).length === 0) return;
		void this.enqueue({ type: "presence", ...outbound }).catch((error) => this.emit("error", toError(error)));
	}

	async disconnect(): Promise<void> {
		this.desired = false;
		this.registeredCapabilities.clear();
		this.roleGeneration++;
		this.advertisedRole = undefined;
		this.lifecycleGeneration++;
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		const socket = this.socket;
		this.failPending(new Error("Intercom client disconnected"));
		if (!socket) return;
		await new Promise<void>((resolve) => {
			let settled = false;
			const finish = () => {
				if (settled) return;
				settled = true;
				clearTimeout(timeout);
				resolve();
			};
			const timeout = setTimeout(() => {
				socket.destroy();
				finish();
			}, 2_000);
			void this.enqueueOn(socket, { type: "unregister" }).then(finish, finish);
		});
		if (socket.destroyed) return;
		await new Promise<void>((resolve) => {
			let settled = false;
			const finish = () => {
				if (settled) return;
				settled = true;
				clearTimeout(timeout);
				resolve();
			};
			const timeout = setTimeout(() => {
				socket.destroy();
				finish();
			}, 2_000);
			socket.once("close", finish);
			socket.end();
		});
	}
}
