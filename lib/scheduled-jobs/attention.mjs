import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { schedulerJobStatus } from "./job-status.mjs";
import {
  acquireLock,
  atomicWriteJson,
  ensurePrivateDirectory,
  readPrivateJson,
  stateRoot,
} from "./runtime.mjs";

const STATUS_DIRECTORY = "status";
const MAX_ATTENTION_COUNT = 128;

function normalizedManifestPath(manifestPath) {
  if (typeof manifestPath !== "string" || !path.isAbsolute(manifestPath)) {
    throw new Error("Scheduler attention requires an absolute manifest path.");
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

export function schedulerAttentionDirectory(env = process.env) {
  return path.join(stateRoot(env), STATUS_DIRECTORY);
}

export function ensureSchedulerAttentionDirectory(env = process.env) {
  return ensurePrivateDirectory(schedulerAttentionDirectory(env));
}

function manifestHash(manifestPath) {
  return createHash("sha256").update(normalizedManifestPath(manifestPath)).digest("hex");
}

export function schedulerAttentionPath(manifestPath, env = process.env) {
  return path.join(schedulerAttentionDirectory(env), `${manifestHash(manifestPath)}.status`);
}

function attentionCount(overview) {
  const jobs = Array.isArray(overview?.jobs) ? overview.jobs : [];
  const count = jobs.filter((job) => schedulerJobStatus(job) === "needs-attention").length;
  if (count > MAX_ATTENTION_COUNT) throw new Error("Scheduler attention count exceeds the manifest job limit.");
  return count;
}

function writeAttention(manifestPath, count, env) {
  atomicWriteJson(schedulerAttentionPath(manifestPath, env), count);
}

export function publishSchedulerAttention(manifestPath, loadOverview, env = process.env) {
  if (typeof loadOverview !== "function") throw new Error("Scheduler attention publication requires an overview loader.");
  let overviewError;
  try {
    ensureSchedulerAttentionDirectory(env);
    const lockPath = path.join(schedulerAttentionDirectory(env), `${manifestHash(manifestPath)}.lock`);
    const release = acquireLock(lockPath, { waitMilliseconds: 120_000 });
    try {
      let overview;
      try {
        overview = loadOverview();
      } catch (error) {
        overviewError = error;
        try {
          writeAttention(manifestPath, 0, env);
        } catch {
          // Preserve the authoritative overview failure.
        }
        throw error;
      }
      try {
        writeAttention(manifestPath, attentionCount(overview), env);
      } catch {
        // Publication is derived state and cannot change an authoritative result.
      }
      return overview;
    } finally {
      release();
    }
  } catch (error) {
    if (overviewError) throw overviewError;
    return loadOverview();
  }
}

export function readSchedulerAttention(manifestPath, env = process.env) {
  const value = readPrivateJson(schedulerAttentionPath(manifestPath, env));
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_ATTENTION_COUNT) {
    throw new Error("Scheduler attention file is invalid.");
  }
  return value;
}
