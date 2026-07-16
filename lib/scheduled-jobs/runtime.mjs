import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  SchedulerEnvironmentError,
  SchedulerError,
  schedulerStateRoot,
  schedulerStorage,
} from "./index.mjs";

export const STATE_VERSION = 1;
export const MAX_STATE_BYTES = 1024 * 1024;
export const LOG_ROTATE_BYTES = 5 * 1024 * 1024;
export const LOG_ROTATE_FILES = 3;

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
    locksDirectory: path.join(root, "locks"),
    lifecycleLockPath: path.join(root, "locks", `${hash}.lifecycle.lock`),
    executionLockPath: path.join(root, "locks", `${hash}.execution.lock`),
    logsDirectory: path.join(root, "logs"),
    logPath: storage.logPath,
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

export function assertInstalledPreconditions(installed, { expectedDigest, expectedRevision } = {}) {
  if (!installed) throw new SchedulerError("Job is not installed.", { code: "NOT_INSTALLED", exitCode: 3 });
  if (installed.health !== "ok") {
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
    && snapshot.contract?.scheduler?.logPath === paths.logPath;
  if (!structurallyValid) {
    return { id, paths, snapshot, metadata, health: "corrupt", healthReason: "state invariants do not match" };
  }
  const installed = { id, paths, snapshot, metadata, health: "ok" };
  try {
    verifyInstalledShims(installed);
  } catch (error) {
    return { ...installed, health: "unhealthy", healthReason: error.message };
  }
  return installed;
}

function writeShim(shimsDirectory, name, executable) {
  const shimPath = path.join(shimsDirectory, name);
  fs.symlinkSync(executable, shimPath);
  if (fs.realpathSync(shimPath) !== executable) {
    throw new SchedulerEnvironmentError(`Command shim did not bind to the reviewed executable: ${name}`);
  }
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
  const runner = installed.snapshot.contract.schedulerRunner;
  try {
    if (!runner || !path.isAbsolute(runner)) throw new Error("missing runner");
    const runnerStats = fs.statSync(runner);
    fs.accessSync(runner, fs.constants.X_OK);
    if (!runnerStats.isFile()) throw new Error("runner is not a file");
  } catch {
    throw new SchedulerEnvironmentError("Installed scheduler runner is missing or not executable.");
  }
  const mappings = {
    ...installed.snapshot.contract.requiredCommands,
    ...Object.fromEntries(
      Object.entries(installed.snapshot.contract.optionalCommands).filter(([, executable]) => executable),
    ),
  };
  for (const [name, executable] of Object.entries(mappings)) {
    const shimPath = path.join(installed.paths.shimsDirectory, name);
    let shimStats;
    let resolved;
    let executableStats;
    try {
      shimStats = fs.lstatSync(shimPath);
      resolved = fs.realpathSync(shimPath);
      executableStats = fs.statSync(executable);
      fs.accessSync(executable, fs.constants.X_OK);
    } catch {
      throw new SchedulerEnvironmentError(`Installed command mapping is missing or not executable: ${name}`);
    }
    if (!shimStats.isSymbolicLink() || resolved !== executable || !executableStats.isFile()) {
      throw new SchedulerEnvironmentError(`Installed command shim changed: ${name}`);
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

async function spawnInstalled(installed) {
  const { contract } = installed.snapshot;
  const timeoutMilliseconds = contract.timeoutSeconds * 1000;
  rotateLog(installed.paths.logPath);
  appendLog(
    installed.paths.logPath,
    `\n[${new Date().toISOString()}] start ${installed.id} digest=${installed.metadata.digest} revision=${installed.metadata.revision}\n`,
  );
  const logDescriptor = fs.openSync(
    installed.paths.logPath,
    fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_NOFOLLOW,
    0o600,
  );
  const child = spawn(contract.argv[0], contract.argv.slice(1), {
    cwd: contract.workingDirectory,
    detached: process.platform !== "win32",
    env: installed.snapshot.environment,
    stdio: ["ignore", logDescriptor, logDescriptor],
  });
  fs.closeSync(logDescriptor);
  return new Promise((resolve, reject) => {
    let timedOut = false;
    let killEscalated = false;
    let closedResult;
    let settled = false;
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      terminateProcessTree(child, "SIGTERM");
      setTimeout(() => {
        terminateProcessTree(child, "SIGKILL");
        killEscalated = true;
        if (closedResult) settle(resolve, closedResult);
      }, 1000);
    }, timeoutMilliseconds);
    timeout.unref();
    child.once("error", (error) => {
      clearTimeout(timeout);
      if (!timedOut) settle(reject, error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      closedResult = { code, signal, timedOut };
      if (!timedOut || killEscalated) settle(resolve, closedResult);
    });
  });
}

export async function executeInstalled(id, {
  env = process.env,
  expectedDigest,
  expectedRevision,
} = {}) {
  const paths = installedPaths(id, env);
  const releaseExecution = acquireLock(paths.executionLockPath, { skipIfBusy: true });
  if (!releaseExecution) {
    appendLog(paths.logPath, `[${new Date().toISOString()}] skipped overlap ${id}\n`);
    return { status: "skipped", reason: "overlap", logPath: paths.logPath };
  }
  let releaseLifecycle;
  try {
    releaseLifecycle = acquireLock(paths.lifecycleLockPath, { waitMilliseconds: 60_000 });
    const installed = readInstalled(id, env);
    assertInstalledPreconditions(installed, { expectedDigest, expectedRevision });
    verifyInstalledShims(installed);
    const result = await spawnInstalled(installed);
    appendLog(
      installed.paths.logPath,
      `[${new Date().toISOString()}] finish ${id} code=${result.code ?? "null"} signal=${result.signal ?? "none"} timedOut=${result.timedOut}\n`,
    );
    if (result.timedOut) {
      throw new SchedulerExecutionError(`Job timed out after ${installed.snapshot.contract.timeoutSeconds} seconds: ${id}`, result);
    }
    if (result.code !== 0) throw new SchedulerExecutionError(`Job exited with code ${result.code}: ${id}`, result);
    return { status: "ok", ...result, logPath: installed.paths.logPath };
  } finally {
    releaseLifecycle?.();
    releaseExecution();
  }
}

export function readLog(id, { env = process.env, lines = 200 } = {}) {
  if (!Number.isInteger(lines) || lines < 1 || lines > 10_000) {
    throw new SchedulerError("--lines must be an integer from 1 to 10000.", { code: "USAGE", exitCode: 2 });
  }
  const paths = installedPaths(id, env);
  let descriptor;
  try {
    descriptor = fs.openSync(paths.logPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const stats = fs.fstatSync(descriptor);
    const maximumRead = 1024 * 1024;
    const bytesToRead = Math.min(stats.size, maximumRead);
    const buffer = Buffer.alloc(bytesToRead);
    fs.readSync(descriptor, buffer, 0, bytesToRead, Math.max(0, stats.size - bytesToRead));
    const content = buffer.toString("utf8");
    return {
      logPath: paths.logPath,
      truncated: stats.size > maximumRead,
      content: content.split("\n").slice(-lines).join("\n"),
    };
  } catch (error) {
    if (error.code === "ENOENT") return { logPath: paths.logPath, content: "", truncated: false };
    if (error.code === "ELOOP") throw new SchedulerError(`Scheduler log must not be a symbolic link: ${paths.logPath}`);
    throw error;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}
