export interface SchedulerAttentionOverview {
	jobs?: unknown[];
}

export function schedulerAttentionDirectory(env?: NodeJS.ProcessEnv): string;
export function ensureSchedulerAttentionDirectory(env?: NodeJS.ProcessEnv): string;
export function schedulerAttentionPath(manifestPath: string, env?: NodeJS.ProcessEnv): string;
export function publishSchedulerAttention<T extends SchedulerAttentionOverview>(
	manifestPath: string,
	loadOverview: () => T,
	env?: NodeJS.ProcessEnv,
): T;
export function readSchedulerAttention(
	manifestPath: string,
	env?: NodeJS.ProcessEnv,
): number | undefined;
