import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PiSessionPresenceTracker } from "./presence.ts";

function fixture(t) {
	const base = fs.mkdtempSync(path.join(os.tmpdir(), "intercom-presence-"));
	t.after(() => fs.rmSync(base, { recursive: true, force: true }));
	const file = path.join(base, "session.jsonl");
	let leaf = "leaf-a";
	const source = {
		getSessionId: () => "pi-session",
		getSessionFile: () => file,
		getLeafId: () => leaf,
	};
	return { base, file, source, setLeaf: (value) => { leaf = value; } };
}

test("presence tracks only a readable current-user regular session snapshot", (t) => {
	const f = fixture(t);
	const tracker = new PiSessionPresenceTracker();
	assert.deepEqual(tracker.refresh(f.source), { changed: false });
	fs.writeFileSync(f.file, '{"type":"session"}\n');
	const first = tracker.refresh(f.source);
	assert.equal(first.changed, true);
	assert.deepEqual(first.presence, {
		sessionId: "pi-session",
		fileLocator: fs.realpathSync(f.file),
		activeLeafId: "leaf-a",
		revision: 1,
	});
	assert.equal(tracker.refresh(f.source).changed, false);
	f.setLeaf(null);
	assert.equal(tracker.refresh(f.source).presence.revision, 2);
	fs.appendFileSync(f.file, '{"type":"message"}\n');
	assert.equal(tracker.refresh(f.source).presence.revision, 3);
});

test("presence clears unavailable and symlinked session files", (t) => {
	const f = fixture(t);
	fs.writeFileSync(f.file, '{"type":"session"}\n');
	const tracker = new PiSessionPresenceTracker();
	assert.equal(tracker.refresh(f.source).changed, true);
	fs.rmSync(f.file);
	assert.deepEqual(tracker.refresh(f.source), { changed: true });
	assert.deepEqual(tracker.refresh(f.source), { changed: false });
	const target = path.join(f.base, "target.jsonl");
	fs.writeFileSync(target, '{"type":"session"}\n');
	fs.symlinkSync(target, f.file);
	assert.deepEqual(tracker.refresh(f.source), { changed: false });
});
