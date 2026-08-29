#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveNamedProfile } from "../../ship/ship/scripts/workflow-profile.mjs";

const SUPPORTED_PROFILE = "personal";
const MAX_CONFIG_BYTES = 64 * 1024;
const MAX_HEADER_BYTES = 16 * 1024;
const DEFAULTS = Object.freeze({
  lookbackDays: 30,
  quiescentHours: 24,
  maxSessions: 8,
  minMessages: 4,
  maxMessages: 80,
  maxProjectionBytes: 48 * 1024,
  maxMessageBytes: 6 * 1024,
  maxSessionBytes: 32 * 1024 * 1024,
});

export class PrepareSessionsError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "PrepareSessionsError";
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pathIsInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function expandHome(value, home) {
  if (value === "~") return home;
  if (typeof value === "string" && value.startsWith("~/")) return path.join(home, value.slice(2));
  return value;
}

function resolveConfigPath(configPath, env, home) {
  const configured = configPath ?? env.PI_SKILLS_WORKFLOW_CONFIG;
  if (configured) return path.resolve(expandHome(configured, home));
  const configHome = env.XDG_CONFIG_HOME
    ? path.resolve(expandHome(env.XDG_CONFIG_HOME, home))
    : path.join(home, ".config");
  return path.join(configHome, "pi-skills", "workflows.json");
}

function configuredPath(value, home) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) return undefined;
  const resolved = path.resolve(expandHome(value, home));
  try {
    return fs.realpathSync(resolved);
  } catch {
    return resolved;
  }
}

function loadProfilePaths({ profileName, configPath, home }) {
  let stat;
  try {
    stat = fs.statSync(configPath);
  } catch (error) {
    throw new PrepareSessionsError("Workflow profile configuration was not found.", { cause: error });
  }
  if (!stat.isFile() || stat.size > MAX_CONFIG_BYTES) {
    throw new PrepareSessionsError(`Workflow profile configuration must be a file no larger than ${MAX_CONFIG_BYTES} bytes.`);
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    throw new PrepareSessionsError("Workflow profile configuration is not valid JSON.", { cause: error });
  }
  const profiles = config?.version === 1 && isPlainObject(config.profiles) ? config.profiles : undefined;
  const raw = profiles?.[profileName];
  if (!isPlainObject(raw) || !Array.isArray(raw.gitRoots) || raw.gitRoots.length < 1 || raw.gitRoots.length > 32) {
    throw new PrepareSessionsError(`${profileName}.gitRoots must contain 1-32 paths.`);
  }

  const roots = [];
  for (const configuredRoot of raw.gitRoots) {
    if (typeof configuredRoot !== "string" || configuredRoot.length === 0 || configuredRoot.includes("\0")) {
      throw new PrepareSessionsError(`${profileName}.gitRoots contains an invalid path.`);
    }
    try {
      const root = fs.realpathSync(path.resolve(expandHome(configuredRoot, home)));
      const rootStat = fs.statSync(root);
      if (rootStat.isDirectory()) {
        fs.accessSync(root, fs.constants.R_OK | fs.constants.X_OK);
        roots.push(root);
      }
    } catch {
      // Another configured root may be available on this host.
    }
  }
  const uniqueRoots = [...new Set(roots)].sort();
  if (uniqueRoots.length === 0) throw new PrepareSessionsError(`${profileName} has no usable Git root.`);

  const forbiddenProfilePaths = [];
  const otherProfileRoots = [];
  for (const [name, profile] of Object.entries(profiles)) {
    if (!isPlainObject(profile)) continue;
    const configuredVault = configuredPath(profile.vault, home);
    if (configuredVault) forbiddenProfilePaths.push(configuredVault);
    for (const candidate of Array.isArray(profile.gitRoots) ? profile.gitRoots : []) {
      const configured = configuredPath(candidate, home);
      if (!configured) continue;
      forbiddenProfilePaths.push(configured);
      if (name !== profileName) otherProfileRoots.push(configured);
    }
  }
  for (const selected of uniqueRoots) {
    if (otherProfileRoots.some((other) => pathIsInside(selected, other) || pathIsInside(other, selected))) {
      throw new PrepareSessionsError("Meta-review requires personal Git roots that do not overlap another workflow profile.");
    }
  }
  return {
    roots: uniqueRoots,
    forbiddenProfilePaths: [...new Set(forbiddenProfilePaths)].sort(),
  };
}

function sessionDirectoryName(cwd) {
  const withoutRoot = path.resolve(cwd).split(path.sep).filter(Boolean).join("-");
  return `--${withoutRoot}--`;
}

function sessionDirectoryCouldBelongToRoot(name, root) {
  const encodedRoot = sessionDirectoryName(root);
  return name === encodedRoot || name.startsWith(encodedRoot.slice(0, -1));
}

function currentSessionStorage(env) {
  if (!env.PI_SESSION_FILE) return undefined;
  const file = path.resolve(env.PI_SESSION_FILE);
  try {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile()) return undefined;
    const header = readHeader(file);
    if (!header || typeof header.cwd !== "string") return undefined;
    const parent = path.dirname(fs.realpathSync(file));
    const nested = path.basename(parent) === sessionDirectoryName(header.cwd);
    return { directory: nested ? path.dirname(parent) : parent, layout: nested ? "nested" : "flat" };
  } catch {
    return undefined;
  }
}

function resolveSessionStorage(options, env, home) {
  const fromCurrentSession = options.sessionDir === undefined ? currentSessionStorage(env) : undefined;
  const fromEnvironment = env.PI_CODING_AGENT_SESSION_DIR
    ? configuredPath(env.PI_CODING_AGENT_SESSION_DIR, home)
    : undefined;
  if (fromCurrentSession && fromEnvironment && fromCurrentSession.directory !== fromEnvironment) {
    throw new PrepareSessionsError("Current Pi session file and PI_CODING_AGENT_SESSION_DIR select different session stores.");
  }

  let selected;
  let layout;
  if (options.sessionDir !== undefined) {
    selected = options.sessionDir;
    layout = options.sessionLayout ?? "nested";
  } else if (fromCurrentSession) {
    ({ directory: selected, layout } = fromCurrentSession);
  } else if (fromEnvironment) {
    selected = fromEnvironment;
    layout = "flat";
  } else {
    throw new PrepareSessionsError("Cannot determine Pi session storage without a persistent current session or PI_CODING_AGENT_SESSION_DIR.");
  }
  const resolved = path.resolve(expandHome(selected, home));
  try {
    const stat = fs.lstatSync(resolved);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("not a regular directory");
    fs.accessSync(resolved, fs.constants.R_OK | fs.constants.X_OK);
    return { directory: fs.realpathSync(resolved), layout };
  } catch (error) {
    throw new PrepareSessionsError("Pi session directory is unavailable.", { cause: error });
  }
}

function ensureOutputDirectory(outputDir, forbiddenRoots) {
  if (!outputDir) throw new PrepareSessionsError("An output directory is required.");
  const selected = path.resolve(outputDir);
  let stat;
  try {
    stat = fs.lstatSync(selected);
  } catch (error) {
    throw new PrepareSessionsError("Output directory is unavailable.", { cause: error });
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new PrepareSessionsError("Output directory must be a regular directory, not a symbolic link.");
  }
  const canonical = fs.realpathSync(selected);
  if (forbiddenRoots.some((root) => pathIsInside(root, canonical))) {
    throw new PrepareSessionsError("Output directory must stay outside workflow roots, vaults, and Pi session storage.");
  }
  if (fs.readdirSync(canonical).length !== 0) {
    throw new PrepareSessionsError("Output directory must be empty.");
  }
  return canonical;
}

function readHeader(filePath) {
  const descriptor = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(MAX_HEADER_BYTES);
    const bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, 0);
    const newline = buffer.subarray(0, bytesRead).indexOf(0x0a);
    if (newline < 0) return undefined;
    const value = JSON.parse(buffer.subarray(0, newline).toString("utf8"));
    return value?.type === "session" ? value : undefined;
  } catch {
    return undefined;
  } finally {
    fs.closeSync(descriptor);
  }
}

function canonicalSessionCwd(value, roots) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) return undefined;
  const resolved = path.resolve(value);
  let candidate = resolved;
  try {
    candidate = fs.realpathSync(resolved);
  } catch {
    // Cleaned worktrees no longer exist. Their absolute header path still records profile ownership.
  }
  return roots.some((root) => pathIsInside(root, candidate)) ? candidate : undefined;
}

function candidateFile(filePath) {
  const stat = fs.statSync(filePath);
  return {
    filePath,
    dev: stat.dev,
    ino: stat.ino,
    size: stat.size,
    modifiedAtMs: stat.mtimeMs,
    changedAtMs: stat.ctimeMs,
  };
}

function listCandidateFiles(storage, roots) {
  const candidates = [];
  if (storage.layout === "flat") {
    for (const file of fs.readdirSync(storage.directory, { withFileTypes: true })) {
      if (!file.isFile() || file.isSymbolicLink() || !file.name.endsWith(".jsonl")) continue;
      candidates.push(candidateFile(path.join(storage.directory, file.name)));
    }
  } else {
    for (const entry of fs.readdirSync(storage.directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      if (!roots.some((root) => sessionDirectoryCouldBelongToRoot(entry.name, root))) continue;
      const directory = path.join(storage.directory, entry.name);
      for (const file of fs.readdirSync(directory, { withFileTypes: true })) {
        if (!file.isFile() || file.isSymbolicLink() || !file.name.endsWith(".jsonl")) continue;
        candidates.push(candidateFile(path.join(directory, file.name)));
      }
    }
  }
  return candidates.sort((left, right) =>
    right.modifiedAtMs - left.modifiedAtMs || left.filePath.localeCompare(right.filePath));
}

function sameCandidateState(stat, candidate) {
  return stat.dev === candidate.dev
    && stat.ino === candidate.ino
    && stat.size === candidate.size
    && stat.mtimeMs === candidate.modifiedAtMs
    && stat.ctimeMs === candidate.changedAtMs;
}

function parseSessionFile(candidate, maximumBytes, quiescentBefore) {
  let before;
  try {
    before = fs.statSync(candidate.filePath);
  } catch {
    return { skipped: "changed" };
  }
  if (!sameCandidateState(before, candidate) || before.mtimeMs > quiescentBefore) return { skipped: "changed" };
  if (before.size > maximumBytes) return { skipped: "oversized" };
  let records;
  try {
    const text = fs.readFileSync(candidate.filePath, "utf8");
    records = text.split("\n").filter((line) => line.length > 0).map((line) => JSON.parse(line));
  } catch {
    return { skipped: "invalid" };
  }
  let after;
  try {
    after = fs.statSync(candidate.filePath);
  } catch {
    return { skipped: "changed" };
  }
  if (!sameCandidateState(after, candidate) || after.mtimeMs > quiescentBefore) return { skipped: "changed" };
  if (records.length < 2 || records[0]?.type !== "session") return { skipped: "invalid" };
  return { header: records[0], entries: records.slice(1), stat: after };
}

function activeBranch(entries) {
  const byId = new Map();
  for (const entry of entries) {
    if (!isPlainObject(entry) || typeof entry.id !== "string" || byId.has(entry.id)) return undefined;
    byId.set(entry.id, entry);
  }
  const leaf = entries.at(-1);
  if (!leaf) return undefined;
  const branch = [];
  const visited = new Set();
  let current = leaf;
  while (current) {
    if (visited.has(current.id)) return undefined;
    visited.add(current.id);
    branch.push(current);
    if (current.parentId === null) break;
    if (typeof current.parentId !== "string") return undefined;
    current = byId.get(current.parentId);
    if (!current) return undefined;
  }
  if (branch.at(-1)?.parentId !== null) return undefined;
  return branch.reverse();
}

function messageText(message) {
  if (!isPlainObject(message)) return undefined;
  if (message.role === "user") {
    if (typeof message.content === "string") return message.content;
    if (!Array.isArray(message.content)) return undefined;
    return message.content
      .filter((block) => block?.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join("\n");
  }
  if (message.role !== "assistant" || !Array.isArray(message.content)) return undefined;
  return message.content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");
}

function truncateUtf8(value, maximumBytes) {
  const buffer = Buffer.from(value, "utf8");
  if (buffer.length <= maximumBytes) return { text: value, truncated: false, bytes: buffer.length };
  const ellipsis = Buffer.from("…", "utf8");
  const suffix = maximumBytes >= ellipsis.length ? ellipsis.toString("utf8") : "";
  let end = Math.max(0, maximumBytes - Buffer.byteLength(suffix, "utf8"));
  let prefix = "";
  while (end >= 0) {
    try {
      prefix = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, end));
      break;
    } catch {
      end -= 1;
    }
  }
  const text = `${prefix}${suffix}`;
  return { text, truncated: true, bytes: Buffer.byteLength(text, "utf8") };
}

function conversationEntries(branch) {
  const messages = [];
  for (const entry of branch) {
    if (entry.type !== "message") continue;
    const role = entry.message?.role;
    if (role !== "user" && role !== "assistant") continue;
    const text = messageText(entry.message);
    if (typeof text !== "string" || text.length === 0) continue;
    messages.push({
      entryId: entry.id,
      parentId: entry.parentId,
      timestamp: entry.timestamp,
      role,
      text,
    });
  }
  return messages;
}

function boundedMessages(messages, bounds) {
  const included = [];
  let contentBytes = 0;
  for (let index = messages.length - 1; index >= 0 && included.length < bounds.maxMessages; index -= 1) {
    const remaining = bounds.maxProjectionBytes - contentBytes;
    if (remaining <= 0) break;
    const limit = Math.min(bounds.maxMessageBytes, remaining);
    const bounded = truncateUtf8(messages[index].text, limit);
    included.push({
      ...messages[index],
      text: bounded.text,
      ...(bounded.truncated ? { truncated: true } : {}),
    });
    contentBytes += bounded.bytes;
  }
  included.reverse();
  return {
    messages: included,
    contentBytes,
    omittedMessages: messages.length - included.length,
  };
}

function latestSessionName(branch) {
  for (let index = branch.length - 1; index >= 0; index -= 1) {
    const entry = branch[index];
    if (entry.type === "session_info" && typeof entry.name === "string" && entry.name.trim()) {
      return truncateUtf8(entry.name.trim(), 1_024).text;
    }
  }
  return undefined;
}

function assembleProjection(session, sourceMessages, messages, bounds) {
  const contentBytes = messages.reduce((total, message) => total + Buffer.byteLength(message.text, "utf8"), 0);
  return {
    version: 1,
    session,
    bounds: {
      sourceMessages,
      includedMessages: messages.length,
      omittedMessages: sourceMessages - messages.length,
      contentBytes,
      maxMessages: bounds.maxMessages,
      maxProjectionBytes: bounds.maxProjectionBytes,
      maxMessageBytes: bounds.maxMessageBytes,
    },
    messages,
  };
}

function serializedProjectionBytes(projection) {
  return Buffer.byteLength(`${JSON.stringify(projection)}\n`, "utf8");
}

function fitProjection(session, sourceMessages, bounded, bounds) {
  const messages = [...bounded.messages];
  let projection = assembleProjection(session, sourceMessages, messages, bounds);
  while (messages.length > 1 && serializedProjectionBytes(projection) > bounds.maxProjectionBytes) {
    messages.shift();
    projection = assembleProjection(session, sourceMessages, messages, bounds);
  }
  if (serializedProjectionBytes(projection) <= bounds.maxProjectionBytes) return projection;
  if (messages.length === 0) return undefined;

  const original = messages[0];
  let low = 0;
  let high = Buffer.byteLength(original.text, "utf8");
  let fitting;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const boundedText = truncateUtf8(original.text, middle);
    const candidate = assembleProjection(session, sourceMessages, [{
      ...original,
      text: boundedText.text,
      ...(boundedText.truncated || original.truncated ? { truncated: true } : {}),
    }], bounds);
    if (serializedProjectionBytes(candidate) <= bounds.maxProjectionBytes) {
      fitting = candidate;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return fitting;
}

function projectCandidate(candidate, header, cwd, bounds, quiescentBefore) {
  const parsed = parseSessionFile(candidate, bounds.maxSessionBytes, quiescentBefore);
  if (parsed.skipped) return parsed;
  if (parsed.header.id !== header.id || parsed.header.cwd !== header.cwd) return { skipped: "changed" };
  const branch = activeBranch(parsed.entries);
  if (!branch) return { skipped: "invalid" };
  const allMessages = conversationEntries(branch);
  if (allMessages.length < bounds.minMessages) return { skipped: "tooShort" };
  const sessionName = latestSessionName(branch);
  const session = {
    sessionId: header.id,
    ...(sessionName ? { name: sessionName } : {}),
    cwd,
    startedAt: header.timestamp,
    leafEntryId: branch.at(-1).id,
    lastActivityAt: new Date(parsed.stat.mtimeMs).toISOString(),
    lastConversationAt: allMessages.at(-1).timestamp,
  };
  const projection = fitProjection(session, allMessages.length, boundedMessages(allMessages, bounds), bounds);
  let finalStat;
  try {
    finalStat = fs.statSync(candidate.filePath);
  } catch {
    return { skipped: "changed" };
  }
  if (!sameCandidateState(finalStat, candidate) || finalStat.mtimeMs > quiescentBefore) return { skipped: "changed" };
  return projection ? { projection } : { skipped: "oversized" };
}

function positiveInteger(value, fallback, label, maximum) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new PrepareSessionsError(`${label} must be an integer from 1 to ${maximum}.`);
  }
  return value;
}

function normalizeBounds(options) {
  return {
    lookbackDays: positiveInteger(options.lookbackDays, DEFAULTS.lookbackDays, "lookbackDays", 365),
    quiescentHours: positiveInteger(options.quiescentHours, DEFAULTS.quiescentHours, "quiescentHours", 24 * 30),
    maxSessions: positiveInteger(options.maxSessions, DEFAULTS.maxSessions, "maxSessions", 32),
    minMessages: positiveInteger(options.minMessages, DEFAULTS.minMessages, "minMessages", 1_000),
    maxMessages: positiveInteger(options.maxMessages, DEFAULTS.maxMessages, "maxMessages", 1_000),
    maxProjectionBytes: positiveInteger(
      options.maxProjectionBytes,
      DEFAULTS.maxProjectionBytes,
      "maxProjectionBytes",
      256 * 1024,
    ),
    maxMessageBytes: positiveInteger(options.maxMessageBytes, DEFAULTS.maxMessageBytes, "maxMessageBytes", 64 * 1024),
    maxSessionBytes: positiveInteger(options.maxSessionBytes, DEFAULTS.maxSessionBytes, "maxSessionBytes", 256 * 1024 * 1024),
  };
}

function normalizedNow(value) {
  const now = value === undefined ? new Date() : value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(now.getTime())) throw new PrepareSessionsError("now must be a valid timestamp.");
  return now;
}

export function prepareSessions(options = {}) {
  const env = options.env ?? process.env;
  const home = path.resolve(options.home ?? env.HOME ?? os.homedir());
  const profileName = options.profileName;
  if (profileName !== SUPPORTED_PROFILE) {
    throw new PrepareSessionsError(`This first release supports only the ${SUPPORTED_PROFILE} profile.`);
  }
  const configPath = resolveConfigPath(options.configPath, env, home);
  const namedProfile = resolveNamedProfile({ profileName, configPath, env, home }).profile;
  const { roots, forbiddenProfilePaths } = loadProfilePaths({ profileName, configPath, home });
  const sessionStorage = resolveSessionStorage(options, env, home);
  const outputDir = ensureOutputDirectory(options.outputDir, [
    sessionStorage.directory,
    namedProfile.vault,
    ...forbiddenProfilePaths,
  ]);
  const bounds = normalizeBounds(options);
  if (bounds.minMessages > bounds.maxMessages) {
    throw new PrepareSessionsError("minMessages may not exceed maxMessages.");
  }
  const now = normalizedNow(options.now);
  const recentAfter = now.getTime() - bounds.lookbackDays * 24 * 60 * 60 * 1000;
  const quiescentBefore = now.getTime() - bounds.quiescentHours * 60 * 60 * 1000;
  const excluded = new Set(options.excludeSessionIds ?? []);
  if (env.PI_SESSION_ID) excluded.add(env.PI_SESSION_ID);

  const diagnostics = {
    discovered: 0,
    outsideWindow: 0,
    wrongProfile: 0,
    excluded: 0,
    oversized: 0,
    invalid: 0,
    changed: 0,
    tooShort: 0,
  };
  const projections = [];
  for (const candidate of listCandidateFiles(sessionStorage, roots)) {
    diagnostics.discovered += 1;
    if (candidate.modifiedAtMs < recentAfter || candidate.modifiedAtMs > quiescentBefore) {
      diagnostics.outsideWindow += 1;
      continue;
    }
    const header = readHeader(candidate.filePath);
    const cwd = header ? canonicalSessionCwd(header.cwd, roots) : undefined;
    if (!header || !cwd || typeof header.id !== "string") {
      diagnostics.wrongProfile += 1;
      continue;
    }
    if (excluded.has(header.id)) {
      diagnostics.excluded += 1;
      continue;
    }
    const result = projectCandidate(candidate, header, cwd, bounds, quiescentBefore);
    if (!result.projection) {
      diagnostics[result.skipped] = (diagnostics[result.skipped] ?? 0) + 1;
      continue;
    }
    projections.push(result.projection);
    if (projections.length >= bounds.maxSessions) break;
  }

  const sessions = projections.map((projection, index) => {
    const file = `session-${String(index + 1).padStart(2, "0")}.json`;
    fs.writeFileSync(path.join(outputDir, file), `${JSON.stringify(projection)}\n`, { mode: 0o600, flag: "wx" });
    return {
      sessionId: projection.session.sessionId,
      ...(projection.session.name ? { name: projection.session.name } : {}),
      cwd: projection.session.cwd,
      lastActivityAt: projection.session.lastActivityAt,
      lastConversationAt: projection.session.lastConversationAt,
      file,
      includedMessages: projection.bounds.includedMessages,
      omittedMessages: projection.bounds.omittedMessages,
    };
  });
  const manifest = {
    version: 1,
    profile: profileName,
    preparedAt: now.toISOString(),
    selection: {
      recentAfter: new Date(recentAfter).toISOString(),
      quiescentBefore: new Date(quiescentBefore).toISOString(),
      maxSessions: bounds.maxSessions,
      minMessages: bounds.minMessages,
    },
    sessions,
    diagnostics,
  };
  fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, {
    mode: 0o600,
    flag: "wx",
  });
  return { outputDir, manifest };
}

function parseCliArguments(argv) {
  const values = {};
  const strings = new Map([
    ["--profile", "profileName"],
    ["--output", "outputDir"],
  ]);
  const seen = new Set();
  const excluded = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") return { help: true };
    const key = strings.get(argument);
    if (!key && argument !== "--exclude-session") throw new PrepareSessionsError(`Unknown option: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new PrepareSessionsError(`${argument} requires a value.`);
    index += 1;
    if (argument === "--exclude-session") {
      excluded.push(value);
      continue;
    }
    if (seen.has(argument)) throw new PrepareSessionsError(`Duplicate option: ${argument}`);
    seen.add(argument);
    values[key] = value;
  }
  return { ...values, excludeSessionIds: excluded };
}

function usage() {
  return "Usage: prepare-sessions.mjs --profile personal --output DIR [--exclude-session ID]\n";
}

function main() {
  try {
    const options = parseCliArguments(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(usage());
      return;
    }
    const result = prepareSessions(options);
    process.stdout.write(`${JSON.stringify({
      version: 1,
      profile: result.manifest.profile,
      preparedAt: result.manifest.preparedAt,
      outputDir: result.outputDir,
      manifest: path.join(result.outputDir, "manifest.json"),
      sessions: result.manifest.sessions.length,
    }, null, 2)}\n`);
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const message = Buffer.byteLength(raw, "utf8") <= 4096
      ? raw
      : "Session preparation failed with an oversized diagnostic.";
    process.stderr.write(`Session preparation error: ${message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
