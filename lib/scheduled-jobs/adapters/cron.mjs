import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { acquireLock } from "../runtime.mjs";

const MARKER_PREFIX = "pi-scheduler";

export class CronAdapterError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "CronAdapterError";
    this.code = "CRON_ADAPTER";
    this.details = details;
  }
}

function assertString(value, label) {
  if (typeof value !== "string" || value.length === 0 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new CronAdapterError(`${label} must be a non-empty string without control characters.`);
  }
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function escapeCronPercents(value) {
  return value.replace(/%/g, "\\%");
}

export function cronIdentity(jobId) {
  assertString(jobId, "jobId");
  const suffix = createHash("sha256").update(jobId).digest("hex").slice(0, 24);
  const marker = `${MARKER_PREFIX}:${suffix}`;
  return { jobId, marker, begin: `# BEGIN ${marker}`, end: `# END ${marker}` };
}

export function cronDefinition({
  jobId,
  schedule,
  nodePath,
  runnerPath,
  stateRoot,
  installedDigest,
  revision,
  logPath,
}) {
  for (const [label, value] of Object.entries({ schedule, nodePath, runnerPath, stateRoot, installedDigest, logPath })) {
    assertString(value, label);
  }
  for (const [label, value] of Object.entries({ nodePath, runnerPath, stateRoot, logPath })) {
    if (!path.isAbsolute(value)) throw new CronAdapterError(`${label} must be absolute.`);
  }
  if (!Number.isSafeInteger(revision) || revision < 1) throw new CronAdapterError("revision must be positive.");
  const identity = cronIdentity(jobId);
  const programArguments = [
    nodePath,
    runnerPath,
    "_run-installed",
    jobId,
    "--expected-installed-digest",
    installedDigest,
    "--expected-revision",
    String(revision),
    "--state-root",
    stateRoot,
  ];
  const command = programArguments.map(shellQuote).join(" ");
  const line = `${schedule} ${escapeCronPercents(`${command} >> ${shellQuote(logPath)} 2>&1`)}`;
  return {
    ...identity,
    schedule,
    programArguments,
    logPath,
    line,
    block: [identity.begin, line, identity.end].join("\n"),
  };
}

function defaultCommandRunner(executable, argv, options) {
  return execFileSync(executable, argv, {
    encoding: "utf8",
    env: options.env,
    input: options.input,
    stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    timeout: options.timeout,
  });
}

function runCommand(executable, argv, {
  commandRunner = defaultCommandRunner,
  env = process.env,
  input,
  timeout = 5000,
} = {}) {
  try {
    const result = commandRunner(executable, argv, { env, input, timeout });
    if (result && typeof result === "object" && "ok" in result) {
      return {
        ok: result.ok !== false,
        stdout: String(result.stdout ?? ""),
        stderr: String(result.stderr ?? ""),
        detail: result.detail,
      };
    }
    return { ok: true, stdout: String(result ?? ""), stderr: "" };
  } catch (error) {
    return {
      ok: false,
      stdout: String(error?.stdout ?? ""),
      stderr: String(error?.stderr ?? ""),
      detail: String(error?.stderr || error?.message || error),
    };
  }
}

function runtimeOptions(options = {}) {
  return {
    crontab: options.crontab,
    commandRunner: options.commandRunner,
    env: options.env || process.env,
    timeout: options.timeout,
  };
}

function requireRuntime(options) {
  const runtime = runtimeOptions(options);
  if (!runtime.crontab || !path.isAbsolute(runtime.crontab)) {
    throw new CronAdapterError("A canonical crontab executable is required.");
  }
  if (!options.lockPath || !path.isAbsolute(options.lockPath)) {
    throw new CronAdapterError("A canonical scheduler-wide cron lock path is required.");
  }
  return runtime;
}

function readCrontab(runtime) {
  const result = runCommand(runtime.crontab, ["-l"], runtime);
  if (result.ok) return result.stdout;
  if (/no crontab/i.test(`${result.stderr} ${result.detail || ""}`)) return "";
  throw new CronAdapterError(`Could not read crontab: ${result.detail || "crontab failed"}`);
}

function writeCrontab(runtime, content) {
  const result = runCommand(runtime.crontab, ["-"], { ...runtime, input: content });
  if (!result.ok) throw new CronAdapterError(`Could not write crontab: ${result.detail || "crontab failed"}`);
}

function restoreCrontab(runtime, content) {
  writeCrontab(runtime, content);
  if (readCrontab(runtime) !== content) {
    throw new CronAdapterError("Crontab rollback did not restore the exact prior bytes.");
  }
}

function regexEscape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseOwnedBlock(content, identity) {
  const beginCount = content.split(identity.begin).length - 1;
  const endCount = content.split(identity.end).length - 1;
  if (beginCount === 0 && endCount === 0) {
    return { exists: false, line: undefined, without: content };
  }
  if (beginCount !== 1 || endCount !== 1) {
    throw new CronAdapterError(`Cron marker is malformed or duplicated: ${identity.marker}`);
  }
  const pattern = new RegExp(
    `(^|\\n)${regexEscape(identity.begin)}\\n([^\\n]*)\\n${regexEscape(identity.end)}(?:\\n|$)`,
  );
  const match = pattern.exec(content);
  if (!match) throw new CronAdapterError(`Cron marker is malformed or duplicated: ${identity.marker}`);
  const markerStart = match.index + match[1].length;
  const removeEnd = match.index + match[0].length;
  return {
    exists: true,
    line: match[2],
    without: `${content.slice(0, markerStart)}${content.slice(removeEnd)}`,
  };
}

function withBlock(content, definition, enabled) {
  const parsed = parseOwnedBlock(content, definition);
  if (!enabled) return parsed.without;
  if (parsed.without.length > 0 && !parsed.without.endsWith("\n")) {
    throw new CronAdapterError("Existing crontab must end with a newline before adding a scheduler block.");
  }
  return `${parsed.without}${definition.block}\n`;
}

function statusFromContent(definition, content) {
  const parsed = parseOwnedBlock(content, definition);
  return {
    jobId: definition.jobId,
    marker: definition.marker,
    artifactExists: parsed.exists,
    loaded: parsed.exists,
    disabled: !parsed.exists,
    enabled: parsed.exists,
    artifactMatches: parsed.line === definition.line,
    available: true,
  };
}

export function cronStatus(definition, options = {}) {
  const runtime = requireRuntime(options);
  const release = acquireLock(options.lockPath, { waitMilliseconds: options.waitMilliseconds ?? 5000 });
  try {
    return statusFromContent(definition, readCrontab(runtime));
  } finally {
    release();
  }
}

function mutateCrontab(definition, enabled, options) {
  const runtime = requireRuntime(options);
  const release = acquireLock(options.lockPath, { waitMilliseconds: options.waitMilliseconds ?? 5000 });
  let previous;
  let mutationAttempted = false;
  try {
    previous = readCrontab(runtime);
    const next = withBlock(previous, definition, enabled);
    if (next !== previous) {
      mutationAttempted = true;
      writeCrontab(runtime, next);
    }
    const actual = readCrontab(runtime);
    const status = statusFromContent(definition, actual);
    const valid = enabled
      ? status.enabled && status.artifactMatches
      : !status.enabled && !status.artifactExists;
    if (!valid) throw new CronAdapterError("Cron mutation did not reach its required state.");
    return status;
  } catch (error) {
    let rollbackFailure;
    if (mutationAttempted && previous !== undefined) {
      try {
        restoreCrontab(runtime, previous);
      } catch (rollbackError) {
        rollbackFailure = rollbackError.message;
      }
    }
    const suffix = rollbackFailure ? `; rollback incomplete: ${rollbackFailure}` : "";
    throw new CronAdapterError(`Cron mutation failed: ${error.message || String(error)}${suffix}`);
  } finally {
    release();
  }
}

export function installCronDisabled(definition, options = {}) {
  const status = cronStatus(definition, options);
  if (status.artifactExists) {
    throw new CronAdapterError(`Refusing disabled installation while cron artifact already exists: ${definition.marker}`);
  }
  return status;
}

export function enableCron(definition, options = {}) {
  return mutateCrontab(definition, true, options);
}

export function disableCron(definition, options = {}) {
  return mutateCrontab(definition, false, options);
}

export function replaceCron(previousDefinition, nextDefinition, options = {}) {
  if (previousDefinition.marker !== nextDefinition.marker) {
    throw new CronAdapterError("Cron replacement definitions must have the same identity.");
  }
  const runtime = requireRuntime(options);
  const release = acquireLock(options.lockPath, { waitMilliseconds: options.waitMilliseconds ?? 5000 });
  try {
    const previousCrontab = readCrontab(runtime);
    const current = statusFromContent(previousDefinition, previousCrontab);
    const wasEnabled = options.wasEnabled ?? current.enabled;
    const enableReplacement = options.enableReplacement ?? wasEnabled;
    if (wasEnabled && (!current.enabled || !current.artifactMatches)) {
      throw new CronAdapterError("Installed cron block changed before replacement.");
    }
    if (!wasEnabled && current.enabled) {
      throw new CronAdapterError("Cron block became enabled before replacement.");
    }
    const nextCrontab = withBlock(previousCrontab, nextDefinition, enableReplacement);
    try {
      if (nextCrontab !== previousCrontab) writeCrontab(runtime, nextCrontab);
      const actualCrontab = readCrontab(runtime);
      const status = statusFromContent(nextDefinition, actualCrontab);
      const valid = enableReplacement
        ? status.enabled && status.artifactMatches
        : !status.enabled && !status.artifactExists;
      if (!valid) throw new CronAdapterError("Cron replacement did not reach its required state.");
      return status;
    } catch (error) {
      let rollbackFailure;
      try {
        restoreCrontab(runtime, previousCrontab);
      } catch (rollbackError) {
        rollbackFailure = rollbackError.message;
      }
      const suffix = rollbackFailure ? `; rollback incomplete: ${rollbackFailure}` : "";
      throw new CronAdapterError(`Cron replacement failed: ${error.message}${suffix}`);
    }
  } finally {
    release();
  }
}

export function removeCron(definition, options = {}) {
  const status = disableCron(definition, options);
  return !status.artifactExists;
}
