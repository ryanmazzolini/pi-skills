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
  loadConfig,
  readCrontab,
  reconcileDates,
  renderReport,
  replaceCronBlock,
  reportGenerationStatus,
  resolveExecutable,
  resolveProfile,
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

function commandInstallCron(positionals, options) {
  if (positionals.length !== 1) throw new DailyReportError("install-cron requires one PROFILE.");
  const { profile, configPath } = loadProfile(positionals[0], options.config);
  if (!profile.schedule) throw new DailyReportError(`${profile.name}.schedule is not configured.`);
  const environment = inspectEnvironment(profile);
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

function commandRemoveCron(positionals, options) {
  if (positionals.length !== 1) throw new DailyReportError("remove-cron requires one PROFILE.");
  const { profile } = loadProfile(positionals[0], options.config);
  const crontab = requireCrontab();
  const marker = `daily-report:${profile.name}`;
  const current = readCrontab(crontab);
  const updated = replaceCronBlock(current, marker, "");
  if (updated !== current) writeCrontab(crontab, updated);
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

if (path.resolve(process.argv[1] || "") === path.resolve(SCRIPT_PATH)) {
  try {
    process.exitCode = main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`daily-report: ${message}`);
    process.exitCode = error instanceof DailyReportError ? 1 : 2;
  }
}
