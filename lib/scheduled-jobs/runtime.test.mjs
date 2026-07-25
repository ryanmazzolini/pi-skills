import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { schedulerStorage } from "./index.mjs";
import {
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

  const result = await executeInstalled(installed.id, {
    env,
    expectedDigest: installed.metadata.digest,
    expectedRevision: installed.metadata.revision,
  });
  assert.equal(result.status, "ok");
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
