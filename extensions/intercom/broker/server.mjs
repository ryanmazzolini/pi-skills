#!/usr/bin/env node
// Legacy wire behavior is adapted from pi-intercom 0.6.0.
// MIT License, Copyright (c) 2026 Nico Bailon. See THIRD_PARTY_NOTICES.md.
import { randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { chmod, link, lstat, mkdir, open, unlink } from "node:fs/promises";
import net from "node:net";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

process.umask(0o077);

const TAIL_CAPABILITY = "pi-session-tail-v1";
const ROLE_CAPABILITY = "first-mate-role-v1";
const IDENTITY_CAPABILITY = "pi-session-identity-v1";
const BROKER_CAPABILITIES = Object.freeze([TAIL_CAPABILITY, ROLE_CAPABILITY, IDENTITY_CAPABILITY]);
const MAX_GRACEFUL_CONNECTION_REJECTIONS = 16;

const runtimeDir = process.env.PI_INTERCOM_RUNTIME_DIR || join(homedir(), ".pi", "agent", "intercom");
const socketPath = process.env.PI_INTERCOM_SOCKET_PATH || join(runtimeDir, "broker.sock");
const pidPath = join(runtimeDir, "broker.pid");
const maxSessions = positiveInteger(process.env.PI_INTERCOM_MAX_SESSIONS, 256);
const maxConnections = positiveInteger(process.env.PI_INTERCOM_MAX_CONNECTIONS, Math.max(512, maxSessions * 2));
const LIMITS = Object.freeze({
	frame: 1024 * 1024,
	id: 256,
	target: 1024,
	sessionString: 4096,
	piSessionId: 256,
	piSessionFile: 4096,
	piSessionLeaf: 256,
	messageText: 256 * 1024,
	attachments: 16,
	attachmentName: 4096,
	attachmentContent: 512 * 1024,
	attachmentTotal: 768 * 1024,
	sessions: maxSessions,
	connections: maxConnections,
	queuedWrites: 2 * 1024 * 1024,
	queuedRequests: positiveInteger(process.env.PI_INTERCOM_MAX_QUEUED_REQUESTS, 64),
	queuedRequestBytes: positiveInteger(process.env.PI_INTERCOM_MAX_QUEUED_REQUEST_BYTES, 2 * 1024 * 1024),
	requestEdges: 1024,
	requestEdgesPerSession: 64,
});
const edgeTtlMs = positiveInteger(process.env.PI_INTERCOM_REQUEST_EDGE_TTL_MS, 10 * 60 * 1000);
const traceDeliveryQueue = process.env.NODE_ENV === "test" && process.env.PI_INTERCOM_TEST_TRACE_DELIVERY_QUEUE === "1";
const idleTimeoutMs = positiveInteger(process.env.PI_INTERCOM_IDLE_TIMEOUT_MS, 5_000);
const registrationTimeoutMs = positiveInteger(process.env.PI_INTERCOM_REGISTRATION_TIMEOUT_MS, 5_000);
const edgeSweepMs = Math.max(25, Math.min(1_000, Math.floor(edgeTtlMs / 4)));

function positiveInteger(value, fallback) {
	const parsed = Number.parseInt(value ?? "", 10);
	return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function byteLength(value) {
	return Buffer.byteLength(value, "utf8");
}

function boundedString(value, maximum, allowEmpty = false) {
	return typeof value === "string" && (allowEmpty || value.length > 0) && byteLength(value) <= maximum;
}

const PI_SESSION_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;

function isPiSessionId(value) {
	return boundedString(value, LIMITS.piSessionId) && PI_SESSION_ID_PATTERN.test(value);
}

function finiteNumber(value) {
	return typeof value === "number" && Number.isFinite(value);
}

function isRole(value) {
	return value === "first-mate";
}

function isAttachment(value) {
	return value && typeof value === "object" && !Array.isArray(value)
		&& (value.type === "file" || value.type === "snippet" || value.type === "context")
		&& boundedString(value.name, LIMITS.attachmentName, true)
		&& boundedString(value.content, LIMITS.attachmentContent, true)
		&& (value.language === undefined || boundedString(value.language, 256, true));
}

function areAttachments(value) {
	return Array.isArray(value) && value.length <= LIMITS.attachments && value.every(isAttachment)
		&& value.reduce((total, attachment) => total + byteLength(attachment.content), 0) <= LIMITS.attachmentTotal;
}

function isMessage(value) {
	return value && typeof value === "object" && !Array.isArray(value)
		&& boundedString(value.id, LIMITS.id, true)
		&& finiteNumber(value.timestamp)
		&& (value.replyTo === undefined || boundedString(value.replyTo, LIMITS.id, true))
		&& (value.expectsReply === undefined || typeof value.expectsReply === "boolean")
		&& value.content && typeof value.content === "object" && !Array.isArray(value.content)
		&& boundedString(value.content.text, LIMITS.messageText, true)
		&& (value.content.attachments === undefined || areAttachments(value.content.attachments));
}

function isPiSessionPresence(value) {
	return value && typeof value === "object" && !Array.isArray(value)
		&& Object.keys(value).length === 4
		&& ["sessionId", "fileLocator", "activeLeafId", "revision"].every((key) => key in value)
		&& isPiSessionId(value.sessionId)
		&& boundedString(value.fileLocator, LIMITS.piSessionFile)
		&& isAbsolute(value.fileLocator)
		&& (value.activeLeafId === null || boundedString(value.activeLeafId, LIMITS.piSessionLeaf))
		&& Number.isSafeInteger(value.revision)
		&& value.revision >= 1;
}

function isRegistration(value) {
	return value && typeof value === "object" && !Array.isArray(value)
		&& boundedString(value.cwd, LIMITS.sessionString, true)
		&& (value.piSessionId === undefined || isPiSessionId(value.piSessionId))
		&& boundedString(value.model, LIMITS.sessionString, true)
		&& Number.isSafeInteger(value.pid)
		&& finiteNumber(value.startedAt)
		&& finiteNumber(value.lastActivity)
		&& (value.name === undefined || boundedString(value.name, LIMITS.sessionString, true))
		&& (value.status === undefined || boundedString(value.status, LIMITS.sessionString, true))
		&& (value.piSession === undefined || isPiSessionPresence(value.piSession))
		&& (value.piSessionId === undefined || value.piSession === undefined || value.piSessionId === value.piSession.sessionId);
}

function sessionFromRegistration(value, id) {
	return {
		id,
		...(value.piSessionId === undefined ? {} : { piSessionId: value.piSessionId }),
		...(value.name === undefined ? {} : { name: value.name }),
		cwd: value.cwd,
		model: value.model,
		pid: value.pid,
		startedAt: value.startedAt,
		lastActivity: value.lastActivity,
		...(value.status === undefined ? {} : { status: value.status }),
		...(value.piSession === undefined ? {} : { piSession: { ...value.piSession } }),
	};
}

function encode(message) {
	const payload = Buffer.from(JSON.stringify(message), "utf8");
	if (payload.length === 0 || payload.length > LIMITS.frame) throw new Error(`Outgoing frame exceeds ${LIMITS.frame} bytes`);
	const header = Buffer.allocUnsafe(4);
	header.writeUInt32BE(payload.length, 0);
	return Buffer.concat([header, payload]);
}

class Reader {
	buffer = Buffer.alloc(0);
	failed = false;
	constructor(onMessage, onError) {
		this.onMessage = onMessage;
		this.onError = onError;
	}
	push(chunk) {
		if (this.failed || chunk.length === 0) return;
		this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
		try {
			while (this.buffer.length >= 4) {
				const length = this.buffer.readUInt32BE(0);
				if (length === 0 || length > LIMITS.frame) throw new Error(`Invalid frame length: ${length}`);
				if (this.buffer.length < length + 4) return;
				const payload = this.buffer.subarray(4, length + 4);
				this.buffer = this.buffer.subarray(length + 4);
				let message;
				try {
					message = JSON.parse(payload.toString("utf8"));
				} catch (error) {
					throw new Error(`Malformed JSON: ${error instanceof Error ? error.message : String(error)}`);
				}
				this.onMessage(message, length + 4);
			}
		} catch (error) {
			this.failed = true;
			this.buffer = Buffer.alloc(0);
			this.onError(error instanceof Error ? error : new Error(String(error)));
		}
	}
}

const sessions = new Map();
const connections = new Set();
const requestEdges = new Map();
const maximumEscapedRequestId = "\u0000".repeat(LIMITS.id);
const emptySessionListBytes = byteLength(JSON.stringify({ type: "sessions", requestId: maximumEscapedRequestId, sessions: [] }));
let sessionInfoBytes = 0;
let idleTimer;
let socketIdentity;
let pidIdentity;
let shuttingDown = false;

function queueFrame(connection, message, beforeWrite) {
	const frame = encode(message);
	if (shuttingDown) return Promise.reject(new Error("Intercom broker is shutting down"));
	if (connection.closed) return Promise.reject(new Error("Target disconnected"));
	if (connection.queuedBytes + frame.length > LIMITS.queuedWrites) {
		connection.socket.destroy(new Error("Intercom peer write queue exceeded limit"));
		return Promise.reject(new Error("Target is not accepting messages"));
	}
	connection.queuedBytes += frame.length;
	const operation = connection.writeTail.catch(() => undefined).then(() => new Promise((resolve, reject) => {
		if (connection.closed || connection.socket.destroyed || !connection.socket.writable) {
			reject(new Error("Target disconnected"));
			return;
		}
		try {
			beforeWrite?.();
		} catch (error) {
			reject(error instanceof Error ? error : new Error(String(error)));
			return;
		}
		let settled = false;
		const finish = (error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			connection.socket.off("close", onClose);
			if (error) reject(error);
			else resolve();
		};
		const onClose = () => finish(new Error("Target disconnected during write"));
		const timeout = setTimeout(() => {
			connection.socket.destroy(new Error("Intercom peer write timeout"));
			finish(new Error("Target write timed out"));
		}, 10_000);
		connection.socket.once("close", onClose);
		try {
			connection.socket.write(frame, (error) => finish(error ?? undefined));
		} catch (error) {
			finish(error instanceof Error ? error : new Error(String(error)));
		}
	})).finally(() => {
		connection.queuedBytes -= frame.length;
	});
	connection.writeTail = operation;
	return operation;
}

function broadcast(message, excludeId) {
	for (const [id, connection] of sessions) {
		if (id === excludeId) continue;
		void queueFrame(connection, message).catch(() => connection.socket.destroy());
	}
}

function findTargets(value) {
	const byId = sessions.get(value);
	if (byId) return [byId];
	const lowered = value.toLowerCase();
	return [...sessions.values()].filter((connection) => connection.info.name?.toLowerCase() === lowered);
}

function selectorTargets(value) {
	const lowered = value.toLowerCase();
	return new Set([...sessions.values()].filter((connection) =>
		connection.sessionId === value
		|| connection.info.piSessionId === value
		|| connection.info.name?.toLowerCase() === lowered));
}

function advertisedPiSessionId(connection) {
	return connection.info.piSessionId ?? connection.info.piSession?.sessionId;
}

function piSessionAdvertisers(value) {
	return [...sessions.values()].filter((connection) => advertisedPiSessionId(connection) === value);
}

function explicitIdentityNamespaceConflict(owner, value) {
	if (owner.info.piSessionId === undefined) return false;
	const lowered = value.toLowerCase();
	return [...sessions.values()].some((candidate) => candidate !== owner && (
		candidate.sessionId === value
		|| candidate.info.name?.toLowerCase() === lowered
	));
}

function deliveryValidationFailure(sender, target, request) {
	if (!sender.sessionId || sessions.get(sender.sessionId) !== sender) return "Sender session changed before delivery";
	const senderPiSessionId = advertisedPiSessionId(sender);
	if (senderPiSessionId !== undefined && (
		piSessionAdvertisers(senderPiSessionId).length !== 1
		|| explicitIdentityNamespaceConflict(sender, senderPiSessionId)
	)) {
		return "Sender Pi session identity is not unique";
	}
	if (!target.sessionId || sessions.get(target.sessionId) !== target) return "Target session changed before delivery";
	if (request.expectedTransportId !== undefined && (
		target.sessionId !== request.expectedTransportId
		|| sessions.get(request.expectedTransportId) !== target
	)) {
		return "Target transport connection changed before delivery";
	}
	const transportMatches = findTargets(request.to);
	if (transportMatches.length !== 1 || transportMatches[0] !== target) {
		return transportMatches.length > 1
			? "Multiple connected sessions match the transport target"
			: "Transport target changed before delivery";
	}
	if (request.expectedTargetSelector !== undefined) {
		const selectorMatches = selectorTargets(request.expectedTargetSelector);
		if (selectorMatches.size !== 1 || !selectorMatches.has(target)) {
			return "Target selector became ambiguous or changed";
		}
	}
	if (request.expectedPiSessionId !== undefined) {
		const advertisers = piSessionAdvertisers(request.expectedPiSessionId);
		const expectedName = request.expectedPiSessionId.toLowerCase();
		const namespaceConflict = [...sessions.values()].some((candidate) => candidate !== target && (
			candidate.info.id === request.expectedPiSessionId
			|| candidate.info.name?.toLowerCase() === expectedName
		));
		if (target.info.piSessionId !== request.expectedPiSessionId || advertisers.length !== 1 || namespaceConflict) {
			return advertisers.length > 1
				? "Multiple connected sessions advertise the expected Pi session ID"
				: namespaceConflict
					? "Expected Pi session ID conflicts with another connected session name or legacy ID"
					: "Target connection no longer matches the expected Pi session ID";
		}
	}
	const targetPiSessionId = advertisedPiSessionId(target);
	if (targetPiSessionId !== undefined && (
		piSessionAdvertisers(targetPiSessionId).length !== 1
		|| explicitIdentityNamespaceConflict(target, targetPiSessionId)
	)) {
		return "Recipient Pi session identity is not unique";
	}
	return undefined;
}

function clearIdleTimer() {
	if (idleTimer) clearTimeout(idleTimer);
	idleTimer = undefined;
}

function scheduleIdleShutdown() {
	if (idleTimer || sessions.size > 0 || shuttingDown) return;
	idleTimer = setTimeout(() => {
		idleTimer = undefined;
		if (sessions.size === 0) void shutdown();
	}, idleTimeoutMs);
	idleTimer.unref();
}

function checkedSessionInfoBytes(candidate, previousBytes = 0) {
	const candidateBytes = byteLength(JSON.stringify(candidate));
	const nextCount = sessions.size + (previousBytes === 0 ? 1 : 0);
	// The empty array contributes two bytes; a populated array contributes each serialized item and N-1 commas.
	const listBytes = emptySessionListBytes - 2
		+ sessionInfoBytes - previousBytes + candidateBytes
		+ Math.max(0, nextCount - 1);
	if (listBytes > LIMITS.frame) {
		throw new Error("Intercom session metadata capacity reached; reduce advertised metadata or connected sessions");
	}
	return candidateBytes;
}

function removeSession(connection) {
	const sessionId = connection.sessionId;
	if (!sessionId || sessions.get(sessionId) !== connection) return;
	sessions.delete(sessionId);
	sessionInfoBytes = Math.max(0, sessionInfoBytes - connection.infoBytes);
	connection.infoBytes = 0;
	connection.sessionId = null;
	broadcast({ type: "session_left", sessionId }, sessionId);
	for (const [messageId, edge] of requestEdges) {
		if (edge.fromPeerId === sessionId) {
			requestEdges.delete(messageId);
			continue;
		}
		if (edge.toPeerId === sessionId) {
			requestEdges.delete(messageId);
			const origin = sessions.get(edge.fromPeerId);
			if (origin) void queueFrame(origin, {
				type: "delivery_failed",
				messageId,
				reason: "Recipient disconnected before replying",
			}).catch(() => origin.socket.destroy());
		}
	}
	scheduleIdleShutdown();
}

async function handleSend(connection, request) {
	const messageId = isMessage(request.message) ? request.message.id : "unknown";
	if (
		!boundedString(request.to, LIMITS.target, true)
		|| !isMessage(request.message)
		|| (request.expectedPiSessionId !== undefined && !isPiSessionId(request.expectedPiSessionId))
		|| (request.expectedTargetSelector !== undefined && !boundedString(request.expectedTargetSelector, LIMITS.target, true))
		|| (request.expectedTransportId !== undefined && !boundedString(request.expectedTransportId, LIMITS.id, true))
	) {
		await queueFrame(connection, { type: "delivery_failed", messageId, reason: "Invalid message format" });
		return;
	}
	const senderId = connection.sessionId;
	const sender = senderId ? sessions.get(senderId) : undefined;
	if (!sender) {
		await queueFrame(connection, { type: "delivery_failed", messageId, reason: "Sender session not found" });
		return;
	}
	const pinnedTarget = request.expectedTransportId === undefined ? undefined : sessions.get(request.expectedTransportId);
	const targets = request.expectedTransportId === undefined ? findTargets(request.to) : pinnedTarget ? [pinnedTarget] : [];
	if (targets.length > 1) {
		await queueFrame(connection, {
			type: "delivery_failed",
			messageId,
			reason: "Multiple connected sessions match the transport target",
		});
		return;
	}
	if (targets.length === 0) {
		await queueFrame(connection, { type: "delivery_failed", messageId, reason: "Session not found" });
		return;
	}
	const target = targets[0];
	const validationFailure = deliveryValidationFailure(sender, target, request);
	if (validationFailure) {
		await queueFrame(connection, { type: "delivery_failed", messageId, reason: validationFailure });
		return;
	}
	if (request.message.expectsReply) {
		if (requestEdges.has(messageId)) {
			await queueFrame(connection, { type: "delivery_failed", messageId, reason: "Duplicate pending request ID" });
			return;
		}
		const senderEdgeCount = [...requestEdges.values()].filter((edge) => edge.fromPeerId === senderId).length;
		if (requestEdges.size >= LIMITS.requestEdges || senderEdgeCount >= LIMITS.requestEdgesPerSession) {
			await queueFrame(connection, { type: "delivery_failed", messageId, reason: "Too many pending requests" });
			return;
		}
		const reverse = [...requestEdges.values()].find((edge) => edge.fromPeerId === target.sessionId && edge.toPeerId === senderId);
		if (reverse) {
			await queueFrame(connection, {
				type: "delivery_failed",
				messageId,
				reason: "Reverse blocking ask rejected while the recipient is waiting for your reply; send a reply or ordinary message instead",
			});
			return;
		}
		requestEdges.set(messageId, { messageId, fromPeerId: senderId, toPeerId: target.sessionId, expiresAt: Date.now() + edgeTtlMs });
	}
	const repliedEdge = request.message.replyTo === undefined ? undefined : requestEdges.get(request.message.replyTo);
	if (traceDeliveryQueue) process.stdout.write(`delivery_queued:${JSON.stringify(messageId)}\n`);
	try {
		await queueFrame(target, { type: "message", from: sender.info, message: request.message }, () => {
			const failure = deliveryValidationFailure(sender, target, request);
			if (failure) throw new Error(failure);
		});
	} catch (error) {
		if (request.message.expectsReply) requestEdges.delete(messageId);
		const reason = error instanceof Error ? error.message : "Target delivery failed";
		await queueFrame(connection, { type: "delivery_failed", messageId, reason });
		return;
	}
	if (repliedEdge && repliedEdge.fromPeerId === target.sessionId && repliedEdge.toPeerId === senderId) {
		requestEdges.delete(repliedEdge.messageId);
	}
	await queueFrame(connection, { type: "delivered", messageId });
}

async function handleMessage(connection, value) {
	if (connection.failed || connection.closed) return;
	if (shuttingDown) throw new Error("Intercom broker is shutting down");
	if (!value || typeof value !== "object" || Array.isArray(value) || !boundedString(value.type, 64)) {
		throw new Error("Invalid client message type");
	}
	if (!connection.sessionId && value.type !== "register") throw new Error("Received request before register");
	switch (value.type) {
		case "register": {
			if (connection.sessionId) throw new Error("Received duplicate register message");
			if (!isRegistration(value.session)) throw new Error("Invalid register message");
			if (sessions.size >= LIMITS.sessions) {
				throw new Error(`Intercom session limit reached (maximum ${LIMITS.sessions}; set PI_INTERCOM_MAX_SESSIONS before broker startup to increase it)`);
			}
			const id = randomUUID();
			const info = sessionFromRegistration(value.session, id);
			const infoBytes = checkedSessionInfoBytes(info);
			connection.sessionId = id;
			connection.info = info;
			connection.infoBytes = infoBytes;
			connection.lastPiSessionRevision = value.session.piSession?.revision ?? 0;
			clearTimeout(connection.registrationTimer);
			connection.registrationTimer = undefined;
			sessions.set(id, connection);
			sessionInfoBytes += infoBytes;
			clearIdleTimer();
			await queueFrame(connection, { type: "registered", sessionId: id, capabilities: BROKER_CAPABILITIES });
			broadcast({ type: "session_joined", session: connection.info }, id);
			break;
		}
		case "unregister":
			removeSession(connection);
			// Unregistration releases both the session and its accepted-connection slot before close events run.
			connection.closed = true;
			clearTimeout(connection.registrationTimer);
			connections.delete(connection);
			connection.socket.destroy();
			break;
		case "list": {
			if (!boundedString(value.requestId, LIMITS.id, true)) throw new Error("Invalid list message");
			await queueFrame(connection, { type: "sessions", requestId: value.requestId, sessions: [...sessions.values()].map((item) => item.info) });
			break;
		}
		case "send":
			await handleSend(connection, value);
			break;
		case "presence": {
			const session = connection.sessionId ? sessions.get(connection.sessionId) : undefined;
			if (!session) throw new Error("Sender session not found");
			for (const field of ["name", "status", "model"]) {
				if (value[field] !== undefined && !boundedString(value[field], LIMITS.sessionString, true)) throw new Error(`Invalid presence ${field}`);
			}
			if (value.piSession !== undefined && value.piSession !== null) {
				if (
					!isPiSessionPresence(value.piSession)
					|| (session.info.piSessionId !== undefined && value.piSession.sessionId !== session.info.piSessionId)
					|| value.piSession.revision <= connection.lastPiSessionRevision
				) {
					throw new Error("Invalid presence piSession");
				}
			}
			if (value.role !== undefined) {
				if ((value.role !== null && !isRole(value.role)) || !boundedString(value.requestId, LIMITS.id)) {
					throw new Error("Invalid presence role request");
				}
			} else if (value.requestId !== undefined) {
				throw new Error("Invalid presence role request");
			}
			const nextInfo = { ...session.info };
			if (value.name !== undefined) nextInfo.name = value.name;
			if (value.status !== undefined) nextInfo.status = value.status;
			if (value.model !== undefined) nextInfo.model = value.model;
			if (value.piSession === null) delete nextInfo.piSession;
			else if (value.piSession !== undefined) nextInfo.piSession = { ...value.piSession };
			if (value.role === null) delete nextInfo.role;
			else if (value.role !== undefined) nextInfo.role = value.role;
			nextInfo.lastActivity = Date.now();
			const nextInfoBytes = checkedSessionInfoBytes(nextInfo, session.infoBytes);
			sessionInfoBytes += nextInfoBytes - session.infoBytes;
			session.info = nextInfo;
			session.infoBytes = nextInfoBytes;
			if (value.piSession !== undefined && value.piSession !== null) {
				connection.lastPiSessionRevision = value.piSession.revision;
			}
			broadcast({ type: "presence_update", session: session.info }, connection.sessionId);
			if (value.requestId !== undefined) {
				await queueFrame(connection, { type: "role_updated", requestId: value.requestId, role: session.info.role ?? null });
			}
			break;
		}
		default:
			throw new Error("Unknown client message type");
	}
}

function failConnection(connection, error) {
	if (connection.closed || connection.failed) return;
	connection.failed = true;
	try {
		void queueFrame(connection, { type: "error", error: error.message }).catch(() => undefined).finally(() => connection.socket.destroy());
	} catch {
		connection.socket.destroy();
	}
}

function rejectAcceptedConnection(connection, error) {
	if (connection.closed || connection.failed) return;
	connection.failed = true;
	connection.socket.resume();
	const timeout = setTimeout(() => connection.socket.destroy(), 250);
	timeout.unref();
	connection.socket.once("close", () => clearTimeout(timeout));
	try {
		connection.socket.end(encode({ type: "error", error: error.message }));
	} catch {
		connection.socket.destroy();
	}
}

function accept(socket) {
	const connection = {
		socket,
		sessionId: null,
		info: null,
		infoBytes: 0,
		closed: false,
		failed: false,
		writeTail: Promise.resolve(),
		queuedBytes: 0,
		readTail: Promise.resolve(),
		queuedRequests: 0,
		queuedRequestBytes: 0,
		registrationTimer: undefined,
		lastPiSessionRevision: 0,
	};
	// Every accepted socket is tracked before registration, cap checks, or protocol work.
	connections.add(connection);
	socket.on("error", () => undefined);
	socket.on("close", () => {
		connection.closed = true;
		clearTimeout(connection.registrationTimer);
		connections.delete(connection);
		removeSession(connection);
	});
	if (shuttingDown) {
		socket.destroy(new Error("Intercom broker is shutting down"));
		return;
	}
	if (connections.size > LIMITS.connections) {
		const error = new Error(
			`Intercom connection limit reached (maximum ${LIMITS.connections}; set PI_INTERCOM_MAX_CONNECTIONS before broker startup to increase it)`,
		);
		if (connections.size - LIMITS.connections <= MAX_GRACEFUL_CONNECTION_REJECTIONS) {
			rejectAcceptedConnection(connection, error);
		} else {
			socket.destroy(error);
		}
		return;
	}
	socket.setNoDelay(true);
	connection.registrationTimer = setTimeout(() => {
		if (!connection.sessionId && !connection.closed) socket.destroy(new Error("Intercom registration timeout"));
	}, registrationTimeoutMs);
	connection.registrationTimer.unref();
	const reader = new Reader(
		(value, frameBytes) => {
			if (connection.failed || connection.closed || shuttingDown) return;
			if (
				connection.queuedRequests + 1 > LIMITS.queuedRequests
				|| connection.queuedRequestBytes + frameBytes > LIMITS.queuedRequestBytes
			) {
				connection.failed = true;
				socket.pause();
				const error = new Error("Intercom inbound request queue exceeded limit");
				socket.destroy(error);
				throw error;
			}
			connection.queuedRequests++;
			connection.queuedRequestBytes += frameBytes;
			const operation = connection.readTail.catch(() => undefined).then(() => handleMessage(connection, value)).catch((error) => {
				failConnection(connection, error instanceof Error ? error : new Error(String(error)));
			}).finally(() => {
				connection.queuedRequests = Math.max(0, connection.queuedRequests - 1);
				connection.queuedRequestBytes = Math.max(0, connection.queuedRequestBytes - frameBytes);
			});
			connection.readTail = operation;
		},
		(error) => failConnection(connection, error),
	);
	socket.on("data", (chunk) => reader.push(chunk));
}

async function unlinkOwned(path, identity) {
	if (!identity) return;
	try {
		const current = await lstat(path);
		if (current.dev === identity.dev && current.ino === identity.ino) await unlink(path);
	} catch {
		// Missing or replaced runtime files are not ours to remove.
	}
}

async function secureRuntimeDirectory(path) {
	await mkdir(path, { recursive: true, mode: 0o700 });
	const info = await lstat(path);
	if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`Intercom runtime path is not a real directory: ${path}`);
	const uid = process.getuid?.();
	if (uid !== undefined && info.uid !== uid) throw new Error(`Intercom runtime directory is not owned by the current user: ${path}`);
	await chmod(path, 0o700);
}

const server = net.createServer(accept);
server.on("error", (error) => {
	process.stderr.write(`Intercom broker failed: ${error.message}\n`);
	process.exitCode = 1;
});

async function shutdown() {
	if (shuttingDown) return;
	shuttingDown = true;
	clearIdleTimer();
	clearInterval(edgeSweep);
	requestEdges.clear();
	const closed = new Promise((resolve) => server.close(() => resolve()));
	for (const connection of connections) connection.socket.destroy();
	sessions.clear();
	sessionInfoBytes = 0;
	await closed;
	await unlinkOwned(socketPath, socketIdentity);
	await unlinkOwned(pidPath, pidIdentity);
}

const edgeSweep = setInterval(() => {
	const now = Date.now();
	for (const [messageId, edge] of requestEdges) {
		if (edge.expiresAt > now) continue;
		requestEdges.delete(messageId);
		const origin = sessions.get(edge.fromPeerId);
		if (origin) void queueFrame(origin, { type: "delivery_failed", messageId, reason: "Request expired before reply" }).catch(() => origin.socket.destroy());
	}
}, edgeSweepMs);
edgeSweep.unref();

async function publishPidFile() {
	const temporaryPidPath = join(runtimeDir, `.broker.pid.${process.pid}.${randomUUID()}.tmp`);
	let handle;
	let temporaryIdentity;
	try {
		handle = await open(
			temporaryPidPath,
			fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | (fsConstants.O_NOFOLLOW ?? 0),
			0o600,
		);
		temporaryIdentity = await handle.stat();
		const uid = process.getuid?.();
		if (!temporaryIdentity.isFile() || (uid !== undefined && temporaryIdentity.uid !== uid)) {
			throw new Error("Intercom PID temporary file is not a current-user regular file");
		}
		await handle.writeFile(`${process.pid}\n`, "utf8");
		await handle.sync();
		await link(temporaryPidPath, pidPath);
		const publicationDelayMs = positiveInteger(process.env.PI_INTERCOM_TEST_PID_PUBLICATION_DELAY_MS, 0);
		if (publicationDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, publicationDelayMs));
		const published = await lstat(pidPath);
		if (!published.isFile() || published.dev !== temporaryIdentity.dev || published.ino !== temporaryIdentity.ino) {
			throw new Error("Intercom PID publication identity mismatch");
		}
		pidIdentity = { dev: published.dev, ino: published.ino };
	} finally {
		await handle?.close();
		await unlinkOwned(temporaryPidPath, temporaryIdentity);
	}
}

await secureRuntimeDirectory(runtimeDir);
server.listen(socketPath, async () => {
	try {
		await chmod(socketPath, 0o600);
		socketIdentity = await lstat(socketPath);
		await publishPidFile();
		// SIGTERM can close the server while PID publication is awaiting filesystem work.
		// Recheck ownership afterward so a late publication cannot outlive this broker.
		if (shuttingDown) {
			await unlinkOwned(pidPath, pidIdentity);
			return;
		}
		scheduleIdleShutdown();
	} catch (error) {
		process.stderr.write(`Intercom broker runtime setup failed: ${error instanceof Error ? error.message : String(error)}\n`);
		await shutdown();
		process.exitCode = 1;
	}
});

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => void shutdown());
