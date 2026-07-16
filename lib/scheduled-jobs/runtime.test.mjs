import assert from "node:assert/strict";
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
  assert.equal(fs.statSync(installed.paths.logPath).mode & 0o077, 0);
  verifyInstalledShims(installed);

  fs.unlinkSync(path.join(installed.paths.shimsDirectory, "node"));
  assert.throws(() => verifyInstalledShims(installed), /mapping is missing/);
  assert.equal(readInstalled(installed.id, env).health, "unhealthy");
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
  const overlapping = await executeInstalled(installed.id, input);
  assert.equal(overlapping.status, "skipped");
  assert.equal((await first).status, "ok");
  assert.match(readLog(installed.id, { env }).content, /skipped overlap/);
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
