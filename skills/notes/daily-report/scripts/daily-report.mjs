#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DailyReportError,
  acquireReportLock,
  assertNotFutureDate,
  atomicWriteReport,
  collectSources,
  cronBlock,
  dateWindow,
  ensureReportPath,
  expandHome,
  generateReportBody,
  initializeConfig,
  inspectEnvironment,
  launchdDefinition,
  loadConfig,
  readCrontab,
  reconcileDates,
  renderReport,
  replaceCronBlock,
  reportGenerationStatus,
  resolveExecutable,
  resolveProfile,
  runCommand,
  systemdDefinitions,
  todayInTimeZone,
  writeCrontab,
} from "./daily-report-lib.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);

function usage() {
  return `Usage:
  daily-report install-cli [--bin-dir PATH]
  daily-report remove-cli [--bin-dir PATH]
  daily-report init-config [--config PATH] [--force]
  daily-report doctor PROFILE [--config PATH]
  daily-report run PROFILE [YYYY-MM-DD] [--config PATH] [--force]
  daily-report reconcile PROFILE [--config PATH] [--max-days N] [--refresh-partial] [--force]
  daily-report install-schedule PROFILE [--config PATH]
  daily-report remove-schedule PROFILE [--config PATH]
  daily-report install-cron PROFILE [--config PATH]
  daily-report remove-cron PROFILE [--config PATH]

Required: pi, git, a writable vault, and configured Git roots.
Optional enabled sources degrade to a partial report when gh or short is unavailable.`;
}

function parseArguments(argv) {
  const options = {
    force: false,
    refreshPartial: false,
    help: false,
  };
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--force") options.force = true;
    else if (argument === "--refresh-partial") options.refreshPartial = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--config" || argument === "--max-days" || argument === "--bin-dir") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new DailyReportError(`${argument} requires a value.`);
      index += 1;
      if (argument === "--config") options.config = value;
      else if (argument === "--bin-dir") options.binDir = value;
      else {
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 366) {
          throw new DailyReportError("--max-days must be an integer from 1 to 366.");
        }
        options.maxDays = parsed;
      }
    } else if (argument.startsWith("--")) {
      throw new DailyReportError(`Unknown option: ${argument}`);
    } else positionals.push(argument);
  }

  return { options, positionals };
}

function loadProfile(profileName, configOption) {
  const { config, configPath } = loadConfig(configOption);
  const profile = resolveProfile(config, profileName);
  return { configPath, profile };
}

function sourceDiagnostic(source) {
  const count = source.items?.length ?? 0;
  const detail = source.reason ? ` (${source.reason})` : "";
  return `${source.name}: ${source.status}, ${count} item${count === 1 ? "" : "s"}${detail}`;
}

function runOneDate({ profile, date, force = false, environment, now = new Date() }) {
  assertNotFutureDate(date, profile, now);
  const reportPath = ensureReportPath(profile, date);
  if (fs.existsSync(reportPath) && !force) {
    console.log(`Skipped existing report: ${reportPath}`);
    return { action: "skipped", reportPath, status: reportGenerationStatus(reportPath) };
  }
  const releaseLock = acquireReportLock(reportPath);
  try {
    if (fs.existsSync(reportPath) && !force) {
      console.log(`Skipped existing report: ${reportPath}`);
      return { action: "skipped", reportPath, status: reportGenerationStatus(reportPath) };
    }

    const window = dateWindow(date, profile.timezone);
    const sources = collectSources(profile, environment, window);
    for (const source of Object.values(sources)) {
      console.error(sourceDiagnostic(source));
      for (const warning of source.warnings || []) console.error(`  warning: ${warning}`);
    }

    const body = generateReportBody(profile, environment.tools, date, window, sources);
    const timestamp = new Date().toISOString();
    const report = renderReport({ profile, date, timestamp, sources, body });
    atomicWriteReport(reportPath, report);
    const status = reportGenerationStatus(reportPath);
    console.log(`Wrote ${status} report: ${reportPath}`);
    return { action: "written", reportPath, status };
  } finally {
    releaseLock();
  }
}

function doctor(profile, configPath, environment) {
  console.log(`Settings: ${configPath}`);
  console.log(`Profile: ${profile.name}`);
  console.log(`Timezone: ${profile.timezone}`);
  console.log(`Vault: ${profile.vault}`);
  console.log(`Reports: ${profile.reportBase}`);
  for (const root of profile.gitRoots) console.log(`Git root: ${root}`);
  console.log(`pi: ${environment.tools.pi}`);
  console.log(`git: ${environment.tools.git}`);
  console.log(
    `GitHub: ${environment.optional.github}${environment.tools.gh ? ` (${environment.tools.gh})` : ""}`,
  );
  console.log(
    `Shortcut: ${environment.optional.shortcut}${environment.tools.short ? ` (${environment.tools.short})` : ""}`,
  );
}

function launcherPath(options) {
  const binDirectory = path.resolve(expandHome(options.binDir || "~/.local/bin"));
  return { binDirectory, launcher: path.join(binDirectory, "daily-report") };
}

function commandInstallCli(options) {
  const { binDirectory, launcher } = launcherPath(options);
  fs.mkdirSync(binDirectory, { recursive: true });
  let existing;
  try {
    existing = fs.lstatSync(launcher);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (existing) {
    let currentTarget;
    try {
      currentTarget = fs.realpathSync(launcher);
    } catch {
      currentTarget = undefined;
    }
    if (existing.isSymbolicLink() && currentTarget === path.resolve(SCRIPT_PATH)) {
      console.log(`CLI launcher already installed: ${launcher}`);
      return;
    }
    throw new DailyReportError(`Refusing to replace existing path: ${launcher}`);
  }
  fs.symlinkSync(path.resolve(SCRIPT_PATH), launcher);
  console.log(`Installed CLI launcher: ${launcher}`);
  if (!(process.env.PATH || "").split(path.delimiter).includes(binDirectory)) {
    console.error(`warning: add ${binDirectory} to PATH to invoke daily-report directly.`);
  }
}

function commandRemoveCli(options) {
  const { launcher } = launcherPath(options);
  let stats;
  try {
    stats = fs.lstatSync(launcher);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    console.log(`CLI launcher is not installed: ${launcher}`);
    return;
  }
  let target;
  try {
    target = fs.realpathSync(launcher);
  } catch {
    target = undefined;
  }
  if (!stats.isSymbolicLink() || target !== path.resolve(SCRIPT_PATH)) {
    throw new DailyReportError(`Refusing to remove an unrelated path: ${launcher}`);
  }
  fs.unlinkSync(launcher);
  console.log(`Removed CLI launcher: ${launcher}`);
}

function commandInitConfig(options) {
  const configPath = initializeConfig(options.config, { force: options.force });
  console.log(`Created settings file: ${configPath}`);
  console.log("Review its vault paths, Git roots, schedules, and enabled sources before running reports.");
}

function commandDoctor(positionals, options) {
  if (positionals.length !== 1) throw new DailyReportError("doctor requires one PROFILE.");
  const { profile, configPath } = loadProfile(positionals[0], options.config);
  const environment = inspectEnvironment(profile);
  doctor(profile, configPath, environment);
}

function commandRun(positionals, options) {
  if (positionals.length < 1 || positionals.length > 2) {
    throw new DailyReportError("run requires PROFILE and an optional YYYY-MM-DD.");
  }
  const { profile } = loadProfile(positionals[0], options.config);
  const environment = inspectEnvironment(profile);
  const date = positionals[1] || todayInTimeZone(profile.timezone);
  runOneDate({ profile, date, force: options.force, environment });
}

function commandReconcile(positionals, options) {
  if (positionals.length !== 1) throw new DailyReportError("reconcile requires one PROFILE.");
  const { profile } = loadProfile(positionals[0], options.config);
  const environment = inspectEnvironment(profile);
  const today = todayInTimeZone(profile.timezone);
  const dates = reconcileDates(profile, today, options.maxDays ?? profile.maxReconcileDays);
  const results = [];

  for (const date of dates) {
    const reportPath = ensureReportPath(profile, date);
    const existingStatus = reportGenerationStatus(reportPath);
    const refreshPartial = options.refreshPartial && existingStatus === "partial";
    if (existingStatus && !options.force && !refreshPartial) {
      console.log(`Skipped existing ${existingStatus} report: ${reportPath}`);
      results.push({ action: "skipped", reportPath, status: existingStatus });
      continue;
    }
    results.push(
      runOneDate({
        profile,
        date,
        force: options.force || refreshPartial,
        environment,
      }),
    );
  }

  const written = results.filter((result) => result.action === "written");
  const partial = written.filter((result) => result.status === "partial");
  console.log(
    `Reconciled ${dates.length} eligible date${dates.length === 1 ? "" : "s"}: ${written.length} written, ${results.length - written.length} skipped, ${partial.length} partial.`,
  );
}

function requireCrontab() {
  const executable = resolveExecutable("crontab");
  if (!executable) throw new DailyReportError("Required scheduling command not found on PATH: crontab");
  return executable;
}

function installCron(profile, configPath, environment) {
  const crontab = requireCrontab();
  const block = cronBlock({
    profile,
    configPath,
    tools: environment.tools,
    scriptPath: SCRIPT_PATH,
  });
  const current = readCrontab(crontab);
  const updated = replaceCronBlock(current, block.marker, block.text);
  writeCrontab(crontab, updated);
  console.log(`Installed cron schedule for ${profile.name}. Log: ${block.logPath}`);
  const hostTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (hostTimeZone && hostTimeZone !== profile.timezone) {
    console.error(
      `warning: cron uses host timezone ${hostTimeZone}; report windows use ${profile.timezone}.`,
    );
  }
}

function removeCron(profile, { required = true } = {}) {
  const crontab = resolveExecutable("crontab");
  if (!crontab) {
    if (required) throw new DailyReportError("Required scheduling command not found on PATH: crontab");
    return false;
  }
  const marker = `daily-report:${profile.name}`;
  const current = readCrontab(crontab);
  const updated = replaceCronBlock(current, marker, "");
  if (updated === current) return false;
  writeCrontab(crontab, updated);
  return true;
}

function writeFileAtomically(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, content, { encoding: "utf8", flag: "wx" });
    fs.renameSync(temporaryPath, filePath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
  }
}

function commandFailureDetail(result) {
  const detail =
    result.result?.stderr || result.result?.stdout || result.result?.error?.message || "unknown failure";
  return String(detail)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

function fileSnapshot(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : undefined;
}

function restoreFile(filePath, snapshot) {
  if (snapshot === undefined) fs.rmSync(filePath, { force: true });
  else writeFileAtomically(filePath, snapshot);
}

function errorDetail(error) {
  return error instanceof Error ? error.message : String(error);
}

function launchdIdentity(profile, homeDirectory = expandHome("~")) {
  const label = `com.llm-wiki.daily-report.${profile.name}`;
  return {
    label,
    plistPath: path.join(homeDirectory, "Library", "LaunchAgents", `${label}.plist`),
  };
}

function launchdDomain(launchctl) {
  if (typeof process.getuid !== "function") return undefined;
  const uid = process.getuid();
  for (const domain of [`gui/${uid}`, `user/${uid}`]) {
    if (runCommand(launchctl, ["print", domain], { allowFailure: true }).ok) return domain;
  }
  return undefined;
}

export function installLaunchd(
  profile,
  configPath,
  environment,
  {
    env = process.env,
    homeDirectory = expandHome("~"),
    launchctl = resolveExecutable("launchctl"),
  } = {},
) {
  const identity = launchdIdentity(profile, homeDirectory);
  if (!launchctl) {
    return {
      ok: false,
      preserved: fs.existsSync(identity.plistPath),
      reason: "launchctl is unavailable",
    };
  }
  const definition = launchdDefinition({
    profile,
    configPath,
    tools: environment.tools,
    scriptPath: SCRIPT_PATH,
    env,
    homeDirectory,
  });
  if (!definition) {
    try {
      removeLaunchd(profile, { homeDirectory, launchctl });
      return { ok: false, preserved: false, reason: "the cron expression needs cron syntax" };
    } catch (error) {
      return {
        ok: false,
        preserved: true,
        reason: `the cron expression needs cron syntax, and the old launchd job could not be removed: ${errorDetail(error)}`,
      };
    }
  }
  const domain = launchdDomain(launchctl);
  if (!domain) {
    return {
      ok: false,
      preserved: fs.existsSync(definition.plistPath),
      reason: "no launchd user domain is active",
    };
  }

  const target = `${domain}/${definition.label}`;
  const previousPlist = fileSnapshot(definition.plistPath);
  const wasLoaded = runCommand(launchctl, ["print", target], { allowFailure: true }).ok;
  let bootedOut = false;
  const rollback = () => {
    const failures = [];
    try {
      restoreFile(definition.plistPath, previousPlist);
    } catch (error) {
      failures.push(`could not restore plist: ${errorDetail(error)}`);
    }
    if (bootedOut && wasLoaded) {
      if (previousPlist === undefined) {
        failures.push("could not reload previous job because its plist did not exist");
      } else {
        const restored = runCommand(launchctl, ["bootstrap", domain, definition.plistPath], {
          allowFailure: true,
        });
        if (!restored.ok) failures.push(`could not reload previous job: ${commandFailureDetail(restored)}`);
      }
    }
    return failures;
  };

  try {
    fs.mkdirSync(path.dirname(definition.logPath), { recursive: true });
    writeFileAtomically(definition.plistPath, definition.plist);
    if (wasLoaded) {
      const bootout = runCommand(launchctl, ["bootout", target], { allowFailure: true });
      if (!bootout.ok) {
        const failures = rollback();
        return {
          ok: false,
          preserved: true,
          reason: [`could not unload previous job: ${commandFailureDetail(bootout)}`, ...failures].join("; "),
        };
      }
      bootedOut = true;
    }
    const bootstrap = runCommand(launchctl, ["bootstrap", domain, definition.plistPath], {
      allowFailure: true,
    });
    if (!bootstrap.ok) {
      const failures = rollback();
      return {
        ok: false,
        preserved: wasLoaded && previousPlist !== undefined && failures.length === 0,
        reason: [`could not load new job: ${commandFailureDetail(bootstrap)}`, ...failures].join("; "),
      };
    }
    runCommand(launchctl, ["enable", target], { allowFailure: true });
    return { ok: true, detail: `launchd (${definition.plistPath})`, logPath: definition.logPath };
  } catch (error) {
    const failures = rollback();
    return {
      ok: false,
      preserved: wasLoaded && previousPlist !== undefined && failures.length === 0,
      reason: [`launchd update failed: ${errorDetail(error)}`, ...failures].join("; "),
    };
  }
}

function systemdIdentity(profile, env = process.env, homeDirectory = expandHome("~")) {
  const configHome = env.XDG_CONFIG_HOME
    ? path.resolve(expandHome(env.XDG_CONFIG_HOME))
    : path.join(homeDirectory, ".config");
  const unitDirectory = path.join(configHome, "systemd", "user");
  const unitBase = `daily-report-${profile.name}`;
  return {
    servicePath: path.join(unitDirectory, `${unitBase}.service`),
    timerName: `${unitBase}.timer`,
    timerPath: path.join(unitDirectory, `${unitBase}.timer`),
  };
}

export function installSystemd(
  profile,
  configPath,
  environment,
  {
    env = process.env,
    homeDirectory = expandHome("~"),
    systemctl = resolveExecutable("systemctl"),
  } = {},
) {
  const identity = systemdIdentity(profile, env, homeDirectory);
  const existingFiles = fs.existsSync(identity.servicePath) || fs.existsSync(identity.timerPath);
  if (!systemctl) return { ok: false, preserved: existingFiles, reason: "systemctl is unavailable" };
  const userManager = runCommand(systemctl, ["--user", "show-environment"], {
    allowFailure: true,
  });
  if (!userManager.ok) {
    return {
      ok: false,
      preserved: existingFiles,
      reason: "the systemd user manager is unavailable",
    };
  }
  const definitions = systemdDefinitions({
    profile,
    configPath,
    tools: environment.tools,
    scriptPath: SCRIPT_PATH,
    env,
    homeDirectory,
  });
  if (!definitions) {
    try {
      removeSystemd(profile, { env, homeDirectory, systemctl });
      return { ok: false, preserved: false, reason: "the cron expression needs cron syntax" };
    } catch (error) {
      return {
        ok: false,
        preserved: error?.fallbackSafe !== true,
        reason: `the cron expression needs cron syntax, and the old systemd timer could not be removed: ${errorDetail(error)}`,
      };
    }
  }

  const previousService = fileSnapshot(definitions.servicePath);
  const previousTimer = fileSnapshot(definitions.timerPath);
  const wasEnabled = runCommand(systemctl, ["--user", "is-enabled", definitions.timerName], {
    allowFailure: true,
  }).ok;
  const wasActive = runCommand(systemctl, ["--user", "is-active", definitions.timerName], {
    allowFailure: true,
  }).ok;
  const rollback = () => {
    const failures = [];
    runCommand(systemctl, ["--user", "disable", "--now", definitions.timerName], {
      allowFailure: true,
    });
    try {
      restoreFile(definitions.servicePath, previousService);
      restoreFile(definitions.timerPath, previousTimer);
    } catch (error) {
      failures.push(`could not restore unit files: ${errorDetail(error)}`);
    }
    const reload = runCommand(systemctl, ["--user", "daemon-reload"], { allowFailure: true });
    if (!reload.ok) failures.push(`could not reload previous units: ${commandFailureDetail(reload)}`);
    if (wasEnabled) {
      const enable = runCommand(systemctl, ["--user", "enable", definitions.timerName], {
        allowFailure: true,
      });
      if (!enable.ok) failures.push(`could not re-enable previous timer: ${commandFailureDetail(enable)}`);
    }
    if (wasActive) {
      const start = runCommand(systemctl, ["--user", "start", definitions.timerName], {
        allowFailure: true,
      });
      if (!start.ok) failures.push(`could not restart previous timer: ${commandFailureDetail(start)}`);
    }
    return failures;
  };

  try {
    writeFileAtomically(definitions.servicePath, definitions.service);
    writeFileAtomically(definitions.timerPath, definitions.timer);
    const reload = runCommand(systemctl, ["--user", "daemon-reload"], { allowFailure: true });
    if (!reload.ok) {
      const failures = rollback();
      return {
        ok: false,
        preserved: (wasEnabled || wasActive) && failures.length === 0,
        reason: [`could not reload new units: ${commandFailureDetail(reload)}`, ...failures].join("; "),
      };
    }
    const enable = runCommand(systemctl, ["--user", "enable", "--now", definitions.timerName], {
      allowFailure: true,
    });
    if (!enable.ok) {
      const failures = rollback();
      return {
        ok: false,
        preserved: (wasEnabled || wasActive) && failures.length === 0,
        reason: [`could not enable new timer: ${commandFailureDetail(enable)}`, ...failures].join("; "),
      };
    }
    return { ok: true, detail: `systemd (${definitions.timerPath})` };
  } catch (error) {
    const failures = rollback();
    return {
      ok: false,
      preserved: (wasEnabled || wasActive) && failures.length === 0,
      reason: [`systemd update failed: ${errorDetail(error)}`, ...failures].join("; "),
    };
  }
}

export function removeLaunchd(
  profile,
  { homeDirectory = expandHome("~"), launchctl = resolveExecutable("launchctl") } = {},
) {
  const identity = launchdIdentity(profile, homeDirectory);
  const plistExists = fs.existsSync(identity.plistPath);
  if (!launchctl) {
    if (plistExists) throw new DailyReportError("Cannot remove launchd schedule: launchctl is unavailable.");
    return false;
  }
  const domain = launchdDomain(launchctl);
  if (!domain) {
    if (plistExists) throw new DailyReportError("Cannot remove launchd schedule: no user domain is active.");
    return false;
  }
  const target = `${domain}/${identity.label}`;
  const loaded = runCommand(launchctl, ["print", target], { allowFailure: true }).ok;
  if (loaded) {
    const bootout = runCommand(launchctl, ["bootout", target], { allowFailure: true });
    if (!bootout.ok) {
      throw new DailyReportError(
        `Cannot remove launchd schedule because the job is still loaded: ${commandFailureDetail(bootout)}`,
      );
    }
  }
  fs.rmSync(identity.plistPath, { force: true });
  return loaded || plistExists;
}

export function removeSystemd(
  profile,
  {
    env = process.env,
    homeDirectory = expandHome("~"),
    systemctl = resolveExecutable("systemctl"),
  } = {},
) {
  const identity = systemdIdentity(profile, env, homeDirectory);
  const filesExist = fs.existsSync(identity.servicePath) || fs.existsSync(identity.timerPath);
  if (!systemctl) {
    if (filesExist) throw new DailyReportError("Cannot remove systemd schedule: systemctl is unavailable.");
    return false;
  }
  const userManager = runCommand(systemctl, ["--user", "show-environment"], {
    allowFailure: true,
  });
  if (!userManager.ok) {
    if (filesExist) {
      throw new DailyReportError("Cannot remove systemd schedule: the user manager is unavailable.");
    }
    return false;
  }
  const enabled = runCommand(systemctl, ["--user", "is-enabled", identity.timerName], {
    allowFailure: true,
  }).ok;
  const active = runCommand(systemctl, ["--user", "is-active", identity.timerName], {
    allowFailure: true,
  }).ok;
  if (enabled || active) {
    const disable = runCommand(systemctl, ["--user", "disable", "--now", identity.timerName], {
      allowFailure: true,
    });
    if (!disable.ok) {
      const detail = commandFailureDetail(disable);
      throw new DailyReportError(
        `Cannot remove systemd schedule because the timer is still enabled or active: ${detail}`,
      );
    }
  }
  fs.rmSync(identity.servicePath, { force: true });
  fs.rmSync(identity.timerPath, { force: true });
  const reload = runCommand(systemctl, ["--user", "daemon-reload"], { allowFailure: true });
  if (!reload.ok) {
    const detail = commandFailureDetail(reload);
    const error = new DailyReportError(`Removed unit files, but systemd could not reload: ${detail}`);
    error.fallbackSafe = true;
    throw error;
  }
  return enabled || active || filesExist;
}

function commandInstallSchedule(positionals, options) {
  if (positionals.length !== 1) throw new DailyReportError("install-schedule requires one PROFILE.");
  const { profile, configPath } = loadProfile(positionals[0], options.config);
  if (!profile.schedule) throw new DailyReportError(`${profile.name}.schedule is not configured.`);
  const environment = inspectEnvironment(profile);
  const removedCron = removeCron(profile, { required: false });
  let result;
  try {
    if (process.platform === "darwin") result = installLaunchd(profile, configPath, environment);
    else if (process.platform === "linux") result = installSystemd(profile, configPath, environment);
    else result = { ok: false, reason: `no native scheduler adapter for ${process.platform}` };
  } catch (error) {
    result = { ok: false, reason: errorDetail(error) };
  }

  if (!result.ok) {
    if (result.preserved) {
      if (removedCron) installCron(profile, configPath, environment);
      throw new DailyReportError(
        `Native schedule update failed; the previous native schedule was preserved: ${result.reason}`,
      );
    }
    try {
      if (process.platform === "darwin") removeLaunchd(profile);
      else if (process.platform === "linux") removeSystemd(profile);
    } catch (error) {
      if (error?.fallbackSafe !== true) {
        throw new DailyReportError(
          `Native scheduling failed and cron fallback was not safe: ${errorDetail(error)}`,
        );
      }
    }
    console.error(`warning: native scheduling unavailable (${result.reason}); falling back to cron.`);
    installCron(profile, configPath, environment);
    return;
  }
  console.log(`Installed ${result.detail} schedule for ${profile.name}.`);
  if (result.logPath) console.log(`Log: ${result.logPath}`);
  if (removedCron) console.log(`Removed the previous cron schedule for ${profile.name}.`);
}

function commandRemoveSchedule(positionals, options) {
  if (positionals.length !== 1) throw new DailyReportError("remove-schedule requires one PROFILE.");
  const { profile } = loadProfile(positionals[0], options.config);
  const removedNative =
    process.platform === "darwin"
      ? removeLaunchd(profile)
      : process.platform === "linux"
        ? removeSystemd(profile)
        : false;
  const removedCron = removeCron(profile, { required: false });
  if (removedNative || removedCron) console.log(`Removed schedule for ${profile.name}.`);
  else console.log(`No installed schedule found for ${profile.name}.`);
}

function commandInstallCron(positionals, options) {
  if (positionals.length !== 1) throw new DailyReportError("install-cron requires one PROFILE.");
  const { profile, configPath } = loadProfile(positionals[0], options.config);
  if (!profile.schedule) throw new DailyReportError(`${profile.name}.schedule is not configured.`);
  const environment = inspectEnvironment(profile);
  installCron(profile, configPath, environment);
}

function commandRemoveCron(positionals, options) {
  if (positionals.length !== 1) throw new DailyReportError("remove-cron requires one PROFILE.");
  const { profile } = loadProfile(positionals[0], options.config);
  removeCron(profile);
  console.log(`Removed cron schedule for ${profile.name}.`);
}

export function main(argv = process.argv.slice(2)) {
  const { options, positionals } = parseArguments(argv);
  const command = positionals.shift();
  if (options.help || !command) {
    console.log(usage());
    return 0;
  }

  switch (command) {
    case "install-cli":
      if (positionals.length !== 0) throw new DailyReportError("install-cli takes no positional arguments.");
      commandInstallCli(options);
      break;
    case "remove-cli":
      if (positionals.length !== 0) throw new DailyReportError("remove-cli takes no positional arguments.");
      commandRemoveCli(options);
      break;
    case "init-config":
      if (positionals.length !== 0) throw new DailyReportError("init-config takes no positional arguments.");
      commandInitConfig(options);
      break;
    case "doctor":
      commandDoctor(positionals, options);
      break;
    case "run":
      commandRun(positionals, options);
      break;
    case "reconcile":
      commandReconcile(positionals, options);
      break;
    case "install-schedule":
      commandInstallSchedule(positionals, options);
      break;
    case "remove-schedule":
      commandRemoveSchedule(positionals, options);
      break;
    case "install-cron":
      commandInstallCron(positionals, options);
      break;
    case "remove-cron":
      commandRemoveCron(positionals, options);
      break;
    default:
      throw new DailyReportError(`Unknown command: ${command}\n\n${usage()}`);
  }
  return 0;
}

function invokedAsMain() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(SCRIPT_PATH);
  } catch {
    return path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH);
  }
}

if (invokedAsMain()) {
  try {
    process.exitCode = main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`daily-report: ${message}`);
    process.exitCode = error instanceof DailyReportError ? 1 : 2;
  }
}
