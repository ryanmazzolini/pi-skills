import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  SchedulerEnvironmentError,
  SchedulerError,
  assertSafeCommandBinding,
  assertSafeExecutable,
  schedulerStateRoot,
  schedulerStorage,
} from "./index.mjs";
import { previousCronOccurrence } from "./schedule.mjs";

export const STATE_VERSION = 1;
export const RUN_HISTORY_VERSION = 1;
export const MAX_STATE_BYTES = 1024 * 1024;
export const MAX_RUN_OUTPUT_BYTES = MAX_STATE_BYTES;
export const MAX_RUN_HISTORY = 200;
export const LOG_ROTATE_BYTES = 5 * 1024 * 1024;
export const LOG_ROTATE_FILES = 3;

const RUN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const RUN_STATUSES = new Set(["running", "succeeded", "failed", "timed-out", "skipped"]);
const RUN_TRIGGERS = new Set(["manual", "scheduled"]);

export class SchedulerBusyError extends SchedulerError {
  constructor(message) {
    super(message, { code: "BUSY", exitCode: 6 });
    this.name = "SchedulerBusyError";
  }
}

export class SchedulerExecutionError extends SchedulerError {
  constructor(message, details) {
    super(message, { code: "EXECUTION", exitCode: 5, details });
    this.name = "SchedulerExecutionError";
  }
}

function currentUid() {
  return typeof process.getuid === "function" ? process.getuid() : undefined;
}

export function stateRoot(env = process.env) {
  return schedulerStateRoot(env);
}

export function installedPaths(id, env = process.env) {
  const storage = schedulerStorage(id, env);
  const { hash, root, jobDirectory } = storage;
  return {
    hash,
    root,
    jobsDirectory: path.join(root, "jobs"),
    jobDirectory,
    snapshotPath: path.join(jobDirectory, "snapshot.json"),
    metadataPath: path.join(jobDirectory, "metadata.json"),
    shimsDirectory: storage.shimsDirectory,
    launcherPath: storage.launcherPath,
    locksDirectory: path.join(root, "locks"),
    lifecycleLockPath: path.join(root, "locks", `${hash}.lifecycle.lock`),
    executionLockPath: path.join(root, "locks", `${hash}.execution.lock`),
    runHistoryLockPath: path.join(root, "locks", `${hash}.runs.lock`),
    logsDirectory: path.join(root, "logs"),
    logPath: storage.logPath,
    runsRootDirectory: path.join(root, "runs"),
    runDirectory: path.join(root, "runs", hash),
  };
}

function verifyOwnedDirectory(directory) {
  const stats = fs.lstatSync(directory);
  const uid = currentUid();
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new SchedulerError(`Scheduler-owned path is not a real directory: ${directory}`);
  }
  if (uid !== undefined && stats.uid !== uid) {
    throw new SchedulerError(`Scheduler-owned directory is not owned by the current user: ${directory}`);
  }
  if ((stats.mode & 0o077) !== 0) fs.chmodSync(directory, 0o700);
}

export function ensurePrivateDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  verifyOwnedDirectory(directory);
  return directory;
}

function ensureStateLayout(paths) {
  ensurePrivateDirectory(paths.root);
  ensurePrivateDirectory(paths.jobsDirectory);
  ensurePrivateDirectory(paths.locksDirectory);
  ensurePrivateDirectory(paths.logsDirectory);
}

function atomicWrite(filePath, content, mode = 0o600) {
  ensurePrivateDirectory(path.dirname(filePath));
  const temporaryPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
  let descriptor;
  try {
    descriptor = fs.openSync(temporaryPath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, mode);
    fs.writeFileSync(descriptor, content, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporaryPath, filePath);
    fs.chmodSync(filePath, mode);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    fs.rmSync(temporaryPath, { force: true });
  }
}

export function atomicWriteJson(filePath, value) {
  atomicWrite(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeNewPrivateJson(filePath, value) {
  ensurePrivateDirectory(path.dirname(filePath));
  const temporaryPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.new`);
  let descriptor;
  try {
    descriptor = fs.openSync(
      temporaryPath,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW,
      0o600,
    );
    fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fs.fsyncSync(descriptor);
    fs.fchmodSync(descriptor, 0o600);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.linkSync(temporaryPath, filePath);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    fs.rmSync(temporaryPath, { force: true });
  }
}

export function readPrivateJson(filePath) {
  let descriptor;
  try {
    descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const stats = fs.fstatSync(descriptor);
    const uid = currentUid();
    if (!stats.isFile()) throw new SchedulerError(`Scheduler state is not a regular file: ${filePath}`);
    if (uid !== undefined && stats.uid !== uid) {
      throw new SchedulerError(`Scheduler state is not owned by the current user: ${filePath}`);
    }
    if ((stats.mode & 0o077) !== 0) throw new SchedulerError(`Scheduler state permissions are too broad: ${filePath}`);
    if (stats.size > MAX_STATE_BYTES) throw new SchedulerError(`Scheduler state is too large: ${filePath}`);
    const buffer = Buffer.alloc(MAX_STATE_BYTES + 1);
    const bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, 0);
    if (bytesRead > MAX_STATE_BYTES) throw new SchedulerError(`Scheduler state is too large: ${filePath}`);
    return JSON.parse(buffer.toString("utf8", 0, bytesRead));
  } catch (error) {
    if (error instanceof SyntaxError) throw new SchedulerError(`Scheduler state is invalid JSON: ${filePath}`);
    if (error.code === "ENOENT") return undefined;
    if (error.code === "ELOOP") throw new SchedulerError(`Scheduler state must not be a symbolic link: ${filePath}`);
    throw error;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

function assertRunId(runId) {
  if (typeof runId !== "string" || !RUN_ID_PATTERN.test(runId)) {
    throw new SchedulerError("Run ID must be a scheduler-generated UUID.", { code: "USAGE", exitCode: 2 });
  }
  return runId;
}

function runPaths(id, runId, env = process.env) {
  const paths = installedPaths(id, env);
  const safeRunId = assertRunId(runId);
  return {
    ...paths,
    recordPath: path.join(paths.runDirectory, `${safeRunId}.json`),
    outputPath: path.join(paths.runDirectory, `${safeRunId}.log`),
    startGatePath: path.join(paths.runDirectory, `${safeRunId}.start.lock`),
  };
}

function assertRunRecord(record, id, runId) {
  const validTimestamp = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
  if (
    !record
    || record.version !== RUN_HISTORY_VERSION
    || record.id !== id
    || record.runId !== runId
    || !RUN_TRIGGERS.has(record.trigger)
    || !RUN_STATUSES.has(record.status)
    || !validTimestamp(record.startedAt)
    || (record.finishedAt !== null && !validTimestamp(record.finishedAt))
    || !Number.isInteger(record.pid)
    || record.pid < 1
    || (record.outputTruncated !== undefined && typeof record.outputTruncated !== "boolean")
  ) {
    throw new SchedulerError(`Scheduler run record is invalid: ${runId}`);
  }
  return record;
}

function withRunHistoryLock(id, env, callback) {
  const release = acquireLock(installedPaths(id, env).runHistoryLockPath, { waitMilliseconds: 60_000 });
  try {
    return callback();
  } finally {
    release();
  }
}

function readRunRecords(id, env = process.env) {
  const paths = installedPaths(id, env);
  if (!fs.existsSync(paths.runDirectory)) return [];
  verifyOwnedDirectory(paths.runDirectory);
  const records = [];
  for (const entry of fs.readdirSync(paths.runDirectory, { withFileTypes: true })) {
    const match = /^([0-9a-f-]+)\.json$/.exec(entry.name);
    if (!match) continue;
    const runId = assertRunId(match[1]);
    if (!entry.isFile() || entry.isSymbolicLink()) {
      throw new SchedulerError(`Scheduler run record is not a regular file: ${path.join(paths.runDirectory, entry.name)}`);
    }
    const record = assertRunRecord(readPrivateJson(path.join(paths.runDirectory, entry.name)), id, runId);
    records.push(record);
  }
  return records.sort((left, right) => {
    const time = Date.parse(right.startedAt) - Date.parse(left.startedAt);
    return time || right.runId.localeCompare(left.runId);
  });
}

function isLiveRun(record) {
  return record.status === "running" && processIsAlive(record.pid);
}

function pruneRunRecords(id, env = process.env) {
  const records = readRunRecords(id, env);
  const liveRuns = records.filter(isLiveRun);
  const finished = records.filter((record) => !liveRuns.includes(record));
  const retainedExecutions = finished.filter((record) => record.status !== "skipped").slice(0, MAX_RUN_HISTORY);
  const remaining = MAX_RUN_HISTORY - retainedExecutions.length;
  const retainedSkipped = finished.filter((record) => record.status === "skipped").slice(0, remaining);
  const retained = new Set([
    ...liveRuns.map((record) => record.runId),
    ...retainedExecutions.map((record) => record.runId),
    ...retainedSkipped.map((record) => record.runId),
  ]);
  for (const record of records) {
    if (retained.has(record.runId)) continue;
    const paths = runPaths(id, record.runId, env);
    fs.rmSync(paths.recordPath, { force: true });
    fs.rmSync(paths.outputPath, { force: true });
    fs.rmSync(paths.startGatePath, { recursive: true, force: true });
  }
}

function scheduledTime(installed, trigger, startedAt) {
  if (trigger !== "scheduled") return null;
  return previousCronOccurrence(installed.snapshot.contract.schedule, { atOrBefore: startedAt })?.toISOString() ?? null;
}

function beginRun(installed, { env, trigger, now, runId = randomUUID() }) {
  if (!RUN_TRIGGERS.has(trigger)) throw new SchedulerError(`Unknown scheduler run trigger: ${trigger}`);
  const startedAt = now();
  const safeRunId = assertRunId(runId);
  const paths = runPaths(installed.id, safeRunId, env);
  const record = {
    version: RUN_HISTORY_VERSION,
    runId: safeRunId,
    id: installed.id,
    trigger,
    scheduledFor: scheduledTime(installed, trigger, startedAt),
    startedAt: startedAt.toISOString(),
    finishedAt: null,
    status: "running",
    pid: process.pid,
    digest: installed.metadata.digest,
    revision: installed.metadata.revision,
    exitCode: null,
    signal: null,
    timedOut: false,
    reason: null,
    logPath: paths.outputPath,
    outputTruncated: false,
  };
  return withRunHistoryLock(installed.id, env, () => {
    ensurePrivateDirectory(paths.runsRootDirectory);
    ensurePrivateDirectory(paths.runDirectory);
    writeNewPrivateJson(paths.recordPath, record);
    pruneRunRecords(installed.id, env);
    return record;
  });
}

function preparedRun(id, runId, { env, expectedDigest, expectedRevision, trigger }) {
  return withRunHistoryLock(id, env, () => {
    const paths = runPaths(id, runId, env);
    const record = assertRunRecord(readPrivateJson(paths.recordPath), id, runId);
    if (
      record.status !== "running"
      || record.trigger !== trigger
      || record.digest !== expectedDigest
      || record.revision !== expectedRevision
    ) {
      throw new SchedulerError(`Prepared scheduler run does not match the reviewed execution: ${runId}`);
    }
    return record;
  });
}

function updateRunningRun(record, changes, env) {
  if (record.status !== "running") throw new SchedulerError(`Scheduler run is no longer active: ${record.runId}`);
  const next = { ...record, ...changes };
  return withRunHistoryLock(record.id, env, () => {
    atomicWriteJson(runPaths(record.id, record.runId, env).recordPath, next);
    return next;
  });
}

function finishRun(record, changes, { env, now }) {
  const paths = runPaths(record.id, record.runId, env);
  const finishedAt = now();
  const next = {
    ...record,
    ...changes,
    finishedAt: finishedAt.toISOString(),
    durationMilliseconds: Math.max(0, finishedAt.getTime() - Date.parse(record.startedAt)),
  };
  return withRunHistoryLock(record.id, env, () => {
    atomicWriteJson(paths.recordPath, next);
    pruneRunRecords(record.id, env);
    return next;
  });
}

function skippedRun(installed, { env, trigger, now, reason, runId }) {
  const record = beginRun(installed, { env, trigger, now, runId });
  return finishRun(record, { status: "skipped", reason }, { env, now });
}

function projectedRunRecord(record) {
  return record.status === "running" && !processIsAlive(record.pid)
    ? { ...record, status: "interrupted", reason: "scheduler process is no longer running" }
    : record;
}

function limitedRunRecords(records, limit) {
  const required = records.filter(isLiveRun).slice(0, limit);
  const requiredIds = new Set(required.map((record) => record.runId));
  const effective = records.find((record) => record.status !== "skipped");
  if (effective && required.length < limit && !requiredIds.has(effective.runId)) {
    required.push(effective);
    requiredIds.add(effective.runId);
  }
  const selectedIds = new Set(requiredIds);
  for (const record of records) {
    if (selectedIds.size >= limit) break;
    selectedIds.add(record.runId);
  }
  return records.filter((record) => selectedIds.has(record.runId));
}

export function readRunHistory(id, { env = process.env, limit = 20 } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RUN_HISTORY) {
    throw new SchedulerError(`Run history limit must be an integer from 1 to ${MAX_RUN_HISTORY}.`, { code: "USAGE", exitCode: 2 });
  }
  if (!fs.existsSync(installedPaths(id, env).runDirectory)) return [];
  return withRunHistoryLock(id, env, () => limitedRunRecords(readRunRecords(id, env), limit).map(projectedRunRecord));
}

const OWNERLESS_LOCK_GRACE_MILLISECONDS = 30_000;
const LOCK_WAIT_ARRAY = new Int32Array(new SharedArrayBuffer(4));

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function removeStaleLock(lockPath) {
  const identity = fs.lstatSync(lockPath, { bigint: true });
  if (!identity.isDirectory() || identity.isSymbolicLink()) {
    throw new SchedulerError(`Scheduler lock is not a real directory: ${lockPath}`);
  }
  const owner = readPrivateJson(path.join(lockPath, "owner.json"));
  if (!owner) {
    const age = Date.now() - Number(identity.mtimeMs);
    if (age < OWNERLESS_LOCK_GRACE_MILLISECONDS) return false;
  } else if (processIsAlive(owner.pid)) return false;
  const current = fs.lstatSync(lockPath, { bigint: true });
  if (!sameIdentity(identity, current)) return false;
  fs.rmSync(lockPath, { recursive: true, force: true });
  return true;
}

export function acquireLock(lockPath, { skipIfBusy = false, waitMilliseconds = 0 } = {}) {
  ensurePrivateDirectory(path.dirname(lockPath));
  const deadline = Date.now() + waitMilliseconds;
  for (;;) {
    try {
      fs.mkdirSync(lockPath, { mode: 0o700 });
      const stats = fs.statSync(lockPath, { bigint: true });
      atomicWriteJson(path.join(lockPath, "owner.json"), {
        pid: process.pid,
        acquiredAt: new Date().toISOString(),
      });
      let released = false;
      return () => {
        if (released) return;
        released = true;
        try {
          const current = fs.statSync(lockPath, { bigint: true });
          if (current.dev === stats.dev && current.ino === stats.ino) {
            fs.rmSync(lockPath, { recursive: true, force: true });
          }
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      try {
        if (removeStaleLock(lockPath)) continue;
      } catch (staleError) {
        if (staleError.code === "ENOENT") continue;
        throw staleError;
      }
      if (Date.now() < deadline) {
        Atomics.wait(LOCK_WAIT_ARRAY, 0, 0, Math.min(50, deadline - Date.now()));
        continue;
      }
      if (skipIfBusy) return undefined;
      throw new SchedulerBusyError(`Scheduler operation is already in progress for lock: ${lockPath}`);
    }
  }
}

export function assertInstalledPreconditions(
  installed,
  { expectedDigest, expectedRevision, allowHealthCategories = [] } = {},
) {
  if (!installed) throw new SchedulerError("Job is not installed.", { code: "NOT_INSTALLED", exitCode: 3 });
  const allowedUnhealthyState = installed.health === "unhealthy"
    && allowHealthCategories.includes(installed.healthCategory);
  if (installed.health !== "ok" && !allowedUnhealthyState) {
    throw new SchedulerError(`Installed job state is ${installed.health}: ${installed.id}`);
  }
  if (!expectedDigest) throw new SchedulerError("--expected-installed-digest is required.", { code: "USAGE", exitCode: 2 });
  if (!Number.isInteger(expectedRevision)) {
    throw new SchedulerError("--expected-revision is required and must be an integer.", { code: "USAGE", exitCode: 2 });
  }
  if (installed.metadata.digest !== expectedDigest || installed.metadata.revision !== expectedRevision) {
    throw new SchedulerError("Installed digest or lifecycle revision changed; inspect the job again.", {
      code: "STALE_STATE",
      exitCode: 7,
      details: {
        expectedDigest,
        expectedRevision,
        actualDigest: installed.metadata.digest,
        actualRevision: installed.metadata.revision,
      },
    });
  }
}

export function readInstalled(id, env = process.env) {
  const paths = installedPaths(id, env);
  const snapshot = readPrivateJson(paths.snapshotPath);
  const metadata = readPrivateJson(paths.metadataPath);
  if (!snapshot && !metadata) return undefined;
  if (!snapshot || !metadata) {
    return { id, paths, snapshot, metadata, health: "partial", healthReason: "snapshot or metadata is missing" };
  }
  const structurallyValid = snapshot.version === STATE_VERSION
    && metadata.version === STATE_VERSION
    && snapshot.id === id
    && metadata.id === id
    && snapshot.digest === metadata.digest
    && Number.isInteger(snapshot.revision)
    && snapshot.revision === metadata.revision
    && typeof metadata.enabled === "boolean"
    && metadata.adapter === snapshot.contract?.adapter?.selected
    && metadata.adapterHistory
    && typeof metadata.adapterHistory === "object"
    && metadata.adapterHistory[metadata.adapter]?.executable === snapshot.contract?.adapter?.executable
    && snapshot.environment?.PATH === paths.shimsDirectory
    && snapshot.contract?.scheduler?.root === paths.root
    && snapshot.contract?.scheduler?.jobDirectory === paths.jobDirectory
    && snapshot.contract?.scheduler?.shimsDirectory === paths.shimsDirectory
    && (
      snapshot.contract?.scheduler?.launcherPath === undefined
      || snapshot.contract.scheduler.launcherPath === paths.launcherPath
    )
    && snapshot.contract?.scheduler?.logPath === paths.logPath;
  if (!structurallyValid) {
    return { id, paths, snapshot, metadata, health: "corrupt", healthReason: "state invariants do not match" };
  }
  const installed = { id, paths, snapshot, metadata, health: "ok" };
  try {
    verifyInstalledShims(installed);
  } catch (error) {
    return {
      ...installed,
      health: "unhealthy",
      healthReason: error.message,
      healthCategory: error.details?.healthCategory,
    };
  }
  return installed;
}

function assertShimResolvesToBindingTarget(shimPath, binding, name) {
  const target = assertSafeCommandBinding(binding);
  let shimTargetStats;
  let targetStats;
  try {
    shimTargetStats = fs.statSync(shimPath);
    fs.accessSync(shimPath, fs.constants.X_OK);
    targetStats = fs.statSync(target);
  } catch {
    throw new SchedulerEnvironmentError(
      `Command shim is not executable through the kernel: ${name}`,
      { healthCategory: "commands" },
    );
  }
  if (
    !shimTargetStats.isFile()
    || shimTargetStats.dev !== targetStats.dev
    || shimTargetStats.ino !== targetStats.ino
  ) {
    throw new SchedulerEnvironmentError(
      `Command shim kernel resolution changed: ${name}`,
      { healthCategory: "commands" },
    );
  }
}

function writeShim(shimsDirectory, name, binding) {
  const shimPath = path.join(shimsDirectory, name);
  fs.symlinkSync(binding, shimPath);
  if (fs.readlinkSync(shimPath) !== binding) {
    throw new SchedulerEnvironmentError(`Command shim did not bind to the reviewed command path: ${name}`);
  }
  assertShimResolvesToBindingTarget(shimPath, binding, name);
}

function installedLauncherSource() {
  const uid = currentUid();
  if (!Number.isInteger(uid) || uid < 0) {
    throw new SchedulerEnvironmentError("Installed launcher requires a numeric current user ID.");
  }
  const trustedGroupWritableDirectory = process.platform === "darwin" ? `|${uid}:80:?????w*` : "";
  return `#!/bin/sh
set -eu

fail() {
  printf '%s\\n' "pi-scheduler: unsafe installed runtime: $1" >&2
  exit 126
}

check_safe() {
  target=$1
  [ -f "$target" ] && [ -x "$target" ] || fail "$target"
  set -- $(LC_ALL=C /bin/ls -nd "$target")
  permissions=$1
  owner=$3
  case "$permissions" in -?????????*) ;; *) fail "$target" ;; esac
  case "$permissions" in ?????w*|????????w*) fail "$target" ;; esac
  case "$owner" in 0|${uid}) ;; *) fail "$target" ;; esac

  parent=\${target%/*}
  [ -n "$parent" ] || parent=/
  while :; do
    set -- $(LC_ALL=C /bin/ls -nd "$parent")
    permissions=$1
    owner=$3
    group=$4
    case "$permissions" in d?????????*) ;; *) fail "$parent" ;; esac
    case "$owner" in 0|${uid}) ;; *) fail "$parent" ;; esac
    case "$permissions" in
      ????????w*)
        case "$owner:$permissions" in
          0:?????????t*|0:?????????T*) ;;
          *) fail "$parent" ;;
        esac
        ;;
    esac
    case "$permissions" in
      ?????w*)
        case "$owner:$group:$permissions" in
          0:*:?????????t*|0:*:?????????T*${trustedGroupWritableDirectory}) ;;
          *) fail "$parent" ;;
        esac
        ;;
    esac
    [ "$parent" = / ] && break
    parent=\${parent%/*}
    [ -n "$parent" ] || parent=/
  done
}

[ "$#" -ge 2 ] || fail "missing runtime arguments"
check_safe "$1"
check_safe "$2"
exec "$@"
`;
}

export function stageInstalledSnapshot(candidate, {
  env = process.env,
  revision,
  enabled = false,
  installedAt = new Date().toISOString(),
  adapterHistory = {},
} = {}) {
  if (!Number.isInteger(revision) || revision < 1) throw new SchedulerError("Installed revision must be positive.");
  const id = candidate.contract.id;
  const paths = installedPaths(id, env);
  if (
    candidate.contract.scheduler?.root !== paths.root
    || candidate.contract.scheduler?.jobDirectory !== paths.jobDirectory
    || candidate.contract.scheduler?.shimsDirectory !== paths.shimsDirectory
    || candidate.contract.scheduler?.launcherPath !== paths.launcherPath
    || candidate.contract.scheduler?.logPath !== paths.logPath
  ) {
    throw new SchedulerEnvironmentError("Scheduler state location changed after candidate review.");
  }
  ensureStateLayout(paths);
  ensurePrivateLog(paths.logPath);
  const stageDirectory = path.join(paths.jobsDirectory, `.${paths.hash}.${process.pid}.${randomUUID()}.tmp`);
  fs.mkdirSync(stageDirectory, { mode: 0o700 });
  const stageShims = path.join(stageDirectory, "shims");
  fs.mkdirSync(stageShims, { mode: 0o700 });
  try {
    for (const [name, executable] of Object.entries(candidate.contract.requiredCommands)) {
      writeShim(stageShims, name, executable);
    }
    for (const [name, executable] of Object.entries(candidate.contract.optionalCommands)) {
      if (executable) writeShim(stageShims, name, executable);
    }
    const environment = {
      HOME: candidate.contract.environment.HOME,
      USER: candidate.contract.environment.USER,
      PATH: candidate.contract.scheduler.shimsDirectory,
      TMPDIR: candidate.contract.environment.TMPDIR,
      ...candidate.contract.environment.locale,
    };
    const snapshot = {
      version: STATE_VERSION,
      id,
      digest: candidate.digest,
      revision,
      contract: candidate.contract,
      environment,
    };
    const adapterDescriptor = {
      selected: candidate.contract.adapter.selected,
      executable: candidate.contract.adapter.executable,
      homeDirectory: candidate.contract.environment.HOME,
      ...(candidate.contract.adapter.configHome
        ? { configHome: candidate.contract.adapter.configHome }
        : {}),
    };
    const metadata = {
      version: STATE_VERSION,
      id,
      digest: candidate.digest,
      revision,
      enabled,
      adapter: candidate.contract.adapter.selected,
      adapterHistory: {
        ...adapterHistory,
        [candidate.contract.adapter.selected]: adapterDescriptor,
      },
      sourcePath: candidate.contract.sourcePath,
      installedAt,
      updatedAt: new Date().toISOString(),
    };
    atomicWriteJson(path.join(stageDirectory, "snapshot.json"), snapshot);
    atomicWriteJson(path.join(stageDirectory, "metadata.json"), metadata);
    atomicWrite(path.join(stageDirectory, path.basename(paths.launcherPath)), installedLauncherSource(), 0o700);
    return { paths, stageDirectory, snapshot, metadata };
  } catch (error) {
    fs.rmSync(stageDirectory, { recursive: true, force: true });
    throw error;
  }
}

export function discardStagedSnapshot(staged) {
  fs.rmSync(staged.stageDirectory, { recursive: true, force: true });
}

export function installStagedDirectory(staged) {
  if (fs.existsSync(staged.paths.jobDirectory)) throw new SchedulerError(`Job is already installed: ${staged.snapshot.id}`);
  fs.renameSync(staged.stageDirectory, staged.paths.jobDirectory);
}

export function replaceInstalledDirectory(staged) {
  const { jobDirectory } = staged.paths;
  if (!fs.existsSync(jobDirectory)) throw new SchedulerError(`Job is not installed: ${staged.snapshot.id}`);
  const backupDirectory = `${jobDirectory}.${process.pid}.${randomUUID()}.backup`;
  fs.renameSync(jobDirectory, backupDirectory);
  try {
    fs.renameSync(staged.stageDirectory, jobDirectory);
  } catch (error) {
    fs.renameSync(backupDirectory, jobDirectory);
    throw error;
  }
  return {
    backupDirectory,
    rollback() {
      fs.rmSync(staged.stageDirectory, { recursive: true, force: true });
      const failedDirectory = `${jobDirectory}.${process.pid}.${randomUUID()}.failed`;
      fs.renameSync(jobDirectory, failedDirectory);
      fs.renameSync(backupDirectory, jobDirectory);
      fs.rmSync(failedDirectory, { recursive: true, force: true });
    },
    commit() {
      fs.rmSync(backupDirectory, { recursive: true, force: true });
    },
  };
}

export function verifyInstalledShims(installed) {
  const launcher = installed.snapshot.contract.scheduler?.launcherPath;
  if (launcher !== undefined) {
    try {
      if (launcher !== installed.paths.launcherPath) throw new Error("unexpected launcher path");
      const launcherStats = fs.lstatSync(launcher);
      if (!launcherStats.isFile() || launcherStats.isSymbolicLink()) throw new Error("invalid launcher");
      fs.accessSync(launcher, fs.constants.X_OK);
      assertSafeExecutable(launcher);
    } catch {
      throw new SchedulerEnvironmentError("Installed scheduler launcher is missing or unsafe.");
    }
  }
  const runner = installed.snapshot.contract.schedulerRunner;
  try {
    if (!runner || !path.isAbsolute(runner)) throw new Error("missing runner");
    const runnerStats = fs.statSync(runner);
    fs.accessSync(runner, fs.constants.X_OK);
    if (!runnerStats.isFile()) throw new Error("runner is not a file");
    assertSafeExecutable(runner);
  } catch {
    throw new SchedulerEnvironmentError("Installed scheduler runner is missing or unsafe.");
  }
  const mappings = {
    ...installed.snapshot.contract.requiredCommands,
    ...Object.fromEntries(
      Object.entries(installed.snapshot.contract.optionalCommands).filter(([, executable]) => executable),
    ),
  };
  for (const [name, binding] of Object.entries(mappings)) {
    const shimPath = path.join(installed.paths.shimsDirectory, name);
    let shimStats;
    try {
      shimStats = fs.lstatSync(shimPath);
    } catch {
      throw new SchedulerEnvironmentError(`Installed command shim is missing: ${name}`);
    }
    if (!shimStats.isSymbolicLink()) {
      throw new SchedulerEnvironmentError(`Installed command shim changed: ${name}`);
    }
    let shimBinding;
    try {
      shimBinding = fs.readlinkSync(shimPath);
    } catch {
      throw new SchedulerEnvironmentError(`Installed command shim is unreadable: ${name}`);
    }
    if (shimBinding !== binding) {
      throw new SchedulerEnvironmentError(`Installed command shim changed: ${name}`);
    }
    try {
      assertShimResolvesToBindingTarget(shimPath, binding, name);
    } catch (error) {
      if (error instanceof SchedulerEnvironmentError) {
        throw new SchedulerEnvironmentError(
          `Installed command mapping is unsafe: ${name}: ${error.message}`,
          { healthCategory: "commands", cause: error.message },
        );
      }
      throw new SchedulerEnvironmentError(
        `Installed command mapping is missing or not executable: ${name}`,
        { healthCategory: "commands" },
      );
    }
  }
}

export function rotateLog(logPath, { maxBytes = LOG_ROTATE_BYTES, files = LOG_ROTATE_FILES } = {}) {
  let stats;
  try {
    stats = fs.lstatSync(logPath);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  if (!stats.isFile() || stats.isSymbolicLink()) throw new SchedulerError(`Scheduler log is not a regular file: ${logPath}`);
  if (stats.size < maxBytes) return;
  fs.rmSync(`${logPath}.${files}`, { force: true });
  for (let index = files - 1; index >= 1; index -= 1) {
    const source = `${logPath}.${index}`;
    if (fs.existsSync(source)) fs.renameSync(source, `${logPath}.${index + 1}`);
  }
  fs.renameSync(logPath, `${logPath}.1`);
}

function appendLog(logPath, message) {
  ensurePrivateDirectory(path.dirname(logPath));
  const descriptor = fs.openSync(
    logPath,
    fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_APPEND | fs.constants.O_NOFOLLOW,
    0o600,
  );
  try {
    const stats = fs.fstatSync(descriptor);
    const uid = currentUid();
    if (!stats.isFile()) throw new SchedulerError(`Scheduler log is not a regular file: ${logPath}`);
    if (uid !== undefined && stats.uid !== uid) {
      throw new SchedulerError(`Scheduler log is not owned by the current user: ${logPath}`);
    }
    fs.writeFileSync(descriptor, message, "utf8");
    fs.fchmodSync(descriptor, 0o600);
  } finally {
    fs.closeSync(descriptor);
  }
}

export function ensurePrivateLog(logPath) {
  appendLog(logPath, "");
}

function terminateProcessTree(child, signal) {
  if (!child.pid) return;
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

function openRunOutput(outputPath) {
  ensurePrivateDirectory(path.dirname(outputPath));
  const descriptor = fs.openSync(
    outputPath,
    fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW,
    0o600,
  );
  const stats = fs.fstatSync(descriptor);
  if (!stats.isFile()) {
    fs.closeSync(descriptor);
    throw new SchedulerError(`Scheduler run output is not a regular file: ${outputPath}`);
  }
  return descriptor;
}

function cappedRunOutput(outputPath) {
  const descriptor = openRunOutput(outputPath);
  let bytesWritten = 0;
  let truncated = false;
  let closed = false;
  return {
    write(chunk) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const available = Math.max(0, MAX_RUN_OUTPUT_BYTES - bytesWritten);
      const length = Math.min(buffer.length, available);
      let offset = 0;
      while (offset < length) offset += fs.writeSync(descriptor, buffer, offset, length - offset);
      bytesWritten += length;
      if (length < buffer.length) truncated = true;
    },
    close() {
      if (closed) return;
      closed = true;
      try {
        fs.fchmodSync(descriptor, 0o600);
      } finally {
        fs.closeSync(descriptor);
      }
    },
    get truncated() { return truncated; },
  };
}

function appendRunOutput(outputPath, logPath) {
  let source;
  let destination;
  try {
    source = fs.openSync(outputPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const sourceStats = fs.fstatSync(source);
    if (!sourceStats.isFile()) throw new SchedulerError(`Scheduler run output is not a regular file: ${outputPath}`);
    destination = fs.openSync(
      logPath,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_APPEND | fs.constants.O_NOFOLLOW,
      0o600,
    );
    const destinationStats = fs.fstatSync(destination);
    if (!destinationStats.isFile()) throw new SchedulerError(`Scheduler log is not a regular file: ${logPath}`);
    const buffer = Buffer.alloc(64 * 1024);
    for (;;) {
      const bytesRead = fs.readSync(source, buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      fs.writeSync(destination, buffer, 0, bytesRead);
    }
    fs.fchmodSync(destination, 0o600);
  } finally {
    if (source !== undefined) fs.closeSync(source);
    if (destination !== undefined) fs.closeSync(destination);
  }
}

async function spawnInstalled(installed, outputPath) {
  const { contract } = installed.snapshot;
  const timeoutMilliseconds = contract.timeoutSeconds * 1000;
  const output = cappedRunOutput(outputPath);
  let child;
  try {
    child = spawn(contract.argv[0], contract.argv.slice(1), {
      cwd: contract.workingDirectory,
      detached: process.platform !== "win32",
      env: installed.snapshot.environment,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    output.close();
    throw error;
  }
  return new Promise((resolve, reject) => {
    let timedOut = false;
    let exitResult;
    let closedResult;
    let outputFailure;
    let settled = false;
    let timeout;
    let terminationTimer;
    let pipeDrainTimer;
    const destroyPipes = () => {
      child.stdout.destroy();
      child.stderr.destroy();
    };
    const settle = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearTimeout(terminationTimer);
      clearTimeout(pipeDrainTimer);
      try {
        output.close();
      } catch (closeError) {
        error ??= closeError;
      }
      if (error) reject(error);
      else resolve({ ...value, outputTruncated: output.truncated });
    };
    const result = () => exitResult ?? closedResult ?? {
      code: null,
      signal: timedOut ? "SIGKILL" : null,
      timedOut,
    };
    const scheduleForcedTermination = () => {
      if (terminationTimer) return;
      terminateProcessTree(child, "SIGTERM");
      terminationTimer = setTimeout(() => {
        terminateProcessTree(child, "SIGKILL");
        destroyPipes();
        settle(outputFailure, { ...result(), timedOut });
      }, 1000);
    };
    const capture = (chunk) => {
      if (outputFailure) return;
      try {
        output.write(chunk);
      } catch (error) {
        outputFailure = error;
        scheduleForcedTermination();
      }
    };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    timeout = setTimeout(() => {
      timedOut = true;
      scheduleForcedTermination();
    }, timeoutMilliseconds);
    timeout.unref();
    child.once("error", (error) => {
      if (!timedOut && !outputFailure) settle(error);
    });
    child.once("exit", (code, signal) => {
      exitResult = { code, signal, timedOut };
      if (timedOut || outputFailure) return;
      clearTimeout(timeout);
      pipeDrainTimer = setTimeout(() => {
        destroyPipes();
        settle(undefined, exitResult);
      }, 1000);
      pipeDrainTimer.unref();
    });
    child.once("close", (code, signal) => {
      closedResult = { code, signal, timedOut };
      if (!timedOut && !outputFailure) settle(undefined, closedResult);
    });
  });
}

export async function startInstalled(id, {
  env = process.env,
  expectedDigest,
  expectedRevision,
  now = () => new Date(),
  spawnProcess = spawn,
} = {}) {
  const paths = installedPaths(id, env);
  let record;
  let releaseStartGate;
  try {
    const installed = readInstalled(id, env);
    assertInstalledPreconditions(installed, { expectedDigest, expectedRevision });
    verifyInstalledShims(installed);
    const { contract } = installed.snapshot;
    assertSafeExecutable(contract.schedulerNode);
    const runId = randomUUID();
    record = beginRun(installed, { env, trigger: "manual", now, runId });
    releaseStartGate = acquireLock(runPaths(id, runId, env).startGatePath);
    const runnerArguments = [
      contract.schedulerRunner,
      "_run-manual-installed",
      id,
      "--expected-installed-digest",
      expectedDigest,
      "--expected-revision",
      String(expectedRevision),
      "--run-id",
      runId,
      "--state-root",
      paths.root,
    ];
    const launcher = contract.scheduler?.launcherPath;
    const child = spawnProcess(launcher ?? contract.schedulerNode, launcher ? [contract.schedulerNode, ...runnerArguments] : runnerArguments, {
      cwd: contract.workingDirectory,
      detached: process.platform !== "win32",
      env: installed.snapshot.environment,
      stdio: "ignore",
    });
    await new Promise((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
    if (!Number.isInteger(child.pid) || child.pid < 1) throw new SchedulerError("Background scheduler process did not report a process ID.");
    record = updateRunningRun(record, { pid: child.pid }, env);
    releaseStartGate();
    releaseStartGate = undefined;
    child.unref();
    return { status: "started", runId, pid: child.pid, run: record };
  } catch (error) {
    if (record?.status === "running") {
      const failed = finishRun(record, {
        status: "failed",
        reason: error.message || String(error),
        exitCode: null,
        signal: null,
        timedOut: false,
      }, { env, now });
      appendLog(paths.logPath, `[${failed.finishedAt}] failed to start ${id} run=${record.runId}: ${error.message || String(error)}\n`);
    }
    throw error;
  } finally {
    releaseStartGate?.();
  }
}

export async function executeInstalled(id, {
  env = process.env,
  expectedDigest,
  expectedRevision,
  trigger = "manual",
  runId,
  now = () => new Date(),
} = {}) {
  const paths = installedPaths(id, env);
  if (runId) {
    const releaseStartGate = acquireLock(runPaths(id, runId, env).startGatePath, { waitMilliseconds: 60_000 });
    releaseStartGate();
  }
  const releaseExecution = acquireLock(paths.executionLockPath, { skipIfBusy: true });
  if (!releaseExecution) {
    let record;
    if (runId) {
      record = preparedRun(id, runId, { env, expectedDigest, expectedRevision, trigger });
      record = finishRun(record, { status: "skipped", reason: "overlap" }, { env, now });
    } else {
      const installed = readInstalled(id, env);
      assertInstalledPreconditions(installed, { expectedDigest, expectedRevision });
      record = skippedRun(installed, { env, trigger, now, reason: "overlap" });
    }
    appendLog(paths.logPath, `[${record.finishedAt}] skipped overlap ${id} run=${record.runId}\n`);
    return { status: "skipped", reason: "overlap", runId: record.runId, run: record, logPath: paths.logPath };
  }
  let releaseLifecycle;
  let record;
  let finalized = false;
  let outputAppended = false;
  try {
    if (runId) {
      record = preparedRun(id, runId, { env, expectedDigest, expectedRevision, trigger });
      record = updateRunningRun(record, { pid: process.pid }, env);
    }
    releaseLifecycle = acquireLock(paths.lifecycleLockPath, { waitMilliseconds: 60_000 });
    const installed = readInstalled(id, env);
    assertInstalledPreconditions(installed, { expectedDigest, expectedRevision });
    verifyInstalledShims(installed);
    record = record ?? beginRun(installed, { env, trigger, now });
    rotateLog(installed.paths.logPath);
    appendLog(
      installed.paths.logPath,
      `\n[${record.startedAt}] start ${installed.id} digest=${installed.metadata.digest} revision=${installed.metadata.revision} run=${record.runId}\n`,
    );
    const result = await spawnInstalled(installed, record.logPath);
    appendRunOutput(record.logPath, installed.paths.logPath);
    outputAppended = true;
    const status = result.timedOut ? "timed-out" : result.code === 0 ? "succeeded" : "failed";
    const reason = result.timedOut
      ? `timed out after ${installed.snapshot.contract.timeoutSeconds} seconds`
      : result.code === 0
        ? null
        : `exited with code ${result.code}`;
    const completed = finishRun(record, {
      status,
      reason,
      exitCode: result.code,
      signal: result.signal,
      timedOut: result.timedOut,
      outputTruncated: result.outputTruncated,
    }, { env, now });
    finalized = true;
    appendLog(
      installed.paths.logPath,
      `[${completed.finishedAt}] finish ${id} code=${result.code ?? "null"} signal=${result.signal ?? "none"} timedOut=${result.timedOut} run=${record.runId}\n`,
    );
    if (result.timedOut) {
      throw new SchedulerExecutionError(`Job timed out after ${installed.snapshot.contract.timeoutSeconds} seconds: ${id}`, result);
    }
    if (result.code !== 0) throw new SchedulerExecutionError(`Job exited with code ${result.code}: ${id}`, result);
    return { status: "ok", ...result, runId: record.runId, run: completed, logPath: installed.paths.logPath };
  } catch (error) {
    if (record && !finalized) {
      if (!outputAppended && fs.existsSync(record.logPath)) appendRunOutput(record.logPath, paths.logPath);
      const failed = finishRun(record, {
        status: error instanceof SchedulerExecutionError && error.details?.timedOut ? "timed-out" : "failed",
        reason: error.message || String(error),
        exitCode: error.details?.code ?? null,
        signal: error.details?.signal ?? null,
        timedOut: error.details?.timedOut === true,
      }, { env, now });
      appendLog(paths.logPath, `[${failed.finishedAt}] failed ${id} run=${record.runId}: ${error.message || String(error)}\n`);
    }
    throw error;
  } finally {
    releaseLifecycle?.();
    releaseExecution();
  }
}

function readOutputFile(filePath, lines) {
  if (!Number.isInteger(lines) || lines < 1 || lines > 10_000) {
    throw new SchedulerError("--lines must be an integer from 1 to 10000.", { code: "USAGE", exitCode: 2 });
  }
  let descriptor;
  try {
    descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const stats = fs.fstatSync(descriptor);
    if (!stats.isFile()) throw new SchedulerError(`Scheduler output is not a regular file: ${filePath}`);
    const maximumRead = 1024 * 1024;
    const bytesToRead = Math.min(stats.size, maximumRead);
    const buffer = Buffer.alloc(bytesToRead);
    fs.readSync(descriptor, buffer, 0, bytesToRead, Math.max(0, stats.size - bytesToRead));
    const content = buffer.toString("utf8");
    return {
      logPath: filePath,
      retainedBytes: stats.size,
      truncated: stats.size > maximumRead,
      content: content.split("\n").slice(-lines).join("\n"),
    };
  } catch (error) {
    if (error.code === "ENOENT") return { logPath: filePath, retainedBytes: 0, content: "", truncated: false };
    if (error.code === "ELOOP") throw new SchedulerError(`Scheduler output must not be a symbolic link: ${filePath}`);
    throw error;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

export function readLog(id, { env = process.env, lines = 200 } = {}) {
  const { retainedBytes: _, ...output } = readOutputFile(installedPaths(id, env).logPath, lines);
  return output;
}

export function readRunOutput(id, runId, { env = process.env, lines = 200 } = {}) {
  const safeRunId = assertRunId(runId);
  if (!fs.existsSync(installedPaths(id, env).runDirectory)) {
    throw new SchedulerError(`Unknown scheduler run: ${safeRunId}`, { code: "RUN_NOT_FOUND", exitCode: 3 });
  }
  return withRunHistoryLock(id, env, () => {
    const record = readRunRecords(id, env).map(projectedRunRecord).find((entry) => entry.runId === safeRunId);
    if (!record) throw new SchedulerError(`Unknown scheduler run: ${safeRunId}`, { code: "RUN_NOT_FOUND", exitCode: 3 });
    const { retainedBytes, ...output } = readOutputFile(runPaths(id, safeRunId, env).outputPath, lines);
    const laterTruncated = record.outputTruncated === true
      || record.status === "running" && retainedBytes >= MAX_RUN_OUTPUT_BYTES;
    return {
      run: record,
      ...output,
      truncated: output.truncated || laterTruncated,
      truncation: laterTruncated ? "later" : output.truncated ? "earlier" : null,
    };
  });
}
