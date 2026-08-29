import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { schedulerStorage } from "./index.mjs";
import {
  MAX_RUN_HISTORY,
  MAX_RUN_OUTPUT_BYTES,
  SchedulerBusyError,
  SchedulerExecutionError,
  acquireLock,
  executeInstalled,
  installStagedDirectory,
  installedPaths,
  readInstalled,
  readLog,
  readRunHistory,
  readRunOutput,
  replaceInstalledDirectory,
  rotateLog,
  stageInstalledSnapshot,
  verifyInstalledShims,
} from "./runtime.mjs";

function temporaryEnvironment(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "scheduler-runtime-test-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const home = path.join(base, "home");
  const temporary = path.join(base, "tmp");
  fs.mkdirSync(home);
  fs.mkdirSync(temporary);
  return {
    base,
    env: {
      HOME: home,
      USER: "scheduler-test",
      TMPDIR: temporary,
      XDG_STATE_HOME: path.join(base, "state"),
      LANG: "C",
      SCHEDULER_TEST_SECRET: "must-not-leak",
    },
  };
}

function candidate(base, overrides = {}) {
  const scriptPath = path.join(base, "job.mjs");
  const id = "global:test:job";
  const storage = schedulerStorage(id, {
    HOME: path.join(base, "home"),
    XDG_STATE_HOME: path.join(base, "state"),
  });
  if (!fs.existsSync(scriptPath)) fs.writeFileSync(scriptPath, "console.log('ok')\n");
  const digest = overrides.digest ?? "a".repeat(64);
  return {
    digest,
    contract: {
      version: 1,
      id,
      scope: { kind: "global", identity: "global", root: path.join(base, "config") },
      key: "test:job",
      sourcePath: path.join(base, "config", "pi-scheduler", "jobs.json"),
      description: "Runtime fixture",
      schedule: "30 17 * * 1-5",
      argv: [process.execPath, scriptPath],
      requiredCommands: { node: fs.realpathSync(process.execPath) },
      optionalCommands: { gh: null },
      workingDirectory: base,
      timeoutSeconds: 10,
      schedulerRunner: fs.realpathSync(process.execPath),
      schedulerNode: fs.realpathSync(process.execPath),
      scheduler: storage,
      environment: {
        HOME: path.join(base, "home"),
        USER: "scheduler-test",
        TMPDIR: path.join(base, "tmp"),
        locale: { LANG: "C" },
      },
      adapter: { mode: "auto", selected: "launchd", executable: "/bin/launchctl" },
      ...overrides.contract,
    },
  };
}

function installCandidate(base, env, overrides = {}) {
  const staged = stageInstalledSnapshot(candidate(base, overrides), { env, revision: overrides.revision ?? 1 });
  installStagedDirectory(staged);
  return readInstalled("global:test:job", env);
}

test("staged installation creates private snapshot state and exact command shims", (t) => {
  const { base, env } = temporaryEnvironment(t);
  const installed = installCandidate(base, env);

  assert.equal(installed.health, "ok");
  assert.equal(installed.metadata.enabled, false);
  assert.equal(installed.metadata.revision, 1);
  assert.equal(installed.snapshot.environment.PATH, installed.paths.shimsDirectory);
  assert.deepEqual(installed.snapshot.environment, {
    HOME: path.join(base, "home"),
    USER: "scheduler-test",
    PATH: installed.paths.shimsDirectory,
    TMPDIR: path.join(base, "tmp"),
    LANG: "C",
  });
  assert.equal(fs.realpathSync(path.join(installed.paths.shimsDirectory, "node")), fs.realpathSync(process.execPath));
  assert.equal(fs.existsSync(path.join(installed.paths.shimsDirectory, "gh")), false);
  assert.equal(fs.statSync(installed.paths.jobDirectory).mode & 0o077, 0);
  assert.equal(fs.statSync(installed.paths.snapshotPath).mode & 0o077, 0);
  assert.equal(fs.statSync(installed.paths.launcherPath).mode & 0o077, 0);
  assert.equal(fs.statSync(installed.paths.logPath).mode & 0o077, 0);
  verifyInstalledShims(installed);

  const nodeShim = path.join(installed.paths.shimsDirectory, "node");
  fs.unlinkSync(nodeShim);
  fs.writeFileSync(nodeShim, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  assert.throws(() => verifyInstalledShims(installed), /command shim changed/i);
  const unhealthy = readInstalled(installed.id, env);
  assert.equal(unhealthy.health, "unhealthy");
  assert.equal(unhealthy.healthCategory, undefined);
});

test("version-1 snapshots without a launcher remain inspectable and recoverable", (t) => {
  const { base, env } = temporaryEnvironment(t);
  const installed = installCandidate(base, env);
  const snapshot = JSON.parse(fs.readFileSync(installed.paths.snapshotPath, "utf8"));
  delete snapshot.contract.scheduler.launcherPath;
  fs.writeFileSync(installed.paths.snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 });
  fs.rmSync(installed.paths.launcherPath);

  const legacy = readInstalled(installed.id, env);
  assert.equal(legacy.health, "ok");
  assert.equal(legacy.snapshot.contract.scheduler.launcherPath, undefined);
  assert.doesNotThrow(() => verifyInstalledShims(legacy));
});

test("installed command verification rejects writable target and parent drift", async (t) => {
  const { base, env } = temporaryEnvironment(t);
  const toolDirectory = path.join(base, "tool-bin");
  const executable = path.join(toolDirectory, "fixture-tool");
  fs.mkdirSync(toolDirectory, { mode: 0o755 });
  fs.writeFileSync(executable, `#!${process.execPath}\nconsole.log('safe')\n`, { mode: 0o755 });
  const canonicalExecutable = fs.realpathSync(executable);
  const installed = installCandidate(base, env, {
    contract: {
      argv: [canonicalExecutable],
      requiredCommands: { "fixture-tool": canonicalExecutable },
      optionalCommands: {},
    },
  });

  verifyInstalledShims(installed);
  fs.chmodSync(executable, 0o777);
  assert.throws(() => verifyInstalledShims(installed), /group- or world-writable/);
  assert.equal(readInstalled(installed.id, env).health, "unhealthy");
  await assert.rejects(
    executeInstalled(installed.id, {
      env,
      expectedDigest: installed.metadata.digest,
      expectedRevision: installed.metadata.revision,
    }),
    /Installed job state is unhealthy/,
  );

  fs.chmodSync(executable, 0o755);
  fs.chmodSync(toolDirectory, 0o777);
  assert.throws(() => verifyInstalledShims(installed), /Command binding ancestor is group- or world-writable/);
  assert.equal(readInstalled(installed.id, env).health, "unhealthy");
});

test("installed command bindings follow safe package-manager retargets without lifecycle drift", async (t) => {
  const { base, env } = temporaryEnvironment(t);
  const versionsDirectory = path.join(base, "versions");
  const stableDirectory = path.join(base, "stable-bin");
  fs.mkdirSync(versionsDirectory);
  fs.mkdirSync(stableDirectory);
  const firstTarget = path.join(versionsDirectory, "tool-v1");
  const secondTarget = path.join(versionsDirectory, "tool-v2");
  fs.writeFileSync(firstTarget, `#!${process.execPath}\nconsole.log("tool-version-1")\n`, { mode: 0o755 });
  fs.writeFileSync(secondTarget, `#!${process.execPath}\nconsole.log("tool-version-2")\n`, { mode: 0o755 });
  const channel = path.join(versionsDirectory, "current");
  fs.symlinkSync(firstTarget, channel);
  const binding = path.join(stableDirectory, "fixture-tool");
  fs.symlinkSync(channel, binding);
  const installed = installCandidate(base, env, {
    contract: {
      argv: [binding],
      requiredCommands: { "fixture-tool": binding },
      optionalCommands: {},
    },
  });

  verifyInstalledShims(installed);
  assert.equal(fs.readlinkSync(path.join(installed.paths.shimsDirectory, "fixture-tool")), binding);
  assert.equal(fs.realpathSync(binding), fs.realpathSync(firstTarget));

  fs.unlinkSync(channel);
  fs.symlinkSync(secondTarget, channel);
  verifyInstalledShims(installed);
  assert.equal(readInstalled(installed.id, env).health, "ok");
  const result = await executeInstalled(installed.id, {
    env,
    expectedDigest: installed.metadata.digest,
    expectedRevision: installed.metadata.revision,
  });
  assert.equal(result.status, "ok");
  assert.match(readLog(installed.id, { env }).content, /tool-version-2/);

  fs.unlinkSync(channel);
  const excessiveHops = Array.from({ length: 50 }, (_, index) => path.join(versionsDirectory, `hop-${index}`));
  for (let index = excessiveHops.length - 1; index >= 0; index -= 1) {
    const next = index === excessiveHops.length - 1 ? secondTarget : excessiveHops[index + 1];
    fs.symlinkSync(path.basename(next), excessiveHops[index]);
  }
  fs.symlinkSync(path.basename(excessiveHops[0]), channel);
  assert.throws(() => verifyInstalledShims(installed), /not executable through the kernel/);
  fs.unlinkSync(channel);
  fs.symlinkSync(secondTarget, channel);

  fs.chmodSync(secondTarget, 0o777);
  assert.throws(() => verifyInstalledShims(installed), /group- or world-writable/);
  fs.chmodSync(secondTarget, 0o755);
  fs.rmSync(secondTarget);
  assert.throws(() => verifyInstalledShims(installed), /mapping is missing or not executable/);
});

test("installation rejects a shim that adds one hop beyond the kernel symlink limit", (t) => {
  const { base, env } = temporaryEnvironment(t);
  const chainDirectory = path.join(base, "kernel-limit-chain");
  fs.mkdirSync(chainDirectory);
  const target = path.join(chainDirectory, "target");
  fs.writeFileSync(target, `#!${process.execPath}\n`, { mode: 0o755 });
  const probeShim = path.join(chainDirectory, "probe-shim");
  let previous = target;
  let boundaryBinding;
  for (let index = 0; index < 64; index += 1) {
    const hop = path.join(chainDirectory, `hop-${index}`);
    fs.symlinkSync(path.basename(previous), hop);
    try {
      fs.statSync(hop);
    } catch {
      break;
    }
    fs.symlinkSync(path.basename(hop), probeShim);
    try {
      fs.statSync(probeShim);
    } catch {
      boundaryBinding = hop;
      fs.rmSync(probeShim, { force: true });
      break;
    }
    fs.rmSync(probeShim);
    previous = hop;
  }
  assert.ok(boundaryBinding, "expected to find the kernel symlink boundary below 64 hops");

  assert.throws(
    () => installCandidate(base, env, {
      contract: {
        argv: [boundaryBinding],
        requiredCommands: { "fixture-tool": boundaryBinding },
        optionalCommands: {},
      },
    }),
    /Command shim is not executable through the kernel/,
  );
});

test("the private launcher rejects an unsafe Node target before executing it", (t) => {
  const { base, env } = temporaryEnvironment(t);
  const markerPath = path.join(base, "node-started");
  const nodeAncestor = path.join(base, "node-tools");
  const nodeDirectory = path.join(nodeAncestor, "protected", "bin");
  fs.mkdirSync(nodeDirectory, { recursive: true, mode: 0o755 });
  const nodePath = path.join(nodeDirectory, "scheduler-node");
  fs.writeFileSync(
    nodePath,
    `#!/bin/sh\nprintf started > ${JSON.stringify(markerPath)}\nexec ${JSON.stringify(process.execPath)} "$@"\n`,
    { mode: 0o755 },
  );
  const canonicalNode = fs.realpathSync(nodePath);
  const installed = installCandidate(base, env, {
    contract: {
      argv: [canonicalNode, path.join(base, "job.mjs")],
      requiredCommands: { node: canonicalNode },
      schedulerNode: canonicalNode,
    },
  });

  const invokeLauncher = () => spawnSync(installed.paths.launcherPath, [
    canonicalNode,
    installed.snapshot.contract.schedulerRunner,
    "_run-installed",
    installed.id,
  ], { encoding: "utf8", env: installed.snapshot.environment });

  fs.chmodSync(canonicalNode, 0o777);
  let result = invokeLauncher();
  assert.equal(result.status, 126);
  assert.match(result.stderr, /unsafe installed runtime/);
  assert.equal(fs.existsSync(markerPath), false);

  fs.chmodSync(canonicalNode, 0o755);
  const nonAdminGroup = typeof process.getgroups === "function"
    ? process.getgroups().find((group) => group !== 80)
    : undefined;
  if (typeof process.getuid === "function" && nonAdminGroup !== undefined) {
    fs.chownSync(nodeAncestor, process.getuid(), nonAdminGroup);
  }
  fs.chmodSync(nodeAncestor, 0o775);
  result = invokeLauncher();
  assert.equal(result.status, 126);
  assert.match(result.stderr, /unsafe installed runtime/);
  assert.equal(fs.existsSync(markerPath), false);
});

test("the private launcher accepts only non-world-writable macOS admin ancestors", {
  skip: process.platform !== "darwin"
    || typeof process.getuid !== "function"
    || !process.getgroups().includes(80),
}, (t) => {
  const { base, env } = temporaryEnvironment(t);
  const markerPath = path.join(base, "trusted-node-started");
  const adminAncestor = path.join(base, "homebrew-cellar");
  const nodeDirectory = path.join(adminAncestor, "node", "bin");
  fs.mkdirSync(nodeDirectory, { recursive: true, mode: 0o755 });
  fs.chownSync(adminAncestor, process.getuid(), 80);
  fs.chmodSync(adminAncestor, 0o775);
  const nodePath = path.join(nodeDirectory, "scheduler-node");
  fs.writeFileSync(nodePath, `#!/bin/sh\nprintf started > ${JSON.stringify(markerPath)}\n`, { mode: 0o755 });
  const canonicalNode = fs.realpathSync(nodePath);
  const installed = installCandidate(base, env, {
    contract: {
      argv: [canonicalNode, path.join(base, "job.mjs")],
      requiredCommands: { node: canonicalNode },
      schedulerNode: canonicalNode,
    },
  });
  const invokeLauncher = () => spawnSync(installed.paths.launcherPath, [
    canonicalNode,
    installed.snapshot.contract.schedulerRunner,
  ], { encoding: "utf8", env: installed.snapshot.environment });

  let result = invokeLauncher();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(markerPath, "utf8"), "started");

  fs.rmSync(markerPath);
  fs.chmodSync(adminAncestor, 0o777);
  result = invokeLauncher();
  assert.equal(result.status, 126);
  assert.match(result.stderr, /unsafe installed runtime/);
  assert.equal(fs.existsSync(markerPath), false);
});

test("installed execution uses only the fixed environment and records output", async (t) => {
  const { base, env } = temporaryEnvironment(t);
  const scriptPath = path.join(base, "job.mjs");
  fs.writeFileSync(scriptPath, "console.log(JSON.stringify(process.env))\n");
  const installed = installCandidate(base, env);
  const transitions = [];

  const result = await executeInstalled(installed.id, {
    env,
    expectedDigest: installed.metadata.digest,
    expectedRevision: installed.metadata.revision,
    onStateChange(record) {
      transitions.push(record.status);
      throw new Error("observer failed");
    },
  });
  assert.equal(result.status, "ok");
  assert.deepEqual(transitions, ["running", "succeeded"]);
  const log = readLog(installed.id, { env, lines: 100 });
  assert.match(log.content, /"HOME"/);
  assert.match(log.content, /"PATH"/);
  assert.doesNotMatch(log.content, /SCHEDULER_TEST_SECRET|must-not-leak/);
  assert.equal(fs.statSync(log.logPath).mode & 0o077, 0);

  const history = readRunHistory(installed.id, { env });
  assert.equal(history.length, 1);
  assert.equal(history[0].status, "succeeded");
  assert.equal(history[0].trigger, "manual");
  assert.equal(history[0].scheduledFor, null);
  assert.equal(history[0].exitCode, 0);
  assert.equal(history[0].revision, installed.metadata.revision);
  const output = readRunOutput(installed.id, history[0].runId, { env });
  assert.match(output.content, /"HOME"/);
  assert.notEqual(output.logPath, log.logPath);
  assert.equal(fs.statSync(output.logPath).mode & 0o077, 0);
});

test("installed execution caps retained run output while draining both streams", async (t) => {
  const { base, env } = temporaryEnvironment(t);
  const scriptPath = path.join(base, "job.mjs");
  const chunkBytes = Math.floor(MAX_RUN_OUTPUT_BYTES / 2) + 1024;
  fs.writeFileSync(scriptPath, `
const write = (stream, value) => new Promise((resolve, reject) => stream.write(value, (error) => error ? reject(error) : resolve()));
await write(process.stdout, Buffer.alloc(${chunkBytes}, "o"));
await write(process.stderr, Buffer.alloc(${chunkBytes}, "e"));
await new Promise((resolve) => setTimeout(resolve, 300));
`);
  const installed = installCandidate(base, env);

  const execution = executeInstalled(installed.id, {
    env,
    expectedDigest: installed.metadata.digest,
    expectedRevision: installed.metadata.revision,
  });
  let liveRecord;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    [liveRecord] = readRunHistory(installed.id, { env });
    if (liveRecord?.status === "running" && fs.existsSync(liveRecord.logPath) && fs.statSync(liveRecord.logPath).size === MAX_RUN_OUTPUT_BYTES) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(liveRecord?.status, "running");
  const liveOutput = readRunOutput(installed.id, liveRecord.runId, { env, lines: 10_000 });
  assert.equal(liveOutput.truncated, true);
  assert.equal(liveOutput.truncation, "later");

  const result = await execution;
  assert.equal(result.status, "ok");
  assert.equal(result.outputTruncated, true);
  const [record] = readRunHistory(installed.id, { env });
  assert.equal(record.outputTruncated, true);
  const output = readRunOutput(installed.id, record.runId, { env, lines: 10_000 });
  assert.equal(output.truncated, true);
  assert.equal(output.truncation, "later");
  assert.equal(fs.statSync(output.logPath).size, MAX_RUN_OUTPUT_BYTES);
  assert.equal(fs.statSync(output.logPath).mode & 0o077, 0);
});

test("a detached descendant holding output pipes cannot block run completion", async (t) => {
  const { base, env } = temporaryEnvironment(t);
  const scriptPath = path.join(base, "job.mjs");
  const childPidPath = path.join(base, "detached.pid");
  fs.writeFileSync(scriptPath, `
import { spawn } from "node:child_process";
import fs from "node:fs";
const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { detached: true, stdio: ["ignore", process.stdout, process.stderr] });
fs.writeFileSync(${JSON.stringify(childPidPath)}, String(child.pid));
child.unref();
`);
  const installed = installCandidate(base, env);
  let childPid;
  t.after(() => {
    if (!childPid) return;
    try {
      process.kill(process.platform === "win32" ? childPid : -childPid, "SIGKILL");
    } catch {}
  });

  const startedAt = Date.now();
  const result = await executeInstalled(installed.id, {
    env,
    expectedDigest: installed.metadata.digest,
    expectedRevision: installed.metadata.revision,
  });
  childPid = Number(fs.readFileSync(childPidPath, "utf8"));
  assert.equal(result.status, "ok");
  assert.equal(result.timedOut, false);
  assert.equal(Date.now() - startedAt < 3_000, true);
});

test("scheduled execution records its nominal occurrence and failed exit", async (t) => {
  const { base, env } = temporaryEnvironment(t);
  const scriptPath = path.join(base, "job.mjs");
  fs.writeFileSync(scriptPath, "console.error('fixture failed')\nprocess.exit(3)\n");
  const installed = installCandidate(base, env);
  const startedAt = new Date(2026, 6, 27, 18, 0, 0, 0);
  const finishedAt = new Date(startedAt.getTime() + 2_000);
  const times = [startedAt, finishedAt];

  await assert.rejects(
    executeInstalled(installed.id, {
      env,
      expectedDigest: installed.metadata.digest,
      expectedRevision: installed.metadata.revision,
      trigger: "scheduled",
      now: () => times.shift() ?? finishedAt,
    }),
    (error) => error instanceof SchedulerExecutionError && /exited with code 3/.test(error.message),
  );

  const [record] = readRunHistory(installed.id, { env });
  const scheduledFor = new Date(2026, 6, 27, 17, 30, 0, 0);
  assert.equal(record.trigger, "scheduled");
  assert.equal(record.scheduledFor, scheduledFor.toISOString());
  assert.equal(record.status, "failed");
  assert.equal(record.exitCode, 3);
  assert.equal(record.durationMilliseconds, 2_000);
  assert.match(readRunOutput(installed.id, record.runId, { env }).content, /fixture failed/);
});

test("execution rejects stale state and skips overlap", async (t) => {
  const { base, env } = temporaryEnvironment(t);
  const installed = installCandidate(base, env);

  await assert.rejects(
    executeInstalled(installed.id, {
      env,
      expectedDigest: "b".repeat(64),
      expectedRevision: 1,
    }),
    /digest or lifecycle revision changed/,
  );

  const release = acquireLock(installed.paths.executionLockPath);
  try {
    const result = await executeInstalled(installed.id, {
      env,
      expectedDigest: installed.metadata.digest,
      expectedRevision: 1,
    });
    assert.deepEqual(result.status, "skipped");
    assert.ok(result.runId);
    assert.equal(readRunHistory(installed.id, { env })[0].runId, result.runId);
    assert.match(readLog(installed.id, { env }).content, /skipped overlap/);
  } finally {
    release();
  }
});

test("a real concurrent execution is skipped and logged instead of returning BUSY", async (t) => {
  const { base, env } = temporaryEnvironment(t);
  const scriptPath = path.join(base, "job.mjs");
  fs.writeFileSync(scriptPath, "await new Promise((resolve) => setTimeout(resolve, 500));\n");
  const installed = installCandidate(base, env);
  const input = {
    env,
    expectedDigest: installed.metadata.digest,
    expectedRevision: installed.metadata.revision,
  };
  const first = executeInstalled(installed.id, input);
  for (let attempt = 0; attempt < 20 && !fs.existsSync(installed.paths.executionLockPath); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const running = readRunHistory(installed.id, { env });
  assert.equal(running[0].status, "running");
  const overlapping = await executeInstalled(installed.id, input);
  assert.equal(overlapping.status, "skipped");
  assert.equal((await first).status, "ok");
  assert.match(readLog(installed.id, { env }).content, /skipped overlap/);
  assert.deepEqual(readRunHistory(installed.id, { env }).map((record) => record.status).sort(), ["skipped", "succeeded"]);
});

test("run history prunes dead running receipts and their output within the terminal bound", async (t) => {
  const { base, env } = temporaryEnvironment(t);
  const installed = installCandidate(base, env);
  fs.mkdirSync(installed.paths.runDirectory, { recursive: true, mode: 0o700 });
  let oldestRecordPath;
  let oldestOutputPath;
  for (let index = 0; index < MAX_RUN_HISTORY + 3; index += 1) {
    const runId = randomUUID();
    const timestamp = new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();
    const recordPath = path.join(installed.paths.runDirectory, `${runId}.json`);
    const outputPath = path.join(installed.paths.runDirectory, `${runId}.log`);
    if (index === 0) {
      oldestRecordPath = recordPath;
      oldestOutputPath = outputPath;
    }
    fs.writeFileSync(recordPath, JSON.stringify({
      version: 1,
      runId,
      id: installed.id,
      trigger: "manual",
      scheduledFor: null,
      startedAt: timestamp,
      finishedAt: null,
      status: "running",
      pid: 999_999_999,
      digest: installed.metadata.digest,
      revision: installed.metadata.revision,
      exitCode: null,
      signal: null,
      timedOut: false,
      reason: null,
      logPath: outputPath,
    }), { mode: 0o600 });
    fs.writeFileSync(outputPath, `output ${index}\n`, { mode: 0o600 });
  }
  const release = acquireLock(installed.paths.executionLockPath);
  try {
    assert.equal((await executeInstalled(installed.id, {
      env,
      expectedDigest: installed.metadata.digest,
      expectedRevision: installed.metadata.revision,
    })).status, "skipped");
  } finally {
    release();
  }
  const history = readRunHistory(installed.id, { env, limit: MAX_RUN_HISTORY });
  assert.equal(history.length, MAX_RUN_HISTORY);
  assert.equal(history.filter((record) => record.status === "interrupted").length, MAX_RUN_HISTORY);
  assert.equal(fs.readdirSync(installed.paths.runDirectory).filter((name) => name.endsWith(".json")).length, MAX_RUN_HISTORY);
  assert.equal(fs.existsSync(oldestRecordPath), false);
  assert.equal(fs.existsSync(oldestOutputPath), false);

  const liveRunId = randomUUID();
  fs.writeFileSync(path.join(installed.paths.runDirectory, `${liveRunId}.json`), JSON.stringify({
    version: 1,
    runId: liveRunId,
    id: installed.id,
    trigger: "manual",
    scheduledFor: null,
    startedAt: new Date(0).toISOString(),
    finishedAt: null,
    status: "running",
    pid: process.pid,
    digest: installed.metadata.digest,
    revision: installed.metadata.revision,
    exitCode: null,
    signal: null,
    timedOut: false,
    reason: null,
    logPath: path.join(installed.paths.runDirectory, `${liveRunId}.log`),
  }), { mode: 0o600 });
  const withLiveRun = readRunHistory(installed.id, { env, limit: MAX_RUN_HISTORY });
  assert.equal(withLiveRun.length, MAX_RUN_HISTORY);
  assert.equal(withLiveRun.some((record) => record.runId === liveRunId && record.status === "running"), true);
});

test("bounded run history retains the newest execution behind overlap receipts", (t) => {
  const { base, env } = temporaryEnvironment(t);
  const installed = installCandidate(base, env);
  fs.mkdirSync(installed.paths.runDirectory, { recursive: true, mode: 0o700 });
  const writeRecord = (status, startedAt, reason) => {
    const runId = randomUUID();
    fs.writeFileSync(path.join(installed.paths.runDirectory, `${runId}.json`), JSON.stringify({
      version: 1,
      runId,
      id: installed.id,
      trigger: "manual",
      scheduledFor: null,
      startedAt,
      finishedAt: startedAt,
      status,
      pid: process.pid,
      digest: installed.metadata.digest,
      revision: installed.metadata.revision,
      exitCode: status === "failed" ? 3 : null,
      signal: null,
      timedOut: false,
      reason,
    }), { mode: 0o600 });
    return runId;
  };
  const failedRunId = writeRecord("failed", new Date(0).toISOString(), "exited with code 3");
  for (let index = 0; index < MAX_RUN_HISTORY; index += 1) {
    writeRecord("skipped", new Date(index + 1).toISOString(), "overlap");
  }

  const history = readRunHistory(installed.id, { env, limit: 10 });
  assert.equal(history.length, 10);
  assert.equal(history.filter((record) => record.status === "skipped").length, 9);
  assert.equal(history.some((record) => record.runId === failedRunId && record.status === "failed"), true);
});

test("empty run history does not create scheduler state", (t) => {
  const { base, env } = temporaryEnvironment(t);
  const stateHome = path.join(base, "read-only-state");
  fs.mkdirSync(stateHome, { mode: 0o500 });
  const readOnlyEnv = { ...env, XDG_STATE_HOME: stateHome };
  try {
    assert.deepEqual(readRunHistory("global:test:missing", { env: readOnlyEnv }), []);
    assert.equal(fs.existsSync(path.join(stateHome, "pi-scheduler")), false);
  } finally {
    fs.chmodSync(stateHome, 0o700);
  }
});

test("run history readers wait for the per-job mutation lock", async (t) => {
  const { base, env } = temporaryEnvironment(t);
  const installed = installCandidate(base, env);
  fs.mkdirSync(installed.paths.runDirectory, { recursive: true, mode: 0o700 });
  const release = acquireLock(installed.paths.runHistoryLockPath);
  const moduleUrl = new URL("./runtime.mjs", import.meta.url).href;
  const reader = spawn(process.execPath, ["--input-type=module", "--eval", `
import { readRunHistory } from ${JSON.stringify(moduleUrl)};
const env = JSON.parse(process.argv[1]);
process.stdout.write(JSON.stringify(readRunHistory(${JSON.stringify(installed.id)}, { env })));
`, JSON.stringify(env)], { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  const closed = new Promise((resolve) => reader.once("close", resolve));
  reader.stdout.on("data", (chunk) => { stdout += chunk; });
  reader.stderr.on("data", (chunk) => { stderr += chunk; });
  try {
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(reader.exitCode, null);
  } finally {
    release();
  }
  const code = await closed;
  assert.equal(code, 0, stderr);
  assert.deepEqual(JSON.parse(stdout), []);
});

test("lifecycle locks reject live owners and recover dead owners", (t) => {
  const { base, env } = temporaryEnvironment(t);
  const lockPath = installedPaths("global:test:job", env).lifecycleLockPath;
  const release = acquireLock(lockPath);
  assert.throws(() => acquireLock(lockPath), SchedulerBusyError);
  release();

  fs.mkdirSync(lockPath, { recursive: true, mode: 0o700 });
  assert.throws(() => acquireLock(lockPath), SchedulerBusyError);
  const old = new Date(Date.now() - 31_000);
  fs.utimesSync(lockPath, old, old);
  const recoveredOwnerless = acquireLock(lockPath);
  recoveredOwnerless();

  fs.mkdirSync(lockPath, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    path.join(lockPath, "owner.json"),
    JSON.stringify({ pid: 999_999_999, acquiredAt: new Date(0).toISOString() }),
    { mode: 0o600 },
  );
  const recovered = acquireLock(lockPath);
  recovered();
  assert.equal(fs.existsSync(lockPath), false);
  assert.ok(base);
});

test("execution times out the complete process group and returns a nonzero execution error", async (t) => {
  const { base, env } = temporaryEnvironment(t);
  const scriptPath = path.join(base, "job.mjs");
  const childPidPath = path.join(base, "child.pid");
  fs.writeFileSync(
    scriptPath,
    `import { spawn } from "node:child_process";\nimport fs from "node:fs";\nconst child = spawn(process.execPath, ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { stdio: "ignore" });\nfs.writeFileSync(${JSON.stringify(childPidPath)}, String(child.pid));\nsetInterval(() => {}, 1000);\n`,
  );
  const installed = installCandidate(base, env, { contract: { timeoutSeconds: 1 } });

  await assert.rejects(
    executeInstalled(installed.id, {
      env,
      expectedDigest: installed.metadata.digest,
      expectedRevision: 1,
    }),
    (error) => error instanceof SchedulerExecutionError && error.exitCode === 5 && /timed out/.test(error.message),
  );
  const [timedOut] = readRunHistory(installed.id, { env });
  assert.equal(timedOut.status, "timed-out");
  assert.equal(timedOut.timedOut, true);
  assert.match(timedOut.reason, /timed out/);
  const childPid = Number(fs.readFileSync(childPidPath, "utf8"));
  let alive = true;
  for (let attempt = 0; attempt < 20 && alive; attempt += 1) {
    try {
      process.kill(childPid, 0);
      await new Promise((resolve) => setTimeout(resolve, 50));
    } catch (error) {
      if (error.code === "ESRCH") alive = false;
      else throw error;
    }
  }
  if (alive) {
    try { process.kill(childPid, "SIGKILL"); } catch {}
  }
  assert.equal(alive, false, "timed out descendant should not survive its process group");
});

test("timeout finalization keeps an isolated runner alive through forced cleanup", (t) => {
  const { base, env } = temporaryEnvironment(t);
  const scriptPath = path.join(base, "job.mjs");
  fs.writeFileSync(scriptPath, "setInterval(() => {}, 1000);\n");
  const installed = installCandidate(base, env, { contract: { timeoutSeconds: 1 } });
  const moduleUrl = new URL("./runtime.mjs", import.meta.url).href;
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", `
import { executeInstalled, readRunHistory } from ${JSON.stringify(moduleUrl)};
const env = JSON.parse(process.argv[1]);
let failed = false;
try {
  await executeInstalled(${JSON.stringify(installed.id)}, {
    env,
    expectedDigest: ${JSON.stringify(installed.metadata.digest)},
    expectedRevision: ${installed.metadata.revision},
  });
} catch {
  failed = true;
}
const [run] = readRunHistory(${JSON.stringify(installed.id)}, { env });
process.stdout.write(JSON.stringify({ failed, status: run?.status, finishedAt: run?.finishedAt }));
`, JSON.stringify(env)], { encoding: "utf8", timeout: 5_000 });
  assert.equal(result.status, 0, result.stderr);
  const outcome = JSON.parse(result.stdout);
  assert.deepEqual(outcome.failed, true);
  assert.equal(outcome.status, "timed-out");
  assert.equal(typeof outcome.finishedAt, "string");
});

test("log rotation keeps the configured bounded history", (t) => {
  const { base, env } = temporaryEnvironment(t);
  const logPath = installedPaths("global:test:job", env).logPath;
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  for (let index = 0; index < 5; index += 1) {
    fs.writeFileSync(logPath, `entry-${index}`);
    rotateLog(logPath, { maxBytes: 1, files: 3 });
  }
  assert.equal(fs.existsSync(`${logPath}.1`), true);
  assert.equal(fs.existsSync(`${logPath}.2`), true);
  assert.equal(fs.existsSync(`${logPath}.3`), true);
  assert.equal(fs.existsSync(`${logPath}.4`), false);
});

test("installed directory replacement can roll back or commit exactly", (t) => {
  const { base, env } = temporaryEnvironment(t);
  const original = installCandidate(base, env);
  const replacement = stageInstalledSnapshot(candidate(base, { digest: "b".repeat(64) }), {
    env,
    revision: 2,
  });
  const transaction = replaceInstalledDirectory(replacement);
  assert.equal(readInstalled(original.id, env).metadata.revision, 2);
  transaction.rollback();
  assert.equal(readInstalled(original.id, env).metadata.revision, 1);

  const committed = stageInstalledSnapshot(candidate(base, { digest: "c".repeat(64) }), {
    env,
    revision: 2,
  });
  const committedTransaction = replaceInstalledDirectory(committed);
  committedTransaction.commit();
  assert.equal(readInstalled(original.id, env).metadata.digest, "c".repeat(64));
});
