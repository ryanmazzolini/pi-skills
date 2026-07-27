import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { lastConversationalTimestamp, PiSessionPresenceTracker } from "./presence.ts";

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

test("derives the latest completed conversational timestamp from the active branch", () => {
	const branch = [
		{ type: "message", id: "user", parentId: null, timestamp: "2026-01-01T00:00:01.000Z", message: { role: "user", content: "question" } },
		{ type: "message", id: "failed", parentId: "user", timestamp: "2026-01-01T00:00:02.000Z", message: { role: "assistant", content: [{ type: "text", text: "failed" }], stopReason: "error" } },
		{ type: "message", id: "tool", parentId: "failed", timestamp: "2026-01-01T00:00:03.000Z", message: { role: "toolResult", content: [] } },
		{ type: "message", id: "assistant", parentId: "tool", timestamp: "2026-01-01T00:00:04.000Z", message: { role: "assistant", content: [{ type: "text", text: "answer" }], stopReason: "stop" } },
	];
	assert.equal(lastConversationalTimestamp({ getBranch: () => branch }), Date.parse("2026-01-01T00:00:04.000Z"));
	assert.equal(lastConversationalTimestamp({ getBranch: () => branch.slice(0, 3) }), Date.parse("2026-01-01T00:00:01.000Z"));
	const nonmonotonic = [
		{ ...branch[0], timestamp: "2026-01-01T00:00:05.000Z" },
		{ ...branch[3], timestamp: "2026-01-01T00:00:04.000Z" },
	];
	assert.equal(lastConversationalTimestamp({ getBranch: () => nonmonotonic }), Date.parse("2026-01-01T00:00:05.000Z"));
	assert.equal(lastConversationalTimestamp({ getBranch: () => [{ ...branch[0], timestamp: "2026-01-01T00:00:01Z" }] }), null);
	const bounded = Array.from({ length: 9 }, (_, index) => ({
		...branch[0],
		id: `bounded-${index}`,
		timestamp: index === 0 ? "not-a-timestamp" : `2026-01-01T00:00:0${index}.000Z`,
	}));
	assert.equal(lastConversationalTimestamp({ getBranch: () => bounded }), Date.parse("2026-01-01T00:00:08.000Z"));
	assert.equal(lastConversationalTimestamp({ getBranch: () => [] }), null);
});

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
