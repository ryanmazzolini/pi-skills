import type { SchedulerJobStatus } from "./job-status.mjs";

export const SCHEDULER_STATUS_VERSION: 1;

export type SchedulerStatusRun = "running" | "succeeded" | "failed" | "timed-out" | "skipped" | "interrupted";

export interface SchedulerStatusJob {
	id: string;
	baseStatus: SchedulerJobStatus;
	installationDigest: string | null;
	installationRevision: number | null;
	runStatus: SchedulerStatusRun | null;
}

export interface SchedulerStatusSnapshot {
	version: 1;
	manifestPath: string;
	generatedAt: string;
	attentionCount: number;
	jobs: SchedulerStatusJob[];
}

export function schedulerStatusDirectory(env?: NodeJS.ProcessEnv): string;
export function ensureSchedulerStatusDirectory(env?: NodeJS.ProcessEnv): string;
export function schedulerStatusSnapshotPath(manifestPath: string, env?: NodeJS.ProcessEnv): string;
export function withSchedulerStatusLock<T>(
	manifestPath: string,
	env: NodeJS.ProcessEnv,
	callback: () => T,
): T;
export function writeSchedulerStatusSnapshot(
	manifestPath: string,
	overview: { generatedAt?: unknown; jobs?: unknown },
	env?: NodeJS.ProcessEnv,
): SchedulerStatusSnapshot;
export function writeUnavailableSchedulerStatusSnapshot(
	manifestPath: string,
	env?: NodeJS.ProcessEnv,
): SchedulerStatusSnapshot;
export function updateSchedulerStatusRun(
	manifestPath: string,
	id: string,
	run: { status: SchedulerStatusRun; digest: string; revision: number },
	env?: NodeJS.ProcessEnv,
): SchedulerStatusSnapshot;
export function readSchedulerStatusSnapshot(
	manifestPath: string,
	env?: NodeJS.ProcessEnv,
): SchedulerStatusSnapshot | undefined;
