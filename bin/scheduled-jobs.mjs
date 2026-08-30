#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONFIG_DIRECTORY_NAME,
  USER_MANIFEST_DIRECTORY,
  USER_MANIFEST_NAME,
  SchedulerError,
  SchedulerUsageError,
  declarationSummary,
  defaultConfigHome,
  loadDeclarations,
  resolveCandidate,
} from "../lib/scheduled-jobs/index.mjs";
import {
  disableJob,
  enableJob,
  installJob,
  installedStatus,
  removeJob,
  updateJob,
} from "../lib/scheduled-jobs/lifecycle.mjs";
import { manifestOverview } from "../lib/scheduled-jobs/overview.mjs";
import { publishSchedulerAttention } from "../lib/scheduled-jobs/attention.mjs";
import {
  MAX_RUN_HISTORY,
  executeInstalled,
  readInstalled,
  readLog,
  readRunHistory,
  readRunOutput,
  stateRoot as resolvedStateRoot,
  verifyInstalledShims,
} from "../lib/scheduled-jobs/runtime.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);

function usage() {
  return `Usage:
  scheduled-jobs list --manifest PATH [--json]
  scheduled-jobs overview --manifest PATH [--history-limit N] [--adapter auto|cron] [--json]
  scheduled-jobs inspect JOB_ID --manifest PATH [--adapter auto|cron] [--json]
  scheduled-jobs doctor JOB_ID --manifest PATH [--adapter auto|cron] [--json]
  scheduled-jobs install JOB_ID --manifest PATH --expected-candidate-digest DIGEST [--json]
  scheduled-jobs update JOB_ID --manifest PATH --expected-candidate-digest DIGEST --expected-installed-digest DIGEST --expected-revision N [--json]
  scheduled-jobs run JOB_ID --expected-installed-digest DIGEST --expected-revision N [--json]
  scheduled-jobs enable JOB_ID --expected-installed-digest DIGEST --expected-revision N [--json]
  scheduled-jobs disable JOB_ID --expected-installed-digest DIGEST --expected-revision N [--json]
  scheduled-jobs remove JOB_ID --expected-installed-digest DIGEST --expected-revision N [--json]
  scheduled-jobs status JOB_ID [--json]
  scheduled-jobs logs JOB_ID [--lines N] [--json]
  scheduled-jobs runs JOB_ID [--limit N] [--json]
  scheduled-jobs run-log JOB_ID RUN_ID [--lines N] [--json]

PATH must be the fixed user manifest or an exact Git-root .pi/scheduler.json.
The CLI performs no project discovery and never prompts. Install creates a disabled job.`;
}

function integerOption(argument, value, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new SchedulerUsageError(`${argument} must be an integer from ${minimum} to ${maximum}.`);
  }
  return parsed;
}

function parseArguments(argv) {
  const options = { adapter: "auto", json: false };
  const positionals = [];
  const valuedOptions = new Set([
    "--manifest",
    "--adapter",
    "--expected-candidate-digest",
    "--expected-installed-digest",
    "--expected-revision",
    "--lines",
    "--history-limit",
    "--limit",
    "--state-root",
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") options.json = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else if (valuedOptions.has(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new SchedulerUsageError(`${argument} requires a value.`);
      index += 1;
      if (argument === "--manifest") options.manifestPath = value;
      else if (argument === "--adapter") options.adapter = value;
      else if (argument === "--expected-candidate-digest") options.expectedCandidateDigest = value;
      else if (argument === "--expected-installed-digest") options.expectedInstalledDigest = value;
      else if (argument === "--expected-revision") options.expectedRevision = integerOption(argument, value, 1, Number.MAX_SAFE_INTEGER);
      else if (argument === "--state-root") options.stateRoot = value;
      else if (argument === "--history-limit") options.historyLimit = integerOption(argument, value, 1, MAX_RUN_HISTORY);
      else if (argument === "--limit") options.limit = integerOption(argument, value, 1, MAX_RUN_HISTORY);
      else options.lines = integerOption(argument, value, 1, 10_000);
    } else if (argument.startsWith("--")) throw new SchedulerUsageError(`Unknown option: ${argument}`);
    else positionals.push(argument);
  }
  return { options, positionals };
}

function requireSupportedJobId(id) {
  if (!id.startsWith("user:") && !id.startsWith("project:")) {
    throw new SchedulerUsageError("JOB_ID must use a user: or project: scope.");
  }
  return id;
}

function requireJobId(positionals, command) {
  if (positionals.length !== 1) throw new SchedulerUsageError(`${command} requires one JOB_ID.`);
  return requireSupportedJobId(positionals[0]);
}

function declaredJob(id, manifestPath, env) {
  const declarations = loadDeclarations({ manifestPath, env });
  const declaration = declarations.find((item) => item.id === id);
  if (!declaration) throw new SchedulerUsageError(`Unknown declared job: ${id}`);
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

function currentManifestOverview(manifestPath, runtime, env, historyLimit = 10) {
  return manifestOverview({
    manifestPath,
    adapter: "auto",
    env,
    platform: runtime.platform,
    runnerPath: fs.realpathSync(SCRIPT_PATH),
    adapterOptions: runtime.adapterOptions,
    historyLimit,
  });
}

function publishAttention(manifestPath, runtime, env) {
  if (!manifestPath) return;
  try {
    publishSchedulerAttention(
      manifestPath,
      () => currentManifestOverview(manifestPath, runtime, env),
      env,
    );
  } catch {
    // Derived attention must never change a scheduler command result.
  }
}

async function withAttentionRefresh(manifestPath, runtime, env, operation) {
  try {
    return await operation();
  } finally {
    publishAttention(manifestPath, runtime, env);
  }
}

function commandOverview(positionals, options, runtime, env) {
  if (positionals.length !== 0) throw new SchedulerUsageError("overview does not accept a JOB_ID.");
  const compute = () => manifestOverview({
    manifestPath: options.manifestPath,
    adapter: options.adapter,
    env,
    platform: runtime.platform,
    runnerPath: fs.realpathSync(SCRIPT_PATH),
    adapterOptions: runtime.adapterOptions,
    historyLimit: options.historyLimit ?? 10,
  });
  return {
    command: "overview",
    result: publishSchedulerAttention(options.manifestPath, compute, env),
  };
}

function commandRunLog(positionals, options, env) {
  if (positionals.length !== 2) throw new SchedulerUsageError("run-log requires one JOB_ID and one RUN_ID.");
  const id = requireSupportedJobId(positionals[0]);
  return { command: "run-log", result: readRunOutput(id, positionals[1], { env, lines: options.lines ?? 200 }) };
}

function requireAvailableInstallation(installation) {
  if (installation.installed && installation.health === "unavailable") {
    throw new SchedulerError(installation.healthReason || "Installed scheduler adapter is unavailable.", {
      code: "ADAPTER_UNAVAILABLE",
      exitCode: 4,
      details: installation,
    });
  }
  return installation;
}

function requireHealthyInstallation(installation) {
  requireAvailableInstallation(installation);
  if (installation.installed && installation.health !== "ok") {
    throw new SchedulerError(
      installation.healthReason || `Installed job state is ${installation.health}.`,
      { code: "INSTALLED_UNHEALTHY", exitCode: 4, details: installation },
    );
  }
  return installation;
}

function commandInspect(command, positionals, options, env, platform, adapterOptions) {
  const id = requireJobId(positionals, command);
  const declaration = declaredJob(id, options.manifestPath, env);
  const candidate = resolveCandidate(declaration, {
    adapter: options.adapter,
    env,
    platform,
    runnerPath: fs.realpathSync(SCRIPT_PATH),
  });
  const currentInstallation = installedStatus(id, { env, adapterOptions });
  const installation = currentInstallation.installed
    ? { ...currentInstallation, definitionDrift: currentInstallation.metadata?.digest !== candidate.digest }
    : currentInstallation;
  if (command === "doctor") {
    requireHealthyInstallation(installation);
    const unavailableOptionalCommands = Object.entries(candidate.contract.optionalCommands)
      .filter(([, executable]) => executable === null)
      .map(([name]) => name);
    let installedCommands = installation.installed ? "unhealthy" : "not-installed";
    if (installation.health === "ok") {
      verifyInstalledShims(readInstalled(id, env));
      installedCommands = "ok";
    }
    return {
      command,
      status: "ok",
      candidate,
      installation,
      diagnostics: {
        manifest: "ok",
        requiredCommands: "ok",
        installedCommands,
        unavailableOptionalCommands,
        adapter: candidate.contract.adapter.selected,
        warning: candidate.contract.adapter.warning ?? null,
      },
    };
  }
  return { command, candidate, installation };
}

function lifecycleInput(id, options, runtime) {
  const { env, platform, adapterOptions } = runtime;
  return {
    id,
    env,
    runnerPath: fs.realpathSync(SCRIPT_PATH),
    adapterOptions,
    expectedCandidateDigest: options.expectedCandidateDigest,
    expectedInstalledDigest: options.expectedInstalledDigest,
    expectedRevision: options.expectedRevision,
    candidateOptions: {
      adapter: options.adapter,
      env,
      platform,
      runnerPath: fs.realpathSync(SCRIPT_PATH),
    },
    loadDeclaration: () => declaredJob(id, options.manifestPath, env),
  };
}

function installedSourcePath(id, env) {
  const sourcePath = readInstalled(id, env)?.snapshot?.contract?.sourcePath;
  return typeof sourcePath === "string" && path.isAbsolute(sourcePath) ? sourcePath : undefined;
}

function overviewSourcePath(id, env) {
  if (id.startsWith("user:")) {
    return path.join(defaultConfigHome(env), USER_MANIFEST_DIRECTORY, USER_MANIFEST_NAME);
  }
  const sourcePath = installedSourcePath(id, env);
  if (
    sourcePath
    && path.basename(sourcePath) === "scheduler.json"
    && path.basename(path.dirname(sourcePath)) === CONFIG_DIRECTORY_NAME
  ) return sourcePath;
  return undefined;
}

function installedManifestEnvironment(id, manifestPath, env) {
  if (!id.startsWith("user:") || !manifestPath) return env;
  return { ...env, XDG_CONFIG_HOME: path.dirname(path.dirname(manifestPath)) };
}

async function executeCommand(command, positionals, options, runtime) {
  const { platform, adapterOptions } = runtime;
  let env = runtime.env;
  if (options.stateRoot !== undefined) {
    if (!path.isAbsolute(options.stateRoot)) throw new SchedulerUsageError("--state-root must be absolute.");
    const requestedRoot = path.resolve(options.stateRoot);
    env = { ...env, XDG_STATE_HOME: path.dirname(requestedRoot) };
    if (resolvedStateRoot(env) !== requestedRoot) {
      throw new SchedulerUsageError("--state-root must identify the canonical pi-scheduler state directory.");
    }
  }
  if (command === "list") return commandList(positionals, options, env);
  if (command === "overview") return commandOverview(positionals, options, runtime, env);
  if (command === "run-log") return commandRunLog(positionals, options, env);
  if (command === "inspect" || command === "doctor") {
    return commandInspect(command, positionals, options, env, platform, adapterOptions);
  }
  const id = requireJobId(positionals, command);
  const operationRuntime = { ...runtime, env };
  const sourcePath = options.manifestPath ?? overviewSourcePath(id, env);
  const installedManifestPath = installedSourcePath(id, env);
  const lifecycleOperation = {
    install: installJob,
    update: updateJob,
    enable: enableJob,
    disable: disableJob,
    remove: removeJob,
  }[command];
  if (lifecycleOperation) {
    return withAttentionRefresh(sourcePath, operationRuntime, env, async () => ({
      command,
      result: lifecycleOperation(lifecycleInput(id, options, operationRuntime)),
    }));
  }
  if (command === "run" || command === "_run-installed") {
    const manifestPath = command === "run" ? sourcePath : installedManifestPath;
    const attentionEnv = command === "run" ? env : installedManifestEnvironment(id, manifestPath, env);
    const operation = async () => ({
      command,
      result: await executeInstalled(id, {
        env,
        expectedDigest: options.expectedInstalledDigest,
        expectedRevision: options.expectedRevision,
        trigger: command === "_run-installed" ? "scheduled" : "manual",
        onStateChange: () => publishAttention(manifestPath, operationRuntime, attentionEnv),
      }),
    });
    return withAttentionRefresh(manifestPath, operationRuntime, attentionEnv, operation);
  }
  if (command === "status") {
    return { command, result: requireAvailableInstallation(installedStatus(id, { env, adapterOptions })) };
  }
  if (command === "logs") return { command, result: readLog(id, { env, lines: options.lines ?? 200 }) };
  if (command === "runs") return { command, result: { id, runs: readRunHistory(id, { env, limit: options.limit ?? 20 }) } };
  throw new SchedulerUsageError(`Unknown command: ${command}`);
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
    `Working directory: ${display(contract.workingDirectory)}`,
    `Timeout: ${contract.timeoutSeconds}s`,
    `Scheduler node: ${display(contract.schedulerNode)}`,
    `Scheduler runner: ${display(contract.schedulerRunner)}`,
    `Scheduler state: ${display(contract.scheduler.root)}`,
    `Shim PATH: ${display(contract.scheduler.shimsDirectory)}`,
    `Log: ${display(contract.scheduler.logPath)}`,
    `Source: ${display(contract.sourcePath)}`,
    "Required commands:",
    ...Object.entries(contract.requiredCommands).map(([name, executable]) => `  ${display(name)}: ${display(executable)}`),
    "Optional commands:",
    ...Object.entries(contract.optionalCommands).map(([name, executable]) => `  ${display(name)}: ${display(executable ?? "unavailable")}`),
    `Installation: ${result.installation.installed ? `${result.installation.health}, revision ${result.installation.metadata?.revision ?? "unknown"}` : "not installed"}`,
  ];
  if (contract.adapter.warning) lines.push(`Warning: ${display(contract.adapter.warning)}`);
  if (result.diagnostics) lines.push("Status: ok");
  return lines.join("\n");
}

function humanOverview(result) {
  if (result.result.jobs.length === 0) return "No scheduler jobs declared.";
  return result.result.jobs.map((job) => {
    const state = !job.installation.installed
      ? "draft"
      : job.installation.health !== "ok"
        ? `needs attention (${display(job.installation.health)})`
        : job.installation.enabled
          ? "active"
          : "paused";
    const lastRun = job.recentRuns[0];
    return [
      `${display(job.id)} — ${state}`,
      `  ${display(job.description)}`,
      `  schedule: ${display(job.schedule)}`,
      `  next: ${display(job.nextRun ?? "not scheduled")}`,
      `  last: ${lastRun ? `${display(lastRun.status)} at ${display(lastRun.startedAt)}` : "no recorded runs"}`,
      ...(job.candidateError ? [`  candidate error: ${display(job.candidateError.message)}`] : []),
      ...(job.installationError ? [`  installation error: ${display(job.installationError.message)}`] : []),
      ...(job.historyError ? [`  history error: ${display(job.historyError.message)}`] : []),
    ].join("\n");
  }).join("\n\n");
}

function humanRuns(result) {
  if (result.result.runs.length === 0) return `No recorded runs for ${display(result.result.id)}.`;
  return result.result.runs.map((run) => (
    `${display(run.status)}  ${display(run.startedAt)}  ${display(run.trigger)}  ${display(run.runId)}`
  )).join("\n");
}

function humanResult(result) {
  if (result.command === "list") return humanList(result);
  if (result.command === "overview") return humanOverview(result);
  if (result.command === "inspect" || result.command === "doctor") return humanCandidate(result);
  if (result.command === "logs" || result.command === "run-log") {
    return result.result.content || `No log output at ${result.result.logPath}`;
  }
  if (result.command === "runs") return humanRuns(result);
  return JSON.stringify(result.result, null, 2);
}

export async function run(argv, {
  env = process.env,
  platform = process.platform,
  adapterOptions,
} = {}) {
  const [command, ...rest] = argv;
  const { options, positionals } = parseArguments(rest);
  if (options.help || command === "help" || command === "--help" || command === "-h" || command === undefined) {
    return { exitCode: 0, stdout: usage(), json: options.json };
  }
  const result = await executeCommand(command, positionals, options, {
    env,
    platform,
    adapterOptions,
  });
  return {
    exitCode: 0,
    stdout: options.json ? JSON.stringify({ ok: true, ...result }, null, 2) : humanResult(result),
    json: options.json,
  };
}

export async function main(argv = process.argv.slice(2), runtime = {}) {
  try {
    const result = await run(argv, runtime);
    process.stdout.write(`${result.stdout}\n`);
    return result.exitCode;
  } catch (error) {
    const adapterError = new Set(["LAUNCHD_ADAPTER", "SYSTEMD_ADAPTER", "CRON_ADAPTER"]).has(error.code);
    const normalized = error instanceof SchedulerError
      ? error
      : new SchedulerError(error.message || String(error), {
          code: adapterError ? "LIFECYCLE" : "INTERNAL",
          exitCode: adapterError ? 8 : 1,
          details: error.details,
        });
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

if (isMain()) process.exitCode = await main();
