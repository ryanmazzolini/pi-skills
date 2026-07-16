#!/usr/bin/env node

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  SchedulerError,
  SchedulerUsageError,
  declarationSummary,
  loadDeclarations,
  resolveCandidate,
} from "../lib/scheduled-jobs/index.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);

function usage() {
  return `Usage:
  scheduled-jobs list --manifest PATH [--json]
  scheduled-jobs inspect JOB_ID --manifest PATH [--adapter auto|cron] [--json]
  scheduled-jobs doctor JOB_ID --manifest PATH [--adapter auto|cron] [--json]

PATH must be the fixed global manifest or an exact Git-root .pi/scheduler.json.
The CLI performs no project discovery. These commands never install or run jobs.`;
}

function parseArguments(argv) {
  const options = { adapter: "auto", json: false };
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") options.json = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--manifest" || argument === "--adapter") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new SchedulerUsageError(`${argument} requires a value.`);
      index += 1;
      if (argument === "--manifest") options.manifestPath = value;
      else options.adapter = value;
    } else if (argument.startsWith("--")) throw new SchedulerUsageError(`Unknown option: ${argument}`);
    else positionals.push(argument);
  }
  return { options, positionals };
}

function selectDeclaration(positionals, declarations, command) {
  if (positionals.length !== 1) throw new SchedulerUsageError(`${command} requires one JOB_ID.`);
  const declaration = declarations.find((item) => item.id === positionals[0]);
  if (!declaration) throw new SchedulerUsageError(`Unknown declared job: ${positionals[0]}`);
  return declaration;
}

function display(value) {
  return String(value).replace(/[\u0000-\u001f\u007f]/g, "�");
}

function humanList(result) {
  if (result.jobs.length === 0) return "No scheduler jobs declared.";
  return result.jobs
    .map((job) => `${display(job.id)}\n  ${display(job.description)}\n  schedule: ${display(job.schedule)}\n  source: ${display(job.sourcePath)}`)
    .join("\n\n");
}

function commandList(positionals, options, env) {
  if (positionals.length !== 0) throw new SchedulerUsageError("list does not accept a JOB_ID.");
  const declarations = loadDeclarations({ manifestPath: options.manifestPath, env });
  return { command: "list", jobs: declarations.map(declarationSummary) };
}

function commandInspect(command, positionals, options, env, platform) {
  const declarations = loadDeclarations({ manifestPath: options.manifestPath, env });
  const declaration = selectDeclaration(positionals, declarations, command);
  const candidate = resolveCandidate(declaration, { adapter: options.adapter, env, platform });
  if (command === "doctor") {
    const unavailableOptionalCommands = Object.entries(candidate.contract.optionalCommands)
      .filter(([, executable]) => executable === null)
      .map(([name]) => name);
    return {
      command,
      status: "ok",
      candidate,
      diagnostics: {
        manifest: "ok",
        requiredCommands: "ok",
        unavailableOptionalCommands,
        adapter: candidate.contract.adapter.selected,
        warning: candidate.contract.adapter.warning ?? null,
      },
    };
  }
  return { command, candidate };
}

function humanCandidate(result) {
  const { candidate } = result;
  const contract = candidate.contract;
  const lines = [
    `${result.command === "doctor" ? "Doctor" : "Candidate"}: ${display(contract.id)}`,
    `Digest: ${display(candidate.digest)}`,
    `Description: ${display(contract.description)}`,
    `Schedule: ${display(contract.schedule)}`,
    `Adapter: ${display(contract.adapter.selected)} (${display(contract.adapter.mode)})`,
    `Argv: ${JSON.stringify(contract.argv.map(display))}`,
    `Working directory: ${display(contract.workingDirectory ?? "HOME")}`,
    `Timeout: ${contract.timeoutSeconds}s`,
    `Source: ${display(contract.sourcePath)}`,
    "Required commands:",
    ...Object.entries(contract.requiredCommands).map(([name, executable]) => `  ${display(name)}: ${display(executable)}`),
    "Optional commands:",
    ...Object.entries(contract.optionalCommands).map(([name, executable]) => `  ${display(name)}: ${display(executable ?? "unavailable")}`),
  ];
  if (contract.adapter.warning) lines.push(`Warning: ${display(contract.adapter.warning)}`);
  if (result.diagnostics) lines.push("Status: ok");
  return lines.join("\n");
}

export function run(argv, { env = process.env, platform = process.platform } = {}) {
  const [command, ...rest] = argv;
  const { options, positionals } = parseArguments(rest);
  if (options.help || command === "help" || command === "--help" || command === "-h" || command === undefined) {
    return { exitCode: 0, stdout: usage(), json: options.json };
  }
  let result;
  if (command === "list") result = commandList(positionals, options, env);
  else if (command === "inspect" || command === "doctor") {
    result = commandInspect(command, positionals, options, env, platform);
  } else throw new SchedulerUsageError(`Unknown command: ${command}`);
  return {
    exitCode: 0,
    stdout: options.json ? JSON.stringify({ ok: true, ...result }, null, 2) : command === "list" ? humanList(result) : humanCandidate(result),
    json: options.json,
  };
}

export function main(argv = process.argv.slice(2), runtime = {}) {
  try {
    const result = run(argv, runtime);
    process.stdout.write(`${result.stdout}\n`);
    return result.exitCode;
  } catch (error) {
    const normalized = error instanceof SchedulerError
      ? error
      : new SchedulerError(error.message || String(error), { code: "INTERNAL", exitCode: 1 });
    const wantsJson = argv.includes("--json");
    if (wantsJson) {
      process.stderr.write(`${JSON.stringify({
        ok: false,
        error: { code: normalized.code, message: normalized.message, details: normalized.details ?? null },
      }, null, 2)}\n`);
    } else process.stderr.write(`scheduled-jobs: ${normalized.message}\n`);
    return normalized.exitCode;
  }
}

function isMain() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(SCRIPT_PATH);
  } catch {
    return false;
  }
}

if (isMain()) process.exitCode = main();
