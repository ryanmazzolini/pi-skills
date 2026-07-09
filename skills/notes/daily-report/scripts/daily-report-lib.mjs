import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const DAY_NAMES = new Map([
  ["sun", 0],
  ["mon", 1],
  ["tue", 2],
  ["wed", 3],
  ["thu", 4],
  ["fri", 5],
  ["sat", 6],
]);

const DISCOVERY_SKIP = new Set([
  ".git",
  ".cache",
  ".next",
  ".pnpm-store",
  ".terraform",
  ".venv",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "target",
  "vendor",
]);

const MAX_BUFFER = 16 * 1024 * 1024;
const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
export const SKILL_DIRECTORY = path.resolve(SCRIPT_DIRECTORY, "..");
export const EXAMPLE_CONFIG_PATH = path.join(SKILL_DIRECTORY, "assets", "config.example.json");
export const REPORT_PROMPT_PATH = path.join(SKILL_DIRECTORY, "references", "report-system-prompt.md");

export class DailyReportError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "DailyReportError";
  }
}

export function expandHome(value) {
  if (typeof value !== "string") return value;
  if (value === "~") return os.homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

export function defaultConfigPath(env = process.env) {
  const configHome = env.XDG_CONFIG_HOME
    ? path.resolve(expandHome(env.XDG_CONFIG_HOME))
    : path.join(os.homedir(), ".config");
  return path.join(configHome, "llm-wiki", "daily-report.json");
}

export function resolveConfigPath(explicitPath, env = process.env) {
  const selected = explicitPath || env.DAILY_REPORT_CONFIG || defaultConfigPath(env);
  return path.resolve(expandHome(selected));
}

export function loadConfig(explicitPath, env = process.env) {
  const configPath = resolveConfigPath(explicitPath, env);
  if (!fs.existsSync(configPath)) {
    throw new DailyReportError(
      `Settings file not found: ${configPath}. Run init-config or pass --config.`,
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    throw new DailyReportError(`Could not parse settings file ${configPath}: ${error.message}`, {
      cause: error,
    });
  }

  if (!isPlainObject(parsed) || parsed.version !== 1 || !isPlainObject(parsed.profiles)) {
    throw new DailyReportError(
      `Settings file ${configPath} must contain version 1 and a profiles object.`,
    );
  }

  return { config: parsed, configPath };
}

export function initializeConfig(explicitPath, { force = false, env = process.env } = {}) {
  const configPath = resolveConfigPath(explicitPath, env);
  if (fs.existsSync(configPath) && !force) {
    throw new DailyReportError(`Refusing to overwrite existing settings file: ${configPath}`);
  }
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.copyFileSync(EXAMPLE_CONFIG_PATH, configPath);
  return configPath;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new DailyReportError(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function optionalBoolean(value, fallback, label) {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new DailyReportError(`${label} must be a boolean.`);
  return value;
}

function optionalPositiveInteger(value, fallback, label, maximum = Number.MAX_SAFE_INTEGER) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new DailyReportError(`${label} must be an integer from 1 to ${maximum}.`);
  }
  return value;
}

function optionalStringArray(value, fallback, label) {
  if (value === undefined) return fallback;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new DailyReportError(`${label} must be an array of non-empty strings.`);
  }
  return value.map((item) => item.trim());
}

function validateTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
  } catch (error) {
    throw new DailyReportError(`Invalid IANA timezone: ${timeZone}`, { cause: error });
  }
  return timeZone;
}

function validateReportDays(value) {
  const names = optionalStringArray(value, [...DAY_NAMES.keys()], "profile.reportDays");
  const numbers = names.map((name) => {
    const normalized = name.toLowerCase().slice(0, 3);
    if (!DAY_NAMES.has(normalized)) {
      throw new DailyReportError(
        `Invalid report day ${JSON.stringify(name)}; use sun, mon, tue, wed, thu, fri, or sat.`,
      );
    }
    return DAY_NAMES.get(normalized);
  });
  return [...new Set(numbers)];
}

function assertDirectory(directory, label) {
  let stats;
  try {
    stats = fs.statSync(directory);
  } catch (error) {
    throw new DailyReportError(`${label} does not exist: ${directory}`, { cause: error });
  }
  if (!stats.isDirectory()) throw new DailyReportError(`${label} is not a directory: ${directory}`);
}

function pathIsInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

export function resolveProfile(config, profileName) {
  requireString(profileName, "profile name");
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(profileName)) {
    throw new DailyReportError(`Invalid profile name: ${profileName}`);
  }

  const rawProfile = config.profiles[profileName];
  if (!isPlainObject(rawProfile)) throw new DailyReportError(`Unknown profile: ${profileName}`);
  const defaults = isPlainObject(config.defaults) ? config.defaults : {};

  const vault = path.resolve(expandHome(requireString(rawProfile.vault, `${profileName}.vault`)));
  assertDirectory(vault, `${profileName}.vault`);
  try {
    fs.accessSync(vault, fs.constants.R_OK | fs.constants.W_OK);
  } catch (error) {
    throw new DailyReportError(`${profileName}.vault is not readable and writable: ${vault}`, {
      cause: error,
    });
  }
  const vaultRealPath = fs.realpathSync(vault);

  if (!Array.isArray(rawProfile.gitRoots) || rawProfile.gitRoots.length === 0) {
    throw new DailyReportError(`${profileName}.gitRoots must contain at least one directory.`);
  }
  const gitRoots = rawProfile.gitRoots.map((root, index) => {
    const resolved = path.resolve(expandHome(requireString(root, `${profileName}.gitRoots[${index}]`)));
    assertDirectory(resolved, `${profileName}.gitRoots[${index}]`);
    try {
      fs.accessSync(resolved, fs.constants.R_OK | fs.constants.X_OK);
    } catch (error) {
      throw new DailyReportError(
        `${profileName}.gitRoots[${index}] is not readable and searchable: ${resolved}`,
        { cause: error },
      );
    }
    return fs.realpathSync(resolved);
  });

  const reportDirectory = rawProfile.reportDirectory ?? "daily-reports";
  requireString(reportDirectory, `${profileName}.reportDirectory`);
  if (path.isAbsolute(reportDirectory)) {
    throw new DailyReportError(`${profileName}.reportDirectory must be relative to the vault.`);
  }
  const reportBase = path.resolve(vaultRealPath, reportDirectory);
  if (!pathIsInside(vaultRealPath, reportBase) || reportBase === vaultRealPath) {
    throw new DailyReportError(`${profileName}.reportDirectory must stay inside the vault.`);
  }

  const timezone = validateTimeZone(
    rawProfile.timezone || defaults.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );
  const maxReconcileDays = optionalPositiveInteger(
    rawProfile.maxReconcileDays ?? defaults.maxReconcileDays,
    7,
    `${profileName}.maxReconcileDays`,
    366,
  );
  const gitAuthors = optionalStringArray(rawProfile.gitAuthors, [], `${profileName}.gitAuthors`);
  const gitMaxDepth = optionalPositiveInteger(
    rawProfile.gitMaxDepth,
    8,
    `${profileName}.gitMaxDepth`,
    32,
  );

  const rawGithub = isPlainObject(rawProfile.github) ? rawProfile.github : {};
  const rawShortcut = isPlainObject(rawProfile.shortcut) ? rawProfile.shortcut : {};
  const rawPi = isPlainObject(rawProfile.pi) ? rawProfile.pi : {};

  const github = {
    enabled: optionalBoolean(rawGithub.enabled, false, `${profileName}.github.enabled`),
    owners: optionalStringArray(rawGithub.owners, [], `${profileName}.github.owners`),
    includeBodies: optionalBoolean(
      rawGithub.includeBodies,
      false,
      `${profileName}.github.includeBodies`,
    ),
    maxPages: optionalPositiveInteger(
      rawGithub.maxPages,
      10,
      `${profileName}.github.maxPages`,
      100,
    ),
  };

  const shortcut = {
    enabled: optionalBoolean(rawShortcut.enabled, false, `${profileName}.shortcut.enabled`),
    includeRequested: optionalBoolean(
      rawShortcut.includeRequested,
      true,
      `${profileName}.shortcut.includeRequested`,
    ),
    maxStories: optionalPositiveInteger(
      rawShortcut.maxStories,
      50,
      `${profileName}.shortcut.maxStories`,
      250,
    ),
  };

  const piConfig = {
    model: rawPi.model === undefined ? undefined : requireString(rawPi.model, `${profileName}.pi.model`),
    thinking:
      rawPi.thinking === undefined
        ? undefined
        : requireString(rawPi.thinking, `${profileName}.pi.thinking`),
    timeoutSeconds: optionalPositiveInteger(
      rawPi.timeoutSeconds,
      600,
      `${profileName}.pi.timeoutSeconds`,
      3600,
    ),
  };

  return {
    name: profileName,
    vault: vaultRealPath,
    gitRoots: [...new Set(gitRoots)],
    gitAuthors,
    gitMaxDepth,
    reportBase,
    reportDirectory,
    reportDays: validateReportDays(rawProfile.reportDays),
    schedule:
      rawProfile.schedule === undefined
        ? undefined
        : requireString(rawProfile.schedule, `${profileName}.schedule`),
    timezone,
    maxReconcileDays,
    github,
    shortcut,
    pi: piConfig,
  };
}

function ensureSafeDirectoryTree(root, target, label) {
  const relative = path.relative(root, target);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`)) {
    throw new DailyReportError(`${label} must be a child directory of the vault.`);
  }

  let current = root;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    let stats;
    try {
      stats = fs.lstatSync(current);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      fs.mkdirSync(current);
      stats = fs.lstatSync(current);
    }
    if (stats.isSymbolicLink()) {
      throw new DailyReportError(`${label} contains a symbolic link: ${current}`);
    }
    if (!stats.isDirectory()) {
      throw new DailyReportError(`${label} contains a non-directory path: ${current}`);
    }
    const canonical = fs.realpathSync(current);
    if (!pathIsInside(root, canonical) || canonical === root) {
      throw new DailyReportError(`${label} resolves outside the vault: ${current}`);
    }
  }
  return fs.realpathSync(target);
}

export function ensureReportBase(profile) {
  return ensureSafeDirectoryTree(profile.vault, profile.reportBase, "Report directory");
}

export function parseDateString(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new DailyReportError(`Invalid date ${JSON.stringify(value)}; expected YYYY-MM-DD.`);
  }
  const [year, month, day] = value.split("-").map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw new DailyReportError(`Invalid calendar date: ${value}`);
  }
  return { year, month, day };
}

export function formatDateParts({ year, month, day }) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addDays(dateString, amount) {
  const { year, month, day } = parseDateString(dateString);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return formatDateParts({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

export function dayOfWeek(dateString) {
  const { year, month, day } = parseDateString(dateString);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function todayInTimeZone(timeZone, now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function timeZoneOffsetMilliseconds(instant, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
    hour: "2-digit",
  });
  const value = formatter.formatToParts(instant).find((part) => part.type === "timeZoneName")?.value;
  if (value === "GMT" || value === "UTC") return 0;
  const match = value?.match(/^GMT([+-])(\d{2}):(\d{2})$/);
  if (!match) throw new DailyReportError(`Could not resolve timezone offset for ${timeZone}.`);
  const sign = match[1] === "+" ? 1 : -1;
  return sign * (Number(match[2]) * 60 + Number(match[3])) * 60_000;
}

function zonedMidnight(dateString, timeZone) {
  const { year, month, day } = parseDateString(dateString);
  const localAsUtc = Date.UTC(year, month - 1, day);
  let candidate = new Date(localAsUtc);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const adjusted = new Date(localAsUtc - timeZoneOffsetMilliseconds(candidate, timeZone));
    if (adjusted.getTime() === candidate.getTime()) return adjusted;
    candidate = adjusted;
  }
  return candidate;
}

export function dateWindow(dateString, timeZone) {
  const start = zonedMidnight(dateString, timeZone);
  const end = zonedMidnight(addDays(dateString, 1), timeZone);
  return { start: start.toISOString(), end: end.toISOString(), timeZone };
}

export function ensureReportPath(profile, dateString) {
  const reportBase = ensureReportBase(profile);
  const { year } = parseDateString(dateString);
  const yearDirectory = ensureSafeDirectoryTree(profile.vault, path.join(reportBase, String(year)), "Report year directory");
  return path.join(yearDirectory, `${dateString}.md`);
}

export function acquireReportLock(reportPath) {
  const lockPath = path.join(path.dirname(reportPath), `.${path.basename(reportPath)}.lock`);
  const token = `${process.pid}:${randomUUID()}`;
  const lock = JSON.stringify({ token, pid: process.pid, createdAt: new Date().toISOString() }) + "\n";
  try {
    const descriptor = fs.openSync(lockPath, "wx", 0o600);
    try {
      fs.writeFileSync(descriptor, lock, "utf8");
    } finally {
      fs.closeSync(descriptor);
    }
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    throw new DailyReportError(
      `Report generation is already in progress: ${reportPath}. If no process is active, remove ${lockPath}.`,
    );
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    let current;
    try {
      current = fs.readFileSync(lockPath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    if (current !== lock) return;
    fs.unlinkSync(lockPath);
  };
}

export function resolveExecutable(command, env = process.env) {
  if (!command) return undefined;
  if (command.includes(path.sep)) {
    const candidate = path.resolve(expandHome(command));
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return fs.realpathSync(candidate);
    } catch {
      return undefined;
    }
  }

  for (const directory of (env.PATH || "").split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(directory, command);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return fs.realpathSync(candidate);
    } catch {
      // Continue searching PATH.
    }
  }
  return undefined;
}

function commandFailure(executable, args, result) {
  const detail = String(result.stderr || result.stdout || result.error?.message || "unknown failure")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
  return new DailyReportError(
    `${path.basename(executable)} ${args[0] || ""} failed${result.status === null ? "" : ` with exit ${result.status}`}: ${detail}`,
  );
}

export function runCommand(
  executable,
  args,
  { cwd, input, env = process.env, timeout = 30_000, allowFailure = false } = {},
) {
  const result = spawnSync(executable, args, {
    cwd,
    input,
    env,
    encoding: "utf8",
    timeout,
    maxBuffer: MAX_BUFFER,
  });
  if (result.error || result.status !== 0) {
    if (allowFailure) return { ok: false, result };
    throw commandFailure(executable, args, result);
  }
  return { ok: true, stdout: result.stdout || "", stderr: result.stderr || "", result };
}

export function inspectEnvironment(profile, env = process.env) {
  const tools = {
    pi: resolveExecutable("pi", env),
    git: resolveExecutable("git", env),
    gh: resolveExecutable("gh", env),
    short: resolveExecutable("short", env),
  };
  if (!tools.pi) throw new DailyReportError("Required command not found on PATH: pi");
  if (!tools.git) throw new DailyReportError("Required command not found on PATH: git");

  return {
    tools,
    optional: {
      github: !profile.github.enabled ? "skipped" : tools.gh ? "available" : "unavailable",
      shortcut: !profile.shortcut.enabled ? "skipped" : tools.short ? "available" : "unavailable",
    },
  };
}

function sourceResult(name, status, items = [], extra = {}) {
  return { name, status, items, warnings: [], ...extra };
}

function safeRelativeRepositoryName(repository, roots) {
  for (const root of roots) {
    if (pathIsInside(root, repository)) {
      const relative = path.relative(root, repository);
      return relative || path.basename(repository);
    }
  }
  return path.basename(repository);
}

export function discoverGitRepositories(roots, maxDepth = 8) {
  const repositories = new Set();
  const warnings = [];
  const stack = roots.map((root) => ({ directory: root, depth: 0 }));

  while (stack.length > 0) {
    const { directory, depth } = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch (error) {
      warnings.push(`Could not inspect ${directory}: ${error.message}`);
      continue;
    }

    const gitEntry = entries.find((entry) => entry.name === ".git");
    if (gitEntry && (gitEntry.isDirectory() || gitEntry.isFile())) repositories.add(directory);
    if (depth >= maxDepth) continue;

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      if (DISCOVERY_SKIP.has(entry.name)) continue;
      if (entry.name.startsWith(".") && entry.name !== ".worktrees") continue;
      stack.push({ directory: path.join(directory, entry.name), depth: depth + 1 });
    }
  }

  return { repositories: [...repositories].sort(), warnings };
}

function readGitConfig(git, repository, key) {
  const result = runCommand(git, ["-C", repository, "config", "--get", key], { allowFailure: true });
  return result.ok ? result.stdout.trim() : "";
}

function sanitizeRemote(remote) {
  if (!remote) return undefined;
  const scpMatch = remote.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
  if (scpMatch) return `https://${scpMatch[1]}/${scpMatch[2].replace(/\.git$/, "")}`;
  try {
    const parsed = new URL(remote);
    if (!["http:", "https:", "ssh:", "git:"].includes(parsed.protocol)) return undefined;
    const protocol = parsed.protocol === "ssh:" || parsed.protocol === "git:" ? "https:" : parsed.protocol;
    return `${protocol}//${parsed.host}${parsed.pathname.replace(/\.git$/, "")}`;
  } catch {
    return undefined;
  }
}

function gitCommitUrl(remote, hash) {
  if (!remote) return undefined;
  try {
    const parsed = new URL(remote);
    if (parsed.hostname.toLowerCase() === "github.com") return `${remote}/commit/${hash}`;
    if (parsed.hostname.toLowerCase().includes("gitlab")) return `${remote}/-/commit/${hash}`;
  } catch {
    return undefined;
  }
  return undefined;
}

function repositoryDisplayName(remote, fallback) {
  if (!remote) return fallback;
  try {
    const parsed = new URL(remote);
    const remotePath = parsed.pathname.replace(/^\/+/, "").replace(/\.git$/, "");
    return remotePath || fallback;
  } catch {
    return fallback;
  }
}

function gitCommonDirectory(git, repository) {
  const response = runCommand(git, ["-C", repository, "rev-parse", "--git-common-dir"], {
    allowFailure: true,
  });
  if (!response.ok) return repository;
  const configured = response.stdout.trim();
  if (!configured) return repository;
  const resolved = path.resolve(repository, configured);
  try {
    return fs.realpathSync(resolved);
  } catch {
    return resolved;
  }
}

function parseGitLog(output) {
  return output
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [hash, authoredAt, committedAt, authorName, authorEmail, subject, refs] = record.split("\x1f");
      return { hash, authoredAt, committedAt, authorName, authorEmail, subject, refs };
    });
}

export function collectGit(profile, tools, window) {
  const discovered = discoverGitRepositories(profile.gitRoots, profile.gitMaxDepth);
  const result = sourceResult("git", discovered.warnings.length ? "degraded" : "ok", [], {
    repositoriesScanned: 0,
    warnings: [...discovered.warnings],
  });
  const startMs = Date.parse(window.start);
  const endMs = Date.parse(window.end);
  const seenCommits = new Set();
  let validRepositories = 0;
  let collectedRepositories = 0;

  for (const repository of discovered.repositories) {
    const fallbackName = safeRelativeRepositoryName(repository, profile.gitRoots);
    const validity = runCommand(
      tools.git,
      ["-C", repository, "rev-parse", "--is-inside-work-tree"],
      { allowFailure: true },
    );
    if (!validity.ok || validity.stdout.trim() !== "true") {
      result.warnings.push(`Ignored invalid Git marker: ${fallbackName}`);
      continue;
    }
    validRepositories += 1;

    try {
      const configuredAuthors =
        profile.gitAuthors.length > 0
          ? profile.gitAuthors
          : [
              readGitConfig(tools.git, repository, "user.email"),
              readGitConfig(tools.git, repository, "user.name"),
            ].filter(Boolean);
      if (configuredAuthors.length === 0) {
        result.status = "degraded";
        result.warnings.push(
          `Skipped ${fallbackName} because no Git author identity was configured.`,
        );
        continue;
      }
      const authorSet = new Set(configuredAuthors.map((value) => value.toLowerCase()));
      const format = "%H%x1f%aI%x1f%cI%x1f%an%x1f%ae%x1f%s%x1f%D%x1e";
      const log = runCommand(
        tools.git,
        [
          "-C",
          repository,
          "log",
          "--all",
          `--since=${window.start}`,
          `--until=${window.end}`,
          `--format=${format}`,
        ],
        { timeout: 60_000 },
      ).stdout;
      const remote = sanitizeRemote(readGitConfig(tools.git, repository, "remote.origin.url"));
      const commonDirectory = gitCommonDirectory(tools.git, repository);
      const repositoryName = repositoryDisplayName(remote, fallbackName);
      collectedRepositories += 1;

      for (const commit of parseGitLog(log)) {
        const committedAt = Date.parse(commit.committedAt);
        if (!(committedAt >= startMs && committedAt < endMs)) continue;
        if (
          !authorSet.has(String(commit.authorEmail).toLowerCase()) &&
          !authorSet.has(String(commit.authorName).toLowerCase())
        ) {
          continue;
        }
        const identity = `${remote || commonDirectory}\u0000${commit.hash}`;
        if (seenCommits.has(identity)) continue;
        seenCommits.add(identity);
        result.items.push({
          kind: "commit",
          repository: repositoryName,
          remote,
          hash: commit.hash,
          shortHash: commit.hash.slice(0, 10),
          authoredAt: commit.authoredAt,
          committedAt: commit.committedAt,
          subject: commit.subject,
          refs: commit.refs || undefined,
          url: gitCommitUrl(remote, commit.hash),
        });
      }
    } catch (error) {
      result.status = "degraded";
      result.warnings.push(`Could not collect ${fallbackName}: ${error.message}`);
    }
  }

  result.repositoriesScanned = collectedRepositories;
  if (validRepositories > 0 && collectedRepositories === 0) {
    throw new DailyReportError("Git collection failed for every discovered repository.");
  }
  result.items.sort((left, right) => left.committedAt.localeCompare(right.committedAt));
  return result;
}

function boundedText(value, enabled, maximum = 800) {
  if (!enabled || typeof value !== "string" || !value.trim()) return undefined;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maximum ? `${normalized.slice(0, maximum)}…` : normalized;
}

function githubEventUrl(event) {
  const payload = event.payload || {};
  return (
    payload.pull_request?.html_url ||
    payload.issue?.html_url ||
    payload.comment?.html_url ||
    payload.review?.html_url ||
    (event.repo?.name ? `https://github.com/${event.repo.name}` : undefined)
  );
}

function normalizeGithubEvent(event, includeBodies) {
  const payload = event.payload || {};
  const normalized = {
    id: event.id,
    kind: event.type,
    createdAt: event.created_at,
    repository: event.repo?.name,
    url: githubEventUrl(event),
  };

  switch (event.type) {
    case "PushEvent":
      return {
        ...normalized,
        ref: payload.ref,
        commits: (payload.commits || []).slice(0, 50).map((commit) => ({
          sha: commit.sha,
          message: boundedText(commit.message, true, 500),
          url:
            event.repo?.name && commit.sha
              ? `https://github.com/${event.repo.name}/commit/${commit.sha}`
              : undefined,
        })),
      };
    case "PullRequestEvent":
      return {
        ...normalized,
        action: payload.action,
        number: payload.number,
        title: payload.pull_request?.title,
        state: payload.pull_request?.state,
        merged: payload.pull_request?.merged,
        body: boundedText(payload.pull_request?.body, includeBodies),
      };
    case "PullRequestReviewEvent":
      return {
        ...normalized,
        action: payload.action,
        number: payload.pull_request?.number,
        title: payload.pull_request?.title,
        reviewState: payload.review?.state,
        body: boundedText(payload.review?.body, includeBodies),
      };
    case "PullRequestReviewCommentEvent":
    case "IssueCommentEvent":
      return {
        ...normalized,
        action: payload.action,
        number: payload.issue?.number,
        title: payload.issue?.title,
        body: boundedText(payload.comment?.body, includeBodies),
      };
    case "IssuesEvent":
      return {
        ...normalized,
        action: payload.action,
        number: payload.issue?.number,
        title: payload.issue?.title,
        body: boundedText(payload.issue?.body, includeBodies),
      };
    case "CreateEvent":
    case "DeleteEvent":
      return { ...normalized, ref: payload.ref, refType: payload.ref_type };
    default:
      return { ...normalized, action: payload.action };
  }
}

function unavailableSource(name, reason) {
  return sourceResult(name, "unavailable", [], { reason });
}

export function collectGithub(profile, tools, window) {
  if (!profile.github.enabled) return sourceResult("github", "skipped");
  if (!tools.gh) return unavailableSource("github", "gh command not found");

  let login;
  try {
    const user = JSON.parse(runCommand(tools.gh, ["api", "/user"], { timeout: 30_000 }).stdout);
    login = requireString(user.login, "GitHub authenticated user login");
  } catch (error) {
    return unavailableSource("github", error.message);
  }

  const result = sourceResult("github", "ok", [], { login });
  const owners = new Set(profile.github.owners.map((owner) => owner.toLowerCase()));
  const startMs = Date.parse(window.start);
  const endMs = Date.parse(window.end);
  const seen = new Set();
  let reachedStart = false;

  for (let page = 1; page <= profile.github.maxPages; page += 1) {
    let events;
    try {
      const endpoint = `/users/${encodeURIComponent(login)}/events?per_page=100&page=${page}`;
      events = JSON.parse(runCommand(tools.gh, ["api", endpoint], { timeout: 30_000 }).stdout);
      if (!Array.isArray(events)) throw new DailyReportError("GitHub events response was not an array.");
    } catch (error) {
      if (result.items.length === 0) return unavailableSource("github", error.message);
      result.status = "degraded";
      result.warnings.push(error.message);
      break;
    }

    if (events.length === 0) {
      reachedStart = true;
      break;
    }

    for (const event of events) {
      const createdAt = Date.parse(event.created_at);
      if (createdAt < startMs) {
        reachedStart = true;
        continue;
      }
      if (createdAt >= endMs || Number.isNaN(createdAt)) continue;
      const owner = String(event.repo?.name || "").split("/")[0].toLowerCase();
      if (owners.size > 0 && !owners.has(owner)) continue;
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      result.items.push(normalizeGithubEvent(event, profile.github.includeBodies));
    }

    const oldest = Math.min(...events.map((event) => Date.parse(event.created_at)).filter(Number.isFinite));
    if (oldest < startMs) reachedStart = true;
    if (reachedStart) break;
  }

  if (!reachedStart && profile.github.maxPages > 0) {
    result.status = "degraded";
    result.warnings.push(
      `GitHub pagination reached ${profile.github.maxPages} pages before the start of the report window.`,
    );
  }
  result.items.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  return result;
}

function shortcutApi(short, endpoint, fields = [], method = "GET") {
  const args = ["api", endpoint];
  if (method !== "GET") args.push("-X", method);
  for (const [key, value] of fields) args.push("-f", `${key}=${value}`);
  return JSON.parse(runCommand(short, args, { timeout: 30_000 }).stdout);
}

function sanitizeHistoryValue(value, depth = 0) {
  if (depth > 4) return undefined;
  if (typeof value === "string") return boundedText(value, true, 500);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) {
    return value.slice(0, 25).map((item) => sanitizeHistoryValue(item, depth + 1));
  }
  if (!isPlainObject(value)) return undefined;

  const output = {};
  for (const [key, item] of Object.entries(value).slice(0, 30)) {
    if (/token|secret|password|email/i.test(key)) continue;
    const sanitized = sanitizeHistoryValue(item, depth + 1);
    if (sanitized !== undefined) output[key] = sanitized;
  }
  return output;
}

function normalizeShortcutStory(story, stateNames, history) {
  return {
    kind: "story",
    id: story.id,
    name: story.name,
    url: story.app_url,
    storyType: story.story_type,
    state: stateNames.get(story.workflow_state_id) || story.workflow_state_id,
    updatedAt: story.updated_at,
    createdAt: story.created_at,
    ownerIds: story.owner_ids,
    requestedById: story.requested_by_id,
    history,
  };
}

export function collectShortcut(profile, tools, window) {
  if (!profile.shortcut.enabled) return sourceResult("shortcut", "skipped");
  if (!tools.short) return unavailableSource("shortcut", "short command not found");

  let member;
  try {
    member = shortcutApi(tools.short, "/member");
    requireString(member.id, "Shortcut member id");
  } catch (error) {
    return unavailableSource("shortcut", error.message);
  }

  const result = sourceResult("shortcut", "ok", [], {
    member: member.profile?.name || member.profile?.mention_name,
  });
  const stories = new Map();
  const queryFields = [
    ["updated_at_start", window.start],
    ["updated_at_end", window.end],
  ];

  try {
    const owned = shortcutApi(
      tools.short,
      "/stories/search",
      [...queryFields, ["owner_id", member.id]],
      "POST",
    );
    if (!Array.isArray(owned)) throw new DailyReportError("Shortcut story search was not an array.");
    for (const story of owned) stories.set(story.id, story);

    if (profile.shortcut.includeRequested) {
      const requested = shortcutApi(
        tools.short,
        "/stories/search",
        [...queryFields, ["requested_by_id", member.id]],
        "POST",
      );
      if (!Array.isArray(requested)) {
        throw new DailyReportError("Shortcut requested-story search was not an array.");
      }
      for (const story of requested) stories.set(story.id, story);
    }
  } catch (error) {
    return unavailableSource("shortcut", error.message);
  }

  let stateNames = new Map();
  try {
    const workflows = shortcutApi(tools.short, "/workflows");
    stateNames = new Map(
      (Array.isArray(workflows) ? workflows : []).flatMap((workflow) =>
        (workflow.states || []).map((state) => [state.id, state.name]),
      ),
    );
  } catch (error) {
    result.status = "degraded";
    result.warnings.push(`Could not resolve Shortcut workflow states: ${error.message}`);
  }

  const selectedStories = [...stories.values()]
    .sort((left, right) => String(left.updated_at).localeCompare(String(right.updated_at)))
    .slice(0, profile.shortcut.maxStories);
  if (stories.size > selectedStories.length) {
    result.status = "degraded";
    result.warnings.push(
      `Shortcut returned ${stories.size} stories; only ${selectedStories.length} were included.`,
    );
  }

  const startMs = Date.parse(window.start);
  const endMs = Date.parse(window.end);
  for (const story of selectedStories) {
    let history = [];
    try {
      const response = shortcutApi(tools.short, `/stories/${story.id}/history`);
      history = (Array.isArray(response) ? response : [])
        .filter((entry) => {
          const changedAt = Date.parse(entry.changed_at);
          return changedAt >= startMs && changedAt < endMs;
        })
        .slice(0, 50)
        .map((entry) => ({
          changedAt: entry.changed_at,
          actorName: entry.actor_name,
          byAuthenticatedMember: entry.member_id === member.id,
          actions: sanitizeHistoryValue(entry.actions),
        }));
    } catch (error) {
      result.status = "degraded";
      result.warnings.push(`Could not load history for sc-${story.id}: ${error.message}`);
    }
    result.items.push(normalizeShortcutStory(story, stateNames, history));
  }

  return result;
}

export function collectSources(profile, environment, window) {
  const sources = {
    git: collectGit(profile, environment.tools, window),
    github: collectGithub(profile, environment.tools, window),
    shortcut: collectShortcut(profile, environment.tools, window),
  };
  return sources;
}

export function sourceStatusLists(sources) {
  const statuses = { ok: [], degraded: [], unavailable: [], skipped: [] };
  for (const [name, source] of Object.entries(sources)) {
    if (statuses[source.status]) statuses[source.status].push(name);
  }
  return statuses;
}

export function generationStatus(sources) {
  return Object.values(sources).some(
    (source) => source.status === "degraded" || source.status === "unavailable",
  )
    ? "partial"
    : "complete";
}

function yamlString(value) {
  return JSON.stringify(String(value));
}

function yamlList(lines, key, values) {
  if (values.length === 0) return;
  lines.push(`${key}:`);
  for (const value of values) lines.push(`  - ${yamlString(value)}`);
}

export function renderFrontmatter({ profile, date, timestamp, sources }) {
  const status = generationStatus(sources);
  const lists = sourceStatusLists(sources);
  const profileTitle = profile.name.charAt(0).toUpperCase() + profile.name.slice(1);
  const lines = [
    "---",
    "type: Daily Report",
    `title: ${yamlString(`${profileTitle} report — ${date}`)}`,
    `description: ${yamlString(`Automated summary of ${profile.name} activity for ${date}.`)}`,
    "tags:",
    "  - daily-report",
    `  - ${yamlString(profile.name)}`,
    "  - generated",
    `timestamp: ${yamlString(timestamp)}`,
    `date: ${yamlString(date)}`,
    `profile: ${yamlString(profile.name)}`,
    `generation_status: ${status}`,
  ];
  yamlList(lines, "sources_ok", lists.ok);
  yamlList(lines, "sources_degraded", lists.degraded);
  yamlList(lines, "sources_unavailable", lists.unavailable);
  yamlList(lines, "sources_skipped", lists.skipped);
  lines.push("---");
  return lines.join("\n");
}

function humanList(values) {
  if (values.length === 0) return "";
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function sourceDisplayName(name) {
  return name === "github" ? "GitHub" : name === "shortcut" ? "Shortcut" : "Git";
}

export function renderCoverage(sources) {
  const lists = sourceStatusLists(sources);
  const clauses = [];
  if (lists.ok.length) clauses.push(`${humanList(lists.ok.map(sourceDisplayName))} available`);
  if (lists.degraded.length) {
    clauses.push(`${humanList(lists.degraded.map(sourceDisplayName))} partially available`);
  }
  if (lists.unavailable.length) {
    clauses.push(`${humanList(lists.unavailable.map(sourceDisplayName))} unavailable`);
  }
  if (lists.skipped.length) {
    clauses.push(`${humanList(lists.skipped.map(sourceDisplayName))} skipped by configuration`);
  }
  return `> Source coverage: ${clauses.join("; ")}.`;
}

function stripAnsi(value) {
  return value.replace(/[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g, "");
}

export function normalizeGeneratedBody(value) {
  let body = stripAnsi(String(value || "")).trim();
  if (body.startsWith("```markdown") && body.endsWith("```")) {
    body = body.slice("```markdown".length, -3).trim();
  } else if (body.startsWith("```") && body.endsWith("```")) {
    body = body.slice(3, -3).trim();
  }
  if (body.startsWith("---\n")) {
    const closing = body.indexOf("\n---\n", 4);
    if (closing >= 0) body = body.slice(closing + 5).trim();
  }
  if (body.length < 20 || !body.startsWith("#")) {
    throw new DailyReportError("Pi returned an invalid or empty Markdown report body.");
  }
  return body;
}

export function generateReportBody(profile, tools, date, window, sources, env = process.env) {
  let systemPrompt;
  try {
    systemPrompt = fs.readFileSync(REPORT_PROMPT_PATH, "utf8").trim();
  } catch (error) {
    throw new DailyReportError(`Could not read report prompt: ${REPORT_PROMPT_PATH}`, { cause: error });
  }

  const promptSources = Object.fromEntries(
    Object.entries(sources).map(([name, source]) => [
      name,
      { status: source.status, items: source.items || [] },
    ]),
  );
  const evidence = JSON.stringify(
    {
      report: { date, profile: profile.name, window },
      sources: promptSources,
    },
    null,
    2,
  );
  const args = [
    "--no-session",
    "--no-tools",
    "--no-extensions",
    "--no-skills",
    "--no-prompt-templates",
    "--no-context-files",
    "--system-prompt",
    systemPrompt,
  ];
  if (profile.pi.model) args.push("--model", profile.pi.model);
  if (profile.pi.thinking) args.push("--thinking", profile.pi.thinking);
  args.push(
    "--print",
    `Write the ${profile.name} daily report for ${date} using the JSON evidence supplied on stdin.`,
  );

  const piEnv = {
    ...env,
    NO_COLOR: "1",
    PI_SKIP_VERSION_CHECK: "1",
  };
  const output = runCommand(tools.pi, args, {
    cwd: profile.vault,
    input: evidence,
    env: piEnv,
    timeout: profile.pi.timeoutSeconds * 1000,
  }).stdout;
  return normalizeGeneratedBody(output);
}

export function renderReport({ profile, date, timestamp, sources, body }) {
  return `${renderFrontmatter({ profile, date, timestamp, sources })}\n\n${renderCoverage(sources)}\n\n${body.trim()}\n`;
}

export function atomicWriteReport(filePath, content) {
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`,
  );
  try {
    fs.writeFileSync(temporaryPath, content, { encoding: "utf8", flag: "wx" });
    fs.renameSync(temporaryPath, filePath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
  }
}

export function reportGenerationStatus(filePath) {
  if (!fs.existsSync(filePath)) return undefined;
  const beginning = fs.readFileSync(filePath, "utf8").slice(0, 8_192);
  if (!beginning.startsWith("---\n")) return undefined;
  const closing = beginning.indexOf("\n---", 4);
  if (closing < 0) return undefined;
  return beginning.slice(4, closing).match(/^generation_status:\s*([^\s#]+)\s*$/m)?.[1];
}

export function reconcileDates(profile, today, maxDays = profile.maxReconcileDays) {
  const boundedDays = optionalPositiveInteger(maxDays, profile.maxReconcileDays, "max days", 366);
  const dates = [];
  for (let offset = boundedDays - 1; offset >= 0; offset -= 1) {
    const date = addDays(today, -offset);
    if (profile.reportDays.includes(dayOfWeek(date))) dates.push(date);
  }
  return dates;
}

export function assertNotFutureDate(date, profile, now = new Date()) {
  const today = todayInTimeZone(profile.timezone, now);
  if (date > today) throw new DailyReportError(`Refusing to generate a future report: ${date}`);
}

export function validateCronExpression(value) {
  requireString(value, "schedule");
  if (/\r|\n/.test(value) || value.trim().split(/\s+/).length !== 5) {
    throw new DailyReportError("schedule must be a single five-field cron expression.");
  }
  return value.trim();
}

export function stateDirectory(env = process.env) {
  const base = env.XDG_STATE_HOME
    ? path.resolve(expandHome(env.XDG_STATE_HOME))
    : path.join(os.homedir(), ".local", "state");
  return path.join(base, "llm-wiki");
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function escapeCronPercents(value) {
  return value.replace(/%/g, "\\%");
}

export function cronBlock({ profile, configPath, tools, scriptPath, env = process.env }) {
  const schedule = validateCronExpression(profile.schedule);
  const commandDirectories = [
    path.dirname(process.execPath),
    path.dirname(tools.pi),
    path.dirname(tools.git),
    tools.gh ? path.dirname(tools.gh) : undefined,
    tools.short ? path.dirname(tools.short) : undefined,
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ].filter(Boolean);
  const cronPath = [...new Set(commandDirectories)].join(path.delimiter);
  const logDirectory = stateDirectory(env);
  fs.mkdirSync(logDirectory, { recursive: true });
  const logPath = path.join(logDirectory, `daily-report-${profile.name}.log`);
  const marker = `daily-report:${profile.name}`;
  const command = [
    "env",
    `PATH=${cronPath}`,
    process.execPath,
    path.resolve(scriptPath),
    "reconcile",
    profile.name,
    "--config",
    path.resolve(configPath),
  ]
    .map(shellQuote)
    .join(" ");
  const commandLine = escapeCronPercents(`${command} >> ${shellQuote(logPath)} 2>&1`);
  return {
    marker,
    logPath,
    text: [`# BEGIN ${marker}`, `${schedule} ${commandLine}`, `# END ${marker}`].join("\n"),
  };
}

export function replaceCronBlock(crontab, marker, replacement) {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(?:^|\\n)# BEGIN ${escaped}\\n[\\s\\S]*?\\n# END ${escaped}(?=\\n|$)`,
    "g",
  );
  const without = crontab.replace(pattern, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const combined = [without, replacement].filter(Boolean).join("\n\n");
  return combined ? `${combined}\n` : "";
}

export function readCrontab(crontabExecutable) {
  const result = runCommand(crontabExecutable, ["-l"], { allowFailure: true });
  if (result.ok) return result.stdout;
  const errorText = String(result.result.stderr || "");
  if (/no crontab/i.test(errorText)) return "";
  throw commandFailure(crontabExecutable, ["-l"], result.result);
}

export function writeCrontab(crontabExecutable, value) {
  runCommand(crontabExecutable, ["-"], { input: value });
}
