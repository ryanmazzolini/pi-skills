import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  readSchedulerStatusSnapshot,
  schedulerStatusSnapshotPath,
  updateSchedulerStatusRun,
  withSchedulerStatusLock,
  writeSchedulerStatusSnapshot,
  writeUnavailableSchedulerStatusSnapshot,
} from "./status-cache.mjs";

function job(overrides = {}) {
  return {
    id: "global:test:job",
    candidateError: null,
    installationError: null,
    historyError: null,
    nextRunError: null,
    installation: {
      installed: true,
      health: "ok",
      enabled: true,
      digest: "installed-digest",
      revision: 1,
      definitionDrift: false,
      adapterDrift: false,
    },
    recentRuns: [],
    ...overrides,
  };
}

function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "scheduler-status-cache-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  return {
    env: { HOME: base, XDG_STATE_HOME: path.join(base, "state") },
    manifestPath: path.join(base, "config", "pi-scheduler", "jobs.json"),
  };
}

test("status snapshots persist only the shared dashboard attention aggregate", (t) => {
  const { env, manifestPath } = fixture(t);
  const candidateFailure = job({
    id: "global:test:candidate",
    candidateError: { code: "ENVIRONMENT", message: "missing command" },
  });
  const paused = job({ id: "global:test:paused", installation: { installed: true, health: "ok", enabled: false } });
  const failed = job({ id: "global:test:failed", recentRuns: [{ status: "failed" }] });

  const written = writeSchedulerStatusSnapshot(manifestPath, {
    generatedAt: "2026-07-30T12:00:00.000Z",
    jobs: [candidateFailure, paused, failed],
  }, env);

  assert.equal(written.attentionCount, 2);
  assert.deepEqual(readSchedulerStatusSnapshot(manifestPath, env), written);
  assert.deepEqual(Object.keys(written), ["version", "manifestPath", "generatedAt", "attentionCount", "jobs"]);
  assert.match(schedulerStatusSnapshotPath(manifestPath, env), /\/status\/[0-9a-f]{64}\.json$/);

  const candidateOnly = writeSchedulerStatusSnapshot(manifestPath, {
    generatedAt: "2026-07-30T12:01:00.000Z",
    jobs: [{ ...candidateFailure, id: "global:test:job" }],
  }, env);
  assert.equal(candidateOnly.attentionCount, 1);
  const installedRun = (status) => ({ status, digest: "installed-digest", revision: 1 });
  assert.equal(updateSchedulerStatusRun(manifestPath, "global:test:job", installedRun("succeeded"), env).attentionCount, 1);
  assert.equal(updateSchedulerStatusRun(manifestPath, "global:test:job", installedRun("running"), env).attentionCount, 0);
  assert.equal(updateSchedulerStatusRun(manifestPath, "global:test:job", installedRun("failed"), env).attentionCount, 1);

  const removed = writeSchedulerStatusSnapshot(manifestPath, {
    generatedAt: "2026-07-30T12:02:00.000Z",
    jobs: [job({ id: "global:test:job", installation: { installed: false, health: "absent", enabled: false } })],
  }, env);
  assert.equal(removed.attentionCount, 0);
  assert.equal(updateSchedulerStatusRun(manifestPath, "global:test:job", installedRun("failed"), env).attentionCount, 0);

  assert.equal(writeUnavailableSchedulerStatusSnapshot(manifestPath, env).attentionCount, 0);
  assert.equal(readSchedulerStatusSnapshot(manifestPath, env).attentionCount, 0);
});

test("status snapshots reject unsafe identity and malformed cache data", (t) => {
  const { env, manifestPath } = fixture(t);
  assert.throws(() => schedulerStatusSnapshotPath("relative/jobs.json", env), /absolute manifest path/);

  writeUnavailableSchedulerStatusSnapshot(manifestPath, env);
  const snapshotPath = schedulerStatusSnapshotPath(manifestPath, env);
  fs.writeFileSync(snapshotPath, "{}\n", { mode: 0o600 });
  assert.throws(() => readSchedulerStatusSnapshot(manifestPath, env), /snapshot is invalid/);
});

test("status refresh locks are private and released after callbacks", (t) => {
  const { env, manifestPath } = fixture(t);
  let calls = 0;
  assert.equal(withSchedulerStatusLock(manifestPath, env, () => ++calls), 1);
  assert.equal(withSchedulerStatusLock(manifestPath, env, () => ++calls), 2);
});
