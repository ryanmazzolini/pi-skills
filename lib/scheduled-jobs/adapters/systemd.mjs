import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const UNIT_PREFIX = "pi-scheduler";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export class SystemdAdapterError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "SystemdAdapterError";
    this.code = "SYSTEMD_ADAPTER";
    this.details = details;
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || value.length === 0 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new SystemdAdapterError(`${label} must be a non-empty string without control characters.`);
  }
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
  if (fields.length !== 5) throw new SystemdAdapterError("systemd requires a five-field fixed-time schedule.");
  const [minuteText, hourText, dayOfMonth, month, weekdayText] = fields;
  if (!/^\d+$/.test(minuteText) || !/^\d+$/.test(hourText) || dayOfMonth !== "*" || month !== "*") {
    throw new SystemdAdapterError("systemd supports only fixed-time daily or weekday schedules.");
  }
  const minute = Number(minuteText);
  const hour = Number(hourText);
  const weekdays = parseWeekdays(weekdayText);
  if (minute > 59 || hour > 23 || (weekdayText !== "*" && (!weekdays || weekdays.length === 0))) {
    throw new SystemdAdapterError("systemd supports only fixed-time daily or weekday schedules.");
  }
  return { hour, minute, weekdays };
}

function unitQuote(value) {
  assertNonEmptyString(String(value), "systemd unit value");
  return `"${String(value).replace(/%/g, "%%").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function execStartQuote(value) {
  return unitQuote(String(value).replace(/\$/g, "$$$$"));
}

function unitPathValue(value) {
  assertNonEmptyString(value, "systemd path");
  return value.replace(/%/g, "%%").replace(/\\/g, "\\\\");
}

function environmentLines(environment) {
  if (!environment || Object.getPrototypeOf(environment) !== Object.prototype) {
    throw new SystemdAdapterError("environment must be a plain object.");
  }
  const keys = Object.keys(environment).sort();
  const allowed = new Set(["HOME", "USER", "PATH", "TMPDIR", "LANG", "LANGUAGE"]);
  for (const required of ["HOME", "USER", "PATH", "TMPDIR"]) {
    if (!keys.includes(required)) throw new SystemdAdapterError(`environment.${required} is required.`);
  }
  const forbidden = keys.filter((key) => !allowed.has(key) && !/^LC_[A-Z_]+$/.test(key));
  if (forbidden.length > 0) {
    throw new SystemdAdapterError(`environment contains forbidden keys: ${forbidden.join(", ")}.`);
  }
  return keys.map((key) => {
    assertNonEmptyString(key, "environment key");
    if (typeof environment[key] !== "string") throw new SystemdAdapterError(`environment.${key} must be a string.`);
    return `Environment=${unitQuote(`${key}=${environment[key]}`)}`;
  });
}

function configHome(options, homeDirectory) {
  const configured = options.configHome ?? options.env?.XDG_CONFIG_HOME;
  if (configured !== undefined) {
    if (typeof configured !== "string" || !path.isAbsolute(configured)) {
      throw new SystemdAdapterError("configHome must be absolute.");
    }
    return path.resolve(configured);
  }
  return path.join(homeDirectory, ".config");
}

export function systemdIdentity(jobId, options = {}) {
  const homeDirectory = options.homeDirectory ?? os.homedir();
  assertNonEmptyString(jobId, "jobId");
  if (typeof homeDirectory !== "string" || !path.isAbsolute(homeDirectory)) {
    throw new SystemdAdapterError("homeDirectory must be absolute.");
  }
  const suffix = createHash("sha256").update(jobId).digest("hex").slice(0, 24);
  const unitBase = `${UNIT_PREFIX}-${suffix}`;
  const unitDirectory = path.join(configHome(options, homeDirectory), "systemd", "user");
  const serviceName = `${unitBase}.service`;
  const timerName = `${unitBase}.timer`;
  return {
    jobId,
    unitBase,
    unitDirectory,
    serviceName,
    servicePath: path.join(unitDirectory, serviceName),
    timerName,
    timerPath: path.join(unitDirectory, timerName),
  };
}

function normalizeIdentity(value, options) {
  if (typeof value === "string") return systemdIdentity(value, options);
  if (!value || typeof value !== "object") throw new SystemdAdapterError("A systemd identity or job ID is required.");
  for (const key of ["serviceName", "timerName"]) assertNonEmptyString(value[key], `identity.${key}`);
  for (const key of ["servicePath", "timerPath"]) {
    if (typeof value[key] !== "string" || !path.isAbsolute(value[key])) {
      throw new SystemdAdapterError(`identity.${key} must be absolute.`);
    }
  }
  return {
    jobId: value.jobId,
    unitBase: value.unitBase,
    unitDirectory: value.unitDirectory ?? path.dirname(value.timerPath),
    serviceName: value.serviceName,
    servicePath: value.servicePath,
    timerName: value.timerName,
    timerPath: value.timerPath,
  };
}

export function systemdDefinition({
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
  configHome: configuredHome,
}) {
  assertNonEmptyString(installedDigest, "installedDigest");
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new SystemdAdapterError("revision must be a positive safe integer.");
  }
  for (const [value, label] of [
    ...(launcherPath === undefined ? [] : [[launcherPath, "launcherPath"]]),
    [nodePath, "nodePath"],
    [runnerPath, "runnerPath"],
    [stateRoot, "stateRoot"],
    [workingDirectory, "workingDirectory"],
    [logPath, "logPath"],
  ]) {
    if (typeof value !== "string" || !path.isAbsolute(value)) {
      throw new SystemdAdapterError(`${label} must be absolute.`);
    }
    assertNonEmptyString(value, label);
  }
  const identity = systemdIdentity(jobId, { homeDirectory, configHome: configuredHome });
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
  const calendarPrefix = parsedSchedule.weekdays === undefined
    ? ""
    : `${parsedSchedule.weekdays.map((weekday) => WEEKDAYS[weekday]).join(",")} `;
  const calendar = `${calendarPrefix}*-*-* ${String(parsedSchedule.hour).padStart(2, "0")}:${String(parsedSchedule.minute).padStart(2, "0")}:00`;
  const service = `[Unit]\nDescription=Run scheduled job ${identity.unitBase}\n\n[Service]\nType=oneshot\n${environmentLines(environment).join("\n")}\nWorkingDirectory=${unitQuote(workingDirectory)}\nExecStart=${programArguments.map(execStartQuote).join(" ")}\nStandardOutput=append:${unitPathValue(logPath)}\nStandardError=append:${unitPathValue(logPath)}\n`;
  const timer = `[Unit]\nDescription=Schedule job ${identity.unitBase}\n\n[Timer]\nOnCalendar=${calendar}\nPersistent=true\nUnit=${identity.serviceName}\n\n[Install]\nWantedBy=timers.target\n`;
  return { ...identity, schedule: parsedSchedule, calendar, programArguments, service, timer };
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
    return {
      ok: false,
      stdout: error?.stdout === undefined ? "" : String(error.stdout),
      detail: commandFailure(error),
    };
  }
}

function runtimeOptions(options = {}) {
  return {
    systemctl: options.systemctl || "/usr/bin/systemctl",
    commandRunner: options.commandRunner,
    env: options.env || process.env,
    timeout: options.timeout,
  };
}

function requireCommand(result, description, argv) {
  if (!result.ok) throw new SystemdAdapterError(`${description}: ${result.detail || "systemctl failed"}`, { argv });
  return result;
}

export function probeSystemd(options = {}) {
  const runtime = runtimeOptions(options);
  return { available: runCommand(runtime.systemctl, ["--user", "show-environment"], runtime).ok };
}

function classifyEnabled(result) {
  const state = result.stdout.trim().split(/\s+/)[0];
  if (new Set(["enabled", "enabled-runtime", "linked", "linked-runtime", "alias"]).has(state)) return true;
  if (new Set(["disabled", "static", "indirect", "masked", "masked-runtime", "not-found"]).has(state)) return false;
  return null;
}

function classifyActive(result) {
  const state = result.stdout.trim().split(/\s+/)[0];
  if (new Set(["active", "activating", "reloading", "deactivating"]).has(state)) return true;
  if (new Set(["inactive", "failed", "not-found"]).has(state)) return false;
  return null;
}

export function systemdStatus(identityOrJobId, options = {}) {
  const identity = normalizeIdentity(identityOrJobId, options);
  const serviceArtifactExists = fs.existsSync(identity.servicePath);
  const timerArtifactExists = fs.existsSync(identity.timerPath);
  const available = options.available ?? probeSystemd(options).available;
  if (!available) {
    return {
      ...identity,
      serviceArtifactExists,
      timerArtifactExists,
      artifactExists: serviceArtifactExists && timerArtifactExists,
      partialArtifact: serviceArtifactExists !== timerArtifactExists,
      enabled: null,
      active: null,
      available: false,
    };
  }
  const runtime = runtimeOptions(options);
  const enabled = classifyEnabled(runCommand(runtime.systemctl, ["--user", "is-enabled", identity.timerName], runtime));
  const active = classifyActive(runCommand(runtime.systemctl, ["--user", "is-active", identity.timerName], runtime));
  return {
    ...identity,
    serviceArtifactExists,
    timerArtifactExists,
    artifactExists: serviceArtifactExists && timerArtifactExists,
    partialArtifact: serviceArtifactExists !== timerArtifactExists,
    enabled,
    active,
    available: true,
  };
}

function requiredManager(options) {
  if (!probeSystemd(options).available) throw new SystemdAdapterError("No systemd user manager is active.");
}

function requireKnownState(status, operation) {
  if (status.enabled === null || status.active === null) {
    throw new SystemdAdapterError(`${operation} could not determine whether ${status.timerName} is enabled and active.`, { status });
  }
  return status;
}

function requireStatus(status, expected, operation) {
  for (const [key, value] of Object.entries(expected)) {
    if (status[key] !== value) {
      throw new SystemdAdapterError(
        `${operation} did not reach its required systemd state (serviceArtifact=${status.serviceArtifactExists}, timerArtifact=${status.timerArtifactExists}, enabled=${status.enabled}, active=${status.active}).`,
        { status },
      );
    }
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

function daemonReload(options) {
  const runtime = runtimeOptions(options);
  requireCommand(
    runCommand(runtime.systemctl, ["--user", "daemon-reload"], runtime),
    "Could not reload systemd user units",
    ["--user", "daemon-reload"],
  );
}

function setTimerState(identity, { enabled, active }, options) {
  const current = requireKnownState(
    systemdStatus(identity, { ...options, available: true }),
    "Timer state transition",
  );
  if (current.enabled === enabled && current.active === active) return current;
  const runtime = runtimeOptions(options);
  requireCommand(
    runCommand(runtime.systemctl, ["--user", "disable", "--now", identity.timerName], runtime),
    `Could not disable and stop ${identity.timerName}`,
    ["--user", "disable", "--now", identity.timerName],
  );
  if (enabled) {
    requireCommand(
      runCommand(runtime.systemctl, ["--user", "enable", identity.timerName], runtime),
      `Could not enable ${identity.timerName}`,
      ["--user", "enable", identity.timerName],
    );
  }
  if (active) {
    requireCommand(
      runCommand(runtime.systemctl, ["--user", "start", identity.timerName], runtime),
      `Could not start ${identity.timerName}`,
      ["--user", "start", identity.timerName],
    );
  }
  return requireStatus(
    systemdStatus(identity, { ...options, available: true }),
    { enabled, active },
    "Timer state transition",
  );
}

function restorePair(identity, snapshots) {
  restoreFile(identity.servicePath, snapshots.service);
  restoreFile(identity.timerPath, snapshots.timer);
}

function rollbackFilesAndState(identity, snapshots, previousState, options) {
  const failures = [];
  const attempt = (description, operation) => {
    try {
      operation();
    } catch (error) {
      failures.push(`${description}: ${error.message}`);
    }
  };
  attempt("could not stop replacement timer", () => setTimerState(identity, { enabled: false, active: false }, options));
  attempt("could not restore prior unit files", () => restorePair(identity, snapshots));
  attempt("could not reload prior units", () => daemonReload(options));
  attempt("could not restore prior timer state", () => setTimerState(identity, previousState, options));
  attempt("could not verify restored systemd state", () => requireStatus(
    systemdStatus(identity, { ...options, available: true }),
    {
      serviceArtifactExists: snapshots.service !== undefined,
      timerArtifactExists: snapshots.timer !== undefined,
      enabled: previousState.enabled,
      active: previousState.active,
    },
    "Rollback",
  ));
  return failures;
}

export function installSystemdDisabled(definition, options = {}) {
  const identity = normalizeIdentity(definition, options);
  if (typeof definition.service !== "string" || typeof definition.timer !== "string") {
    throw new SystemdAdapterError("Generated systemd service and timer definitions are required.");
  }
  requiredManager(options);
  const before = requireKnownState(systemdStatus(identity, { ...options, available: true }), "Disabled installation");
  if (before.enabled || before.active) {
    throw new SystemdAdapterError(`Refusing to replace enabled or active systemd timer ${identity.timerName} with a disabled artifact.`);
  }
  const snapshots = { service: fileSnapshot(identity.servicePath), timer: fileSnapshot(identity.timerPath) };
  try {
    writeFileAtomically(identity.servicePath, definition.service);
    writeFileAtomically(identity.timerPath, definition.timer);
    daemonReload(options);
    setTimerState(identity, { enabled: false, active: false }, options);
    return requireStatus(
      systemdStatus(identity, { ...options, available: true }),
      { serviceArtifactExists: true, timerArtifactExists: true, enabled: false, active: false },
      "Disabled installation",
    );
  } catch (error) {
    const failures = rollbackFilesAndState(identity, snapshots, { enabled: before.enabled, active: before.active }, options);
    const suffix = failures.length === 0 ? "" : `; rollback incomplete: ${failures.join("; ")}`;
    throw new SystemdAdapterError(`${error.message}${suffix}`, { cause: error, rollbackFailures: failures });
  }
}

export function enableSystemd(definitionOrIdentity, options = {}) {
  const identity = normalizeIdentity(definitionOrIdentity, options);
  if (!fs.existsSync(identity.servicePath) || !fs.existsSync(identity.timerPath)) {
    throw new SystemdAdapterError(`Systemd artifacts do not both exist for ${identity.timerName}.`);
  }
  requiredManager(options);
  const before = requireKnownState(systemdStatus(identity, { ...options, available: true }), "Enablement");
  try {
    daemonReload(options);
    setTimerState(identity, { enabled: true, active: true }, options);
    return requireStatus(
      systemdStatus(identity, { ...options, available: true }),
      { serviceArtifactExists: true, timerArtifactExists: true, enabled: true, active: true },
      "Enablement",
    );
  } catch (error) {
    const failures = [];
    try {
      setTimerState(identity, { enabled: before.enabled, active: before.active }, options);
    } catch (rollbackError) {
      failures.push(`could not restore prior timer state: ${rollbackError.message}`);
    }
    const suffix = failures.length === 0 ? "" : `; rollback incomplete: ${failures.join("; ")}`;
    throw new SystemdAdapterError(`${error.message}${suffix}`, { cause: error, rollbackFailures: failures });
  }
}

export function disableSystemd(identityOrJobId, options = {}) {
  const identity = normalizeIdentity(identityOrJobId, options);
  requiredManager(options);
  const before = requireKnownState(systemdStatus(identity, { ...options, available: true }), "Disablement");
  try {
    setTimerState(identity, { enabled: false, active: false }, options);
    return requireStatus(
      systemdStatus(identity, { ...options, available: true }),
      { serviceArtifactExists: true, timerArtifactExists: true, enabled: false, active: false },
      "Disablement",
    );
  } catch (error) {
    const failures = [];
    try {
      setTimerState(identity, { enabled: before.enabled, active: before.active }, options);
    } catch (rollbackError) {
      failures.push(`could not restore prior timer state: ${rollbackError.message}`);
    }
    const suffix = failures.length === 0 ? "" : `; rollback incomplete: ${failures.join("; ")}`;
    throw new SystemdAdapterError(`${error.message}${suffix}`, { cause: error, rollbackFailures: failures });
  }
}

export function replaceSystemd(previousDefinition, nextDefinition, options = {}) {
  const previousIdentity = normalizeIdentity(previousDefinition, options);
  const nextIdentity = normalizeIdentity(nextDefinition, options);
  if (
    previousIdentity.serviceName !== nextIdentity.serviceName
    || previousIdentity.timerName !== nextIdentity.timerName
    || previousIdentity.servicePath !== nextIdentity.servicePath
    || previousIdentity.timerPath !== nextIdentity.timerPath
  ) throw new SystemdAdapterError("Systemd replacement definitions must have the same identity and artifact paths.");
  if (typeof nextDefinition.service !== "string" || typeof nextDefinition.timer !== "string") {
    throw new SystemdAdapterError("Generated replacement service and timer definitions are required.");
  }
  requiredManager(options);
  const before = requireKnownState(systemdStatus(previousIdentity, { ...options, available: true }), "Replacement");
  const wasEnabled = options.wasEnabled ?? before.enabled;
  const wasActive = options.wasActive ?? before.active;
  const enableReplacement = options.enableReplacement ?? wasEnabled;
  const activateReplacement = options.activateReplacement ?? enableReplacement;
  for (const [name, value] of Object.entries({ wasEnabled, wasActive, enableReplacement, activateReplacement })) {
    if (typeof value !== "boolean") throw new SystemdAdapterError(`${name} must be boolean.`);
  }
  if (before.enabled !== wasEnabled || before.active !== wasActive) {
    throw new SystemdAdapterError("Systemd replacement prior enabled or active state changed before replacement.", { status: before });
  }
  const snapshots = { service: fileSnapshot(previousIdentity.servicePath), timer: fileSnapshot(previousIdentity.timerPath) };
  if ((wasEnabled || wasActive) && (snapshots.service === undefined || snapshots.timer === undefined)) {
    throw new SystemdAdapterError("Cannot safely replace an enabled or active timer without both prior unit artifacts.");
  }
  const directory = path.dirname(nextIdentity.timerPath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const nonce = `${process.pid}.${randomBytes(8).toString("hex")}`;
  const stagedService = path.join(directory, `.${path.basename(nextIdentity.servicePath)}.${nonce}.stage`);
  const stagedTimer = path.join(directory, `.${path.basename(nextIdentity.timerPath)}.${nonce}.stage`);
  fs.writeFileSync(stagedService, nextDefinition.service, { encoding: "utf8", mode: 0o600, flag: "wx" });
  try {
    fs.writeFileSync(stagedTimer, nextDefinition.timer, { encoding: "utf8", mode: 0o600, flag: "wx" });
    setTimerState(previousIdentity, { enabled: false, active: false }, options);
    fs.renameSync(stagedService, nextIdentity.servicePath);
    fs.chmodSync(nextIdentity.servicePath, 0o600);
    fs.renameSync(stagedTimer, nextIdentity.timerPath);
    fs.chmodSync(nextIdentity.timerPath, 0o600);
    daemonReload(options);
    setTimerState(nextIdentity, { enabled: enableReplacement, active: activateReplacement }, options);
    return requireStatus(
      systemdStatus(nextIdentity, { ...options, available: true }),
      {
        serviceArtifactExists: true,
        timerArtifactExists: true,
        enabled: enableReplacement,
        active: activateReplacement,
      },
      "Replacement",
    );
  } catch (error) {
    const failures = rollbackFilesAndState(previousIdentity, snapshots, { enabled: wasEnabled, active: wasActive }, options);
    const suffix = failures.length === 0 ? "" : `; rollback incomplete: ${failures.join("; ")}`;
    throw new SystemdAdapterError(`Systemd replacement failed: ${error.message}${suffix}`, {
      cause: error,
      rollbackFailures: failures,
    });
  } finally {
    fs.rmSync(stagedService, { force: true });
    fs.rmSync(stagedTimer, { force: true });
  }
}

export function removeSystemd(identityOrJobId, options = {}) {
  const identity = normalizeIdentity(identityOrJobId, options);
  const snapshots = { service: fileSnapshot(identity.servicePath), timer: fileSnapshot(identity.timerPath) };
  const filesExist = snapshots.service !== undefined || snapshots.timer !== undefined;
  if (!probeSystemd(options).available) {
    if (filesExist) throw new SystemdAdapterError("Cannot prove the systemd timer is disabled and inactive because no user manager is active; artifacts retained.");
    return false;
  }
  const before = requireKnownState(systemdStatus(identity, { ...options, available: true }), "Removal");
  try {
    setTimerState(identity, { enabled: false, active: false }, options);
  } catch (error) {
    throw new SystemdAdapterError(`${error.message} Artifacts retained at ${identity.unitDirectory}.`, { cause: error });
  }
  const stopped = requireKnownState(systemdStatus(identity, { ...options, available: true }), "Removal");
  if (stopped.enabled || stopped.active) {
    throw new SystemdAdapterError(`Systemd timer ${identity.timerName} is still enabled or active; artifacts retained at ${identity.unitDirectory}.`);
  }
  try {
    fs.rmSync(identity.servicePath, { force: true });
    fs.rmSync(identity.timerPath, { force: true });
    daemonReload(options);
    requireStatus(
      systemdStatus(identity, { ...options, available: true }),
      { serviceArtifactExists: false, timerArtifactExists: false, enabled: false, active: false },
      "Removal",
    );
    return filesExist || before.enabled || before.active;
  } catch (error) {
    const failures = [];
    try {
      restorePair(identity, snapshots);
      daemonReload(options);
      setTimerState(identity, { enabled: false, active: false }, options);
    } catch (rollbackError) {
      failures.push(`could not restore removed artifacts for retry: ${rollbackError.message}`);
    }
    const suffix = failures.length === 0 ? "" : `; rollback incomplete: ${failures.join("; ")}`;
    throw new SystemdAdapterError(`${error.message}; unit artifacts restored for retry${suffix}`, {
      cause: error,
      rollbackFailures: failures,
    });
  }
}
