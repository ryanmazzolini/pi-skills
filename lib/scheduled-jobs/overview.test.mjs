import assert from "node:assert/strict";
import test from "node:test";
import { SchedulerEnvironmentError } from "./index.mjs";
import { manifestOverview } from "./overview.mjs";

function declaration(id, key = id.split(":").slice(-2).join(":")) {
  return {
    id,
    key,
    description: `Description for ${key}`,
    schedule: "30 17 * * 1-5",
    sourcePath: "/config/pi-scheduler/jobs.json",
    scope: { kind: "global", identity: "global", root: "/config" },
    job: { schedule: "30 17 * * 1-5" },
  };
}

function candidate(id, digest) {
  return {
    digest,
    contract: {
      adapter: { mode: "auto", selected: "launchd" },
      workingDirectory: "/work",
      timeoutSeconds: 1800,
      schedule: "30 17 * * 1-5",
      id,
    },
  };
}

test("builds one bounded manifest overview while isolating per-job failures", () => {
  const manifestPath = "/config/pi-scheduler/jobs.json";
  const active = declaration("global:test:active");
  const broken = declaration("global:test:broken");
  const calls = [];
  const now = new Date("2026-07-25T10:00:00.000Z");
  const result = manifestOverview({ manifestPath, historyLimit: 2, now, runnerPath: "/bin/runner" }, {
    loadDeclarations(input) {
      calls.push(["load", input.manifestPath]);
      return [active, broken];
    },
    resolveCandidate(value) {
      if (value.id === broken.id) throw new SchedulerEnvironmentError("Missing required command: broken");
      return candidate(value.id, "candidate-digest");
    },
    installedStatus(id) {
      if (id === broken.id) return { id, installed: false, health: "absent" };
      return {
        id,
        installed: true,
        health: "ok",
        metadata: { enabled: true, digest: "installed-digest", revision: 3 },
        snapshot: { contract: { schedule: "30 17 * * 1-5" } },
        adapter: { name: "launchd", available: true, enabled: true, loaded: true, artifactMatches: true },
        drift: { enabled: false, artifact: false, otherAdapters: false },
      };
    },
    readRunHistory(id, options) {
      calls.push(["history", id, options.limit]);
      return id === active.id
        ? [{
            runId: "00000000-0000-4000-8000-000000000001",
            trigger: "scheduled",
            scheduledFor: "2026-07-24T17:30:00.000Z",
            startedAt: "2026-07-24T17:30:01.000Z",
            finishedAt: "2026-07-24T17:30:03.000Z",
            durationMilliseconds: 2000,
            status: "succeeded",
            exitCode: 0,
            signal: null,
            timedOut: false,
            reason: null,
            digest: "installed-digest",
            revision: 3,
            pid: 1,
            logPath: "/private/output.log",
          }]
        : [];
    },
    nextCronOccurrence(schedule, options) {
      calls.push(["next", schedule, options.after.toISOString()]);
      return new Date("2026-07-27T17:30:00.000Z");
    },
  });

  assert.equal(result.generatedAt, now.toISOString());
  assert.deepEqual(calls.filter(([kind]) => kind === "load"), [["load", manifestPath]]);
  assert.equal(result.jobs.length, 2);
  assert.equal(result.jobs[0].installation.definitionDrift, true);
  assert.equal(result.jobs[0].nextRun, "2026-07-27T17:30:00.000Z");
  assert.equal(result.jobs[0].recentRuns[0].status, "succeeded");
  assert.deepEqual(calls.filter(([kind]) => kind === "history").map((entry) => entry[2]), [2, 2]);
  assert.equal("pid" in result.jobs[0].recentRuns[0], false);
  assert.equal("logPath" in result.jobs[0].recentRuns[0], false);
  assert.equal(result.jobs[1].candidate, null);
  assert.equal(result.jobs[1].candidateError.code, "ENVIRONMENT");
  assert.equal(result.jobs[1].installation.installed, false);
  assert.equal(result.jobs[1].nextRun, null);
});

test("uses bounded run history as the only execution authority", () => {
  const current = declaration("global:test:active");
  const skipped = Array.from({ length: 10 }, (_, index) => ({
    runId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    trigger: "manual",
    scheduledFor: null,
    startedAt: new Date(20_000 - index).toISOString(),
    finishedAt: new Date(20_001 - index).toISOString(),
    durationMilliseconds: 1,
    status: "skipped",
    exitCode: null,
    signal: null,
    timedOut: false,
    reason: "overlap",
    digest: "digest",
    revision: 1,
  }));
  const failed = {
    ...skipped[0],
    runId: "00000000-0000-4000-8000-000000000099",
    startedAt: new Date(1).toISOString(),
    finishedAt: new Date(2).toISOString(),
    status: "failed",
    reason: "exited with code 3",
  };
  const result = manifestOverview({ manifestPath: current.sourcePath, historyLimit: 10, now: new Date(30_000) }, {
    loadDeclarations: () => [current],
    resolveCandidate: (value) => candidate(value.id, "digest"),
    installedStatus: (id) => ({
      id,
      installed: true,
      health: "ok",
      metadata: { enabled: true, digest: "digest", revision: 1 },
      snapshot: { contract: { schedule: current.schedule } },
      drift: { enabled: false, artifact: false, otherAdapters: false },
    }),
    readRunHistory: (_id, { limit }) => [...skipped.slice(0, limit - 1), failed],
    nextCronOccurrence: () => new Date(40_000),
  });
  assert.equal(result.jobs[0].recentRuns.length, 10);
  assert.equal(result.jobs[0].recentRuns.filter((run) => run.status === "skipped").length, 9);
  assert.equal(result.jobs[0].recentRuns.at(-1).status, "failed");
  assert.equal("effectiveRun" in result.jobs[0], false);
});

test("suppresses next run for paused, unhealthy, or adapter-drifted installations", () => {
  const jobs = [declaration("global:test:paused"), declaration("global:test:unhealthy"), declaration("global:test:drift")];
  let nextCalls = 0;
  const result = manifestOverview({ manifestPath: "/config/pi-scheduler/jobs.json", now: new Date(0) }, {
    loadDeclarations: () => jobs,
    resolveCandidate: (value) => candidate(value.id, "digest"),
    installedStatus(id) {
      return {
        id,
        installed: true,
        health: id.endsWith("unhealthy") ? "unhealthy" : "ok",
        metadata: { enabled: !id.endsWith("paused"), digest: "digest", revision: 1 },
        snapshot: { contract: { schedule: "30 17 * * 1-5" } },
        drift: { enabled: id.endsWith("drift"), artifact: false, otherAdapters: false },
      };
    },
    readRunHistory: () => [],
    nextCronOccurrence: () => {
      nextCalls += 1;
      return new Date(1);
    },
  });

  assert.deepEqual(result.jobs.map((job) => job.nextRun), [null, null, null]);
  assert.equal(nextCalls, 0);
});
