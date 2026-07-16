import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

export const CONFIG_DIRECTORY_NAME = ".pi";
export const PROJECT_MANIFEST_NAME = "scheduler.json";
export const GLOBAL_MANIFEST_DIRECTORY = "pi-scheduler";
export const GLOBAL_MANIFEST_NAME = "jobs.json";

const CLI_PATH = fileURLToPath(new URL("../bin/scheduled-jobs.mjs", import.meta.url));
const DISPLAY_LIMIT = 24_000;

type ScopeKind = "global" | "project";
type SchedulerAction = "inspect" | "logs" | "install" | "update" | "run" | "enable" | "disable" | "remove";
type NoticeLevel = "info" | "warning" | "error";

interface ExecResult {
	stdout: string;
	stderr: string;
	code: number | null;
	killed?: boolean;
}

interface UiContext {
	cwd: string;
	hasUI: boolean;
	ui: {
		select(title: string, options: string[]): Promise<string | undefined>;
		confirm(title: string, message: string): Promise<boolean>;
		notify(message: string, level: NoticeLevel): void;
	};
}

interface SchedulerDependencies {
	env: NodeJS.ProcessEnv;
	exists: (filePath: string) => boolean;
	exec: (command: string, args: string[], options?: { timeout?: number }) => Promise<ExecResult>;
}

interface CliFailureShape {
	code: string;
	message: string;
	details?: unknown;
}

export class SchedulerCommandError extends Error {
	code: string;
	details?: unknown;

	constructor(message: string, code = "CLI_FAILURE", details?: unknown) {
		super(message);
		this.name = "SchedulerCommandError";
		this.code = code;
		this.details = details;
	}
}

interface JobView {
	id: string;
	key: string;
	scope: ScopeKind;
	manifestPath: string;
	declaration: Record<string, unknown>;
	inspection?: Record<string, any>;
	inspectionError?: SchedulerCommandError;
}

const ACTION_LABELS: Record<SchedulerAction, string> = {
	inspect: "Inspect",
	logs: "View recent logs",
	install: "Install disabled",
	update: "Update installed snapshot",
	run: "Run installed snapshot now",
	enable: "Enable schedule",
	disable: "Disable schedule",
	remove: "Remove installed schedule",
};

export function sanitizeDisplay(value: unknown): string {
	return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "�");
}

function boundedDisplay(value: unknown, limit = DISPLAY_LIMIT): string {
	const safe = sanitizeDisplay(value);
	return safe.length <= limit ? safe : `${safe.slice(0, limit)}\n… output truncated …`;
}

export function globalManifestPath(env: NodeJS.ProcessEnv = process.env): string {
	const home = env.HOME || homedir();
	return join(resolve(env.XDG_CONFIG_HOME || join(home, ".config")), GLOBAL_MANIFEST_DIRECTORY, GLOBAL_MANIFEST_NAME);
}

async function projectManifestPath(
	cwd: string,
	dependencies: SchedulerDependencies,
): Promise<string | undefined> {
	const result = await dependencies.exec("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { timeout: 5_000 });
	if (result.code !== 0) return undefined;
	const reported = result.stdout.trim();
	if (!reported) return undefined;
	const manifestPath = join(resolve(reported), CONFIG_DIRECTORY_NAME, PROJECT_MANIFEST_NAME);
	return dependencies.exists(manifestPath) ? manifestPath : undefined;
}

export async function discoverManifestPaths(
	cwd: string,
	dependencies: SchedulerDependencies,
): Promise<Array<{ scope: ScopeKind; manifestPath: string }>> {
	const manifests: Array<{ scope: ScopeKind; manifestPath: string }> = [];
	const global = globalManifestPath(dependencies.env);
	if (dependencies.exists(global)) manifests.push({ scope: "global", manifestPath: global });
	const project = await projectManifestPath(cwd, dependencies);
	if (project) manifests.push({ scope: "project", manifestPath: project });
	return manifests;
}

function parseCliError(stderr: string): CliFailureShape {
	try {
		const parsed = JSON.parse(stderr) as { error?: CliFailureShape };
		if (parsed.error?.message) return parsed.error;
	} catch {
		// Fall back to the bounded plain-text error below.
	}
	return { code: "CLI_FAILURE", message: boundedDisplay(stderr.trim() || "scheduled-jobs failed") };
}

async function runCliJson(
	dependencies: SchedulerDependencies,
	args: string[],
): Promise<Record<string, any>> {
	const result = await dependencies.exec(process.execPath, [CLI_PATH, ...args, "--json"], { timeout: 86_410_000 });
	if (result.code !== 0) {
		const failure = parseCliError(result.stderr);
		throw new SchedulerCommandError(boundedDisplay(failure.message), failure.code, failure.details);
	}
	try {
		return JSON.parse(result.stdout) as Record<string, any>;
	} catch {
		throw new SchedulerCommandError("scheduled-jobs returned invalid JSON.");
	}
}

async function loadJobs(cwd: string, dependencies: SchedulerDependencies): Promise<JobView[]> {
	const manifests = await discoverManifestPaths(cwd, dependencies);
	const jobs: JobView[] = [];
	for (const source of manifests) {
		let listed: Record<string, any>;
		try {
			listed = await runCliJson(dependencies, ["list", "--manifest", source.manifestPath]);
		} catch (error) {
			const failure = error instanceof SchedulerCommandError ? error : new SchedulerCommandError(String(error));
			jobs.push({
				id: `${source.scope}:invalid-manifest`,
				key: "invalid manifest",
				scope: source.scope,
				manifestPath: source.manifestPath,
				declaration: {},
				inspectionError: failure,
			});
			continue;
		}
		for (const declaration of listed.jobs ?? []) {
			const job: JobView = {
				id: String(declaration.id),
				key: String(declaration.key),
				scope: source.scope,
				manifestPath: source.manifestPath,
				declaration,
			};
			try {
				job.inspection = await runCliJson(dependencies, [
					"inspect",
					job.id,
					"--manifest",
					job.manifestPath,
				]);
			} catch (error) {
				job.inspectionError = error instanceof SchedulerCommandError
					? error
					: new SchedulerCommandError(String(error));
			}
			jobs.push(job);
		}
	}
	return jobs;
}

function installation(job: JobView): Record<string, any> | undefined {
	return job.inspection?.installation;
}

function healthyInstallation(job: JobView): boolean {
	const current = installation(job);
	return current?.installed === true && current.health === "ok";
}

export function applicableActions(job: JobView): SchedulerAction[] {
	if (!job.inspection || job.inspectionError) return ["inspect"];
	const current = installation(job);
	if (!current?.installed) return ["inspect", "install"];
	const actions: SchedulerAction[] = ["inspect", "logs"];
	if (!healthyInstallation(job)) {
		if (current.health === "conflict" || current.health === "unavailable") actions.push("remove");
		return actions;
	}
	if (current.definitionDrift) actions.push("update");
	actions.push("run");
	if (current.metadata?.enabled) actions.push("disable");
	else actions.push("enable");
	actions.push("remove");
	return actions;
}

function jobStatus(job: JobView): string {
	if (job.inspectionError) return "inspection failed";
	const current = installation(job);
	if (!current?.installed) return "available · not installed";
	const enablement = current.metadata?.enabled ? "enabled" : "disabled";
	const health = current.health === "ok" ? "healthy" : `health ${sanitizeDisplay(current.health)}`;
	const drift = current.definitionDrift ? "definition drift" : "definition current";
	const adapterDrift = current.drift && Object.values(current.drift).some(Boolean) ? "adapter drift" : "adapter current";
	return `${enablement} · ${health} · ${drift} · ${adapterDrift}`;
}

export function jobOption(job: JobView): string {
	const group = job.scope === "global" ? "Global jobs" : "Project jobs";
	const schedule = job.declaration.schedule ? ` · ${sanitizeDisplay(job.declaration.schedule)}` : "";
	return `${group} · ${sanitizeDisplay(job.key)}${schedule} — ${jobStatus(job)}`;
}

function commandMappings(contract: Record<string, any>): string[] {
	const required = Object.entries(contract.requiredCommands ?? {})
		.map(([name, executable]) => `  required ${sanitizeDisplay(name)}: ${sanitizeDisplay(executable)}`);
	const optional = Object.entries(contract.optionalCommands ?? {})
		.map(([name, executable]) => `  optional ${sanitizeDisplay(name)}: ${sanitizeDisplay(executable ?? "unavailable")}`);
	return [...required, ...optional];
}

function contractLines(contract: Record<string, any>, digest: unknown, revision?: unknown): string[] {
	return [
		`Scope: ${sanitizeDisplay(contract.id)}`,
		`Source: ${sanitizeDisplay(contract.sourcePath)}`,
		`Description: ${sanitizeDisplay(contract.description)}`,
		`Schedule: ${sanitizeDisplay(contract.schedule)}`,
		`Adapter: ${sanitizeDisplay(contract.adapter?.selected)} (${sanitizeDisplay(contract.adapter?.mode)})`,
		`Argv: ${JSON.stringify((contract.argv ?? []).map(sanitizeDisplay))}`,
		`Working directory: ${sanitizeDisplay(contract.workingDirectory)}`,
		`Digest: ${sanitizeDisplay(digest)}`,
		...(revision === undefined ? [] : [`Lifecycle revision: ${sanitizeDisplay(revision)}`]),
		`Timeout: ${sanitizeDisplay(contract.timeoutSeconds)} seconds`,
		"Resolved commands:",
		...commandMappings(contract),
		...(contract.adapter?.warning ? [`Warning: ${sanitizeDisplay(contract.adapter.warning)}`] : []),
	];
}

function changedContractFields(installed: Record<string, any>, candidate: Record<string, any>): string[] {
	const fields = ["description", "schedule", "argv", "requiredCommands", "optionalCommands", "workingDirectory", "timeoutSeconds", "adapter"];
	return fields.filter((field) => JSON.stringify(installed[field]) !== JSON.stringify(candidate[field]));
}

export function inspectionText(job: JobView): string {
	if (job.inspectionError) {
		return boundedDisplay([
			`Scope: ${job.id}`,
			`Source: ${job.manifestPath}`,
			`Inspection failed (${job.inspectionError.code}): ${job.inspectionError.message}`,
		].join("\n"));
	}
	const candidate = job.inspection?.candidate;
	if (!candidate) return "No resolved candidate is available.";
	const current = installation(job);
	const lines = ["Candidate", ...contractLines(candidate.contract, candidate.digest)];
	if (!current?.installed) lines.push("", "Installation: not installed");
	else {
		lines.push(
			"",
			"Installed snapshot",
			...contractLines(current.snapshot?.contract ?? {}, current.metadata?.digest, current.metadata?.revision),
			`Installation health: ${sanitizeDisplay(current.health)}`,
			`Enablement: ${current.metadata?.enabled ? "enabled" : "disabled"}`,
			`Definition drift: ${current.definitionDrift ? "yes" : "no"}`,
			`Adapter drift: ${current.drift && Object.values(current.drift).some(Boolean) ? "yes" : "no"}`,
		);
		if (current.definitionDrift) {
			const changed = changedContractFields(current.snapshot?.contract ?? {}, candidate.contract ?? {});
			lines.push(`Changed fields: ${changed.length > 0 ? changed.join(", ") : "digest changed"}`);
		}
	}
	return boundedDisplay(lines.join("\n"));
}

function confirmationText(job: JobView, action: SchedulerAction): string {
	const candidate = job.inspection?.candidate;
	const current = installation(job);
	const usesCandidate = action === "install" || action === "update";
	const contract = usesCandidate ? candidate?.contract : current?.snapshot?.contract;
	const digest = usesCandidate ? candidate?.digest : current?.metadata?.digest;
	const revision = current?.metadata?.revision;
	const lines = [
		`${ACTION_LABELS[action]} will ${action === "run" ? "execute code" : "change scheduler state"}.`,
		"",
		...contractLines(contract ?? {}, digest, revision),
	];
	if (action === "update") {
		lines.push(
			"",
			`Installed digest: ${sanitizeDisplay(current?.metadata?.digest)}`,
			`Candidate digest: ${sanitizeDisplay(candidate?.digest)}`,
			`Changed fields: ${changedContractFields(current?.snapshot?.contract ?? {}, candidate?.contract ?? {}).join(", ") || "digest changed"}`,
		);
	}
	if (action === "enable" && ["launchd", "systemd"].includes(String(contract?.adapter?.selected))) {
		lines.push("", "Catch-up warning: the native adapter may run one missed schedule immediately.");
	}
	if (action === "remove") lines.push("", "This removes the installed snapshot and all known host adapter artifacts.");
	const text = sanitizeDisplay(lines.join("\n"));
	if (text.length > DISPLAY_LIMIT) {
		throw new SchedulerCommandError(
			"The resolved contract is too large to display completely in a safe confirmation. Inspect it with scheduled-jobs --json and use the headless checkpoint flow instead.",
			"CONFIRMATION_TOO_LARGE",
		);
	}
	return text;
}

function operationArguments(job: JobView, action: SchedulerAction): string[] {
	const current = installation(job);
	const installedDigest = String(current?.metadata?.digest ?? "");
	const revision = String(current?.metadata?.revision ?? "");
	if (action === "install") {
		return ["install", job.id, "--manifest", job.manifestPath, "--expected-candidate-digest", String(job.inspection?.candidate?.digest ?? "")];
	}
	if (action === "update") {
		return [
			"update", job.id,
			"--manifest", job.manifestPath,
			"--expected-candidate-digest", String(job.inspection?.candidate?.digest ?? ""),
			"--expected-installed-digest", installedDigest,
			"--expected-revision", revision,
		];
	}
	return [action, job.id, "--expected-installed-digest", installedDigest, "--expected-revision", revision];
}

async function showText(ctx: UiContext, title: string, text: string): Promise<void> {
	await ctx.ui.select(`${title}\n\n${boundedDisplay(text)}`, ["Back"]);
}

function successMessage(job: JobView, action: SchedulerAction): string {
	if (action === "run") return `Completed ${sanitizeDisplay(job.id)}. Open recent logs for output.`;
	return `${ACTION_LABELS[action]} completed for ${sanitizeDisplay(job.id)}.`;
}

export function createSchedulerCommandHandler(dependencies: SchedulerDependencies) {
	return async (_args: string, ctx: UiContext): Promise<void> => {
		if (!ctx.hasUI) return;
		let redisplayId: string | undefined;
		for (;;) {
			let jobs: JobView[];
			try {
				jobs = await loadJobs(ctx.cwd, dependencies);
			} catch (error) {
				ctx.ui.notify(boundedDisplay(error instanceof Error ? error.message : error), "error");
				return;
			}
			if (jobs.length === 0) {
				ctx.ui.notify("No scheduler jobs are declared in the global or current-project manifest.", "info");
				return;
			}
			if (redisplayId) {
				const refreshed = jobs.find((job) => job.id === redisplayId);
				if (refreshed) await showText(ctx, "Scheduler state changed; refreshed details", inspectionText(refreshed));
				redisplayId = undefined;
			}
			const options = jobs.map(jobOption);
			const selected = await ctx.ui.select("Scheduler — choose a declared job", options);
			if (!selected) return;
			const selectedIndex = options.indexOf(selected);
			if (selectedIndex < 0) return;
			const job = jobs[selectedIndex];
			const actions = applicableActions(job);
			const actionOptions = actions.map((action) => ACTION_LABELS[action]);
			const selectedAction = await ctx.ui.select(`${sanitizeDisplay(job.id)}\n${jobStatus(job)}`, actionOptions);
			if (!selectedAction) continue;
			const action = actions[actionOptions.indexOf(selectedAction)];
			if (!action) continue;
			if (action === "inspect") {
				await showText(ctx, `Inspect ${sanitizeDisplay(job.id)}`, inspectionText(job));
				continue;
			}
			if (action === "logs") {
				try {
					const logs = await runCliJson(dependencies, ["logs", job.id, "--lines", "200"]);
					const result = logs.result ?? {};
					const body = `${sanitizeDisplay(result.logPath)}\n\n${result.content || "No log output."}${result.truncated ? "\n\nEarlier output was truncated by the CLI." : ""}`;
					await showText(ctx, `Recent logs · ${sanitizeDisplay(job.id)}`, body);
				} catch (error) {
					ctx.ui.notify(boundedDisplay(error instanceof Error ? error.message : error), "error");
				}
				continue;
			}
			let confirmation: string;
			try {
				confirmation = confirmationText(job, action);
			} catch (error) {
				ctx.ui.notify(boundedDisplay(error instanceof Error ? error.message : error), "error");
				continue;
			}
			const confirmed = await ctx.ui.confirm(`${ACTION_LABELS[action]}?`, confirmation);
			if (!confirmed) continue;
			try {
				await runCliJson(dependencies, operationArguments(job, action));
				ctx.ui.notify(successMessage(job, action), "info");
			} catch (error) {
				const failure = error instanceof SchedulerCommandError ? error : new SchedulerCommandError(String(error));
				if (failure.code === "STALE_STATE" || failure.code === "STALE_CANDIDATE") {
					ctx.ui.notify("Scheduler state changed before the operation; refreshed details will be shown.", "warning");
					redisplayId = job.id;
				} else ctx.ui.notify(boundedDisplay(failure.message), "error");
			}
		}
	};
}

export default function scheduledJobsExtension(pi: ExtensionAPI): void {
	const handler = createSchedulerCommandHandler({
		env: process.env,
		exists: existsSync,
		exec: (command, args, options) => pi.exec(command, args, options),
	});
	pi.registerCommand("scheduler", {
		description: "Inspect and operate reviewed global or current-project scheduled jobs",
		handler: (args, ctx) => handler(args, ctx as ExtensionCommandContext & UiContext),
	});
}
