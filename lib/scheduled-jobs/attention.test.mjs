import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  publishSchedulerAttention,
  readSchedulerAttention,
  schedulerAttentionPath,
} from "./attention.mjs";
import { acquireLock } from "./runtime.mjs";

function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "scheduler-attention-test-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const manifestPath = path.join(base, "config", "pi-scheduler", "jobs.json");
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, "{}\n");
  return {
    env: { HOME: base, XDG_STATE_HOME: path.join(base, "state") },
    manifestPath,
  };
}

function job(overrides = {}) {
  return {
    installation: {
      installed: true,
      health: "ok",
      enabled: true,
      definitionDrift: false,
      adapterDrift: false,
    },
    candidateError: null,
    installationError: null,
    historyError: null,
    nextRunError: null,
    recentRuns: [],
    ...overrides,
  };
}

test("attention files persist only the shared classifier count", (t) => {
  const { env, manifestPath } = fixture(t);
  const overview = {
    jobs: [
      job({ recentRuns: [{ status: "skipped" }, { status: "failed" }] }),
      job({ recentRuns: [{ status: "running" }] }),
      job(),
    ],
  };

  assert.equal(publishSchedulerAttention(manifestPath, () => overview, env), overview);
  assert.equal(readSchedulerAttention(manifestPath, env), 1);
  const attentionPath = schedulerAttentionPath(manifestPath, env);
  assert.match(attentionPath, /\/status\/[0-9a-f]{64}\.status$/);
  assert.equal(fs.readFileSync(attentionPath, "utf8"), "1\n");
  assert.equal(fs.statSync(attentionPath).mode & 0o077, 0);
});

test("an unavailable overview clears attention without replacing its error", (t) => {
  const { env, manifestPath } = fixture(t);
  publishSchedulerAttention(manifestPath, () => ({ jobs: [job({ candidateError: { code: "ENVIRONMENT" } })] }), env);
  const failure = new Error("manifest is unavailable");

  assert.throws(
    () => publishSchedulerAttention(manifestPath, () => { throw failure; }, env),
    (error) => error === failure,
  );
  assert.equal(readSchedulerAttention(manifestPath, env), 0);
});

test("attention publication failures never change the authoritative overview", (t) => {
  const { env, manifestPath } = fixture(t);
  const attentionPath = schedulerAttentionPath(manifestPath, env);
  fs.mkdirSync(attentionPath, { recursive: true });
  const overview = { jobs: [job({ candidateError: { code: "ENVIRONMENT" } })] };

  assert.equal(publishSchedulerAttention(manifestPath, () => overview, env), overview);
  assert.equal(fs.statSync(attentionPath).isDirectory(), true);
});

test("attention files reject unsafe identity and malformed counts", (t) => {
  const { env, manifestPath } = fixture(t);
  assert.throws(() => schedulerAttentionPath("relative/jobs.json", env), /absolute manifest path/);

  publishSchedulerAttention(manifestPath, () => ({ jobs: [] }), env);
  fs.writeFileSync(schedulerAttentionPath(manifestPath, env), "{}\n", { mode: 0o600 });
  assert.throws(() => readSchedulerAttention(manifestPath, env), /file is invalid/);
});

test("attention publication serializes repeated overview loads", (t) => {
  const { env, manifestPath } = fixture(t);
  let calls = 0;
  assert.equal(publishSchedulerAttention(manifestPath, () => ({ jobs: [], call: ++calls }), env).call, 1);
  assert.equal(publishSchedulerAttention(manifestPath, () => ({ jobs: [], call: ++calls }), env).call, 2);
});

test("a busy attention publisher never delays an authoritative overview", (t) => {
  const { env, manifestPath } = fixture(t);
  publishSchedulerAttention(manifestPath, () => ({ jobs: [] }), env);
  const attentionPath = schedulerAttentionPath(manifestPath, env);
  const release = acquireLock(attentionPath.replace(/\.status$/, ".lock"));
  t.after(release);
  let calls = 0;
  const blocked = { jobs: [job({ candidateError: { code: "ENVIRONMENT" } })] };

  assert.equal(publishSchedulerAttention(manifestPath, () => { calls++; return blocked; }, env), blocked);
  assert.equal(calls, 1);
  assert.equal(readSchedulerAttention(manifestPath, env), 0);
});
