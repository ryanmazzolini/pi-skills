import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
import {
	FileSessionSummaryCache,
	SESSION_SUMMARY_CACHE_SCHEMA_VERSION,
	parseSessionSummaryCacheRecord,
} from "./summary-cache.ts";

function record(overrides = {}) {
	return {
		schemaVersion: SESSION_SUMMARY_CACHE_SCHEMA_VERSION,
		sessionId: "stable-pi-session-id",
		createdAt: "2026-08-05T12:00:00.000Z",
		lastTurnAtSummary: "2026-08-04T12:00:00.000Z",
		card: {
			title: "Finished migration",
			state: "complete",
			mainPoint: "The requested migration is complete.",
			safeToClose: "yes",
			decision: null,
			limitations: [],
		},
		...overrides,
	};
}

test("stores one atomic machine-owned JSON record per stable Pi session", async (t) => {
	const base = await mkdtemp(join(tmpdir(), "intercom-summary-cache-"));
	t.after(() => import("node:fs/promises").then(({ rm }) => rm(base, { recursive: true, force: true })));
	const root = join(base, "summaries");
	const cache = new FileSessionSummaryCache(root);
	assert.equal(await cache.write(record()), "stored");
	assert.equal(await cache.write(record({ createdAt: "2026-08-05T13:00:00.000Z" })), "same-turn-retained");
	const [directoryName] = await readdir(root);
	assert.match(directoryName, /^[a-f0-9]{64}$/);
	const directory = join(root, directoryName);
	const [filename] = await readdir(directory);
	assert.match(filename, /^\d{16}\.json$/);
	assert.equal((await stat(root)).mode & 0o777, 0o700);
	assert.equal((await stat(directory)).mode & 0o777, 0o700);
	assert.equal((await stat(join(directory, filename))).mode & 0o777, 0o600);
	const raw = await readFile(join(directory, filename), "utf8");
	assert.equal(raw.includes("stable-pi-session-id"), true);
	assert.equal(raw.includes("evidenceIds"), false);
	assert.equal(raw.includes('"createdAt": "2026-08-05T12:00:00.000Z"'), true);
	assert.deepEqual(await cache.read("stable-pi-session-id"), record());
	assert.equal(await cache.read("other-session"), undefined);
});

test("retains the newest session turn across sequential and concurrent writes", async (t) => {
	const base = await mkdtemp(join(tmpdir(), "intercom-summary-cache-order-"));
	t.after(() => import("node:fs/promises").then(({ rm }) => rm(base, { recursive: true, force: true })));
	const root = join(base, "summaries");
	const cache = new FileSessionSummaryCache(root);
	const older = record({
		createdAt: "2026-08-05T13:00:00.000Z",
		lastTurnAtSummary: "2026-08-04T12:00:00.000Z",
	});
	const newer = record({
		createdAt: "2026-08-05T14:00:00.000Z",
		lastTurnAtSummary: "2026-08-05T12:00:00.000Z",
	});
	assert.equal(await cache.write(newer), "stored");
	assert.equal(await cache.write(older), "superseded");
	assert.deepEqual(await cache.read(older.sessionId), newer);
	let [directoryName] = await readdir(root);
	assert.equal((await readdir(join(root, directoryName))).length, 1);

	await rm(root, { recursive: true });
	await Promise.all([cache.write(older), cache.write(newer)]);
	assert.deepEqual(await cache.read(older.sessionId), newer);
	[directoryName] = await readdir(root);
	assert.equal((await readdir(join(root, directoryName))).length, 1);

	const firstSameTurn = record({
		createdAt: "2026-08-06T13:00:00.000Z",
		lastTurnAtSummary: "2026-08-06T12:00:00.000Z",
		card: { ...record().card, title: "First same-turn process" },
	});
	const secondSameTurn = record({
		createdAt: "2026-08-06T14:00:00.000Z",
		lastTurnAtSummary: "2026-08-06T12:00:00.000Z",
		card: { ...record().card, title: "Second same-turn process" },
	});
	const writer = join(base, "cache-writer.mjs");
	await writeFile(writer, `
		import { FileSessionSummaryCache } from ${JSON.stringify(new URL("./summary-cache.ts", import.meta.url).href)};
		const cache = new FileSessionSummaryCache(process.argv[2]);
		const input = JSON.parse(process.argv[3]);
		const result = await cache.write(input);
		process.stdout.write(JSON.stringify({ result, title: input.card.title }));
	`);
	const writes = await Promise.all([firstSameTurn, secondSameTurn].map(async (input) => {
		const { stdout } = await execFileAsync(process.execPath, [writer, root, JSON.stringify(input)]);
		return JSON.parse(stdout);
	}));
	assert.deepEqual(writes.map((item) => item.result).sort(), ["same-turn-retained", "stored"]);
	const stored = writes.find((item) => item.result === "stored");
	assert.equal((await cache.read(older.sessionId)).card.title, stored.title);
	assert.equal((await readdir(join(root, directoryName))).filter((name) => name.endsWith(".json")).length, 1);
});

test("prunes interrupted published versions before rejecting a stale write", async (t) => {
	const base = await mkdtemp(join(tmpdir(), "intercom-summary-cache-interrupted-"));
	t.after(() => import("node:fs/promises").then(({ rm }) => rm(base, { recursive: true, force: true })));
	const root = join(base, "summaries");
	const cache = new FileSessionSummaryCache(root);
	await cache.write(record());
	const [directoryName] = await readdir(root);
	const directory = join(root, directoryName);
	const interrupted = ["2026-08-05T12:00:00.000Z", "2026-08-06T12:00:00.000Z", "2026-08-07T12:00:00.000Z"].map((lastTurnAtSummary, index) => record({
		createdAt: `2026-08-0${index + 6}T13:00:00.000Z`,
		lastTurnAtSummary,
	}));
	for (const item of interrupted) {
		const filename = `${String(Date.parse(item.lastTurnAtSummary)).padStart(16, "0")}.json`;
		await writeFile(join(directory, filename), `${JSON.stringify(item)}\n`, { mode: 0o600 });
	}
	const publishedFilename = `${String(Date.parse(interrupted.at(-1).lastTurnAtSummary)).padStart(16, "0")}.json`;
	const unpublishedFilename = `${String(Date.parse("2026-08-08T12:00:00.000Z")).padStart(16, "0")}.json`;
	const interruptedTemps = [
		join(directory, `.${publishedFilename}.00000000-0000-4000-8000-000000000001.tmp`),
		join(directory, `.${unpublishedFilename}.00000000-0000-4000-8000-000000000002.tmp`),
	];
	for (const path of interruptedTemps) {
		await writeFile(path, "interrupted temp", { mode: 0o600 });
		await utimes(path, new Date(Date.now() - 60 * 60 * 1_000), new Date(Date.now() - 60 * 60 * 1_000));
	}
	assert.equal((await readdir(directory)).filter((name) => name.endsWith(".json")).length, 4);
	assert.equal((await readdir(directory)).filter((name) => name.endsWith(".tmp")).length, 2);
	assert.deepEqual(await cache.read(record().sessionId), interrupted.at(-1));
	assert.equal((await readdir(directory)).filter((name) => name.endsWith(".json")).length, 1);
	assert.equal((await readdir(directory)).filter((name) => name.endsWith(".tmp")).length, 0);
	assert.equal(await cache.write(record({ lastTurnAtSummary: "2026-08-06T18:00:00.000Z" })), "superseded");
	assert.equal((await readdir(directory)).filter((name) => name.endsWith(".json")).length, 1);
});

test("isolates lookup from unrelated cached sessions", async (t) => {
	const base = await mkdtemp(join(tmpdir(), "intercom-summary-cache-scale-"));
	t.after(() => import("node:fs/promises").then(({ rm }) => rm(base, { recursive: true, force: true })));
	const root = join(base, "summaries");
	const cache = new FileSessionSummaryCache(root);
	const target = record();
	await cache.write(target);
	await Promise.all(Array.from({ length: 32 }, (_, index) => cache.write(record({ sessionId: `unrelated-${index}` }))));
	const directories = await readdir(root, { withFileTypes: true });
	assert.equal(directories.length, 33);
	assert.equal(directories.every((entry) => entry.isDirectory() && /^[a-f0-9]{64}$/u.test(entry.name)), true);
	assert.deepEqual(await cache.read(target.sessionId), target);
});

test("rejects malformed records and does not follow cache-file symlinks", async (t) => {
	assert.throws(() => parseSessionSummaryCacheRecord(record({ lastTurnAtSummary: "not-a-date" })), /canonical ISO timestamp/);
	assert.throws(() => parseSessionSummaryCacheRecord(record({ card: { ...record().card, evidenceIds: ["E1"] } })), /card is invalid/);
	assert.throws(() => parseSessionSummaryCacheRecord(record({ card: { ...record().card, safeToClose: "yes", state: "blocked" } })), /Only a complete session/);

	const base = await mkdtemp(join(tmpdir(), "intercom-summary-cache-link-"));
	t.after(() => import("node:fs/promises").then(({ rm }) => rm(base, { recursive: true, force: true })));
	const root = join(base, "summaries");
	const cache = new FileSessionSummaryCache(root);
	await cache.write(record());
	const [directoryName] = await readdir(root);
	const directory = join(root, directoryName);
	const [filename] = await readdir(directory);
	const target = join(base, "target.json");
	await writeFile(target, `${JSON.stringify(record())}\n`);
	await rm(join(directory, filename));
	await symlink(target, join(directory, filename));
	await assert.rejects(cache.read("stable-pi-session-id"));

	await rm(join(directory, filename));
	await execFileAsync("mkfifo", [join(directory, filename)]);
	await assert.rejects(
		Promise.race([
			cache.read("stable-pi-session-id"),
			new Promise((_, reject) => setTimeout(() => reject(new Error("FIFO cache read blocked")), 1_000)),
		]),
		/private current-user regular file/,
	);

	await rm(directory, { recursive: true });
	await symlink(base, directory);
	await assert.rejects(cache.read("stable-pi-session-id"), /session is not a private current-user real directory/);
});
