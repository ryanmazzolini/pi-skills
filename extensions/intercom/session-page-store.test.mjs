import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openSessionPage } from "./session-page.ts";
import { SessionPageStore, SESSION_PAGE_CURSOR_LIMITS } from "./session-page-store.ts";

const options = { limit: 1, projectionBytes: 4096 };
const TS = "2026-01-01T00:00:00.000Z";

function fixture(t, text = "older", ids = {}) {
	const directory = mkdtempSync(join(tmpdir(), "page-store-"));
	t.after(() => rmSync(directory, { recursive: true, force: true }));
	const source = { piSessionId: ids.sessionId ?? "session", activeLeafId: ids.leafId ?? "u2", fileLocator: join(directory, "session.jsonl") };
	const records = [
		{ type: "session", version: 3, id: source.piSessionId, cwd: "/private/cwd", timestamp: TS },
		{ type: "message", id: "u1", parentId: null, timestamp: TS, message: { role: "user", content: text } },
		{ type: "message", id: source.activeLeafId, parentId: "u1", timestamp: TS, message: { role: "user", content: "newer" } },
	];
	writeFileSync(source.fileLocator, records.map((record) => JSON.stringify(record)).join("\n") + "\n");
	let reads = 0;
	const runtime = {
		async readSession(to, open) {
			assert.equal(to, "peer");
			reads++;
			const handle = await open(source);
			try {
				handle.verifyStable();
				return { target: {}, targetSessionId: source.piSessionId, snapshot: handle.snapshot };
			} finally {
				handle.close();
			}
		},
	};
	return { source, runtime, request: { to: "peer", runtime }, reads: () => reads };
}

function decode(result, ceiling = 4096) {
	assert.ok(Buffer.byteLength(result.text) <= ceiling);
	assert.equal(result.details.projectionBytes, Buffer.byteLength(result.text));
	assert.equal(result.text.includes("\n"), false, "the JSON result is one physical line");
	const value = JSON.parse(result.text);
	assert.equal(result.details.nextCursor, value.nextCursor);
	assert.equal("fileLocator" in value, false);
	assert.equal("fileLocator" in result.details, false);
	return value;
}

test("returns source citations and an opaque token, then continues without resolving the peer", async (t) => {
	const f = fixture(t);
	const store = new SessionPageStore();
	const first = decode(await store.read(f.request, options));
	assert.equal(first.sessionId, "session");
	assert.equal(first.branchLeafId, "u2");
	assert.deepEqual(first.events.map((event) => event.entryId), ["u2"]);
	assert.match(first.nextCursor, /^[0-9a-f-]{36}$/);
	assert.ok(Date.parse(first.cursorExpiresAt) > Date.now());
	f.runtime.readSession = () => { throw new Error("peer is disconnected"); };
	const second = decode(await store.read({ cursor: first.nextCursor }, options));
	assert.deepEqual(second.events.map((event) => event.text), ["older"]);
	assert.equal(second.nextCursor, null);
	assert.equal(second.cursorExpiresAt, null);
	assert.equal(f.reads(), 1);
});

test("the final JSON envelope, escaping, and cursor all fit without losing original text", async (t) => {
	const original = ('\u001b]52;clipboard\u0007\u009b\u202e\u2066\u200d\u2028\u2029𐀀界\\\"\n').repeat(850);
	const f = fixture(t, original);
	const store = new SessionPageStore();
	const fragments = [];
	let request = f.request;
	for (let index = 0; ; index++) {
		assert.ok(index < 100);
		const result = await store.read(request, { ...options, limit: 32 });
		assert.doesNotMatch(result.text, /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u);
		const page = decode(result);
		fragments.push(...page.events.filter((event) => event.entryId === "u1"));
		if (page.nextCursor === null) break;
		request = { cursor: page.nextCursor };
	}
	fragments.sort((a, b) => a.textRange.start - b.textRange.start);
	assert.ok(fragments.length > 3);
	let end = 0;
	for (const fragment of fragments) {
		assert.equal(fragment.textRange.start, end);
		end = fragment.textRange.end;
	}
	assert.equal(end, original.length);
	assert.equal(fragments.map((fragment) => fragment.text).join(""), original);
});

test("insufficient event space fails explicitly and a larger response budget recovers", async (t) => {
	const f = fixture(t, "older", { sessionId: "\u0001".repeat(256), leafId: "\u0002".repeat(256) });
	const store = new SessionPageStore();
	await assert.rejects(store.read(f.request, options), /cannot fit the next event/);
	const first = decode(await store.read(f.request, { ...options, projectionBytes: 8192 }), 8192);
	assert.equal(first.events.length, 1);
	assert.ok(first.nextCursor);
	const second = decode(await store.read({ cursor: first.nextCursor }, options));
	assert.equal(second.events[0].text, "older");
});

test("tokens are isolated, replayable, expiring, and bounded without timers", async (t) => {
	const f = fixture(t);
	let now = 0;
	const store = new SessionPageStore({ now: () => now });
	const first = decode(await store.read(f.request, options));
	await assert.rejects(new SessionPageStore().read({ cursor: first.nextCursor }, options), /invalid or expired/);
	const replay1 = decode(await store.read({ cursor: first.nextCursor }, options));
	const replay2 = decode(await store.read({ cursor: first.nextCursor }, options));
	assert.deepEqual(replay1, replay2);
	now = SESSION_PAGE_CURSOR_LIMITS.ttlMs;
	await assert.rejects(store.read({ cursor: first.nextCursor }, options), /invalid or expired/);
	const tokens = [];
	for (let index = 0; index <= SESSION_PAGE_CURSOR_LIMITS.count; index++) {
		tokens.push(decode(await store.read(f.request, options)).nextCursor);
	}
	await assert.rejects(store.read({ cursor: tokens[0] }, options), /invalid or expired/);
	assert.equal(decode(await store.read({ cursor: tokens.at(-1) }, options)).events[0].text, "older");
	store.clear();
	await assert.rejects(store.read({ cursor: tokens.at(-1) }, options), /invalid or expired/);
});

test("cursor lifetime starts after a slow read finishes", async (t) => {
	const f = fixture(t);
	let now = 0;
	const store = new SessionPageStore({ now: () => now, openPage: async (input) => {
		const handle = await openSessionPage(input);
		now += SESSION_PAGE_CURSOR_LIMITS.ttlMs * 2;
		return handle;
	} });
	const first = decode(await store.read(f.request, options));
	assert.equal(Date.parse(first.cursorExpiresAt), now + SESSION_PAGE_CURSOR_LIMITS.ttlMs);
	assert.equal(decode(await store.read({ cursor: first.nextCursor }, options)).events[0].text, "older");
});

test("session reset fences an in-flight first page or continuation and closes its handle", async (t) => {
	for (const mode of ["first", "continuation"]) {
		await t.test(mode, async (t) => {
			const f = fixture(t);
			const started = Promise.withResolvers();
			const release = Promise.withResolvers();
			let gate = false;
			let closed = 0;
			const store = new SessionPageStore({ openPage: async (input) => {
				const handle = await openSessionPage(input);
				if (gate) {
					started.resolve();
					await release.promise;
				}
				return { ...handle, close() { closed++; handle.close(); } };
			} });
			let request = f.request;
			if (mode === "continuation") request = { cursor: decode(await store.read(f.request, options)).nextCursor };
			const closedBefore = closed;
			gate = true;
			const pending = store.read(request, options);
			const rejected = assert.rejects(pending, /Session changed/);
			await started.promise;
			store.clear();
			release.resolve();
			await rejected;
			assert.equal(closed, closedBefore + 1);
			if ("cursor" in request) await assert.rejects(store.read(request, options), /invalid or expired/);
		});
	}
});

test("failed or cancelled reads do not consume a cursor or silently retarget it", async (t) => {
	const f = fixture(t);
	const store = new SessionPageStore();
	const first = decode(await store.read(f.request, options));
	const request = { cursor: first.nextCursor };
	await assert.rejects(store.read(request, { ...options, scanBytes: 1 }), /emergency read ceiling/);
	await assert.rejects(store.read(request, { ...options, signal: AbortSignal.abort() }), /cancelled/);
	appendFileSync(f.source.fileLocator, JSON.stringify({ type: "message", id: "other", parentId: null, timestamp: TS, message: { role: "user", content: "unrelated branch" } }) + "\n");
	assert.equal(decode(await store.read(request, options)).events[0].text, "older");
	for (const projectionBytes of [4095, 49153, NaN]) {
		await assert.rejects(store.read(request, { ...options, projectionBytes }), /byte limit is invalid/);
	}
});

test("concurrent page creation cannot exceed the cursor count bound", async (t) => {
	const f = fixture(t);
	const store = new SessionPageStore();
	const results = await Promise.all(Array.from({ length: SESSION_PAGE_CURSOR_LIMITS.count + 4 }, () => store.read(f.request, options)));
	let available = 0;
	for (const result of results) {
		const cursor = decode(result).nextCursor;
		try { await store.read({ cursor }, options); available++; }
		catch (error) { assert.match(error.message, /invalid or expired/); }
	}
	assert.equal(available, SESSION_PAGE_CURSOR_LIMITS.count);
});
