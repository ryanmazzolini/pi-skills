import assert from "node:assert/strict";
import {
	appendFileSync,
	mkdtempSync,
	readFileSync,
	renameSync,
	symlinkSync,
	truncateSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openSessionTail, SESSION_TAIL_LIMITS } from "./session-tail.ts";

const SESSION_ID = "session-test";
const TS = "2026-01-01T00:00:00.000Z";

function header(overrides = {}) {
	return { type: "session", version: 3, id: SESSION_ID, timestamp: TS, cwd: "/safe", ...overrides };
}

function entry(type, id, parentId, fields = {}) {
	return { type, id, parentId, timestamp: TS, ...fields };
}

function user(id, parentId, content) {
	return entry("message", id, parentId, { message: { role: "user", content, timestamp: 1 } });
}

function assistant(id, parentId, content, stopReason = "stop") {
	return entry("message", id, parentId, {
		message: { role: "assistant", content, stopReason, timestamp: 1 },
	});
}

function toolResult(id, parentId, toolCallId, toolName, isError, output = "private-output") {
	return entry("message", id, parentId, {
		message: {
			role: "toolResult",
			toolCallId,
			toolName,
			content: [{ type: "text", text: output }],
			isError,
			timestamp: 1,
		},
	});
}

function bashExecution(id, parentId, fields = {}) {
	return entry("message", id, parentId, {
		message: {
			role: "bashExecution",
			command: "private-command",
			output: "private-output",
			exitCode: 0,
			cancelled: false,
			truncated: false,
			timestamp: 1,
			...fields,
		},
	});
}

function toolCall(id, name, argumentsValue = {}) {
	return { type: "toolCall", id, name, arguments: argumentsValue };
}

function makeDirectory(t, prefix = "session-tail-") {
	const directory = mkdtempSync(join(tmpdir(), prefix));
	t.after(() => import("node:fs").then(({ rmSync }) => rmSync(directory, { recursive: true, force: true })));
	return directory;
}

function writeRecords(t, records, options = {}) {
	const directory = makeDirectory(t, options.prefix);
	const path = join(directory, options.name ?? "session.jsonl");
	const complete = records.map((record) => JSON.stringify(record)).join("\n") + "\n";
	writeFileSync(path, options.fragment === undefined ? complete : complete + options.fragment);
	return path;
}

function writeRaw(t, contents, name = "session.jsonl") {
	const directory = makeDirectory(t);
	const path = join(directory, name);
	writeFileSync(path, contents);
	return path;
}

function open(path, activeLeafId, limit = 32, overrides = {}) {
	return openSessionTail({
		piSessionId: SESSION_ID,
		fileLocator: path,
		activeLeafId,
		limit,
		...overrides,
	});
}

function withHandle(handle, callback) {
	try {
		return callback(handle);
	} finally {
		handle.close();
	}
}

function assertStaticSafeError(callback, sentinels = []) {
	assert.throws(callback, (error) => {
		assert.ok(error instanceof Error);
		assert.ok([
			"Session tail input is invalid",
			"Session file is unsafe",
			"Session file changed while its snapshot was open",
			"Session file is malformed",
			"Session file format is unsupported",
			"Session file exceeds safety limits",
			"Session file does not match the advertised snapshot",
			"Session tail handle is closed",
		].includes(error.message), `unexpected non-static error: ${error.message}`);
		for (const sentinel of sentinels) assert.equal(error.message.includes(sentinel), false);
		return true;
	});
}

test("projects only privacy-safe text and completed outcome events", (t) => {
	const secret = "PRIVACY_SENTINEL_NEVER_PROJECT";
	const records = [
		header(),
		user("u1", null, [
			{ type: "text", text: "hello" },
			{ type: "image", data: secret, mimeType: `image/${secret}` },
		]),
		assistant("a1", "u1", [
			{ type: "thinking", thinking: secret },
			{ type: "text", text: "working" },
			toolCall("call-safe", "read", { path: secret, nested: { value: secret } }),
		], "toolUse"),
		toolResult("r1", "a1", "call-safe", "read", false, secret),
		entry("custom", "c1", "r1", { customType: "private-state", data: { secret } }),
		entry("custom_message", "cm1", "c1", { customType: "private-message", content: secret, display: true, details: { secret } }),
		entry("compaction", "co1", "cm1", { summary: secret, firstKeptEntryId: "u1", tokensBefore: 10, details: { secret } }),
		entry("branch_summary", "bs1", "co1", { fromId: "r1", summary: secret, details: { secret } }),
		assistant("bad-a", "bs1", [
			{ type: "text", text: secret },
			toolCall("bad-call", "write", { content: secret }),
		], "aborted"),
		toolResult("bad-r", "bad-a", "bad-call", "write", false, secret),
		bashExecution("b1", "bad-r", { command: secret, output: secret, fullOutputPath: secret }),
		user("u2", "b1", "done"),
	];
	const path = writeRecords(t, records);
	withHandle(open(path, "u2"), (handle) => {
		assert.deepEqual(handle.snapshot.events, [
			{ kind: "user", text: "hello" },
			{ kind: "assistant", text: "working" },
			{ kind: "tool", name: "read", outcome: "succeeded" },
			{ kind: "bash", outcome: "succeeded" },
			{ kind: "user", text: "done" },
		]);
		assert.equal(JSON.stringify(handle.snapshot).includes(secret), false);
		assert.deepEqual(handle.snapshot.counts, {
			scannedEntries: records.length - 1,
			branchEntries: records.length - 1,
			eligibleTextEvents: 3,
			returnedTextEvents: 3,
			toolEvents: 1,
			bashEvents: 1,
		});
		assert.equal(handle.snapshot.truncated, false);
		handle.verifyStable();
	});
});

test("follows only the advertised older leaf and supports a null root", (t) => {
	const records = [
		header(),
		user("root", null, "root text"),
		assistant("common", "root", [{ type: "text", text: "common text" }]),
		user("old-leaf", "common", "old branch"),
		assistant("old-end", "old-leaf", [{ type: "text", text: "old end" }]),
		user("new-leaf", "common", "active-at-write-time"),
	];
	const path = writeRecords(t, records);
	withHandle(open(path, "old-end"), (handle) => {
		assert.deepEqual(handle.snapshot.events, [
			{ kind: "user", text: "root text" },
			{ kind: "assistant", text: "common text" },
			{ kind: "user", text: "old branch" },
			{ kind: "assistant", text: "old end" },
		]);
		assert.equal(JSON.stringify(handle.snapshot).includes("active-at-write-time"), false);
		assert.equal(handle.snapshot.counts.scannedEntries, 5);
		assert.equal(handle.snapshot.counts.branchEntries, 4);
	});
	withHandle(open(path, null), (handle) => {
		assert.deepEqual(handle.snapshot.events, []);
		assert.deepEqual(handle.snapshot.counts, {
			scannedEntries: 5,
			branchEntries: 0,
			eligibleTextEvents: 0,
			returnedTextEvents: 0,
			toolEvents: 0,
			bashEvents: 0,
		});
	});
});

test("pairs only matching completed tools and maps completed user Bash outcomes", (t) => {
	const records = [header(), user("anchor", null, "anchor")];
	let parent = "anchor";
	for (const specification of [
		{ id: "ok", callName: "read", resultName: "read", isError: false, stopReason: "toolUse" },
		{ id: "fail", callName: "write", resultName: "write", isError: true, stopReason: "toolUse" },
		{ id: "mismatch", callName: "edit", resultName: "bash", isError: false, stopReason: "toolUse" },
		{ id: "aborted", callName: "read", resultName: "read", isError: false, stopReason: "error" },
	]) {
		const assistantId = `a-${specification.id}`;
		const resultId = `r-${specification.id}`;
		records.push(assistant(assistantId, parent, [toolCall(`call-${specification.id}`, specification.callName)], specification.stopReason));
		records.push(toolResult(resultId, assistantId, `call-${specification.id}`, specification.resultName, specification.isError));
		parent = resultId;
	}
	records.push(assistant("a-incomplete", parent, [toolCall("call-incomplete", "read")], "toolUse"));
	records.push(bashExecution("bash-ok", "a-incomplete", { exitCode: 0 }));
	records.push(bashExecution("bash-fail", "bash-ok", { exitCode: 9 }));
	records.push(bashExecution("bash-cancel", "bash-fail", { exitCode: undefined, cancelled: true }));
	records.push(bashExecution("bash-incomplete", "bash-cancel", { exitCode: undefined, cancelled: false }));
	const path = writeRecords(t, records);
	withHandle(open(path, "bash-incomplete"), (handle) => {
		assert.deepEqual(handle.snapshot.events, [
			{ kind: "user", text: "anchor" },
			{ kind: "tool", name: "read", outcome: "succeeded" },
			{ kind: "tool", name: "write", outcome: "failed" },
			{ kind: "bash", outcome: "succeeded" },
			{ kind: "bash", outcome: "failed" },
			{ kind: "bash", outcome: "cancelled" },
		]);
		assert.equal(handle.snapshot.counts.toolEvents, 2);
		assert.equal(handle.snapshot.counts.bashEvents, 3);
	});
});

test("projects completed outcomes even when the active branch has no text", (t) => {
	const records = [
		header(),
		assistant("tool-only", null, [toolCall("call-only", "read")], "toolUse"),
		toolResult("result-only", "tool-only", "call-only", "read", false),
		bashExecution("bash-only", "result-only", { exitCode: 3 }),
	];
	const path = writeRecords(t, records);
	withHandle(open(path, "bash-only", 8), (handle) => {
		assert.deepEqual(handle.snapshot.events, [
			{ kind: "tool", name: "read", outcome: "succeeded" },
			{ kind: "bash", outcome: "failed" },
		]);
		assert.equal(handle.snapshot.counts.eligibleTextEvents, 0);
		assert.equal(handle.snapshot.counts.returnedTextEvents, 0);
	});
});

test("the text limit selects latest text while retaining every later outcome", (t) => {
	const records = [
		header(),
		user("u0", null, "too old"),
		assistant("old-call", "u0", [toolCall("old", "read")], "toolUse"),
		toolResult("old-result", "old-call", "old", "read", false),
		user("u1", "old-result", "earliest returned"),
		assistant("new-call", "u1", [toolCall("new", "write")], "toolUse"),
		toolResult("new-result", "new-call", "new", "write", true),
		bashExecution("b1", "new-result", { exitCode: 0 }),
		bashExecution("b2", "b1", { exitCode: 1 }),
		assistant("a2", "b2", [{ type: "text", text: "latest" }]),
	];
	const path = writeRecords(t, records);
	withHandle(open(path, "a2", 2), (handle) => {
		assert.deepEqual(handle.snapshot.events, [
			{ kind: "user", text: "earliest returned" },
			{ kind: "tool", name: "write", outcome: "failed" },
			{ kind: "bash", outcome: "succeeded" },
			{ kind: "bash", outcome: "failed" },
			{ kind: "assistant", text: "latest" },
		]);
		assert.equal(handle.snapshot.counts.eligibleTextEvents, 3);
		assert.equal(handle.snapshot.counts.returnedTextEvents, 2);
		assert.equal(handle.snapshot.truncated, true);
	});
});

test("returns the latest default eight and maximum thirty-two text events", (t) => {
	const records = [header()];
	let parent = null;
	for (let index = 0; index < 40; index++) {
		const id = `text-${index}`;
		records.push(user(id, parent, `message-${index}`));
		parent = id;
	}
	const path = writeRecords(t, records);
	withHandle(open(path, parent, 8), (handle) => {
		assert.equal(handle.snapshot.counts.returnedTextEvents, 8);
		assert.deepEqual(handle.snapshot.events.map((event) => event.text), Array.from({ length: 8 }, (_, index) => `message-${index + 32}`));
	});
	withHandle(open(path, parent, 32), (handle) => {
		assert.equal(handle.snapshot.counts.returnedTextEvents, 32);
		assert.deepEqual(handle.snapshot.events.map((event) => event.text), Array.from({ length: 32 }, (_, index) => `message-${index + 8}`));
	});
});

test("accepts exact v2 and v3 headers without migration", (t) => {
	for (const version of [2, 3]) {
		const extra = version === 2
			? [entry("message", "legacy", "u", { message: { role: "hookMessage", content: "private" } })]
			: [];
		const records = [header({ version }), user("u", null, `v${version}`), ...extra];
		const leaf = version === 2 ? "legacy" : "u";
		const path = writeRecords(t, records, { name: `v${version}.jsonl` });
		withHandle(open(path, leaf), (handle) => assert.deepEqual(handle.snapshot.events, [{ kind: "user", text: `v${version}` }]));
	}
});

test("rejects malformed, blank, unsupported, mismatched, duplicate, cyclic, and orphaned input", (t) => {
	const malformedSentinel = "MALFORMED_SOURCE_SENTINEL";
	const cases = [
		{
			name: "malformed JSON",
			contents: `${JSON.stringify(header())}\n{${malformedSentinel}\n`,
			leaf: "x",
		},
		{
			name: "blank line",
			contents: `${JSON.stringify(header())}\n\n`,
			leaf: null,
		},
		{
			name: "unsupported version",
			records: [header({ version: 1 })],
			leaf: null,
		},
		{
			name: "wrong header id",
			records: [header({ id: "other-session" })],
			leaf: null,
		},
		{
			name: "malformed header",
			records: [{ type: "not-session", version: 3, id: SESSION_ID, timestamp: TS, cwd: "/safe" }],
			leaf: null,
		},
		{
			name: "unknown entry",
			records: [header(), entry("future_entry", "x", null)],
			leaf: "x",
		},
		{
			name: "unknown message role",
			records: [header(), entry("message", "x", null, { message: { role: "future", content: "private" } })],
			leaf: "x",
		},
		{
			name: "missing parent",
			records: [header(), user("x", "absent", "private")],
			leaf: "x",
		},
		{
			name: "forward parent",
			records: [header(), user("child", "later-parent", "private"), user("later-parent", null, "private")],
			leaf: "child",
		},
		{
			name: "duplicate id",
			records: [header(), user("same", null, "first"), user("same", null, "second")],
			leaf: "same",
		},
		{
			name: "cycle",
			records: [header(), user("x", "y", "first"), user("y", "x", "second")],
			leaf: "x",
		},
		{
			name: "missing advertised leaf",
			records: [header(), user("x", null, "private")],
			leaf: "absent-leaf",
		},
	];

	for (const fixture of cases) {
		const path = fixture.contents === undefined
			? writeRecords(t, fixture.records, { name: `${fixture.name.replaceAll(" ", "-")}.jsonl` })
			: writeRaw(t, fixture.contents, `${fixture.name.replaceAll(" ", "-")}.jsonl`);
		assertStaticSafeError(() => open(path, fixture.leaf), [malformedSentinel, path]);
	}
});

test("uses fatal UTF-8 and ignores only one bounded unterminated final fragment", (t) => {
	const path = writeRecords(t, [header(), user("u", null, "complete")], { fragment: "UNTERMINATED_PRIVATE_FRAGMENT" });
	withHandle(open(path, "u"), (handle) => {
		assert.deepEqual(handle.snapshot.events, [{ kind: "user", text: "complete" }]);
		assert.equal(handle.snapshot.ignoredFinalFragment, true);
		assert.equal(JSON.stringify(handle.snapshot).includes("UNTERMINATED_PRIVATE_FRAGMENT"), false);
	});

	const invalidPath = join(makeDirectory(t), "invalid.jsonl");
	writeFileSync(invalidPath, Buffer.concat([
		Buffer.from(`${JSON.stringify(header())}\n`, "utf8"),
		Buffer.from([0xff, 0x0a]),
	]));
	assertStaticSafeError(() => open(invalidPath, null), [invalidPath]);

	const finalPath = writeRecords(t, [header()], { fragment: "x".repeat(SESSION_TAIL_LIMITS.lineBytes + 1) });
	assertStaticSafeError(() => open(finalPath, null), [finalPath]);
});

test("enforces independent locator, line, retained-byte, entry, scan, event, and text limits", (t) => {
	assertStaticSafeError(() => openSessionTail({
		piSessionId: SESSION_ID,
		fileLocator: `/${"x".repeat(SESSION_TAIL_LIMITS.locatorBytes + 1)}`,
		activeLeafId: null,
		limit: 1,
	}));
	for (const limit of [0, SESSION_TAIL_LIMITS.textEvents + 1]) {
		assertStaticSafeError(() => openSessionTail({ piSessionId: SESSION_ID, fileLocator: "/tmp/unused", activeLeafId: null, limit }));
	}

	const longLinePath = writeRecords(t, [
		header(),
		user("long", null, "x".repeat(SESSION_TAIL_LIMITS.lineBytes)),
	]);
	assertStaticSafeError(() => open(longLinePath, "long"), [longLinePath]);

	const retainedRecords = [header()];
	let retainedParent = null;
	const retainedTextBytes = Math.floor(SESSION_TAIL_LIMITS.lineBytes / 3);
	for (let index = 0; index < Math.ceil(SESSION_TAIL_LIMITS.retainedBytes / retainedTextBytes) + 1; index++) {
		const id = `retained-${index}`;
		retainedRecords.push(user(id, retainedParent, "r".repeat(retainedTextBytes)));
		retainedParent = id;
	}
	const retainedPath = writeRecords(t, retainedRecords);
	assertStaticSafeError(() => open(retainedPath, retainedParent), [retainedPath]);

	const entryRecords = [header()];
	for (let index = 0; index < SESSION_TAIL_LIMITS.entries + 1; index++) {
		entryRecords.push(entry("custom", `entry-${index}`, null, { customType: "bound" }));
	}
	const entryPath = writeRecords(t, entryRecords);
	assertStaticSafeError(() => open(entryPath, null), [entryPath]);

	const scanDirectory = makeDirectory(t);
	const scanPath = join(scanDirectory, "scan.jsonl");
	const scanChunk = `${JSON.stringify(header())}\n`;
	writeFileSync(scanPath, scanChunk + "s".repeat(SESSION_TAIL_LIMITS.scanBytes - Buffer.byteLength(scanChunk) + 1));
	assertStaticSafeError(() => open(scanPath, null), [scanPath]);

	const eventRecords = [header(), user("event-anchor", null, "anchor")];
	let eventParent = "event-anchor";
	for (let index = 0; index < SESSION_TAIL_LIMITS.events; index++) {
		const id = `bash-${index}`;
		eventRecords.push(bashExecution(id, eventParent));
		eventParent = id;
	}
	const eventPath = writeRecords(t, eventRecords);
	assertStaticSafeError(() => open(eventPath, eventParent), [eventPath]);
});

test("rejects symlinks and non-files without exposing the locator", (t) => {
	const directory = makeDirectory(t, "session-tail-private-locator-");
	const target = join(directory, "target-private.jsonl");
	const link = join(directory, "link-private.jsonl");
	writeFileSync(target, `${JSON.stringify(header())}\n`);
	symlinkSync(target, link);
	assertStaticSafeError(() => open(link, null), [directory, link]);
	assertStaticSafeError(() => open(directory, null), [directory]);
});

test("detects post-open append and path replacement", (t) => {
	const appendPath = writeRecords(t, [header(), user("u", null, "stable")], { name: "append.jsonl" });
	const appended = open(appendPath, "u");
	try {
		appended.verifyStable();
		appendFileSync(appendPath, `${JSON.stringify(user("later", "u", "not advertised"))}\n`);
		assertStaticSafeError(() => appended.verifyStable(), [appendPath, "not advertised"]);
	} finally {
		appended.close();
	}

	const replacementPath = writeRecords(t, [header(), user("u", null, "stable")], { name: "replacement.jsonl" });
	const originalContents = `${JSON.stringify(header())}\n${JSON.stringify(user("u", null, "stable"))}\n`;
	const replaced = open(replacementPath, "u");
	try {
		renameSync(replacementPath, `${replacementPath}.old`);
		writeFileSync(replacementPath, originalContents);
		assertStaticSafeError(() => replaced.verifyStable(), [replacementPath]);
	} finally {
		replaced.close();
	}
	assertStaticSafeError(() => replaced.verifyStable(), [replacementPath]);

	const shrinkPath = writeRecords(t, [header(), user("u", null, "stable")], { name: "shrink.jsonl" });
	const shrunk = open(shrinkPath, "u");
	try {
		truncateSync(shrinkPath, 1);
		assertStaticSafeError(() => shrunk.verifyStable(), [shrinkPath]);
	} finally {
		shrunk.close();
	}

	const rewritePath = writeRecords(t, [header(), user("u", null, "stable")], { name: "rewrite.jsonl" });
	const rewritten = open(rewritePath, "u");
	try {
		const contents = readFileSync(rewritePath);
		writeFileSync(rewritePath, contents);
		assertStaticSafeError(() => rewritten.verifyStable(), [rewritePath]);
	} finally {
		rewritten.close();
	}
});
