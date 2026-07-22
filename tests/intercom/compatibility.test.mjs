import assert from "node:assert/strict";
import test from "node:test";
import { IntercomClient } from "../../extensions/intercom/client.ts";
import { LegacyDriver, connectNew, isolatedIntercom, registration, startLegacyBroker, startOwnedBroker, stopChild, waitEvent, waitFor } from "./helpers.mjs";

async function createPeer(kind, fixture, name) {
	if (kind === "old") {
		const driver = new LegacyDriver(fixture.home);
		const connected = await driver.command("connect", { session: registration(name) });
		return {
			kind,
			sessionId: connected.sessionId,
			list: () => driver.command("list"),
			send: (to, options) => driver.command("send", { to, options }),
			presence: (updates) => driver.command("presence", { updates }),
			waitMessage: (id) => driver.waitEvent((event) => event.event === "message" && event.message.id === id).then((event) => [event.from, event.message]),
			waitPresence: (id, status) => driver.waitEvent((event) => event.event === "presence_update" && event.session.id === id && event.session.status === status).then((event) => event.session),
			waitLeft: (id) => driver.waitEvent((event) => event.event === "session_left" && event.sessionId === id),
			tailCapability: () => false,
			close: () => driver.close(),
		};
	}
	const client = await connectNew(fixture.paths, name);
	return {
		kind,
		sessionId: client.sessionId,
		list: () => client.listSessions(),
		send: (to, options) => client.send(to, options),
		presence: async (updates) => client.updatePresence(updates),
		waitMessage: (id) => waitEvent(client, "message", (_from, message) => message.id === id),
		waitPresence: (id, status) => waitEvent(client, "presence_update", (session) => session.id === id && session.status === status).then(([session]) => session),
		waitLeft: (id) => waitEvent(client, "session_left", (sessionId) => sessionId === id),
		tailCapability: () => client.supportsCapability("pi-session-tail-v1"),
		ask: (to, options) => client.ask(to, options),
		close: () => client.disconnect(),
	};
}

const combinations = [
	{ title: "old-client/old-broker baseline", broker: "old", client: "old" },
	{ title: "new-client/old-broker", broker: "old", client: "new" },
	{ title: "old-client/new-broker", broker: "new", client: "old" },
	{ title: "new-client/new-broker", broker: "new", client: "new" },
];

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

for (const brokerKind of ["old", "new"]) {
	test(`true mixed clients communicate old↔new against the ${brokerKind === "old" ? "legacy" : "owned"} broker`, async (t) => {
		const fixture = await isolatedIntercom(t, `mixed-${brokerKind}-`);
		const broker = brokerKind === "old"
			? await startLegacyBroker(fixture.home, fixture.paths.socketPath)
			: await startOwnedBroker(fixture.paths);
		t.after(() => stopChild(broker));
		const oldPeer = await createPeer("old", fixture, "legacy-peer");
		const newPeer = await createPeer("new", fixture, "owned-peer");
		assert.equal(newPeer.tailCapability(), brokerKind === "new");
		t.after(async () => Promise.allSettled([oldPeer.close(), newPeer.close()]));

		for (const peer of [oldPeer, newPeer]) {
			const sessions = await peer.list();
			assert.equal(sessions.some((session) => session.id === oldPeer.sessionId && session.name === "legacy-peer"), true);
			assert.equal(sessions.some((session) => session.id === newPeer.sessionId && session.name === "owned-peer"), true);
		}

		const oldPresence = newPeer.waitPresence(oldPeer.sessionId, "old-present");
		await oldPeer.presence({ status: "old-present", model: "old-model" });
		assert.equal((await oldPresence).model, "old-model");
		const newPresence = oldPeer.waitPresence(newPeer.sessionId, "new-present");
		await newPeer.presence({ status: "new-present", model: "new-model" });
		assert.equal((await newPresence).model, "new-model");

		for (const [sender, recipient, id, attachmentText] of [
			[oldPeer, newPeer, "mixed-old-to-new", "old attachment"],
			[newPeer, oldPeer, "mixed-new-to-old", "new attachment"],
		]) {
			const incoming = recipient.waitMessage(id);
			const attachment = { type: "context", name: `${id}.txt`, content: attachmentText };
			assert.equal((await sender.send(recipient.sessionId, { messageId: id, text: id, attachments: [attachment] })).delivered, true);
			const [from, message] = await incoming;
			assert.equal(from.id, sender.sessionId);
			assert.deepEqual(message.content.attachments, [attachment]);
		}

		const oldAskIncoming = newPeer.waitMessage("mixed-old-ask");
		assert.equal((await oldPeer.send(newPeer.sessionId, { messageId: "mixed-old-ask", text: "legacy question", expectsReply: true })).delivered, true);
		await oldAskIncoming;
		const oldReply = oldPeer.waitMessage("mixed-new-reply");
		assert.equal((await newPeer.send(oldPeer.sessionId, { messageId: "mixed-new-reply", text: "owned answer", replyTo: "mixed-old-ask" })).delivered, true);
		assert.equal((await oldReply)[1].replyTo, "mixed-old-ask");

		const newAsk = newPeer.ask(oldPeer.sessionId, { messageId: "mixed-new-ask", text: "owned question" });
		await oldPeer.waitMessage("mixed-new-ask");
		assert.equal((await oldPeer.send(newPeer.sessionId, { messageId: "mixed-old-reply", text: "legacy answer", replyTo: "mixed-new-ask" })).delivered, true);
		const correlated = await newAsk;
		assert.equal(correlated.from.id, oldPeer.sessionId);
		assert.equal(correlated.message.replyTo, "mixed-new-ask");
		assert.equal(correlated.message.content.text, "legacy answer");

		for (const peer of [oldPeer, newPeer]) {
			const failed = await peer.send("not-connected", { messageId: `mixed-failed-${peer.kind}`, text: "lost" });
			assert.equal(failed.delivered, false);
			assert.match(failed.reason, /Session not found/);
		}

		const left = newPeer.waitLeft(oldPeer.sessionId);
		await oldPeer.close();
		await left;
	});
}

for (const combination of combinations) {
	test(`compatibility matrix: ${combination.title}`, async (t) => {
		const fixture = await isolatedIntercom(t, `matrix-${combination.broker}-${combination.client}-`);
		const broker = combination.broker === "old"
			? await startLegacyBroker(fixture.home, fixture.paths.socketPath)
			: await startOwnedBroker(fixture.paths);
		t.after(() => stopChild(broker));
		const alice = await createPeer(combination.client, fixture, "alice");
		const bob = await createPeer(combination.client, fixture, "bob");
		assert.equal(alice.tailCapability(), combination.client === "new" && combination.broker === "new");
		t.after(async () => {
			await Promise.allSettled([alice.close(), bob.close()]);
		});

		const sessions = await alice.list();
		assert.equal(sessions.length, 2);
		assert.equal(sessions.some((session) => session.id === bob.sessionId && session.name === "bob"), true);

		const presence = bob.waitPresence(alice.sessionId, "reviewing");
		await alice.presence({ status: "reviewing", model: "matrix-model" });
		assert.equal((await presence).model, "matrix-model");

		const attachment = { type: "context", name: "finding", content: "legacy-compatible attachment" };
		const incoming = bob.waitMessage("matrix-send");
		assert.equal((await alice.send(bob.sessionId, { messageId: "matrix-send", text: "hello", attachments: [attachment] })).delivered, true);
		const [from, message] = await incoming;
		assert.equal(from.id, alice.sessionId);
		assert.deepEqual(message.content.attachments, [attachment]);

		const askIncoming = bob.waitMessage("matrix-ask");
		assert.equal((await alice.send(bob.sessionId, { messageId: "matrix-ask", text: "question", expectsReply: true })).delivered, true);
		await askIncoming;
		const replyIncoming = alice.waitMessage("matrix-reply");
		assert.equal((await bob.send(alice.sessionId, { messageId: "matrix-reply", text: "answer", replyTo: "matrix-ask" })).delivered, true);
		const [, reply] = await replyIncoming;
		assert.equal(reply.replyTo, "matrix-ask");
		assert.equal(reply.content.text, "answer");

		const failed = await alice.send("not-connected", { messageId: "matrix-failed", text: "lost" });
		assert.equal(failed.delivered, false);
		assert.match(failed.reason, /Session not found/);

		const left = alice.waitLeft(bob.sessionId);
		await bob.close();
		await left;
	});
}
