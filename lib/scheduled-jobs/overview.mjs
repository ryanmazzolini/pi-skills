import {
  declarationSummary,
  loadDeclarations,
  resolveCandidate,
} from "./index.mjs";
import { installedStatus } from "./lifecycle.mjs";
import { readRunHistory } from "./runtime.mjs";
import { nextCronOccurrence } from "./schedule.mjs";

function failure(error) {
  return {
    code: typeof error?.code === "string" ? error.code : "SCHEDULER_ERROR",
    message: error?.message || String(error),
  };
}

function candidateSummary(candidate) {
  return {
    digest: candidate.digest,
    adapter: {
      mode: candidate.contract.adapter.mode,
      selected: candidate.contract.adapter.selected,
      warning: candidate.contract.adapter.warning ?? null,
    },
    workingDirectory: candidate.contract.workingDirectory,
    timeoutSeconds: candidate.contract.timeoutSeconds,
  };
}

function adapterSummary(adapter) {
  if (!adapter) return null;
  return {
    name: adapter.name ?? null,
    available: adapter.available ?? null,
    enabled: adapter.enabled ?? null,
    loaded: adapter.loaded ?? adapter.active ?? null,
    artifactMatches: adapter.artifactMatches ?? null,
  };
}

function installationSummary(installation, candidate) {
  if (!installation?.installed) return { installed: false, health: installation?.health ?? "absent" };
  const drift = installation.drift ?? {};
  return {
    installed: true,
    health: installation.health,
    healthReason: installation.healthReason ?? null,
    healthCategory: installation.healthCategory ?? null,
    enabled: installation.metadata?.enabled === true,
    digest: installation.metadata?.digest ?? null,
    revision: installation.metadata?.revision ?? null,
    schedule: installation.snapshot?.contract?.schedule ?? null,
    workingDirectory: installation.snapshot?.contract?.workingDirectory ?? null,
    definitionDrift: Boolean(candidate && installation.metadata?.digest !== candidate.digest),
    adapterDrift: Object.values(drift).some(Boolean),
    adapter: adapterSummary(installation.adapter),
  };
}

function runSummary(run) {
  return {
    runId: run.runId,
    trigger: run.trigger,
    scheduledFor: run.scheduledFor,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    durationMilliseconds: run.durationMilliseconds ?? null,
    status: run.status,
    exitCode: run.exitCode,
    signal: run.signal,
    timedOut: run.timedOut,
    reason: run.reason,
    digest: run.digest,
    revision: run.revision,
  };
}

export function manifestOverview({
  manifestPath,
  adapter = "auto",
  env = process.env,
  platform = process.platform,
  runnerPath,
  adapterOptions,
  historyLimit = 10,
  now = new Date(),
}, implementations = {}) {
  const load = implementations.loadDeclarations ?? loadDeclarations;
  const resolve = implementations.resolveCandidate ?? resolveCandidate;
  const status = implementations.installedStatus ?? installedStatus;
  const history = implementations.readRunHistory ?? readRunHistory;
  const nextOccurrence = implementations.nextCronOccurrence ?? nextCronOccurrence;
  const declarations = load({ manifestPath, env });
  const jobs = declarations.map((declaration) => {
    let candidate;
    let candidateError = null;
    try {
      candidate = resolve(declaration, { adapter, env, platform, runnerPath });
    } catch (error) {
      candidateError = failure(error);
    }

    let installation;
    let installationError = null;
    try {
      installation = status(declaration.id, { env, adapterOptions });
    } catch (error) {
      installationError = failure(error);
    }

    let recentRuns = [];
    let historyError = null;
    try {
      recentRuns = history(declaration.id, { env, limit: historyLimit }).map(runSummary);
    } catch (error) {
      historyError = failure(error);
    }

    const normalizedInstallation = installationSummary(installation, candidate);
    const installedSchedule = installation?.snapshot?.contract?.schedule;
    const canSchedule = normalizedInstallation.installed
      && normalizedInstallation.enabled
      && normalizedInstallation.health === "ok"
      && !normalizedInstallation.adapterDrift
      && typeof installedSchedule === "string";
    let nextRun = null;
    let nextRunError = null;
    if (canSchedule) {
      try {
        nextRun = nextOccurrence(installedSchedule, { after: now })?.toISOString() ?? null;
      } catch (error) {
        nextRunError = failure(error);
      }
    }

    return {
      ...declarationSummary(declaration),
      candidate: candidate ? candidateSummary(candidate) : null,
      candidateError,
      installation: normalizedInstallation,
      installationError,
      nextRun,
      nextRunError,
      recentRuns,
      historyError,
    };
  });
  return { manifestPath, generatedAt: now.toISOString(), jobs };
}
