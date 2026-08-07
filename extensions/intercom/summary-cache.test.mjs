import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
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
	await cache.write(record());
	await cache.write(record({ createdAt: "2026-08-05T13:00:00.000Z" }));
	const entries = await readdir(root);
	assert.equal(entries.length, 1);
	assert.match(entries[0], /^[a-f0-9]{64}\.json$/);
	assert.equal((await stat(root)).mode & 0o777, 0o700);
	assert.equal((await stat(join(root, entries[0]))).mode & 0o777, 0o600);
	const raw = await readFile(join(root, entries[0]), "utf8");
	assert.equal(raw.includes("stable-pi-session-id"), true);
	assert.equal(raw.includes("evidenceIds"), false);
	assert.equal(raw.includes('"createdAt": "2026-08-05T13:00:00.000Z"'), true);
	assert.deepEqual(await cache.read("stable-pi-session-id"), record({ createdAt: "2026-08-05T13:00:00.000Z" }));
	assert.equal(await cache.read("other-session"), undefined);
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
	const [filename] = await readdir(root);
	const target = join(base, "target.json");
	await writeFile(target, `${JSON.stringify(record())}\n`);
	await rm(join(root, filename));
	await symlink(target, join(root, filename));
	await assert.rejects(cache.read("stable-pi-session-id"));

	await rm(join(root, filename));
	await execFileAsync("mkfifo", [join(root, filename)]);
	await assert.rejects(
		Promise.race([
			cache.read("stable-pi-session-id"),
			new Promise((_, reject) => setTimeout(() => reject(new Error("FIFO cache read blocked")), 1_000)),
		]),
		/private current-user regular file/,
	);
});
