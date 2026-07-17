import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const LABEL_PREFIX = "io.pi.scheduler";

export class LaunchdAdapterError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "LaunchdAdapterError";
    this.code = "LAUNCHD_ADAPTER";
    this.details = details;
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || value.length === 0 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new LaunchdAdapterError(`${label} must be a non-empty string without control characters.`);
  }
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function plistString(value, indentation = "    ") {
  return `${indentation}<string>${xmlEscape(value)}</string>`;
}

function parseWeekdays(field) {
  if (field === "*") return undefined;
  const weekdays = new Set();
  for (const part of field.split(",")) {
    const match = /^(\d)(?:-(\d))?$/.exec(part);
    if (!match) return undefined;
    const first = Number(match[1]);
    const last = Number(match[2] ?? match[1]);
    if (first > 7 || last > 7 || first > last) return undefined;
    for (let day = first; day <= last; day += 1) weekdays.add(day === 7 ? 0 : day);
  }
  return [...weekdays].sort((left, right) => left - right);
}

function nativeSchedule(schedule) {
  assertNonEmptyString(schedule, "schedule");
  const fields = schedule.trim().split(/\s+/);
  if (fields.length !== 5) throw new LaunchdAdapterError("launchd requires a five-field fixed-time schedule.");
  const [minuteText, hourText, dayOfMonth, month, weekdayText] = fields;
  if (!/^\d+$/.test(minuteText) || !/^\d+$/.test(hourText) || dayOfMonth !== "*" || month !== "*") {
    throw new LaunchdAdapterError("launchd supports only fixed-time daily or weekday schedules.");
  }
  const minute = Number(minuteText);
  const hour = Number(hourText);
  const weekdays = parseWeekdays(weekdayText);
  if (minute > 59 || hour > 23 || (weekdayText !== "*" && (!weekdays || weekdays.length === 0))) {
    throw new LaunchdAdapterError("launchd supports only fixed-time daily or weekday schedules.");
  }
  return { hour, minute, weekdays };
}

function normalizeIdentity(value, options) {
  if (typeof value === "string") return launchdIdentity(value, options);
  if (!value || typeof value !== "object") throw new LaunchdAdapterError("A launchd identity or job ID is required.");
  assertNonEmptyString(value.label, "identity.label");
  if (!path.isAbsolute(value.plistPath)) throw new LaunchdAdapterError("identity.plistPath must be absolute.");
  return { jobId: value.jobId, label: value.label, plistPath: value.plistPath };
}

export function launchdIdentity(jobId, { homeDirectory = os.homedir() } = {}) {
  assertNonEmptyString(jobId, "jobId");
  if (!path.isAbsolute(homeDirectory)) throw new LaunchdAdapterError("homeDirectory must be absolute.");
  const suffix = createHash("sha256").update(jobId).digest("hex").slice(0, 24);
  const label = `${LABEL_PREFIX}.${suffix}`;
  return {
    jobId,
    label,
    plistPath: path.join(homeDirectory, "Library", "LaunchAgents", `${label}.plist`),
  };
}

function calendarEntry(schedule, weekday, indentation) {
  const lines = [
    `${indentation}<dict>`,
    `${indentation}  <key>Hour</key>`,
    `${indentation}  <integer>${schedule.hour}</integer>`,
    `${indentation}  <key>Minute</key>`,
    `${indentation}  <integer>${schedule.minute}</integer>`,
  ];
  if (weekday !== undefined) {
    lines.push(`${indentation}  <key>Weekday</key>`, `${indentation}  <integer>${weekday}</integer>`);
  }
  lines.push(`${indentation}</dict>`);
  return lines.join("\n");
}

function environmentXml(environment) {
  if (!environment || Object.getPrototypeOf(environment) !== Object.prototype) {
    throw new LaunchdAdapterError("environment must be a plain object.");
  }
  const keys = Object.keys(environment).sort();
  for (const required of ["HOME", "USER", "PATH", "TMPDIR"]) {
    if (!keys.includes(required)) throw new LaunchdAdapterError(`environment.${required} is required.`);
  }
  const forbidden = keys.filter(
    (key) => !new Set(["HOME", "USER", "PATH", "TMPDIR", "LANG", "LANGUAGE"]).has(key) && !/^LC_[A-Z_]+$/.test(key),
  );
  if (forbidden.length > 0) {
    throw new LaunchdAdapterError(`environment contains forbidden keys: ${forbidden.join(", ")}.`);
  }
  return keys.map((key) => {
    assertNonEmptyString(key, "environment key");
    if (typeof environment[key] !== "string") {
      throw new LaunchdAdapterError(`environment.${key} must be a string.`);
    }
    return `    <key>${xmlEscape(key)}</key>\n${plistString(environment[key], "    ")}`;
  }).join("\n");
}

export function launchdDefinition({
  jobId,
  schedule,
  launcherPath,
  nodePath,
  runnerPath,
  stateRoot,
  installedDigest,
  revision,
  environment,
  workingDirectory,
  logPath,
  homeDirectory = os.homedir(),
}) {
  assertNonEmptyString(installedDigest, "installedDigest");
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new LaunchdAdapterError("revision must be a positive safe integer.");
  }
  if (launcherPath !== undefined && (typeof launcherPath !== "string" || !path.isAbsolute(launcherPath))) {
    throw new LaunchdAdapterError("launcherPath must be an absolute executable path when provided.");
  }
  if (typeof nodePath !== "string" || !path.isAbsolute(nodePath)) {
    throw new LaunchdAdapterError("nodePath must be an absolute executable path.");
  }
  if (typeof runnerPath !== "string" || !path.isAbsolute(runnerPath)) {
    throw new LaunchdAdapterError("runnerPath must be an absolute executable path.");
  }
  if (typeof stateRoot !== "string" || !path.isAbsolute(stateRoot)) {
    throw new LaunchdAdapterError("stateRoot must be absolute.");
  }
  if (typeof workingDirectory !== "string" || !path.isAbsolute(workingDirectory)) {
    throw new LaunchdAdapterError("workingDirectory must be absolute.");
  }
  if (typeof logPath !== "string" || !path.isAbsolute(logPath)) {
    throw new LaunchdAdapterError("logPath must be absolute.");
  }
  const identity = launchdIdentity(jobId, { homeDirectory });
  const parsedSchedule = nativeSchedule(schedule);
  const programArguments = [
    ...(launcherPath === undefined ? [] : [launcherPath]),
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
  const intervals = parsedSchedule.weekdays === undefined
    ? calendarEntry(parsedSchedule, undefined, "    ")
    : [
        "    <array>",
        ...parsedSchedule.weekdays.map((weekday) => calendarEntry(parsedSchedule, weekday + 1, "      ")),
        "    </array>",
      ].join("\n");
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
${plistString(identity.label, "  ")}
  <key>ProgramArguments</key>
  <array>
${programArguments.map((argument) => plistString(argument, "    ")).join("\n")}
  </array>
  <key>EnvironmentVariables</key>
  <dict>
${environmentXml(environment)}
  </dict>
  <key>WorkingDirectory</key>
${plistString(workingDirectory, "  ")}
  <key>StartCalendarInterval</key>
${intervals}
  <key>ProcessType</key>
  <string>Background</string>
  <key>StandardOutPath</key>
${plistString(logPath, "  ")}
  <key>StandardErrorPath</key>
${plistString(logPath, "  ")}
</dict>
</plist>
`;
  return { ...identity, schedule: parsedSchedule, programArguments, plist };
}

function defaultCommandRunner(executable, argv, options) {
  return execFileSync(executable, argv, {
    encoding: "utf8",
    env: options.env,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: options.timeout,
  });
}

function commandFailure(error) {
  const stderr = error?.stderr === undefined ? "" : String(error.stderr).trim();
  return stderr || error?.message || String(error);
}

function runCommand(executable, argv, { commandRunner = defaultCommandRunner, env = process.env, timeout = 5000 } = {}) {
  try {
    const result = commandRunner(executable, argv, { env, timeout });
    if (result && typeof result === "object" && "ok" in result) {
      return {
        ok: result.ok !== false,
        stdout: result.stdout === undefined ? "" : String(result.stdout),
        detail: result.detail,
      };
    }
    return { ok: true, stdout: result === undefined ? "" : String(result) };
  } catch (error) {
    return { ok: false, stdout: error?.stdout === undefined ? "" : String(error.stdout), detail: commandFailure(error) };
  }
}

function requireCommand(result, description, argv) {
  if (!result.ok) {
    throw new LaunchdAdapterError(`${description}: ${result.detail || "launchctl failed"}`, { argv });
  }
  return result;
}

function runtimeOptions(options = {}) {
  return {
    launchctl: options.launchctl || "/bin/launchctl",
    commandRunner: options.commandRunner,
    env: options.env || process.env,
    timeout: options.timeout,
  };
}

export function probeLaunchd(options = {}) {
  const runtime = runtimeOptions(options);
  const uid = options.uid ?? (typeof process.getuid === "function" ? process.getuid() : undefined);
  if (!Number.isSafeInteger(uid) || uid < 0) return { available: false, domain: null };
  for (const domain of [`gui/${uid}`, `user/${uid}`]) {
    if (runCommand(runtime.launchctl, ["print", domain], runtime).ok) return { available: true, domain };
  }
  return { available: false, domain: null };
}

function requiredDomain(options) {
  const probe = options.domain
    ? { available: true, domain: options.domain }
    : probeLaunchd(options);
  if (!probe.available) throw new LaunchdAdapterError("No launchd user domain is active.");
  return probe.domain;
}

function regexEscape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function disabledOverride(output, label) {
  const match = new RegExp(`[\"']?${regexEscape(label)}[\"']?\\s*=>\\s*(true|false|disabled|enabled)\\b`).exec(output);
  return match ? ["true", "disabled"].includes(match[1]) : null;
}

export function launchdStatus(identityOrJobId, options = {}) {
  const identity = normalizeIdentity(identityOrJobId, options);
  const probe = options.domain
    ? { available: true, domain: options.domain }
    : probeLaunchd(options);
  const artifactExists = fs.existsSync(identity.plistPath);
  if (!probe.available) {
    return {
      ...identity,
      domain: null,
      target: null,
      artifactExists,
      loaded: false,
      disabled: null,
      enabled: false,
      available: false,
    };
  }
  const runtime = runtimeOptions(options);
  const target = `${probe.domain}/${identity.label}`;
  const loaded = runCommand(runtime.launchctl, ["print", target], runtime).ok;
  const disabledResult = runCommand(runtime.launchctl, ["print-disabled", probe.domain], runtime);
  const disabled = disabledResult.ok ? (disabledOverride(disabledResult.stdout, identity.label) ?? false) : null;
  return {
    ...identity,
    domain: probe.domain,
    target,
    artifactExists,
    loaded,
    disabled,
    enabled: disabled === false && (artifactExists || loaded),
    available: true,
  };
}

function requireStatus(status, { artifactExists, loaded, disabled }, operation) {
  if (
    status.artifactExists !== artifactExists
    || status.loaded !== loaded
    || status.disabled !== disabled
  ) {
    throw new LaunchdAdapterError(
      `${operation} did not reach its required launchd state (artifact=${status.artifactExists}, loaded=${status.loaded}, disabled=${status.disabled}).`,
      { status },
    );
  }
  return status;
}

function fileSnapshot(filePath) {
  try {
    return fs.readFileSync(filePath);
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}

function writeFileAtomically(filePath, content) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = path.join(directory, `.${path.basename(filePath)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`);
  try {
    fs.writeFileSync(temporaryPath, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
    fs.renameSync(temporaryPath, filePath);
    fs.chmodSync(filePath, 0o600);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
}

function restoreFile(filePath, snapshot) {
  if (snapshot === undefined) fs.rmSync(filePath, { force: true });
  else writeFileAtomically(filePath, snapshot);
}

function disableTarget(identity, domain, options) {
  const runtime = runtimeOptions(options);
  const target = `${domain}/${identity.label}`;
  requireCommand(
    runCommand(runtime.launchctl, ["disable", target], runtime),
    `Could not disable ${identity.label}`,
    ["disable", target],
  );
  const loaded = runCommand(runtime.launchctl, ["print", target], runtime).ok;
  if (loaded) {
    requireCommand(
      runCommand(runtime.launchctl, ["bootout", target], runtime),
      `Could not unload ${identity.label}; it remains loaded`,
      ["bootout", target],
    );
  }
  if (runCommand(runtime.launchctl, ["print", target], runtime).ok) {
    throw new LaunchdAdapterError(`Could not disable ${identity.label}; it remains loaded.`);
  }
}

export function installLaunchdDisabled(definition, options = {}) {
  const identity = normalizeIdentity(definition, options);
  if (typeof definition.plist !== "string") throw new LaunchdAdapterError("A generated launchd definition is required.");
  const domain = requiredDomain(options);
  const status = launchdStatus(identity, { ...options, domain });
  if (status.loaded) {
    throw new LaunchdAdapterError(`Refusing to replace loaded launchd job ${identity.label} with a disabled artifact.`);
  }
  const previous = fileSnapshot(identity.plistPath);
  try {
    const runtime = runtimeOptions(options);
    const target = `${domain}/${identity.label}`;
    requireCommand(
      runCommand(runtime.launchctl, ["disable", target], runtime),
      `Could not mark ${identity.label} disabled`,
      ["disable", target],
    );
    writeFileAtomically(identity.plistPath, definition.plist);
    return requireStatus(
      launchdStatus(identity, { ...options, domain }),
      { artifactExists: true, loaded: false, disabled: true },
      "Disabled installation",
    );
  } catch (error) {
    const rollbackFailures = [];
    try {
      restoreFile(identity.plistPath, previous);
    } catch (rollbackError) {
      rollbackFailures.push(`could not restore prior artifact: ${rollbackError.message}`);
    }
    const runtime = runtimeOptions(options);
    const target = `${domain}/${identity.label}`;
    const restoreOverride = status.disabled === true
      ? runCommand(runtime.launchctl, ["disable", target], runtime)
      : runCommand(runtime.launchctl, ["enable", target], runtime);
    if (!restoreOverride.ok) rollbackFailures.push("could not restore prior launchd enablement override");
    const suffix = rollbackFailures.length === 0 ? "" : `; rollback incomplete: ${rollbackFailures.join("; ")}`;
    throw new LaunchdAdapterError(`${error.message}${suffix}`, { cause: error, rollbackFailures });
  }
}

export function enableLaunchd(definitionOrIdentity, options = {}) {
  const identity = normalizeIdentity(definitionOrIdentity, options);
  if (!fs.existsSync(identity.plistPath)) throw new LaunchdAdapterError(`Launchd artifact does not exist: ${identity.plistPath}`);
  const domain = requiredDomain(options);
  const runtime = runtimeOptions(options);
  const target = `${domain}/${identity.label}`;
  const before = launchdStatus(identity, { ...options, domain });
  requireCommand(
    runCommand(runtime.launchctl, ["enable", target], runtime),
    `Could not enable ${identity.label}`,
    ["enable", target],
  );
  if (!before.loaded) {
    const bootstrap = runCommand(runtime.launchctl, ["bootstrap", domain, identity.plistPath], runtime);
    if (!bootstrap.ok) {
      if (runCommand(runtime.launchctl, ["print", target], runtime).ok) {
        runCommand(runtime.launchctl, ["bootout", target], runtime);
      }
      runCommand(runtime.launchctl, ["disable", target], runtime);
      throw new LaunchdAdapterError(`Could not load ${identity.label}: ${bootstrap.detail || "launchctl failed"}`, {
        argv: ["bootstrap", domain, identity.plistPath],
      });
    }
  }
  return requireStatus(
    launchdStatus(identity, { ...options, domain }),
    { artifactExists: true, loaded: true, disabled: false },
    "Enablement",
  );
}

export function disableLaunchd(identityOrJobId, options = {}) {
  const identity = normalizeIdentity(identityOrJobId, options);
  const domain = requiredDomain(options);
  disableTarget(identity, domain, options);
  return requireStatus(
    launchdStatus(identity, { ...options, domain }),
    { artifactExists: true, loaded: false, disabled: true },
    "Disablement",
  );
}

function rollbackReplacement(identity, previous, wasLoaded, domain, options) {
  const failures = [];
  const runtime = runtimeOptions(options);
  const target = `${domain}/${identity.label}`;
  if (runCommand(runtime.launchctl, ["print", target], runtime).ok) {
    const result = runCommand(runtime.launchctl, ["bootout", target], runtime);
    if (!result.ok) failures.push(`could not unload replacement: ${result.detail || "launchctl failed"}`);
  }
  const disabled = runCommand(runtime.launchctl, ["disable", target], runtime);
  if (!disabled.ok) failures.push(`could not disable replacement: ${disabled.detail || "launchctl failed"}`);
  try {
    restoreFile(identity.plistPath, previous);
  } catch (error) {
    failures.push(`could not restore prior plist: ${error.message}`);
  }
  if (wasLoaded && previous !== undefined) {
    const enabled = runCommand(runtime.launchctl, ["enable", target], runtime);
    if (!enabled.ok) failures.push(`could not re-enable prior job: ${enabled.detail || "launchctl failed"}`);
    else {
      const restored = runCommand(runtime.launchctl, ["bootstrap", domain, identity.plistPath], runtime);
      if (!restored.ok) failures.push(`could not reload prior job: ${restored.detail || "launchctl failed"}`);
    }
  }
  return failures;
}

export function replaceLaunchd(previousDefinition, nextDefinition, options = {}) {
  const previousIdentity = normalizeIdentity(previousDefinition, options);
  const nextIdentity = normalizeIdentity(nextDefinition, options);
  if (previousIdentity.label !== nextIdentity.label || previousIdentity.plistPath !== nextIdentity.plistPath) {
    throw new LaunchdAdapterError("Launchd replacement definitions must have the same identity and artifact path.");
  }
  if (typeof nextDefinition.plist !== "string") throw new LaunchdAdapterError("A generated replacement definition is required.");
  const domain = requiredDomain(options);
  const before = launchdStatus(previousIdentity, { ...options, domain });
  const wasEnabled = options.wasEnabled ?? before.loaded;
  const enableReplacement = options.enableReplacement ?? wasEnabled;
  const previous = fileSnapshot(previousIdentity.plistPath);
  if (wasEnabled && previous === undefined) {
    throw new LaunchdAdapterError("Cannot safely replace a loaded launchd job without its prior artifact.");
  }
  const directory = path.dirname(nextIdentity.plistPath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stagedPath = path.join(directory, `.${path.basename(nextIdentity.plistPath)}.${process.pid}.${randomBytes(8).toString("hex")}.stage`);
  fs.writeFileSync(stagedPath, nextDefinition.plist, { encoding: "utf8", mode: 0o600, flag: "wx" });
  try {
    if (before.loaded) disableTarget(previousIdentity, domain, options);
    else {
      const runtime = runtimeOptions(options);
      const target = `${domain}/${previousIdentity.label}`;
      requireCommand(runCommand(runtime.launchctl, ["disable", target], runtime), `Could not stage ${previousIdentity.label} disabled`, ["disable", target]);
    }
    fs.renameSync(stagedPath, nextIdentity.plistPath);
    fs.chmodSync(nextIdentity.plistPath, 0o600);
    if (enableReplacement) enableLaunchd(nextIdentity, { ...options, domain });
    return requireStatus(
      launchdStatus(nextIdentity, { ...options, domain }),
      {
        artifactExists: true,
        loaded: enableReplacement,
        disabled: !enableReplacement,
      },
      "Replacement",
    );
  } catch (error) {
    const failures = rollbackReplacement(previousIdentity, previous, wasEnabled, domain, options);
    const suffix = failures.length === 0 ? "" : `; rollback incomplete: ${failures.join("; ")}`;
    throw new LaunchdAdapterError(`Launchd replacement failed: ${error.message}${suffix}`, {
      cause: error,
      rollbackFailures: failures,
    });
  } finally {
    fs.rmSync(stagedPath, { force: true });
  }
}

export function removeLaunchd(identityOrJobId, options = {}) {
  const identity = normalizeIdentity(identityOrJobId, options);
  const artifactExists = fs.existsSync(identity.plistPath);
  const probe = options.domain
    ? { available: true, domain: options.domain }
    : probeLaunchd(options);
  if (!probe.available) {
    if (artifactExists) {
      throw new LaunchdAdapterError("Cannot prove the launchd job is unloaded because no user domain is active; artifact retained.");
    }
    return false;
  }
  const before = launchdStatus(identity, { ...options, domain: probe.domain });
  try {
    disableTarget(identity, probe.domain, options);
  } catch (error) {
    throw new LaunchdAdapterError(`${error.message} Artifact retained at ${identity.plistPath}.`, { cause: error });
  }
  const runtime = runtimeOptions(options);
  if (runCommand(runtime.launchctl, ["print", before.target], runtime).ok) {
    throw new LaunchdAdapterError(`Launchd job ${identity.label} is still loaded; artifact retained at ${identity.plistPath}.`);
  }
  const cleared = runCommand(runtime.launchctl, ["enable", before.target], runtime);
  if (!cleared.ok) {
    throw new LaunchdAdapterError(
      `Launchd job is unloaded, but its disabled override could not be cleared; artifact retained at ${identity.plistPath}.`,
    );
  }
  fs.rmSync(identity.plistPath, { force: true });
  return before.loaded || artifactExists;
}
