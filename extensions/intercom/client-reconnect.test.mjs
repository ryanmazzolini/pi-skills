import assert from "node:assert/strict";
import net from "node:net";
import test from "node:test";
import { FrameDecoder, IntercomClient, encodeFrame } from "./client.ts";
import { isolatedIntercom, registration, startCurrentBroker, startOwnedBroker, stopChild, waitEvent } from "../../tests/intercom/helpers.mjs";

test("shutdown cancels a connection that is still preparing its broker", async () => {
	let release;
	const gate = new Promise((resolve) => { release = resolve; });
	const client = new IntercomClient({ socketPath: "/tmp/pi-intercom-never-connects.sock", reconnectDelaysMs: [10] });
	const starting = client.start(registration("cancelled"), () => gate);
	await new Promise((resolve) => setImmediate(resolve));
	await client.disconnect();
	release();
	await assert.rejects(starting, /cancelled/);
	await new Promise((resolve) => setTimeout(resolve, 30));
	assert.equal(client.isConnected(), false);
});

test("client uses the latest registration after blocked broker preparation", async (t) => {
	const { paths } = await isolatedIntercom(t);
	const broker = await startOwnedBroker(paths);
	t.after(() => stopChild(broker));
	let release;
	const gate = new Promise((resolve) => { release = resolve; });
	const client = new IntercomClient({ socketPath: paths.socketPath, reconnectDelaysMs: [20] });
	const starting = client.start(registration("stale", { model: "stale-model", status: "stale", piSession: { sessionId: "pi-session", fileLocator: "/tmp/stale.jsonl", activeLeafId: "old", revision: 1 } }), () => gate);
	await new Promise((resolve) => setImmediate(resolve));
	client.setRegistration(registration("latest", { model: "latest-model", status: "latest", piSession: { sessionId: "pi-session", fileLocator: "/tmp/latest.jsonl", activeLeafId: "new", revision: 2 } }));
	release();
	await starting;
	t.after(() => client.disconnect());
	const self = (await client.listSessions()).find((session) => session.id === client.sessionId);
	assert.equal(self.name, "latest");
	assert.equal(self.model, "latest-model");
	assert.equal(self.status, "latest");
	assert.deepEqual(self.piSession, { sessionId: "pi-session", fileLocator: "/tmp/latest.jsonl", activeLeafId: "new", revision: 2 });
});

test("client synchronizes a registration update that races broker acknowledgement", async (t) => {
	const { paths } = await isolatedIntercom(t, "register-race-");
	let acceptedSocket;
	let releaseRegistered;
	let resolveRegister;
	let resolvePresence;
	const sawRegister = new Promise((resolve) => { resolveRegister = resolve; });
	const sawPresence = new Promise((resolve) => { resolvePresence = resolve; });
	const server = net.createServer((socket) => {
		acceptedSocket = socket;
		socket.on("error", () => undefined);
		const decoder = new FrameDecoder((message) => {
			if (message?.type === "register") {
				resolveRegister(message);
				new Promise((resolve) => { releaseRegistered = resolve; }).then(() => {
					socket.write(encodeFrame({
						type: "registered",
						sessionId: "race-session-id",
						capabilities: ["pi-session-tail-v1", "recipient-filtered-private-presence-v1"],
					}));
				});
			}
			if (message?.type === "presence") resolvePresence(message);
		}, () => socket.destroy());
		socket.on("data", (chunk) => decoder.push(chunk));
	});
	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(paths.socketPath, resolve);
	});
	t.after(async () => {
		acceptedSocket?.destroy();
		await new Promise((resolve) => server.close(resolve));
	});
	const client = new IntercomClient({ socketPath: paths.socketPath, connectTimeoutMs: 500 });
	const starting = client.start(registration("initial", { piSession: { sessionId: "pi-session", fileLocator: "/tmp/initial.jsonl", activeLeafId: "first", revision: 1 } }), async () => undefined);
	const registerMessage = await sawRegister;
	const sentRegistration = registerMessage.session;
	assert.deepEqual(registerMessage.capabilities, ["pi-session-tail-v1"]);
	assert.equal(sentRegistration.piSession, undefined);
	client.setRegistration(registration("latest", { model: "latest-model", status: "thinking", piSession: { sessionId: "pi-session", fileLocator: "/tmp/latest.jsonl", activeLeafId: "second", revision: 2 } }));
	releaseRegistered();
	await starting;
	const presence = await sawPresence;
	assert.equal(presence.name, "latest");
	assert.equal(presence.model, "latest-model");
	assert.equal(presence.status, "thinking");
	assert.deepEqual(presence.piSession, { sessionId: "pi-session", fileLocator: "/tmp/latest.jsonl", activeLeafId: "second", revision: 2 });
	await client.disconnect();
});

test("client withholds private presence until the privacy-unsafe current broker drains", async (t) => {
	const { paths } = await isolatedIntercom(t, "privacy-drain-");
	let broker = await startCurrentBroker(paths);
	t.after(async () => stopChild(broker));
	const presence = { sessionId: "rolling-pi-session", fileLocator: "/tmp/rolling.jsonl", activeLeafId: "rolling-leaf", revision: 1 };
	const client = new IntercomClient({ socketPath: paths.socketPath, connectTimeoutMs: 500, reconnectDelaysMs: [20, 40] });
	await client.start(registration("rolling-client", { piSession: presence }), async () => undefined);
	t.after(() => client.disconnect());
	assert.equal(client.supportsCapability("pi-session-tail-v1"), true);
	assert.equal(client.supportsPrivatePresence(), false);
	assert.equal((await client.listSessions()).find((session) => session.id === client.sessionId).piSession, undefined);

	const disconnected = waitEvent(client, "disconnected");
	const reconnected = waitEvent(client, "reconnected", () => true, 5_000);
	await stopChild(broker);
	await disconnected;
	broker = await startOwnedBroker(paths);
	await reconnected;
	assert.equal(client.supportsPrivatePresence(), true);
	assert.deepEqual((await client.listSessions()).find((session) => session.id === client.sessionId).piSession, presence);
});

test("client fails waiters on broker disconnect and reconnects one implementation safely", async (t) => {
	const { paths } = await isolatedIntercom(t);
	let broker = await startOwnedBroker(paths);
	t.after(async () => stopChild(broker));
	const client = new IntercomClient({
		socketPath: paths.socketPath,
		connectTimeoutMs: 200,
		listTimeoutMs: 500,
		sendTimeoutMs: 500,
		askTimeoutMs: 5_000,
		reconnectDelaysMs: [20, 40],
	});
	await client.start(registration("reconnecting"), async () => undefined);
	t.after(() => client.disconnect());
	const originalId = client.sessionId;
	const peer = new IntercomClient({ socketPath: paths.socketPath, connectTimeoutMs: 500 });
	await peer.connect(registration("peer"));

	const pending = client.ask(peer.sessionId, { messageId: "disconnect-cleanup", text: "wait" });
	const pendingAssertion = assert.rejects(pending, /disconnected|closed/);
	await waitEvent(peer, "message", (_from, message) => message.id === "disconnect-cleanup");
	const disconnected = waitEvent(client, "disconnected");
	const reconnected = waitEvent(client, "reconnected", () => true, 5_000);
	await stopChild(broker);
	await disconnected;
	await pendingAssertion;
	assert.deepEqual(client.pendingCounts(), { sends: 0, lists: 0, asks: 0 });
	assert.equal(client.supportsCapability("pi-session-tail-v1"), false);
	client.setRegistration(registration("reconnected-latest", { model: "reconnect-model", status: "ready", piSession: { sessionId: "pi-reconnected", fileLocator: "/tmp/reconnected.jsonl", activeLeafId: "leaf", revision: 7 } }));
	broker = await startOwnedBroker(paths);
	await reconnected;
	assert.equal(client.isConnected(), true);
	assert.notEqual(client.sessionId, originalId);
	const reconnectedSelf = (await client.listSessions()).find((session) => session.id === client.sessionId);
	assert.equal(reconnectedSelf.name, "reconnected-latest");
	assert.equal(reconnectedSelf.model, "reconnect-model");
	assert.equal(reconnectedSelf.status, "ready");
	assert.deepEqual(reconnectedSelf.piSession, { sessionId: "pi-reconnected", fileLocator: "/tmp/reconnected.jsonl", activeLeafId: "leaf", revision: 7 });
	assert.equal(client.supportsCapability("pi-session-tail-v1"), true);
	await peer.disconnect();
});

test("non-reading broker cannot wedge or unbound the serialized client write path", async (t) => {
	const { paths } = await isolatedIntercom(t, "write-bound-");
	const sockets = new Set();
	let nextId = 0;
	const server = net.createServer((socket) => {
		sockets.add(socket);
		socket.on("error", () => undefined);
		socket.on("close", () => sockets.delete(socket));
		const decoder = new FrameDecoder((message) => {
			if (message?.type !== "register") return;
			socket.write(encodeFrame({ type: "registered", sessionId: `wedged-${++nextId}` }));
			socket.pause();
		}, () => socket.destroy());
		socket.on("data", (chunk) => decoder.push(chunk));
	});
	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(paths.socketPath, resolve);
	});
	t.after(async () => {
		for (const socket of sockets) socket.destroy();
		await new Promise((resolve) => server.close(resolve));
	});

	const timed = new IntercomClient({
		socketPath: paths.socketPath,
		connectTimeoutMs: 500,
		sendTimeoutMs: 2_000,
		writeTimeoutMs: 50,
		maxQueuedWriteBytes: 16 * 1024 * 1024,
		reconnectDelaysMs: [20],
	});
	await timed.start(registration("timed"), async () => undefined);
	const disconnected = waitEvent(timed, "disconnected", () => true, 3_000);
	const reconnected = waitEvent(timed, "reconnected", () => true, 3_000);
	const sends = Array.from({ length: 60 }, (_, index) => timed.send("nobody", {
		messageId: `wedged-${index}`,
		text: "x".repeat(200_000),
	}).catch((error) => error));
	await disconnected;
	assert.equal(timed.isConnected(), false);
	assert.equal((await Promise.all(sends)).every((result) => result instanceof Error), true);
	await reconnected;
	assert.equal(timed.isConnected(), true);
	assert.deepEqual(timed.pendingCounts(), { sends: 0, lists: 0, asks: 0 });
	await timed.disconnect();

	const bounded = new IntercomClient({
		socketPath: paths.socketPath,
		connectTimeoutMs: 500,
		writeTimeoutMs: 1_000,
		maxQueuedWriteBytes: 8_192,
		reconnectDelaysMs: [1_000],
	});
	await bounded.start(registration("bounded"), async () => undefined);
	const boundedDisconnect = waitEvent(bounded, "disconnected");
	const errors = [];
	bounded.on("error", (error) => errors.push(error));
	for (let index = 0; index < 4; index++) bounded.updatePresence({ status: `${index}${"y".repeat(3_999)}` });
	await boundedDisconnect;
	assert.equal(bounded.isConnected(), false);
	assert.equal(errors.some((error) => /write queue exceeds/.test(error.message)), true);
	await bounded.disconnect();
});
