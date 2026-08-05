export const SCHEDULER_JOB_STATUSES = Object.freeze({
  RUNNING: "running",
  NEEDS_ATTENTION: "needs-attention",
  DRAFT: "draft",
  ACTIVE: "active",
  ACTIVE_UPDATE: "active-update",
  PAUSED: "paused",
  PAUSED_UPDATE: "paused-update",
});

export function schedulerEffectiveRun(job) {
  if (job?.effectiveRun && typeof job.effectiveRun === "object") return job.effectiveRun;
  const runs = Array.isArray(job?.recentRuns) ? job.recentRuns : [];
  return runs.find((run) => run?.status !== "skipped") ?? runs[0];
}

export function schedulerJobStatus(job) {
  const installation = job?.installation ?? {};
  const latest = schedulerEffectiveRun(job);
  if (latest?.status === "running") return SCHEDULER_JOB_STATUSES.RUNNING;
  if (latest && ["failed", "timed-out", "interrupted"].includes(latest.status)) {
    return SCHEDULER_JOB_STATUSES.NEEDS_ATTENTION;
  }
  if (
    job?.candidateError
    || job?.installationError
    || job?.historyError
    || job?.nextRunError
    || installation.installed && installation.health !== "ok"
    || installation.adapterDrift
  ) return SCHEDULER_JOB_STATUSES.NEEDS_ATTENTION;
  if (!installation.installed) return SCHEDULER_JOB_STATUSES.DRAFT;
  if (installation.enabled) {
    return installation.definitionDrift
      ? SCHEDULER_JOB_STATUSES.ACTIVE_UPDATE
      : SCHEDULER_JOB_STATUSES.ACTIVE;
  }
  return installation.definitionDrift
    ? SCHEDULER_JOB_STATUSES.PAUSED_UPDATE
    : SCHEDULER_JOB_STATUSES.PAUSED;
}
