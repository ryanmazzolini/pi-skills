import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const CONFIG_DIRECTORY_NAME = ".pi";
export const PROJECT_MANIFEST_NAME = "scheduler.json";
export const GLOBAL_MANIFEST_DIRECTORY = "pi-scheduler";
export const GLOBAL_MANIFEST_NAME = "jobs.json";
export const MANIFEST_VERSION = 1;
export const MAX_MANIFEST_BYTES = 256 * 1024;
export const MAX_JOBS = 128;
export const DEFAULT_TIMEOUT_SECONDS = 30 * 60;

const JOB_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,62}:[a-z0-9][a-z0-9._-]{0,62}$/;
const COMMAND_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/;
const CRON_RANGES = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];
const MANIFEST_KEYS = new Set(["version", "jobs"]);
const JOB_KEYS = new Set([
  "description",
  "schedule",
  "argv",
  "requiredCommands",
  "optionalCommands",
  "workingDirectory",
  "timeoutSeconds",
]);

export class SchedulerError extends Error {
  constructor(message, { code = "SCHEDULER_ERROR", exitCode = 3, details } = {}) {
    super(message);
    this.name = "SchedulerError";
    this.code = code;
    this.exitCode = exitCode;
    this.details = details;
  }
}

export class SchedulerUsageError extends SchedulerError {
  constructor(message) {
    super(message, { code: "USAGE", exitCode: 2 });
    this.name = "SchedulerUsageError";
  }
}

export class SchedulerEnvironmentError extends SchedulerError {
  constructor(message, details) {
    super(message, { code: "ENVIRONMENT", exitCode: 4, details });
    this.name = "SchedulerEnvironmentError";
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertPlainObject(value, label) {
  if (!isPlainObject(value)) throw new SchedulerError(`${label} must be a JSON object.`);
}

function assertKnownKeys(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new SchedulerError(`${label} contains unknown field${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}.`);
  }
}

function assertString(value, label, { maxLength = 1024 } = {}) {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    throw new SchedulerError(`${label} must be a non-empty string no longer than ${maxLength} characters.`);
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    throw new SchedulerError(`${label} must not contain control characters.`);
  }
}

function assertStringArray(value, label, { maxItems = 64, commandNames = false } = {}) {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new SchedulerError(`${label} must be an array with at most ${maxItems} entries.`);
  }
  const seen = new Set();
  for (const [index, item] of value.entries()) {
    assertString(item, `${label}[${index}]`, { maxLength: 4096 });
    if (commandNames && !COMMAND_NAME_PATTERN.test(item)) {
      throw new SchedulerError(`${label}[${index}] must be an executable name without a path.`);
    }
    if (seen.has(item)) throw new SchedulerError(`${label} contains duplicate value: ${item}.`);
    seen.add(item);
  }
}

function validCronNumber(value, minimum, maximum) {
  return /^\d+$/.test(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function validCronPart(part, minimum, maximum) {
  const [base, step, extra] = part.split("/");
  if (
    extra !== undefined
    || (step !== undefined && (!/^\d+$/.test(step) || Number(step) < 1 || Number(step) > maximum - minimum + 1))
  ) return false;
  if (base === "*") return true;
  const range = base.split("-");
  if (range.length === 1) return validCronNumber(range[0], minimum, maximum);
  return range.length === 2
    && validCronNumber(range[0], minimum, maximum)
    && validCronNumber(range[1], minimum, maximum)
    && Number(range[0]) <= Number(range[1]);
}

function validCronField(field, [minimum, maximum]) {
  return field.length > 0 && field.split(",").every((part) => validCronPart(part, minimum, maximum));
}

export function validateSchedule(value) {
  assertString(value, "schedule", { maxLength: 256 });
  const fields = value.trim().split(/\s+/);
  if (fields.length !== 5 || fields.some((field, index) => !validCronField(field, CRON_RANGES[index]))) {
    throw new SchedulerError("schedule must be a valid five-field numeric cron expression.");
  }
  return fields.join(" ");
}

export function supportsNativeSchedule(schedule) {
  const [minute, hour, dayOfMonth, month, dayOfWeek] = validateSchedule(schedule).split(" ");
  return /^\d+$/.test(minute)
    && /^\d+$/.test(hour)
    && dayOfMonth === "*"
    && month === "*"
    && (dayOfWeek === "*" || dayOfWeek.split(",").every((part) => /^\d+(?:-\d+)?$/.test(part)));
}

function normalizeJob(key, value) {
  if (!JOB_KEY_PATTERN.test(key)) {
    throw new SchedulerError(`Job key ${JSON.stringify(key)} must use the namespace:name format.`);
  }
  assertPlainObject(value, `jobs.${key}`);
  assertKnownKeys(value, JOB_KEYS, `jobs.${key}`);
  assertString(value.description, `jobs.${key}.description`, { maxLength: 512 });
  const schedule = validateSchedule(value.schedule);
  assertStringArray(value.argv, `jobs.${key}.argv`, { maxItems: 64 });
  if (value.argv.length === 0) throw new SchedulerError(`jobs.${key}.argv must contain a command.`);
  assertStringArray(value.requiredCommands, `jobs.${key}.requiredCommands`, {
    maxItems: 32,
    commandNames: true,
  });
  const requiredCommands = value.requiredCommands.includes(value.argv[0])
    ? [...value.requiredCommands]
    : [value.argv[0], ...value.requiredCommands];
  const optionalCommands = value.optionalCommands ?? [];
  assertStringArray(optionalCommands, `jobs.${key}.optionalCommands`, {
    maxItems: 32,
    commandNames: true,
  });
  const overlap = requiredCommands.filter((command) => optionalCommands.includes(command));
  if (overlap.length > 0) {
    throw new SchedulerError(`jobs.${key} declares command as both required and optional: ${overlap.join(", ")}.`);
  }
  if (!COMMAND_NAME_PATTERN.test(value.argv[0])) {
    throw new SchedulerError(`jobs.${key}.argv[0] must be an executable name without a path.`);
  }
  if (value.workingDirectory !== undefined) {
    assertString(value.workingDirectory, `jobs.${key}.workingDirectory`, { maxLength: 4096 });
  }
  const timeoutSeconds = value.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 86_400) {
    throw new SchedulerError(`jobs.${key}.timeoutSeconds must be an integer from 1 to 86400.`);
  }
  return {
    description: value.description,
    schedule,
    argv: [...value.argv],
    requiredCommands,
    optionalCommands: [...optionalCommands],
    ...(value.workingDirectory === undefined ? {} : { workingDirectory: value.workingDirectory }),
    timeoutSeconds,
  };
}

export function validateManifest(value) {
  assertPlainObject(value, "manifest");
  assertKnownKeys(value, MANIFEST_KEYS, "manifest");
  if (value.version !== MANIFEST_VERSION) {
    throw new SchedulerError(`manifest.version must be ${MANIFEST_VERSION}.`);
  }
  assertPlainObject(value.jobs, "manifest.jobs");
  const entries = Object.entries(value.jobs);
  if (entries.length > MAX_JOBS) throw new SchedulerError(`manifest.jobs may contain at most ${MAX_JOBS} jobs.`);
  const jobs = {};
  for (const [key, job] of entries) jobs[key] = normalizeJob(key, job);
  return { version: MANIFEST_VERSION, jobs };
}

function currentUid() {
  return typeof process.getuid === "function" ? process.getuid() : undefined;
}

function pathExists(filePath) {
  try {
    fs.lstatSync(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function safeManifestPath(rootPath, relativeParts, { uid = currentUid() } = {}) {
  let root;
  try {
    root = fs.realpathSync(path.resolve(rootPath));
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
  let current = root;
  for (const part of relativeParts) {
    current = path.join(current, part);
    let stats;
    try {
      stats = fs.lstatSync(current);
    } catch (error) {
      if (error.code === "ENOENT") return undefined;
      throw error;
    }
    if (stats.isSymbolicLink()) {
      throw new SchedulerError(`Refusing scheduler manifest path containing a symbolic link: ${current}`);
    }
    if (part !== relativeParts.at(-1) && !stats.isDirectory()) {
      throw new SchedulerError(`Scheduler manifest parent is not a directory: ${current}`);
    }
    if (part === relativeParts.at(-1)) {
      if (!stats.isFile()) throw new SchedulerError(`Scheduler manifest is not a regular file: ${current}`);
      if (uid !== undefined && stats.uid !== uid) {
        throw new SchedulerError(`Scheduler manifest is not owned by the current user: ${current}`);
      }
      if (stats.size > MAX_MANIFEST_BYTES) {
        throw new SchedulerError(`Scheduler manifest exceeds ${MAX_MANIFEST_BYTES} bytes: ${current}`);
      }
    }
  }
  return current;
}

export function readManifest(rootPath, relativeParts, options = {}) {
  const manifestPath = safeManifestPath(rootPath, relativeParts, options);
  if (!manifestPath) return undefined;
  let descriptor;
  let parsed;
  try {
    descriptor = fs.openSync(manifestPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const stats = fs.fstatSync(descriptor);
    const expectedUid = options.uid ?? currentUid();
    if (!stats.isFile()) throw new SchedulerError(`Scheduler manifest is not a regular file: ${manifestPath}`);
    if (expectedUid !== undefined && stats.uid !== expectedUid) {
      throw new SchedulerError(`Scheduler manifest is not owned by the current user: ${manifestPath}`);
    }
    if (stats.size > MAX_MANIFEST_BYTES) {
      throw new SchedulerError(`Scheduler manifest exceeds ${MAX_MANIFEST_BYTES} bytes: ${manifestPath}`);
    }
    const buffer = Buffer.alloc(MAX_MANIFEST_BYTES + 1);
    const bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, 0);
    if (bytesRead > MAX_MANIFEST_BYTES) {
      throw new SchedulerError(`Scheduler manifest exceeds ${MAX_MANIFEST_BYTES} bytes: ${manifestPath}`);
    }
    parsed = JSON.parse(buffer.toString("utf8", 0, bytesRead));
  } catch (error) {
    if (error instanceof SyntaxError) throw new SchedulerError(`Invalid JSON in scheduler manifest ${manifestPath}: ${error.message}`);
    if (error.code === "ELOOP") throw new SchedulerError(`Refusing symbolic-link scheduler manifest: ${manifestPath}`);
    throw error;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
  return { manifest: validateManifest(parsed), manifestPath };
}

export function defaultConfigHome(env = process.env) {
  return path.resolve(env.XDG_CONFIG_HOME || path.join(env.HOME || os.homedir(), ".config"));
}

function canonicalFuturePath(input) {
  const missing = [];
  let existing = path.resolve(input);
  while (!fs.existsSync(existing)) {
    missing.unshift(path.basename(existing));
    const parent = path.dirname(existing);
    if (parent === existing) break;
    existing = parent;
  }
  const canonicalBase = fs.realpathSync(existing);
  return path.join(canonicalBase, ...missing);
}

export function schedulerStateRoot(env = process.env) {
  if (env.XDG_STATE_HOME && !path.isAbsolute(env.XDG_STATE_HOME)) {
    throw new SchedulerEnvironmentError("XDG_STATE_HOME must be absolute.");
  }
  const base = env.XDG_STATE_HOME
    ? env.XDG_STATE_HOME
    : path.join(env.HOME || os.homedir(), ".local", "state");
  return canonicalFuturePath(path.join(base, "pi-scheduler"));
}

export function schedulerStorage(id, env = process.env) {
  const hash = createHash("sha256").update(id).digest("hex");
  const root = schedulerStateRoot(env);
  const jobDirectory = path.join(root, "jobs", hash);
  return {
    root,
    hash,
    jobDirectory,
    shimsDirectory: path.join(jobDirectory, "shims"),
    logPath: path.join(root, "logs", `${hash}.log`),
  };
}

function assertSafeExecutable(executable) {
  const stats = fs.statSync(executable);
  const owner = currentUid();
  if (!stats.isFile() || (stats.mode & 0o111) === 0) {
    throw new SchedulerEnvironmentError(`Command does not resolve to an executable file: ${executable}`);
  }
  if (owner !== undefined && stats.uid !== owner && stats.uid !== 0) {
    throw new SchedulerEnvironmentError(`Command is not owned by the current user or root: ${executable}`);
  }
  if ((stats.mode & 0o022) !== 0) {
    throw new SchedulerEnvironmentError(`Command is group- or world-writable: ${executable}`);
  }
  const parent = fs.statSync(path.dirname(executable));
  if (owner !== undefined && parent.uid !== owner && parent.uid !== 0) {
    throw new SchedulerEnvironmentError(`Command directory is not owned by the current user or root: ${path.dirname(executable)}`);
  }
  if ((parent.mode & 0o022) !== 0) {
    throw new SchedulerEnvironmentError(`Command directory is group- or world-writable: ${path.dirname(executable)}`);
  }
}

export function resolveExecutable(command, env = process.env) {
  if (!COMMAND_NAME_PATTERN.test(command)) return undefined;
  const directories = (env.PATH || "").split(path.delimiter);
  if (directories.some((directory) => directory.length === 0 || !path.isAbsolute(directory))) {
    throw new SchedulerEnvironmentError("PATH must contain only explicit absolute directories.");
  }
  const matches = new Set();
  for (const directory of directories) {
    const candidate = path.join(directory, command);
    try {
      const stats = fs.statSync(candidate);
      if (!stats.isFile()) continue;
      fs.accessSync(candidate, fs.constants.X_OK);
      const executable = fs.realpathSync(candidate);
      assertSafeExecutable(executable);
      matches.add(executable);
    } catch (error) {
      if (["ENOENT", "EACCES", "ENOTDIR"].includes(error.code)) continue;
      throw error;
    }
  }
  if (matches.size > 1) {
    throw new SchedulerEnvironmentError(`Command is shadowed by distinct PATH mappings: ${command}.`, {
      command,
      matches: [...matches].sort(),
    });
  }
  return [...matches][0];
}

export function resolveExactGitRoot(input, { env = process.env, gitExecutable } = {}) {
  const requested = fs.realpathSync(path.resolve(input));
  const git = gitExecutable || resolveExecutable("git", env);
  if (!git) throw new SchedulerEnvironmentError("Project discovery requires git on PATH.");
  let reported;
  try {
    reported = execFileSync(git, ["-C", requested, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      env,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    throw new SchedulerError(`Project root is not a Git worktree: ${requested}`);
  }
  const root = fs.realpathSync(reported);
  if (root !== requested) {
    throw new SchedulerError(`--project-root must name the exact Git root (${root}), not ${requested}.`);
  }
  return root;
}

export function projectScopeIdentityFromCanonicalPath(canonicalRoot) {
  const normalizedRoot = path.resolve(canonicalRoot);
  const hash = createHash("sha256").update(normalizedRoot).digest("hex").slice(0, 16);
  return { kind: "project", identity: `project:${hash}`, root: normalizedRoot };
}

export function projectScopeIdentity(root) {
  return projectScopeIdentityFromCanonicalPath(fs.realpathSync(path.resolve(root)));
}

function declarationsFromSource(source, loaded) {
  if (!loaded) return [];
  return Object.entries(loaded.manifest.jobs).map(([key, job]) => ({
    id: `${source.identity}:${key}`,
    scope: source,
    key,
    description: job.description,
    schedule: job.schedule,
    sourcePath: loaded.manifestPath,
    job,
  }));
}

export function loadDeclarations({ manifestPath, env = process.env, uid } = {}) {
  if (!manifestPath) throw new SchedulerUsageError("--manifest is required.");
  const requested = path.resolve(manifestPath);
  const configHome = defaultConfigHome(env);
  const globalPath = path.join(configHome, GLOBAL_MANIFEST_DIRECTORY, GLOBAL_MANIFEST_NAME);
  let source;
  let loaded;

  if (requested === globalPath) {
    loaded = readManifest(configHome, [GLOBAL_MANIFEST_DIRECTORY, GLOBAL_MANIFEST_NAME], { uid });
    const root = fs.existsSync(configHome) ? fs.realpathSync(configHome) : configHome;
    source = { kind: "global", identity: "global", root };
  } else if (
    path.basename(requested) === PROJECT_MANIFEST_NAME
    && path.basename(path.dirname(requested)) === CONFIG_DIRECTORY_NAME
  ) {
    const proposedRoot = path.dirname(path.dirname(requested));
    const root = resolveExactGitRoot(proposedRoot, { env });
    loaded = readManifest(root, [CONFIG_DIRECTORY_NAME, PROJECT_MANIFEST_NAME], { uid });
    source = projectScopeIdentity(root);
  } else {
    throw new SchedulerUsageError(
      `Manifest must be the fixed global path (${globalPath}) or an exact Git-root ${CONFIG_DIRECTORY_NAME}/${PROJECT_MANIFEST_NAME}.`,
    );
  }
  if (!loaded) throw new SchedulerError(`Scheduler manifest does not exist: ${requested}`);
  return declarationsFromSource(source, loaded).sort((left, right) => left.id.localeCompare(right.id));
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function digest(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

const PATH_OPTION_PATTERN = /(?:^|[-_])(config|path|file|dir|directory|root)$/i;
const BARE_FILE_PATTERN = /\.(?:c?js|mjs|ts|tsx|json|ya?ml|toml|rb|py|sh|md|txt)$/i;

function canonicalizeArgument(argument, env, manifestDirectory, { relativeIsPath = false } = {}) {
  let expanded = argument;
  if (argument === "~") expanded = env.HOME || os.homedir();
  else if (argument.startsWith("~/")) expanded = path.join(env.HOME || os.homedir(), argument.slice(2));
  else if (
    !path.isAbsolute(argument)
    && (relativeIsPath || argument.startsWith("./") || argument.startsWith("../") || argument.includes("/"))
  ) {
    expanded = path.resolve(manifestDirectory, argument);
  }
  if (!path.isAbsolute(expanded)) return argument;
  const absolute = path.resolve(expanded);
  try {
    return fs.realpathSync(absolute);
  } catch (error) {
    if (error.code === "ENOENT") return absolute;
    throw error;
  }
}

function canonicalizeArguments(argumentsList, env, manifestDirectory) {
  return argumentsList.map((argument, index) => {
    const previous = argumentsList[index - 1];
    const followsPathOption = typeof previous === "string" && PATH_OPTION_PATTERN.test(previous);
    if (
      !followsPathOption
      && BARE_FILE_PATTERN.test(argument)
      && !path.isAbsolute(argument)
      && !argument.startsWith("./")
      && !argument.startsWith("../")
      && !argument.includes("/")
    ) {
      throw new SchedulerError(
        `Ambiguous relative path argument ${JSON.stringify(argument)}; prefix it with ./ or use an absolute path.`,
      );
    }
    return canonicalizeArgument(argument, env, manifestDirectory, { relativeIsPath: followsPathOption });
  });
}

export function fixedEnvironment(env = process.env) {
  const homeInput = env.HOME || os.homedir();
  const temporaryInput = env.TMPDIR || os.tmpdir();
  let home;
  let temporaryDirectory;
  try {
    home = fs.realpathSync(path.resolve(homeInput));
    temporaryDirectory = fs.realpathSync(path.resolve(temporaryInput));
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new SchedulerEnvironmentError(`Required environment directory does not exist: ${error.path}`);
    }
    throw error;
  }
  const user = env.USER || os.userInfo().username;
  assertString(user, "USER", { maxLength: 256 });
  const locale = {};
  for (const [name, value] of Object.entries(env)) {
    if (name !== "LANG" && name !== "LANGUAGE" && !/^LC_[A-Z_]+$/.test(name)) continue;
    if (typeof value !== "string" || value.length === 0) continue;
    assertString(value, name, { maxLength: 256 });
    locale[name] = value;
  }
  return { HOME: home, USER: user, TMPDIR: temporaryDirectory, locale };
}

function resolveWorkingDirectory(value, env, manifestDirectory) {
  const raw = value ?? (env.HOME || os.homedir());
  const expanded = raw === "~"
    ? env.HOME || os.homedir()
    : raw.startsWith("~/")
      ? path.join(env.HOME || os.homedir(), raw.slice(2))
      : path.isAbsolute(raw)
        ? raw
        : path.resolve(manifestDirectory, raw);
  const absolute = path.resolve(expanded);
  let stats;
  try {
    stats = fs.statSync(absolute);
  } catch (error) {
    if (error.code === "ENOENT") throw new SchedulerEnvironmentError(`Working directory does not exist: ${absolute}`);
    throw error;
  }
  if (!stats.isDirectory()) throw new SchedulerEnvironmentError(`Working directory is not a directory: ${absolute}`);
  return fs.realpathSync(absolute);
}

function probeNativeAdapter(adapter, executable, env) {
  const args = adapter === "launchd"
    ? ["print", `gui/${typeof process.getuid === "function" ? process.getuid() : 0}`]
    : ["--user", "show-environment"];
  try {
    execFileSync(executable, args, { env, stdio: "ignore", timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

export function selectAdapter({
  requested = "auto",
  platform = process.platform,
  env = process.env,
  schedule,
  probe = probeNativeAdapter,
} = {}) {
  if (!new Set(["auto", "cron"]).has(requested)) throw new SchedulerUsageError("--adapter must be auto or cron.");
  const available = (command) => resolveExecutable(command, env);
  if (requested === "cron") {
    const executable = available("crontab");
    if (!executable) throw new SchedulerEnvironmentError("Forced cron adapter requires crontab on PATH.");
    return { mode: "cron", selected: "cron", executable, warning: "Cron fallback does not provide catch-up after downtime." };
  }

  const native = platform === "darwin"
    ? { name: "launchd", command: "launchctl" }
    : platform === "linux"
      ? { name: "systemd", command: "systemctl" }
      : undefined;
  const nativeSchedule = schedule === undefined || supportsNativeSchedule(schedule);
  if (native && nativeSchedule) {
    const executable = available(native.command);
    if (executable && probe(native.name, executable, env)) {
      return { mode: "auto", selected: native.name, executable };
    }
  }
  const cron = available("crontab");
  if (cron) {
    const reason = !nativeSchedule
      ? "The schedule is not supported by the native fixed-time adapter"
      : `${native?.name || "Native scheduling"} is unavailable`;
    return {
      mode: "auto",
      selected: "cron",
      executable: cron,
      warning: `${reason}; cron fallback does not provide catch-up after downtime.`,
    };
  }
  throw new SchedulerEnvironmentError("No usable scheduler adapter is available (launchd, systemd-user, or cron).", {
    platform,
    nativeSchedule,
  });
}

export function resolveCandidate(declaration, {
  adapter = "auto",
  env = process.env,
  platform = process.platform,
  probe,
  runnerPath,
  nodePath = process.execPath,
} = {}) {
  if (!declaration) throw new SchedulerUsageError("A declared job is required.");
  const commandNames = [...declaration.job.requiredCommands, ...declaration.job.optionalCommands];
  const caseFoldedNames = new Map();
  for (const command of commandNames) {
    const folded = command.toLocaleLowerCase("en-US");
    const existing = caseFoldedNames.get(folded);
    if (existing && existing !== command) {
      throw new SchedulerEnvironmentError(`Command names collide on case-insensitive filesystems: ${existing}, ${command}.`);
    }
    caseFoldedNames.set(folded, command);
  }
  const requiredCommands = {};
  const missingRequired = [];
  for (const command of declaration.job.requiredCommands) {
    const executable = resolveExecutable(command, env);
    if (executable) requiredCommands[command] = executable;
    else missingRequired.push(command);
  }
  if (missingRequired.length > 0) {
    throw new SchedulerEnvironmentError(`Missing required command${missingRequired.length === 1 ? "" : "s"}: ${missingRequired.join(", ")}.`, {
      missingRequired,
    });
  }
  const optionalCommands = {};
  for (const command of declaration.job.optionalCommands) {
    optionalCommands[command] = resolveExecutable(command, env) ?? null;
  }
  let schedulerRunner = null;
  if (runnerPath !== undefined) {
    if (!path.isAbsolute(runnerPath)) throw new SchedulerEnvironmentError("Scheduler runner path must be absolute.");
    try {
      fs.accessSync(runnerPath, fs.constants.X_OK);
      schedulerRunner = fs.realpathSync(runnerPath);
    } catch {
      throw new SchedulerEnvironmentError(`Scheduler runner is missing or not executable: ${runnerPath}`);
    }
  }
  let schedulerNode;
  try {
    if (!path.isAbsolute(nodePath)) throw new Error("not absolute");
    fs.accessSync(nodePath, fs.constants.X_OK);
    schedulerNode = fs.realpathSync(nodePath);
  } catch {
    throw new SchedulerEnvironmentError(`Scheduler Node interpreter is missing or not executable: ${nodePath}`);
  }
  const scheduler = schedulerStorage(declaration.id, env);
  const adapterContract = selectAdapter({
    requested: adapter,
    platform,
    env,
    schedule: declaration.job.schedule,
    probe,
  });
  const manifestDirectory = path.dirname(declaration.sourcePath);
  const contract = {
    version: MANIFEST_VERSION,
    id: declaration.id,
    scope: declaration.scope,
    key: declaration.key,
    sourcePath: declaration.sourcePath,
    description: declaration.job.description,
    schedule: declaration.job.schedule,
    argv: [
      requiredCommands[declaration.job.argv[0]],
      ...canonicalizeArguments(declaration.job.argv.slice(1), env, manifestDirectory),
    ],
    requiredCommands,
    optionalCommands,
    workingDirectory: resolveWorkingDirectory(declaration.job.workingDirectory, env, manifestDirectory),
    timeoutSeconds: declaration.job.timeoutSeconds,
    schedulerRunner,
    schedulerNode,
    scheduler,
    environment: fixedEnvironment(env),
    adapter: adapterContract,
  };
  return { digest: digest(contract), contract };
}

export function declarationSummary(declaration) {
  return {
    id: declaration.id,
    scope: declaration.scope,
    key: declaration.key,
    description: declaration.description,
    schedule: declaration.schedule,
    sourcePath: declaration.sourcePath,
  };
}
