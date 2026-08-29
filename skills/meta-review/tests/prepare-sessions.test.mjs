import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PrepareSessionsError, prepareSessions } from "../scripts/prepare-sessions.mjs";

const SCRIPT_PATH = fileURLToPath(new URL("../scripts/prepare-sessions.mjs", import.meta.url));
const NOW = "2026-08-28T12:00:00.000Z";

function fixture(t) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "meta-review-sessions-")));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const home = path.join(base, "home");
  const personalRoot = path.join(base, "personal");
  const workRoot = path.join(base, "personal-work");
  const personalVault = path.join(base, "personal-vault");
  const workVault = path.join(base, "work-vault");
  const sessionDir = path.join(base, "sessions");
  for (const directory of [home, personalRoot, workRoot, personalVault, workVault, sessionDir]) {
    fs.mkdirSync(directory, { recursive: true });
  }
  const configPath = path.join(base, "workflows.json");
  fs.writeFileSync(configPath, `${JSON.stringify({
    version: 1,
    profiles: {
      personal: { vault: personalVault, gitRoots: [personalRoot] },
      work: { vault: workVault, gitRoots: [workRoot] },
    },
  }, null, 2)}\n`);
  let outputIndex = 0;
  return {
    base,
    home,
    personalRoot,
    workRoot,
    personalVault,
    workVault,
    sessionDir,
    configPath,
    output() {
      const directory = path.join(base, `output-${outputIndex++}`);
      fs.mkdirSync(directory);
      return directory;
    },
    options(overrides = {}) {
      return {
        profileName: "personal",
        configPath,
        sessionDir,
        home,
        env: {},
        now: NOW,
        outputDir: this.output(),
        ...overrides,
      };
    },
  };
}

function encodedDirectory(sessionDir, cwd) {
  const name = `--${path.resolve(cwd).split(path.sep).filter(Boolean).join("-")}--`;
  const directory = path.join(sessionDir, name);
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

function user(id, parentId, timestamp, text) {
  return {
    type: "message",
    id,
    parentId,
    timestamp,
    message: { role: "user", content: [{ type: "text", text }], timestamp: Date.parse(timestamp) },
  };
}

function assistant(id, parentId, timestamp, content) {
  return {
    type: "message",
    id,
    parentId,
    timestamp,
    message: {
      role: "assistant",
      content,
      provider: "test",
      model: "test",
      usage: {},
      stopReason: "stop",
      timestamp: Date.parse(timestamp),
    },
  };
}

function ordinaryConversation(prefix, timestamp) {
  return [
    user(`${prefix}01`, null, timestamp, `${prefix} request one`),
    assistant(`${prefix}02`, `${prefix}01`, timestamp, [{ type: "text", text: `${prefix} response one` }]),
    user(`${prefix}03`, `${prefix}02`, timestamp, `${prefix} request two`),
    assistant(`${prefix}04`, `${prefix}03`, timestamp, [{ type: "text", text: `${prefix} response two` }]),
  ];
}

function writeSession({ sessionDir, cwd, id, timestamp, entries, modifiedAt = timestamp }) {
  const directory = encodedDirectory(sessionDir, cwd);
  const file = path.join(directory, `${timestamp.replaceAll(":", "-")}_${id}.jsonl`);
  const records = [{ type: "session", version: 3, id, timestamp, cwd }, ...entries];
  fs.writeFileSync(file, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
  const modified = new Date(modifiedAt);
  fs.utimesSync(file, modified, modified);
  return file;
}

function readProjection(result, index = 0) {
  const file = result.manifest.sessions[index].file;
  return JSON.parse(fs.readFileSync(path.join(result.outputDir, file), "utf8"));
}

test("projects only the active branch while preserving entry IDs and excluding private payloads", (t) => {
  const f = fixture(t);
  const cwd = path.join(f.personalRoot, "repo");
  fs.mkdirSync(cwd);
  const timestamp = "2026-08-20T10:00:00.000Z";
  const sourceFile = writeSession({
    sessionDir: f.sessionDir,
    cwd,
    id: "session-active",
    timestamp,
    modifiedAt: "2026-08-26T10:00:00.000Z",
    entries: [
      user("e0000001", null, timestamp, "Initial request"),
      assistant("e0000002", "e0000001", timestamp, [
        { type: "thinking", thinking: "PRIVATE-THINKING-SENTINEL" },
        { type: "text", text: "Visible response" },
        { type: "toolCall", id: "call-1", name: "bash", arguments: { command: "PRIVATE-TOOL-SENTINEL" } },
      ]),
      {
        type: "message",
        id: "e0000003",
        parentId: "e0000002",
        timestamp,
        message: {
          role: "toolResult",
          toolCallId: "call-1",
          toolName: "bash",
          content: [{ type: "text", text: "PRIVATE-RESULT-SENTINEL" }],
          isError: false,
          timestamp: Date.parse(timestamp),
        },
      },
      user("e0000004", "e0000003", timestamp, "Abandoned request"),
      assistant("e0000005", "e0000004", timestamp, [{ type: "text", text: "Abandoned response" }]),
      user("e0000006", "e0000003", timestamp, "Active request"),
      assistant("e0000007", "e0000006", timestamp, [{ type: "text", text: "Active response" }]),
    ],
  });

  const sourceBefore = fs.readFileSync(sourceFile, "utf8");
  const sourceModifiedAt = fs.statSync(sourceFile).mtimeMs;
  const result = prepareSessions(f.options());
  assert.equal(result.manifest.sessions.length, 1);
  assert.equal(fs.readFileSync(sourceFile, "utf8"), sourceBefore);
  assert.equal(fs.statSync(sourceFile).mtimeMs, sourceModifiedAt);
  const projection = readProjection(result);
  assert.equal(projection.session.sessionId, "session-active");
  assert.equal(projection.session.leafEntryId, "e0000007");
  assert.deepEqual(projection.messages.map((message) => message.entryId), [
    "e0000001",
    "e0000002",
    "e0000006",
    "e0000007",
  ]);
  const serialized = JSON.stringify(projection);
  assert.doesNotMatch(serialized, /PRIVATE-|Abandoned/);
  assert.match(serialized, /Visible response/);
});

test("selects only recent quiescent personal sessions and excludes the current session", (t) => {
  const f = fixture(t);
  const personalCwd = path.join(f.personalRoot, "repo");
  const workCwd = path.join(f.workRoot, "repo");
  fs.mkdirSync(personalCwd);
  fs.mkdirSync(workCwd);
  const writeOrdinary = (cwd, id, modifiedAt, prefix = id) => writeSession({
    sessionDir: f.sessionDir,
    cwd,
    id,
    timestamp: modifiedAt,
    modifiedAt,
    entries: ordinaryConversation(prefix, modifiedAt),
  });
  writeOrdinary(personalCwd, "personal-newest", "2026-08-26T12:00:00.000Z");
  writeOrdinary(personalCwd, "personal-older", "2026-08-25T12:00:00.000Z");
  writeOrdinary(personalCwd, "current-session", "2026-08-24T12:00:00.000Z");
  writeOrdinary(personalCwd, "too-new", "2026-08-28T00:00:00.000Z");
  writeOrdinary(personalCwd, "too-old", "2026-07-01T12:00:00.000Z");
  writeOrdinary(workCwd, "work-session", "2026-08-27T00:00:00.000Z", "WORK-PRIVATE-SENTINEL");

  const result = prepareSessions(f.options({
    env: { PI_SESSION_ID: "current-session" },
    maxSessions: 8,
  }));
  assert.deepEqual(result.manifest.sessions.map((session) => session.sessionId), [
    "personal-newest",
    "personal-older",
  ]);
  const output = fs.readdirSync(result.outputDir)
    .map((file) => fs.readFileSync(path.join(result.outputDir, file), "utf8"))
    .join("\n");
  assert.doesNotMatch(output, /WORK-PRIVATE-SENTINEL|work-session|current-session|too-new|too-old/);
  assert.equal(result.manifest.profile, "personal");
  assert.equal(result.manifest.diagnostics.discovered, 6);
  assert.equal(result.manifest.diagnostics.wrongProfile, 1);
});

test("bounds each projection by recent message count and total serialized bytes", (t) => {
  const f = fixture(t);
  const cwd = path.join(f.personalRoot, "bounded");
  fs.mkdirSync(cwd);
  const timestamp = "2026-08-24T12:00:00.000Z";
  const escapedText = `quotes, slashes, and lines: ${"\"\\\n".repeat(400)}`;
  const entries = [
    user("b0000001", null, timestamp, "first"),
    assistant("b0000002", "b0000001", timestamp, [{ type: "text", text: "second" }]),
    user("b0000003", "b0000002", timestamp, "third"),
    assistant("b0000004", "b0000003", timestamp, [{ type: "text", text: escapedText }]),
    user("b0000005", "b0000004", timestamp, escapedText),
  ];
  writeSession({ sessionDir: f.sessionDir, cwd, id: "bounded-session", timestamp, entries });

  const result = prepareSessions(f.options({
    minMessages: 1,
    maxMessages: 2,
    maxProjectionBytes: 1_024,
    maxMessageBytes: 800,
  }));
  const projection = readProjection(result);
  assert.equal(projection.messages.at(-1).entryId, "b0000005");
  assert.ok(projection.bounds.omittedMessages >= 3);
  assert.equal(projection.messages.every((message) => message.truncated), true);
  assert.equal(
    projection.messages.reduce((total, message) => total + Buffer.byteLength(message.text, "utf8"), 0),
    projection.bounds.contentBytes,
  );
  const projectionPath = path.join(result.outputDir, result.manifest.sessions[0].file);
  assert.ok(fs.statSync(projectionPath).size <= 1_024);
});

test("supports Pi's flat custom session directory", (t) => {
  const f = fixture(t);
  const cwd = path.join(f.personalRoot, "flat-store");
  fs.mkdirSync(cwd);
  const timestamp = "2026-08-24T12:00:00.000Z";
  const nestedFile = writeSession({
    sessionDir: f.sessionDir,
    cwd,
    id: "flat-session",
    timestamp,
    entries: ordinaryConversation("flat", timestamp),
  });
  const flatFile = path.join(f.sessionDir, "flat-session.jsonl");
  fs.renameSync(nestedFile, flatFile);

  const result = prepareSessions(f.options({
    sessionDir: undefined,
    env: { PI_CODING_AGENT_SESSION_DIR: f.sessionDir },
  }));
  assert.deepEqual(result.manifest.sessions.map((session) => session.sessionId), ["flat-session"]);

  assert.throws(
    () => prepareSessions(f.options({ sessionDir: undefined, env: {} })),
    /Cannot determine Pi session storage without a persistent current session/,
  );

  const differentStore = path.join(f.base, "different-session-store");
  fs.mkdirSync(differentStore);
  assert.throws(
    () => prepareSessions(f.options({
      sessionDir: undefined,
      env: {
        PI_SESSION_FILE: flatFile,
        PI_CODING_AGENT_SESSION_DIR: differentStore,
      },
    })),
    /current Pi session file and PI_CODING_AGENT_SESSION_DIR select different session stores/i,
  );
});

test("uses session headers when profile roots share one encoded directory", (t) => {
  const f = fixture(t);
  const personalRoot = path.join(f.base, "repos", "a-b");
  const workRoot = path.join(f.base, "repos", "a", "b");
  fs.mkdirSync(personalRoot, { recursive: true });
  fs.mkdirSync(workRoot, { recursive: true });
  const config = JSON.parse(fs.readFileSync(f.configPath, "utf8"));
  config.profiles.personal.gitRoots = [personalRoot];
  config.profiles.work.gitRoots = [workRoot];
  fs.writeFileSync(f.configPath, `${JSON.stringify(config, null, 2)}\n`);

  const timestamp = "2026-08-24T12:00:00.000Z";
  writeSession({
    sessionDir: f.sessionDir,
    cwd: personalRoot,
    id: "personal-collision",
    timestamp,
    entries: ordinaryConversation("personal-collision", timestamp),
  });
  writeSession({
    sessionDir: f.sessionDir,
    cwd: workRoot,
    id: "work-collision",
    timestamp,
    entries: ordinaryConversation("work-collision", timestamp),
  });

  const result = prepareSessions(f.options());
  assert.deepEqual(result.manifest.sessions.map((session) => session.sessionId), ["personal-collision"]);
  assert.equal(result.manifest.diagnostics.discovered, 2);
  assert.equal(result.manifest.diagnostics.wrongProfile, 1);
});

test("rejects overlapping workflow profile roots", (t) => {
  const f = fixture(t);
  const config = JSON.parse(fs.readFileSync(f.configPath, "utf8"));
  config.profiles.work.gitRoots = [path.join(f.personalRoot, "work")];
  fs.mkdirSync(config.profiles.work.gitRoots[0]);
  fs.writeFileSync(f.configPath, `${JSON.stringify(config, null, 2)}\n`);

  assert.throws(
    () => prepareSessions(f.options()),
    /personal Git roots that do not overlap another workflow profile/,
  );
});

test("rejects report output inside profile roots or session storage", (t) => {
  const f = fixture(t);
  const insideProfile = path.join(f.personalRoot, "report-output");
  fs.mkdirSync(insideProfile);
  assert.throws(
    () => prepareSessions(f.options({ outputDir: insideProfile })),
    (error) => error instanceof PrepareSessionsError && /outside workflow roots/.test(error.message),
  );

  const insideSessions = path.join(f.sessionDir, "report-output");
  fs.mkdirSync(insideSessions);
  assert.throws(
    () => prepareSessions(f.options({ outputDir: insideSessions })),
    /outside workflow roots, vaults, and Pi session storage/,
  );

  for (const crossProfileOutput of [
    f.workVault,
    path.join(f.workRoot, "report-output"),
  ]) {
    fs.mkdirSync(crossProfileOutput, { recursive: true });
    assert.throws(
      () => prepareSessions(f.options({ outputDir: crossProfileOutput })),
      /outside workflow roots, vaults, and Pi session storage/,
    );
  }
});

test("CLI emits a bounded manifest pointer and supports only fixed production boundaries", (t) => {
  const f = fixture(t);
  const cwd = path.join(f.personalRoot, "repo");
  fs.mkdirSync(cwd);
  const timestamp = new Date(Date.now() - 48 * 60 * 60 * 1_000).toISOString();
  writeSession({
    sessionDir: f.sessionDir,
    cwd,
    id: "cli-session",
    timestamp,
    entries: ordinaryConversation("cli", timestamp),
  });
  const currentTimestamp = new Date().toISOString();
  const currentFile = writeSession({
    sessionDir: f.sessionDir,
    cwd,
    id: "current-cli-session",
    timestamp: currentTimestamp,
    entries: ordinaryConversation("current", currentTimestamp),
  });
  const cliEnv = {
    ...process.env,
    HOME: f.home,
    PI_SKILLS_WORKFLOW_CONFIG: f.configPath,
    PI_SESSION_FILE: currentFile,
    PI_SESSION_ID: "current-cli-session",
  };
  const outputDir = f.output();
  const result = spawnSync(process.execPath, [
    SCRIPT_PATH,
    "--profile", "personal",
    "--output", outputDir,
  ], { encoding: "utf8", env: cliEnv });
  assert.equal(result.status, 0, result.stderr);
  const response = JSON.parse(result.stdout);
  assert.equal(response.sessions, 1);
  assert.equal(response.manifest, path.join(outputDir, "manifest.json"));
  assert.ok(Buffer.byteLength(result.stdout, "utf8") < 4 * 1024);

  const unsupported = spawnSync(process.execPath, [
    SCRIPT_PATH,
    "--profile", "work",
    "--output", f.output(),
  ], { encoding: "utf8", env: cliEnv });
  assert.equal(unsupported.status, 1);
  assert.match(unsupported.stderr, /supports only the personal profile/);

  const weakerBounds = spawnSync(process.execPath, [
    SCRIPT_PATH,
    "--profile", "personal",
    "--output", f.output(),
    "--quiescent-hours", "1",
  ], { encoding: "utf8", env: cliEnv });
  assert.equal(weakerBounds.status, 1);
  assert.match(weakerBounds.stderr, /Unknown option: --quiescent-hours/);
});
