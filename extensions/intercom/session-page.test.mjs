import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync, readFileSync, renameSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openSessionPage, sessionPageJson } from "./session-page.ts";

const SESSION_ID = "paged-session";
const TS = "2026-01-01T00:00:00.000Z";
const header = { type: "session", version: 3, id: SESSION_ID, timestamp: TS, cwd: "/safe" };

function message(id, parentId, value) {
	return { type: "message", id, parentId, timestamp: TS, message: value };
}

function user(id, parentId, content) {
	return message(id, parentId, { role: "user", content });
}

function assistant(id, parentId, text, extra = []) {
	return message(id, parentId, { role: "assistant", stopReason: "stop", content: [{ type: "text", text }, ...extra] });
}

function recordsText(records) {
	return records.map((record) => JSON.stringify(record)).join("\n") + "\n";
}

function fixture(t, records) {
	const directory = mkdtempSync(join(tmpdir(), "session-page-"));
	t.after(() => rmSync(directory, { recursive: true, force: true }));
	const fileLocator = join(directory, "session.jsonl");
	writeFileSync(fileLocator, recordsText([header, ...records]));
	return { piSessionId: SESSION_ID, fileLocator, activeLeafId: records.at(-1)?.id ?? null };
}

async function page(input) {
	const handle = await openSessionPage({ limit: 2, maxEventBytes: 4096, ...input });
	try {
		handle.verifyStable();
		assert.equal(handle.snapshot.eventBytes, Buffer.byteLength(sessionPageJson(handle.snapshot.events)));
		assert.ok(handle.snapshot.eventBytes <= (input.maxEventBytes ?? 4096));
		return handle.snapshot;
	} finally {
		handle.close();
	}
}

async function allPages(source, options = {}) {
	const pages = [];
	let current = await page({ source, ...options });
	for (let count = 0; ; count++) {
		assert.ok(count < 100, "pagination must make progress");
		pages.push(current);
		if (!current.next) return pages;
		current = await page({ cursor: current.next, ...options });
	}
}

function texts(pages) {
	return pages.flatMap((item) => item.events).filter((event) => event.kind === "user" || event.kind === "assistant");
}

function reconstruct(events, entryId) {
	const fragments = events.filter((event) => event.entryId === entryId).sort((a, b) => a.textRange.start - b.textRange.start);
	let end = 0;
	for (const part of fragments) {
		assert.equal(part.textRange.start, end, "no missing or duplicate text between fragments");
		end = part.textRange.end;
	}
	assert.equal(end, fragments[0].textRange.total);
	return fragments.map((part) => part.text).join("");
}

test("pages backward with original entry IDs and chronological events inside each page", async (t) => {
	const source = fixture(t, [user("u1", null, "first"), assistant("a1", "u1", "second"), user("u2", "a1", "third"), assistant("a2", "u2", "fourth")]);
	const pages = await allPages(source);
	assert.deepEqual(pages.map((item) => item.events.map((event) => event.entryId)), [["u2", "a2"], ["u1", "a1"]]);
	assert.ok(pages.every((item) => item.sessionId === SESSION_ID && item.branchLeafId === "a2"));
	assert.equal(new Set(texts(pages).map((event) => event.entryId)).size, 4);
	assert.equal(pages.at(-1).next, null);
});

test("byte-limited pages resume partially returned text without gaps, broken characters, or duplicates", async (t) => {
	const long = 'Start\\\"\n\t界😀é'.repeat(1200) + "END";
	const source = fixture(t, [user("old", null, "older"), assistant("long", "old", long), user("new", "long", "newer")]);
	const pages = await allPages(source, { limit: 32 });
	assert.ok(pages.length > 3);
	const events = texts(pages);
	assert.equal(reconstruct(events, "long"), long);
	assert.equal(reconstruct(events, "old"), "older");
	assert.equal(reconstruct(events, "new"), "newer");
	for (const event of events) {
		assert.equal(event.text.includes("�"), false);
		assert.equal(/^[\udc00-\udfff]|[\ud800-\udbff]$/.test(event.text), false);
	}
});

test("a fully consumed large boundary does not consume the next page's retained-text budget", async (t) => {
	const older = "a".repeat(300_000);
	const newer = "b".repeat(300_000);
	const source = fixture(t, [user("old", null, older), user("new", "old", newer)]);
	const pages = await allPages(source, { limit: 1, maxEventBytes: 49152 });
	assert.ok(pages.length >= 14);
	const events = texts(pages);
	assert.equal(reconstruct(events, "old"), older);
	assert.equal(reconstruct(events, "new"), newer);
});

test("preserves escaped lone surrogates rather than normalizing the source text", async (t) => {
	const text = "a\ud800b\udc00".repeat(1800);
	const source = fixture(t, [user("u", null, text)]);
	assert.equal(reconstruct(texts(await allPages(source)), "u"), text);
});

test("changing page limits and replaying an earlier cursor never shifts the unread boundary", async (t) => {
	const records = Array.from({ length: 9 }, (_, index) => user(`u${index}`, index === 0 ? null : `u${index - 1}`, `text${index}`));
	const source = fixture(t, records);
	const first = await page({ source, limit: 1 });
	const second = await page({ cursor: first.next, limit: 3, maxEventBytes: 8192 });
	assert.deepEqual(second.events.map((event) => event.entryId), ["u5", "u6", "u7"]);
	const replay = await page({ cursor: first.next, limit: 3, maxEventBytes: 8192 });
	assert.deepEqual(replay.events, second.events);
	assert.equal(JSON.stringify(first.next), "{}", "opaque cursors must not expose file locators or source text");
});

test("continues on the original branch across appends and a different live leaf, without peer lookup", async (t) => {
	const source = fixture(t, [user("u1", null, "original"), assistant("a1", "u1", "latest")]);
	const first = await page({ source, limit: 1 });
	appendFileSync(source.fileLocator, recordsText([user("u2", "a1", "new message"), assistant("other", "u1", "other branch")]));
	// Even caller-owned source metadata cannot redirect an existing cursor.
	source.activeLeafId = "other";
	const older = await page({ cursor: first.next, limit: 1 });
	assert.equal(older.branchLeafId, "a1");
	assert.deepEqual(older.events.map((event) => event.text), ["original"]);
	assert.equal(older.next, null);
});

test("does not follow physically adjacent entries from another branch", async (t) => {
	const source = fixture(t, [user("u1", null, "original"), assistant("other", "u1", "excluded"), assistant("a1", "u1", "selected")]);
	assert.deepEqual(texts(await allPages(source, { limit: 1 })).map((event) => event.text), ["selected", "original"]);
});

test("tool matching may look behind the page boundary without consuming that older text", async (t) => {
	const source = fixture(t, [
		user("u", null, "request"),
		assistant("call", "u", "call text", [{ type: "toolCall", id: "tc", name: "read", arguments: { private: "SECRET" } }]),
		user("middle", "call", "between call and result"),
		message("result", "middle", { role: "toolResult", toolCallId: "tc", toolName: "read", isError: false, content: [{ type: "text", text: "SECRET" }] }),
	]);
	const pages = await allPages(source, { limit: 1 });
	assert.deepEqual(pages[0].events.map((event) => [event.entryId, event.kind]), [["middle", "user"], ["result", "tool"]]);
	assert.deepEqual(texts(pages).map((event) => event.entryId), ["middle", "call", "u"]);
	assert.equal(JSON.stringify(pages).includes("SECRET"), false);
});

test("outcome-only pages and byte boundaries retain exact outcome entry IDs", async (t) => {
	const records = [user("u", null, "old text")];
	for (let index = 0; index < 63; index++) {
		records.push(message(`b${index}-${"x".repeat(180)}`, records.at(-1).id, { role: "bashExecution", command: "SECRET", output: "SECRET", exitCode: 0, cancelled: false, truncated: false }));
	}
	const source = fixture(t, records);
	const pages = await allPages(source);
	assert.ok(pages.length > 1);
	assert.ok(pages[0].events.every((event) => event.kind === "bash"));
	const events = pages.flatMap((item) => item.events);
	assert.equal(new Set(events.map((event) => event.entryId)).size, 64);
	assert.equal(events.length, 64);
	assert.equal(JSON.stringify(pages).includes("SECRET"), false);
});

test("permits an empty final page for private-only older history and a null initial leaf", async (t) => {
	const privateEntry = { type: "custom", id: "c", parentId: null, timestamp: TS, customType: "hidden", data: "SECRET" };
	const source = fixture(t, [privateEntry, user("u", "c", "last")]);
	const pages = await allPages(source, { limit: 1 });
	assert.equal(pages.length, 2);
	assert.deepEqual(pages[1].events, []);
	assert.equal(pages[1].next, null);
	assert.deepEqual((await page({ source: { ...source, activeLeafId: null } })).events, []);
});

test("retains text-part arrays and excludes private payloads, failed assistant text, and incomplete records", async (t) => {
	const source = fixture(t, [
		user("u", null, [{ type: "text", text: "one" }, { type: "image", data: "SECRET", mimeType: "image/png" }, { type: "text", text: "two" }]),
		message("bad", "u", { role: "assistant", stopReason: "aborted", content: [{ type: "text", text: "SECRET" }] }),
		assistant("a", "bad", "answer", [{ type: "thinking", thinking: "SECRET" }]),
	]);
	appendFileSync(source.fileLocator, '{"unfinished":');
	const pages = await allPages(source, { limit: 1 });
	assert.ok(pages.every((item) => item.ignoredFinalFragment));
	assert.equal(JSON.stringify(pages).includes("SECRET"), false);
	assert.equal(reconstruct(texts(pages), "u"), "one\ntwo");
});

test("rejects replaced, shortened, missing, and rewritten boundary sources", async (t) => {
	for (const mutation of ["replace", "shorten", "missing", "rewrite-and-append", "same-size"]) {
		await t.test(mutation, async (t) => {
			const source = fixture(t, [user("u", null, "first"), assistant("a", "u", "later")]);
			const first = await page({ source, limit: 1 });
			const original = readFileSync(source.fileLocator, "utf8");
			if (mutation === "replace") {
				renameSync(source.fileLocator, `${source.fileLocator}.old`);
				writeFileSync(source.fileLocator, original);
			} else if (mutation === "shorten") truncateSync(source.fileLocator, original.length - 2);
			else if (mutation === "missing") rmSync(source.fileLocator);
			else if (mutation === "same-size") writeFileSync(source.fileLocator, original.replace("later", "OTHER"));
			else writeFileSync(source.fileLocator, original.replace("later", "CHANGED") + recordsText([user("new", "a", "added")]));
			await assert.rejects(page({ cursor: first.next }), /Session (page source changed|file)/);
		});
	}
});

test("rejects forged cursors, conflicting inputs, invalid budgets, cancellation, and read ceilings", async (t) => {
	const source = fixture(t, [user("u", null, "text"), assistant("a", "u", "more")]);
	const first = await page({ source, limit: 1 });
	await assert.rejects(page({ cursor: {} }), /cursor is invalid/);
	await assert.rejects(page({ cursor: JSON.parse(JSON.stringify(first.next)) }), /cursor is invalid/);
	await assert.rejects(page({ source, cursor: first.next }), /input is invalid/);
	await assert.rejects(page({}), /input is invalid/);
	for (const maxEventBytes of [0, 1, 49153, NaN, 4096.5]) {
		await assert.rejects(page({ source, maxEventBytes }), /input is invalid/);
	}
	await assert.rejects(page({ source, limit: 33 }), /input is invalid/);
	await assert.rejects(page({ cursor: first.next, scanBytes: 1 }), /emergency read ceiling/);
	await assert.rejects(page({ source, signal: AbortSignal.abort() }), /cancelled/);
	await assert.rejects(page({ cursor: first.next, signal: AbortSignal.abort() }), /cancelled/);
});

test("page handles detect post-read mutations and close deterministically", async (t) => {
	const source = fixture(t, [user("u", null, "text")]);
	const handle = await openSessionPage({ source, limit: 1, maxEventBytes: 4096 });
	appendFileSync(source.fileLocator, recordsText([assistant("a", "u", "new")]));
	assert.throws(() => handle.verifyStable(), /changed/);
	handle.close();
	handle.close();
	assert.throws(() => handle.verifyStable(), /closed/);
	assert.throws(() => handle.verifyReopenedStable(), /changed/);
});
