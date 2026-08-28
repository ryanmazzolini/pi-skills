export type SchedulerJobStatus =
	| "running"
	| "needs-attention"
	| "draft"
	| "active"
	| "active-update"
	| "paused"
	| "paused-update";

export const SCHEDULER_JOB_STATUSES: Readonly<{
	RUNNING: "running";
	NEEDS_ATTENTION: "needs-attention";
	DRAFT: "draft";
	ACTIVE: "active";
	ACTIVE_UPDATE: "active-update";
	PAUSED: "paused";
	PAUSED_UPDATE: "paused-update";
}>;

export interface SchedulerStatusJob {
	candidateError?: unknown;
	installationError?: unknown;
	historyError?: unknown;
	nextRunError?: unknown;
	installation?: {
		installed?: unknown;
		health?: unknown;
		enabled?: unknown;
		definitionDrift?: unknown;
		adapterDrift?: unknown;
	};
	recentRuns?: Array<{ status?: unknown }>;
}

export function schedulerLatestExecution(job: SchedulerStatusJob): { status?: unknown } | undefined;
export function schedulerJobStatus(job: SchedulerStatusJob): SchedulerJobStatus;
