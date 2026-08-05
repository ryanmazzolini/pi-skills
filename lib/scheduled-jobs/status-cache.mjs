import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { schedulerEffectiveRun, schedulerJobStatus } from "./job-status.mjs";
import {
  acquireLock,
  atomicWriteJson,
  ensurePrivateDirectory,
  readPrivateJson,
  stateRoot,
} from "./runtime.mjs";

export const SCHEDULER_STATUS_VERSION = 1;
const STATUS_DIRECTORY = "status";
const MAX_STATUS_JOBS = 128;
const JOB_STATUSES = new Set([
  "running",
  "needs-attention",
  "draft",
  "active",
  "active-update",
  "paused",
  "paused-update",
]);
const RUN_STATUSES = new Set(["running", "succeeded", "failed", "timed-out", "skipped", "interrupted"]);
const FAILED_RUN_STATUSES = new Set(["failed", "timed-out", "interrupted"]);

function normalizedManifestPath(manifestPath) {
  if (typeof manifestPath !== "string" || !path.isAbsolute(manifestPath)) {
    throw new Error("Scheduler status requires an absolute manifest path.");
  }
  let current = path.resolve(manifestPath);
  const missing = [];
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    missing.unshift(path.basename(current));
    current = parent;
  }
  const canonical = fs.existsSync(current) ? fs.realpathSync(current) : current;
  return path.join(canonical, ...missing);
}

export function schedulerStatusDirectory(env = process.env) {
  return path.join(stateRoot(env), STATUS_DIRECTORY);
}

export function ensureSchedulerStatusDirectory(env = process.env) {
  return ensurePrivateDirectory(schedulerStatusDirectory(env));
}

function manifestHash(manifestPath) {
  return createHash("sha256").update(normalizedManifestPath(manifestPath)).digest("hex");
}

export function schedulerStatusSnapshotPath(manifestPath, env = process.env) {
  return path.join(schedulerStatusDirectory(env), `${manifestHash(manifestPath)}.json`);
}

export function withSchedulerStatusLock(manifestPath, env = process.env, callback) {
  const lockPath = path.join(schedulerStatusDirectory(env), `${manifestHash(manifestPath)}.refresh.lock`);
  const release = acquireLock(lockPath, { waitMilliseconds: 120_000 });
  try {
    return callback();
  } finally {
    release();
  }
}

function attentionCount(jobs) {
  return jobs.filter((job) => (
    job.runStatus === "running"
      ? false
      : FAILED_RUN_STATUSES.has(job.runStatus)
        ? true
        : job.baseStatus === "needs-attention"
  )).length;
}

function snapshotRecord(manifestPath, jobs, generatedAt = new Date().toISOString()) {
  const normalized = normalizedManifestPath(manifestPath);
  const sorted = [...jobs].sort((left, right) => left.id.localeCompare(right.id));
  return {
    version: SCHEDULER_STATUS_VERSION,
    manifestPath: normalized,
    generatedAt,
    attentionCount: attentionCount(sorted),
    jobs: sorted,
  };
}

export function writeSchedulerStatusSnapshot(manifestPath, overview, env = process.env) {
  const sourceJobs = Array.isArray(overview?.jobs) ? overview.jobs : [];
  const jobs = sourceJobs.map((job) => {
    const effectiveRun = schedulerEffectiveRun(job);
    return {
      id: job.id,
      baseStatus: schedulerJobStatus({ ...job, recentRuns: [], effectiveRun: null }),
      installationDigest: typeof job.installation?.digest === "string" ? job.installation.digest : null,
      installationRevision: Number.isSafeInteger(job.installation?.revision) ? job.installation.revision : null,
      runStatus: typeof effectiveRun?.status === "string" ? effectiveRun.status : null,
    };
  });
  const snapshot = snapshotRecord(
    manifestPath,
    jobs,
    typeof overview?.generatedAt === "string" ? overview.generatedAt : new Date().toISOString(),
  );
  validateSnapshot(snapshot, normalizedManifestPath(manifestPath));
  atomicWriteJson(schedulerStatusSnapshotPath(manifestPath, env), snapshot);
  return snapshot;
}

export function writeUnavailableSchedulerStatusSnapshot(manifestPath, env = process.env) {
  const snapshot = snapshotRecord(manifestPath, []);
  atomicWriteJson(schedulerStatusSnapshotPath(manifestPath, env), snapshot);
  return snapshot;
}

export function updateSchedulerStatusRun(manifestPath, id, run, env = process.env) {
  if (typeof id !== "string" || id.length < 1 || id.length > 512 || /[\u0000-\u001f\u007f]/.test(id)) {
    throw new Error("Scheduler status job ID is invalid.");
  }
  if (
    !run
    || !RUN_STATUSES.has(run.status)
    || typeof run.digest !== "string"
    || run.digest.length < 1
    || run.digest.length > 256
    || !Number.isSafeInteger(run.revision)
    || run.revision < 1
  ) throw new Error("Scheduler run status is invalid.");
  return withSchedulerStatusLock(manifestPath, env, () => {
    const previous = readSchedulerStatusSnapshot(manifestPath, env);
    if (run.status === "skipped") return previous;
    const jobs = previous ? previous.jobs.map((job) => ({ ...job })) : [];
    const existing = jobs.find((job) => job.id === id);
    if (existing) {
      if (existing.installationDigest !== run.digest || existing.installationRevision !== run.revision) return previous;
      existing.runStatus = run.status;
    } else {
      jobs.push({
        id,
        baseStatus: "active",
        installationDigest: run.digest,
        installationRevision: run.revision,
        runStatus: run.status,
      });
    }
    const snapshot = snapshotRecord(manifestPath, jobs);
    validateSnapshot(snapshot, normalizedManifestPath(manifestPath));
    atomicWriteJson(schedulerStatusSnapshotPath(manifestPath, env), snapshot);
    return snapshot;
  });
}

function validateSnapshot(snapshot, normalized) {
  if (
    !snapshot
    || snapshot.version !== SCHEDULER_STATUS_VERSION
    || snapshot.manifestPath !== normalized
    || typeof snapshot.generatedAt !== "string"
    || !Number.isFinite(Date.parse(snapshot.generatedAt))
    || !Number.isSafeInteger(snapshot.attentionCount)
    || snapshot.attentionCount < 0
    || !Array.isArray(snapshot.jobs)
    || snapshot.jobs.length > MAX_STATUS_JOBS
    || snapshot.jobs.some((job) => (
      !job
      || typeof job.id !== "string"
      || job.id.length < 1
      || job.id.length > 512
      || /[\u0000-\u001f\u007f]/.test(job.id)
      || !JOB_STATUSES.has(job.baseStatus)
      || job.installationDigest !== null && (
        typeof job.installationDigest !== "string"
        || job.installationDigest.length < 1
        || job.installationDigest.length > 256
      )
      || job.installationRevision !== null && (
        !Number.isSafeInteger(job.installationRevision)
        || job.installationRevision < 1
      )
      || (job.installationDigest === null) !== (job.installationRevision === null)
      || job.runStatus !== null && !RUN_STATUSES.has(job.runStatus)
    ))
    || new Set(snapshot.jobs.map((job) => job.id)).size !== snapshot.jobs.length
    || attentionCount(snapshot.jobs) !== snapshot.attentionCount
  ) throw new Error("Scheduler status snapshot is invalid.");
  return snapshot;
}

export function readSchedulerStatusSnapshot(manifestPath, env = process.env) {
  const normalized = normalizedManifestPath(manifestPath);
  const snapshot = readPrivateJson(schedulerStatusSnapshotPath(normalized, env));
  if (snapshot === undefined) return undefined;
  return validateSnapshot(snapshot, normalized);
}
