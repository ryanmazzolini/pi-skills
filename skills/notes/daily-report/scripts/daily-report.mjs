#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DailyReportError,
  SKILL_DIRECTORY,
  assertNotFutureDate,
  collectSources,
  dateWindow,
  ensureReportPath,
  expandHome,
  initializeConfig,
  inspectEnvironment,
  loadConfig,
  publishReport,
  reconcileDates,
  reportContentHash,
  reportEvidence,
  reportGenerationStatus,
  resolveProfile,
  shouldSkipReport,
  todayInTimeZone,
} from "./daily-report-lib.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);

function usage() {
  return `Usage:
  daily-report install-cli [--bin-dir PATH]
  daily-report remove-cli [--bin-dir PATH]
  daily-report init-config [--config PATH] [--force]
  daily-report doctor PROFILE [--config PATH]
  daily-report reconcile PROFILE [--config PATH] [--max-days N] [--refresh-partial] [--force]
  daily-report collect PROFILE [YYYY-MM-DD] [--config PATH] [--refresh-partial] [--force]
  daily-report publish PROFILE --evidence PATH --body PATH [--config PATH] [--refresh-partial] [--force]

reconcile lists dates needing reports as JSON; collect emits one date's JSON evidence.
Synthesize a Markdown body using only that evidence, then publish with the unchanged evidence file.
publish adds frontmatter and source coverage and rechecks existing-report protection.
No command calls an LLM. Report body rules: ${path.join(SKILL_DIRECTORY, "references", "report-system-prompt.md")}
Required: git for collection, a writable vault, and configured Git roots.
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
    else if (["--config", "--max-days", "--bin-dir", "--evidence", "--body"].includes(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new DailyReportError(`${argument} requires a value.`);
      index += 1;
      if (argument === "--config") options.config = value;
      else if (argument === "--bin-dir") options.binDir = value;
      else if (argument === "--evidence") options.evidence = value;
      else if (argument === "--body") options.body = value;
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

function doctor(profile, configPath, environment) {
  console.log(`Settings: ${configPath}`);
  console.log(`Profile: ${profile.name}`);
  console.log(`Timezone: ${profile.timezone}`);
  console.log(`Vault: ${profile.vault}`);
  console.log(`Reports: ${profile.reportBase}`);
  for (const root of profile.gitRoots) console.log(`Git root: ${root}`);
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
  console.log("Review its vault paths, Git roots, and enabled sources before running reports.");
}

function commandDoctor(positionals, options) {
  if (positionals.length !== 1) throw new DailyReportError("doctor requires one PROFILE.");
  const { profile, configPath } = loadProfile(positionals[0], options.config);
  const environment = inspectEnvironment(profile);
  doctor(profile, configPath, environment);
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function commandCollect(positionals, options) {
  if (positionals.length < 1 || positionals.length > 2) {
    throw new DailyReportError("collect requires PROFILE and an optional YYYY-MM-DD.");
  }
  const { profile } = loadProfile(positionals[0], options.config);
  const date = positionals[1] || todayInTimeZone(profile.timezone);
  const window = dateWindow(date, profile.timezone);
  assertNotFutureDate(date, profile);
  const reportPath = ensureReportPath(profile, date);
  const previousReportHash = reportContentHash(reportPath);
  if (shouldSkipReport(reportPath, options)) {
    printJson({ action: "skipped", reportPath, status: reportGenerationStatus(reportPath) });
    return;
  }

  const environment = inspectEnvironment(profile);
  const sources = collectSources(profile, environment, window);
  for (const source of Object.values(sources)) {
    console.error(sourceDiagnostic(source));
    for (const warning of source.warnings || []) console.error(`  warning: ${warning}`);
  }
  printJson(reportEvidence(profile, date, window, sources, previousReportHash));
}

function commandReconcile(positionals, options) {
  if (positionals.length !== 1) throw new DailyReportError("reconcile requires one PROFILE.");
  const { profile } = loadProfile(positionals[0], options.config);
  const today = todayInTimeZone(profile.timezone);
  const dates = reconcileDates(profile, today, options.maxDays ?? profile.maxReconcileDays)
    .filter((date) => !shouldSkipReport(ensureReportPath(profile, date), options));
  printJson({ profile: profile.name, today, dates });
}

function readInputFile(filePath, label) {
  try {
    return fs.readFileSync(path.resolve(expandHome(filePath)), "utf8");
  } catch (error) {
    throw new DailyReportError(`Could not read ${label} file ${filePath}: ${error.message}`, { cause: error });
  }
}

function commandPublish(positionals, options) {
  if (positionals.length !== 1 || !options.evidence || !options.body) {
    throw new DailyReportError("publish requires PROFILE, --evidence PATH, and --body PATH.");
  }
  const { profile } = loadProfile(positionals[0], options.config);
  let evidence;
  try {
    evidence = JSON.parse(readInputFile(options.evidence, "evidence"));
  } catch (error) {
    if (error instanceof DailyReportError) throw error;
    throw new DailyReportError(`Invalid evidence JSON: ${error.message}`, { cause: error });
  }
  const body = readInputFile(options.body, "body");
  printJson(publishReport(profile, evidence, body, options));
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
    case "reconcile":
      commandReconcile(positionals, options);
      break;
    case "collect":
      commandCollect(positionals, options);
      break;
    case "publish":
      commandPublish(positionals, options);
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
