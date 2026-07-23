import assert from "node:assert/strict";
import test from "node:test";
import { IntercomClient } from "../../extensions/intercom/client.ts";
import {
	CurrentDriver,
	LegacyDriver,
	connectNew,
	isolatedIntercom,
	registration,
	startCurrentBroker,
	startLegacyBroker,
	startOwnedBroker,
	stopChild,
	waitEvent,
	waitFor,
} from "./helpers.mjs";

const CLIENT_KINDS = ["old", "current", "new"];
const BROKER_KINDS = ["old", "current", "new"];
const TAIL_CAPABILITY = "pi-session-tail-v1";

async function createPeer(kind, fixture, name, overrides = {}) {
	if (kind === "old" || kind === "current") {
		const driver = kind === "old" ? new LegacyDriver(fixture.home) : new CurrentDriver(fixture.home);
		const connected = await driver.command("connect", { session: registration(name, overrides) });
		return {
			kind,
			sessionId: connected.sessionId,
			list: () => driver.command("list"),
			send: (to, options) => driver.command("send", { to, options }),
			presence: (updates) => driver.command("presence", { updates }),
			waitMessage: (id) => driver.waitEvent((event) => event.event === "message" && event.message.id === id).then((event) => [event.from, event.message]),
			waitJoined: (target) => driver.waitEvent((event) => event.event === "session_joined" && (event.session.id === target || event.session.name === target)).then((event) => event.session),
			waitPresence: (id, status) => driver.waitEvent((event) => event.event === "presence_update" && event.session.id === id && event.session.status === status).then((event) => event.session),
			waitLeft: (id) => driver.waitEvent((event) => event.event === "session_left" && event.sessionId === id),
			tailCapability: () => kind === "current" && connected.tailCapability === true,
			privatePresenceCapability: () => kind === "current" && connected.privatePresenceCapability === true,
			close: () => driver.close(),
		};
	}
	const client = new IntercomClient({ socketPath: fixture.paths.socketPath, connectTimeoutMs: 1_000, listTimeoutMs: 1_000, sendTimeoutMs: 1_000, askTimeoutMs: 1_000 });
	await client.connect(registration(name, overrides));
	return {
		kind,
		sessionId: client.sessionId,
		list: () => client.listSessions(),
		send: (to, options) => client.send(to, options),
		presence: async (updates) => client.updatePresence(updates),
		waitMessage: (id) => waitEvent(client, "message", (_from, message) => message.id === id),
		waitJoined: (target) => waitEvent(client, "session_joined", (session) => session.id === target || session.name === target).then(([session]) => session),
		waitPresence: (id, status) => waitEvent(client, "presence_update", (session) => session.id === id && session.status === status).then(([session]) => session),
		waitLeft: (id) => waitEvent(client, "session_left", (sessionId) => sessionId === id),
		tailCapability: () => client.supportsCapability(TAIL_CAPABILITY),
		privatePresenceCapability: () => client.supportsPrivatePresence(),
		ask: (to, options) => client.ask(to, options),
		close: () => client.disconnect(),
	};
}

function startBroker(kind, fixture) {
	if (kind === "old") return startLegacyBroker(fixture.home, fixture.paths.socketPath);
	if (kind === "current") return startCurrentBroker(fixture.paths);
	return startOwnedBroker(fixture.paths);
}

test("pinned legacy clients disconnect cleanly when owned unregister closes the socket", async (t) => {
	const fixture = await isolatedIntercom(t, "old-unreg-");
	const broker = await startOwnedBroker(fixture.paths, { PI_INTERCOM_MAX_CONNECTIONS: "1" });
	t.after(() => stopChild(broker));
	const first = new LegacyDriver(fixture.home);
	const second = new LegacyDriver(fixture.home);
	t.after(async () => Promise.allSettled([first.close(), second.close()]));
	await first.command("connect", { session: registration("first") });
	assert.equal(await first.command("disconnect"), true);
	const replacement = await second.command("connect", { session: registration("second") });
	assert.equal(typeof replacement.sessionId, "string");
});

test("legacy clients receive owned-broker mutual-ask refusal through delivery_failed", async (t) => {
	const fixture = await isolatedIntercom(t, "mutual-old-");
	const broker = await startOwnedBroker(fixture.paths);
	t.after(() => stopChild(broker));
	const alice = await createPeer("old", fixture, "alice");
	const bob = await createPeer("old", fixture, "bob");
	t.after(async () => Promise.allSettled([alice.close(), bob.close()]));
	const question = bob.waitMessage("legacy-mutual-a");
	assert.equal((await alice.send(bob.sessionId, { messageId: "legacy-mutual-a", text: "question", expectsReply: true })).delivered, true);
	await question;
	const reverse = await bob.send(alice.sessionId, { messageId: "legacy-mutual-b", text: "reverse", expectsReply: true });
	assert.equal(reverse.delivered, false);
	assert.match(reverse.reason, /Reverse blocking ask rejected/);
	const reply = alice.waitMessage("legacy-mutual-reply");
	assert.equal((await bob.send(alice.sessionId, { messageId: "legacy-mutual-reply", text: "answer", replyTo: "legacy-mutual-a" })).delivered, true);
	assert.equal((await reply)[1].content.text, "answer");
});

test("new client cleans only the departed recipient's asks from legacy session_left", async (t) => {
	const fixture = await isolatedIntercom(t, "left-old-");
	const broker = await startLegacyBroker(fixture.home, fixture.paths.socketPath);
	t.after(() => stopChild(broker));
	const alice = await connectNew(fixture.paths, "alice", { askTimeoutMs: 5_000 });
	const bob = await connectNew(fixture.paths, "bob");
	const carol = await connectNew(fixture.paths, "carol");
	t.after(async () => Promise.allSettled([alice.disconnect(), bob.disconnect(), carol.disconnect()]));
	const bobIncoming = waitEvent(bob, "message", (_from, message) => message.id === "legacy-left-bob");
	const carolIncoming = waitEvent(carol, "message", (_from, message) => message.id === "legacy-left-carol");
	const bobAsk = alice.ask(bob.sessionId, { messageId: "legacy-left-bob", text: "bob?" });
	const carolAsk = alice.ask(carol.sessionId, { messageId: "legacy-left-carol", text: "carol?" });
	await Promise.all([bobIncoming, carolIncoming]);
	const bobFailure = assert.rejects(bobAsk, /Recipient disconnected before replying/);
	await bob.disconnect();
	await bobFailure;
	assert.deepEqual(alice.pendingCounts(), { sends: 0, lists: 0, asks: 1 });
	await carol.send(alice.sessionId, { messageId: "legacy-left-reply", text: "still here", replyTo: "legacy-left-carol" });
	assert.equal((await carolAsk).message.content.text, "still here");
	assert.deepEqual(alice.pendingCounts(), { sends: 0, lists: 0, asks: 0 });
});

test("new clients never expose persisted-session locators through a legacy broker", async (t) => {
	const fixture = await isolatedIntercom(t, "tail-legacy-");
	const broker = await startLegacyBroker(fixture.home, fixture.paths.socketPath);
	t.after(() => stopChild(broker));
	const observer = await connectNew(fixture.paths, "observer");
	const target = new IntercomClient({ socketPath: fixture.paths.socketPath, reconnectDelaysMs: [20] });
	const privateLocator = "/private/persisted/session.jsonl";
	await target.start(registration("target", { piSession: { sessionId: "private-pi-session", fileLocator: privateLocator, activeLeafId: "leaf", revision: 1 } }), async () => undefined);
	t.after(async () => Promise.allSettled([observer.disconnect(), target.disconnect()]));
	assert.equal(target.supportsCapability("pi-session-tail-v1"), false);
	let listed = (await observer.listSessions()).find((session) => session.id === target.sessionId);
	assert.equal(listed.piSession, undefined);
	assert.equal(JSON.stringify(listed).includes(privateLocator), false);
	target.updatePresence({ piSession: { sessionId: "private-pi-session", fileLocator: privateLocator, activeLeafId: "new", revision: 2 } });
	listed = (await observer.listSessions()).find((session) => session.id === target.sessionId);
	assert.equal(listed.piSession, undefined);
	assert.equal(JSON.stringify(listed).includes(privateLocator), false);
});

test("new client keeps parallel asks independent against the legacy broker", async (t) => {
	const fixture = await isolatedIntercom(t, "parallel-old-");
	const broker = await startLegacyBroker(fixture.home, fixture.paths.socketPath);
	t.after(() => stopChild(broker));
	const alice = await connectNew(fixture.paths, "alice", { askTimeoutMs: 2_000 });
	const bob = await connectNew(fixture.paths, "bob");
	t.after(async () => Promise.allSettled([alice.disconnect(), bob.disconnect()]));
	const seen = [];
	bob.on("message", (_from, message) => seen.push(message));
	const first = alice.ask(bob.sessionId, { messageId: "legacy-parallel-1", text: "one" });
	const second = alice.ask(bob.sessionId, { messageId: "legacy-parallel-2", text: "two" });
	await waitFor(() => seen.length === 2);
	await bob.send(alice.sessionId, { text: "two answer", replyTo: "legacy-parallel-2" });
	await bob.send(alice.sessionId, { text: "one answer", replyTo: "legacy-parallel-1" });
	assert.deepEqual((await Promise.all([first, second])).map((result) => result.message.content.text), ["one answer", "two answer"]);
	assert.equal(alice.pendingCounts().asks, 0);
});

function assertPrivateProjection(actual, expected, sentinels, label) {
	assert.deepEqual(actual.piSession, expected, `${label} piSession`);
	if (expected === undefined) {
		const serialized = JSON.stringify(actual);
		for (const sentinel of sentinels) assert.equal(serialized.includes(sentinel), false, `${label} leaked ${sentinel}`);
	}
}

function publisherAdvertisesPiSession(brokerKind, publisherKind) {
	if (publisherKind === "old") return true;
	if (publisherKind === "current") return brokerKind !== "old";
	return brokerKind === "new";
}

function recipientReceivesPiSession(brokerKind, recipientKind) {
	// New clients suppress private projections from brokers that cannot prove recipient filtering.
	return brokerKind === "new" ? recipientKind === "new" : recipientKind !== "new";
}

for (const brokerKind of BROKER_KINDS) {
	for (const publisherKind of CLIENT_KINDS) {
		test(`privacy and messaging matrix: ${publisherKind} client with ${brokerKind} broker`, async (t) => {
			const fixture = await isolatedIntercom(t, `privacy-${brokerKind}-${publisherKind}-`);
			const broker = await startBroker(brokerKind, fixture);
			t.after(() => stopChild(broker));

			const observers = [];
			for (const recipientKind of CLIENT_KINDS) {
				observers.push(await createPeer(recipientKind, fixture, `observer-${recipientKind}`));
			}
			t.after(async () => Promise.allSettled(observers.map((peer) => peer.close())));
			for (const observer of observers) {
				assert.equal(observer.tailCapability(), observer.kind !== "old" && brokerKind !== "old");
				assert.equal(observer.privatePresenceCapability(), observer.kind !== "old" && brokerKind === "new");
			}

			const initialLocator = `/private/PRIVATE_${brokerKind}_${publisherKind}_REGISTER.jsonl`;
			const updatedLocator = `/private/PRIVATE_${brokerKind}_${publisherKind}_PRESENCE.jsonl`;
			const initialPresence = { sessionId: `private-${brokerKind}-${publisherKind}`, fileLocator: initialLocator, activeLeafId: "initial-private-leaf", revision: 1 };
			const updatedPresence = { ...initialPresence, fileLocator: updatedLocator, activeLeafId: "updated-private-leaf", revision: 2 };
			const sentinels = [initialLocator, updatedLocator, initialPresence.sessionId, initialPresence.activeLeafId, updatedPresence.activeLeafId];
			const joined = observers.map((observer) => observer.waitJoined("private-publisher"));
			const publisher = await createPeer(publisherKind, fixture, "private-publisher", { piSession: initialPresence });
			t.after(() => publisher.close());

			for (let index = 0; index < observers.length; index++) {
				const observer = observers[index];
				const registrationProjection = await joined[index];
				const expected = publisherKind === "old" && recipientReceivesPiSession(brokerKind, observer.kind)
					? initialPresence
					: undefined;
				assertPrivateProjection(registrationProjection, expected, sentinels, `${observer.kind} registration/join projection`);
			}

			const presenceEvents = observers.map((observer) => observer.waitPresence(publisher.sessionId, "private-updated"));
			await publisher.presence({ status: "private-updated", model: "matrix-model", piSession: updatedPresence });
			const advertised = publisherAdvertisesPiSession(brokerKind, publisherKind);
			for (let index = 0; index < observers.length; index++) {
				const observer = observers[index];
				const canReceive = recipientReceivesPiSession(brokerKind, observer.kind);
				const expected = advertised && canReceive
					? brokerKind === "old" ? initialPresence : updatedPresence
					: undefined;
				const presenceProjection = await presenceEvents[index];
				assert.equal(presenceProjection.model, "matrix-model");
				assertPrivateProjection(presenceProjection, expected, sentinels, `${observer.kind} presence projection`);

				const listed = (await observer.list()).find((session) => session.id === publisher.sessionId);
				assertPrivateProjection(listed, expected, sentinels, `${observer.kind} list projection`);

				const messageId = `private-message-${brokerKind}-${publisherKind}-${observer.kind}`;
				const incoming = observer.waitMessage(messageId);
				const attachment = { type: "context", name: `${messageId}.txt`, content: "version-compatible attachment" };
				assert.equal((await publisher.send(observer.sessionId, { messageId, text: "hello", attachments: [attachment] })).delivered, true);
				const [from, message] = await incoming;
				assertPrivateProjection(from, expected, sentinels, `${observer.kind} message sender projection`);
				assert.deepEqual(message.content.attachments, [attachment]);
			}

			const failure = await publisher.send("not-connected", { messageId: `private-failed-${brokerKind}-${publisherKind}`, text: "lost" });
			assert.equal(failure.delivered, false);
			assert.match(failure.reason, /Session not found/);
		});
	}
}
