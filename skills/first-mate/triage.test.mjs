import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const triage = readFileSync(new URL("./references/triage.md", import.meta.url), "utf8");

test("triage uses the streaming tail reader default within a bounded page", () => {
	assert.match(triage, /internal pages of at most 2 peers/);
	assert.match(triage, /Tail each peer by full ID with `limit: 8` and `tailProjectionBytes: 4096`/);
	assert.doesNotMatch(triage, /tailScanBytes:\s*\d/);
	assert.match(triage, /1 GiB local scan ceiling and 8 KiB model projection ceiling/);
});
