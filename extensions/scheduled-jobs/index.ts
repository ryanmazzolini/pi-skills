import { existsSync, watch, type FSWatcher } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BorderedLoader, type ExtensionAPI, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { schedulerJobStatus } from "../../lib/scheduled-jobs/job-status.mjs";
import {
	ensureSchedulerAttentionDirectory,
	readSchedulerAttention,
	schedulerAttentionDirectory,
	schedulerAttentionPath,
} from "../../lib/scheduled-jobs/attention.mjs";
import {
	SchedulerPanelComponent,
	SchedulerTextComponent,
	schedulerAttention,
	type SchedulerDashboardData,
	type SchedulerDetailView,
	type SchedulerJobOverview,
	type SchedulerPanelResult,
	type SchedulerTextResult,
	type SchedulerTextView,
} from "./dashboard.ts";

export const CONFIG_DIRECTORY_NAME = ".pi";
export const PROJECT_MANIFEST_NAME = "scheduler.json";
export const USER_MANIFEST_DIRECTORY = "pi-scheduler";
export const USER_MANIFEST_NAME = "jobs.json";

const MODULE_CLI_PATH = fileURLToPath(new URL("../../bin/scheduled-jobs.mjs", import.meta.url));
const DISPLAY_LIMIT = 24_000;
const SCHEDULER_STATUS_ID = "scheduled-jobs";
const SCHEDULER_STATUS_DEBOUNCE_MS = 50;
const SCHEDULER_OVERLAY_OPTIONS = {
	overlay: true,
	overlayOptions: { anchor: "bottom-center", width: "100%", maxHeight: "100%", margin: 0 },
} as const;

export function resolveSchedulerCliPath(options: {
	argv?: string[];
	cwd?: string;
	exists?: (filePath: string) => boolean;
	moduleCliPath?: string;
} = {}): string {
	const argv = options.argv ?? process.argv;
	const cwd = options.cwd ?? process.cwd();
	const exists = options.exists ?? existsSync;
	for (let index = 0; index < argv.length; index++) {
		const argument = argv[index] ?? "";
		const explicit = argument === "--extension" || argument === "-e"
			? argv[index + 1]
			: argument.startsWith("--extension=")
				? argument.slice("--extension=".length)
				: undefined;
		if (!explicit) continue;
		const extensionPath = resolve(cwd, explicit);
		if (basename(extensionPath) !== "index.ts" && basename(extensionPath) !== "index.js") continue;
		if (basename(dirname(extensionPath)) !== "scheduled-jobs") continue;
		const candidate = resolve(dirname(extensionPath), "..", "..", "bin", "scheduled-jobs.mjs");
		if (exists(candidate)) return candidate;
	}
	return options.moduleCliPath ?? MODULE_CLI_PATH;
}

const CLI_PATH = resolveSchedulerCliPath();

type ScopeKind = "user" | "project";
type SchedulerAction = "inspect" | "logs" | "install" | "update" | "run" | "enable" | "disable" | "remove";

interface ExecResult {
	stdout: string;
	stderr: string;
	code: number | null;
	killed?: boolean;
}

interface UiContext {
	cwd: string;
	hasUI: boolean;
	mode: ExtensionCommandContext["mode"];
	ui: ExtensionCommandContext["ui"];
}

interface SchedulerDependencies {
	env: NodeJS.ProcessEnv;
	exists: (filePath: string) => boolean;
	exec: (command: string, args: string[], options?: { timeout?: number; signal?: AbortSignal }) => Promise<ExecResult>;
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
	declaration: { schedule?: unknown };
	inspection?: Record<string, any>;
	inspectionError?: SchedulerCommandError;
}

const ACTION_LABELS: Record<SchedulerAction, string> = {
	inspect: "Inspect",
	logs: "View recent logs",
	install: "Install disabled",
	update: "Update installed snapshot",
	run: "Run installed snapshot now",
	enable: "Resume schedule",
	disable: "Pause schedule",
	remove: "Remove installed schedule",
};

export function sanitizeDisplay(value: unknown): string {
	return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "�");
}

export function sanitizeMultiline(value: unknown): string {
	return String(value ?? "")
		.replace(/\r\n?/g, "\n")
		.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "�");
}

function boundedDisplay(value: unknown, limit = DISPLAY_LIMIT): string {
	const safe = sanitizeMultiline(value);
	return safe.length <= limit ? safe : `${safe.slice(0, limit)}\n… output truncated …`;
}

export function userManifestPath(env: NodeJS.ProcessEnv = process.env): string {
	const home = env.HOME || homedir();
	return join(resolve(env.XDG_CONFIG_HOME || join(home, ".config")), USER_MANIFEST_DIRECTORY, USER_MANIFEST_NAME);
}

async function projectManifestPath(
	cwd: string,
	dependencies: SchedulerDependencies,
	signal?: AbortSignal,
	requireExisting = true,
): Promise<string | undefined> {
	const result = await dependencies.exec("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { timeout: 5_000, signal });
	if (result.code !== 0) return undefined;
	const reported = result.stdout.trim();
	if (!reported) return undefined;
	const manifestPath = join(resolve(reported), CONFIG_DIRECTORY_NAME, PROJECT_MANIFEST_NAME);
	return !requireExisting || dependencies.exists(manifestPath) ? manifestPath : undefined;
}

export async function discoverManifestPaths(
	cwd: string,
	dependencies: SchedulerDependencies,
	options: { signal?: AbortSignal } = {},
): Promise<Array<{ scope: ScopeKind; manifestPath: string }>> {
	const manifests: Array<{ scope: ScopeKind; manifestPath: string }> = [];
	const user = userManifestPath(dependencies.env);
	if (dependencies.exists(user)) manifests.push({ scope: "user", manifestPath: user });
	const project = await projectManifestPath(cwd, dependencies, options.signal);
	if (project) manifests.push({ scope: "project", manifestPath: project });
	return manifests;
}

async function attentionManifestPaths(
	cwd: string,
	dependencies: SchedulerDependencies,
	signal?: AbortSignal,
): Promise<Array<{ scope: ScopeKind; manifestPath: string }>> {
	const manifests: Array<{ scope: ScopeKind; manifestPath: string }> = [
		{ scope: "user", manifestPath: userManifestPath(dependencies.env) },
	];
	const project = await projectManifestPath(cwd, dependencies, signal, false);
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
	options: { signal?: AbortSignal; timeout?: number } = {},
): Promise<Record<string, any>> {
	const result = await dependencies.exec(CLI_PATH, [...args, "--json"], { timeout: options.timeout ?? 120_000, signal: options.signal });
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

async function loadDashboardManifests(
	manifests: Array<{ scope: ScopeKind; manifestPath: string }>,
	dependencies: SchedulerDependencies,
	options: { signal?: AbortSignal } = {},
): Promise<SchedulerDashboardData> {
	const jobs: SchedulerJobOverview[] = [];
	const sourceErrors: SchedulerDashboardData["sourceErrors"] = [];
	let generatedAt = new Date().toISOString();
	for (const source of manifests) {
		try {
			const overview = await runCliJson(dependencies, [
				"overview",
				"--manifest",
				source.manifestPath,
				"--history-limit",
				"20",
			], { signal: options.signal });
			const result = overview.result ?? {};
			if (typeof result.generatedAt === "string") generatedAt = result.generatedAt;
			for (const value of result.jobs ?? []) {
				jobs.push({
					...value,
					scope: value.scope ?? { kind: source.scope },
					manifestPath: source.manifestPath,
				} as SchedulerJobOverview);
			}
		} catch (error) {
			if (options.signal?.aborted) throw error;
			const failure = error instanceof SchedulerCommandError ? error : new SchedulerCommandError(String(error));
			sourceErrors.push({
				scope: source.scope,
				manifestPath: source.manifestPath,
				error: { code: failure.code, message: sanitizeDisplay(failure.message) },
			});
		}
	}
	return { jobs, sourceErrors, generatedAt };
}

export async function loadDashboardData(
	cwd: string,
	dependencies: SchedulerDependencies,
	options: { signal?: AbortSignal } = {},
): Promise<SchedulerDashboardData> {
	const manifests = await discoverManifestPaths(cwd, dependencies, options);
	return loadDashboardManifests(manifests, dependencies, options);
}

interface SchedulerStatusMonitorOptions {
	debounceMs?: number;
	watch?: (
		path: string,
		options: { persistent: boolean },
		listener: (eventType: string, filename: string | Buffer | null) => void,
	) => FSWatcher;
	setTimeout?: (callback: () => void, milliseconds: number) => ReturnType<typeof setTimeout>;
	clearTimeout?: (timer: ReturnType<typeof setTimeout>) => void;
}

export function createSchedulerStatusMonitor(
	dependencies: SchedulerDependencies,
	options: SchedulerStatusMonitorOptions = {},
) {
	const debounceMs = options.debounceMs ?? SCHEDULER_STATUS_DEBOUNCE_MS;
	const watchDirectory = options.watch ?? watch;
	const scheduleTimeout = options.setTimeout ?? setTimeout;
	const clearScheduledTimeout = options.clearTimeout ?? clearTimeout;
	let context: UiContext | undefined;
	let watcher: FSWatcher | undefined;
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	let manifests: Array<{ scope: ScopeKind; manifestPath: string }> = [];
	let expectedNames = new Set<string>();
	let generation = 0;
	let startAbort: AbortController | undefined;
	let lastCount: number | undefined;

	const renderCount = (target: UiContext, count: number, force = false) => {
		if (!force && lastCount === count) return;
		lastCount = count;
		if (count < 1) {
			target.ui.setStatus(SCHEDULER_STATUS_ID, undefined);
			return;
		}
		const theme = target.ui.theme;
		const label = count === 1 ? "1 task needs review" : `${count} tasks need review`;
		target.ui.setStatus(SCHEDULER_STATUS_ID, theme.fg("error", `! Scheduler: ${label}`));
	};

	const closeWatcher = () => {
		const current = watcher;
		watcher = undefined;
		current?.close();
	};

	const setManifests = (sources: Array<{ scope: ScopeKind; manifestPath: string }>) => {
		manifests = sources;
		expectedNames = new Set(sources.map((source) => basename(schedulerAttentionPath(source.manifestPath, dependencies.env))));
	};

	const sync = (clearMissing = true) => {
		const target = context;
		if (!target || target.mode !== "tui") return;
		let count = 0;
		let observed = false;
		for (const source of manifests) {
			try {
				const value = readSchedulerAttention(source.manifestPath, dependencies.env);
				if (value !== undefined) {
					observed = true;
					count += value;
				}
			} catch {
				observed = true;
				// An invalid derived count contributes no attention.
			}
		}
		if (observed || clearMissing) renderCount(target, count);
	};

	const scheduleSync = (watchGeneration: number) => {
		if (debounceTimer) return;
		debounceTimer = scheduleTimeout(() => {
			debounceTimer = undefined;
			if (generation === watchGeneration) sync();
		}, debounceMs);
		debounceTimer.unref?.();
	};

	const mountWatcher = (watchGeneration: number) => {
		closeWatcher();
		try {
			ensureSchedulerAttentionDirectory(dependencies.env);
			const next = watchDirectory(
				schedulerAttentionDirectory(dependencies.env),
				{ persistent: false },
				(_eventType, filename) => {
					const reported = filename ? basename(filename.toString()) : undefined;
					const known = reported === undefined || expectedNames.has(reported)
						|| [...expectedNames].some((name) => reported.startsWith(`.${name}.`));
					if (known) scheduleSync(watchGeneration);
				},
			);
			watcher = next;
			next.on("error", () => {
				if (watcher === next) closeWatcher();
			});
		} catch {
			closeWatcher();
		}
	};

	const stop = async () => {
		generation++;
		startAbort?.abort();
		startAbort = undefined;
		if (debounceTimer) clearScheduledTimeout(debounceTimer);
		debounceTimer = undefined;
		closeWatcher();
		manifests = [];
		expectedNames.clear();
		if (context?.mode === "tui") context.ui.setStatus(SCHEDULER_STATUS_ID, undefined);
		context = undefined;
		lastCount = undefined;
	};

	const start = async (nextContext: UiContext) => {
		await stop();
		if (nextContext.mode !== "tui") return;
		context = nextContext;
		renderCount(nextContext, 0, true);
		const startGeneration = generation;
		const abort = new AbortController();
		startAbort = abort;
		try {
			const sources = await attentionManifestPaths(nextContext.cwd, dependencies, abort.signal);
			if (abort.signal.aborted || generation !== startGeneration || context?.cwd !== nextContext.cwd) return;
			setManifests(sources);
			mountWatcher(startGeneration);
			const data = await loadDashboardData(nextContext.cwd, dependencies, { signal: abort.signal });
			if (abort.signal.aborted || generation !== startGeneration || context?.cwd !== nextContext.cwd) return;
			renderCount(nextContext, data.jobs.filter((job) => schedulerJobStatus(job) === "needs-attention").length);
			sync(false);
		} catch {
			if (!abort.signal.aborted && generation === startGeneration) sync();
		} finally {
			if (startAbort === abort) startAbort = undefined;
		}
	};

	const updateContext = async (nextContext: UiContext) => {
		if (nextContext.mode !== "tui") {
			await stop();
			return;
		}
		if (!context || context.cwd !== nextContext.cwd) {
			await start(nextContext);
			return;
		}
		context = nextContext;
		if (!watcher) mountWatcher(generation);
		sync();
	};

	const reconcile = async (nextContext: UiContext) => {
		await updateContext(nextContext);
	};

	return { start, updateContext, reconcile, sync, stop };
}

async function loadJob(job: SchedulerJobOverview, dependencies: SchedulerDependencies, signal?: AbortSignal): Promise<JobView> {
	const view: JobView = {
		id: job.id,
		key: job.key,
		scope: job.scope.kind,
		manifestPath: job.manifestPath,
		declaration: job,
	};
	try {
		view.inspection = await runCliJson(dependencies, ["inspect", view.id, "--manifest", view.manifestPath], { signal });
	} catch (error) {
		if (signal?.aborted) throw error;
		view.inspectionError = error instanceof SchedulerCommandError
			? error
			: new SchedulerCommandError(String(error));
	}
	return view;
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
		if (current.health === "unhealthy" && current.healthCategory === "commands" && current.metadata?.enabled === false && current.definitionDrift) actions.push("update");
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

function shellQuote(value: unknown): string {
	return `'${sanitizeDisplay(value).replace(/'/g, `'\\''`)}'`;
}

export function schedulerDoctorCommand(
	overview: SchedulerJobOverview,
	cliPath = CLI_PATH,
): string {
	return `${shellQuote(cliPath)} doctor ${shellQuote(overview.id)} --manifest ${shellQuote(overview.manifestPath)} --json`;
}

function boundedPromptField(value: unknown, limit: number): string {
	const safe = sanitizeDisplay(value);
	return safe.length <= limit ? safe : `${safe.slice(0, limit)}…`;
}

export function schedulerInvestigationPrompt(
	overview: SchedulerJobOverview,
	cliPath = CLI_PATH,
): string {
	const attention = schedulerAttention(overview);
	const scope = overview.scope.kind === "user" ? "User" : "Project";
	const cause = boundedPromptField(attention.cause, 200);
	const detail = attention.detail ? ` · ${boundedPromptField(attention.detail, 600)}` : "";
	return boundedDisplay([
		`Diagnose the scheduled task “${boundedPromptField(overview.key, 300)}”.`,
		"This is a read-only diagnosis. Do not change files or scheduler state until I approve the exact action.",
		`Task ID: ${boundedPromptField(overview.id, 500)}`,
		`Scope: ${scope}`,
		`Detected issue: ${cause}${detail}`,
		`Current installed state: ${overview.installation.installed ? `${boundedPromptField(overview.installation.health, 100)} and ${overview.installation.enabled ? "active" : "paused"}` : "not installed"}`,
		`Read-only diagnosis: ${boundedPromptField(schedulerDoctorCommand(overview, cliPath), 1_500)}`,
		"Explain the cause and recommend the smallest safe fix.",
	].join("\n"), 4_096);
}

export function actionReviewText(job: JobView, action: SchedulerAction): string {
	const candidate = job.inspection?.candidate;
	const current = installation(job);
	const usesCandidate = action === "install" || action === "update";
	const contract = usesCandidate ? candidate?.contract : current?.snapshot?.contract;
	const digest = usesCandidate ? candidate?.digest : current?.metadata?.digest;
	const revision = current?.metadata?.revision;
	let lines: string[];
	if (action === "enable" || action === "disable") {
		const adapter = sanitizeDisplay(contract?.adapter?.selected);
		lines = [
			action === "enable" ? "Scheduled runs will resume." : "Scheduled runs will pause.",
			`${sanitizeDisplay(contract?.schedule)} · ${adapter}`,
		];
		if (action === "enable" && ["launchd", "systemd"].includes(String(contract?.adapter?.selected))) {
			lines.push("A missed run may start immediately.");
		} else if (action === "enable" && contract?.adapter?.warning) {
			lines.push(String(contract.adapter.warning).includes("does not provide catch-up")
				? "No catch-up after downtime."
				: "Adapter warning applies; review Definition before resuming.");
		}
	} else if (action === "remove") {
		lines = [
			`Remove the installed ${sanitizeDisplay(contract?.adapter?.selected)} schedule and snapshot.`,
			"The declaration stays available as a draft.",
		];
	} else {
		lines = [
			`${ACTION_LABELS[action]} will ${action === "run" ? "execute the installed code" : "create or replace reviewed scheduler state"}.`,
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
	}
	const text = sanitizeMultiline(lines.join("\n"));
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

type LoaderOutcome<T> =
	| { status: "completed"; value: T }
	| { status: "cancelled" }
	| { status: "failed"; error: unknown };

async function withLoader<T>(
	ctx: UiContext,
	label: string,
	operation: (signal: AbortSignal) => Promise<T>,
): Promise<{ completed: true; value: T } | { completed: false }> {
	const outcome = await ctx.ui.custom<LoaderOutcome<T>>((tui, theme, _keybindings, done) => {
		const loader = new BorderedLoader(tui, theme, label);
		let settled = false;
		const finish = (result: LoaderOutcome<T>) => {
			if (settled) return;
			settled = true;
			done(result);
		};
		loader.onAbort = () => finish({ status: "cancelled" });
		void operation(loader.signal).then(
			(value) => finish({ status: "completed", value }),
			(error) => finish(loader.signal.aborted ? { status: "cancelled" } : { status: "failed", error }),
		);
		return loader;
	});
	if (outcome.status === "failed") throw outcome.error;
	return outcome.status === "completed"
		? { completed: true, value: outcome.value }
		: { completed: false };
}

async function showSchedulerPanel(
	ctx: UiContext,
	dependencies: SchedulerDependencies,
): Promise<SchedulerPanelResult> {
	let setPanelHidden: ((hidden: boolean) => void) | undefined;
	return ctx.ui.custom<SchedulerPanelResult>((tui, theme, _keybindings, done) => new SchedulerPanelComponent(
		undefined,
		tui,
		theme,
		{
			loadDashboard: (signal) => loadDashboardData(ctx.cwd, dependencies, { signal }),
			loadDetail: (id, signal) => loadDetailView(ctx.cwd, id, dependencies, signal),
			loadOutput: (id, runId, signal) => loadRunOutput(dependencies, id, runId, signal),
			runAction: async (id) => {
				setPanelHidden?.(true);
				try {
					await runAction(ctx, dependencies, id);
				} finally {
					setPanelHidden?.(false);
				}
			},
			investigationPrompt: (job) => schedulerInvestigationPrompt(job),
		},
		done,
	), {
		...SCHEDULER_OVERLAY_OPTIONS,
		onHandle: (handle) => {
			setPanelHidden = (hidden) => handle.setHidden(hidden);
		},
	});
}

async function showText(ctx: UiContext, snapshot: SchedulerTextView): Promise<SchedulerTextResult> {
	return ctx.ui.custom<SchedulerTextResult>((tui, theme, _keybindings, done) => new SchedulerTextComponent(
		snapshot.title,
		snapshot.text,
		tui,
		theme,
		done,
	), SCHEDULER_OVERLAY_OPTIONS);
}

async function loadRunOutput(
	dependencies: SchedulerDependencies,
	id: string,
	runId: string,
	signal?: AbortSignal,
): Promise<SchedulerTextView> {
	const response = await runCliJson(dependencies, ["run-log", id, runId, "--lines", "500"], { signal });
	const result = response.result ?? {};
	const run = result.run ?? {};
	const status = sanitizeDisplay(run.status ?? "run");
	return {
		title: `${sanitizeDisplay(id)} · ${status} · ${sanitizeDisplay(run.startedAt ?? runId)}`,
		text: `${sanitizeDisplay(result.logPath)}\n\n${boundedDisplay(result.content || "No output recorded for this run.")}${result.truncation === "later" ? "\n\nLater output was truncated by the CLI." : result.truncated ? "\n\nEarlier output was truncated by the CLI." : ""}`,
	};
}

async function loadSelectedTask(
	cwd: string,
	id: string,
	dependencies: SchedulerDependencies,
	signal?: AbortSignal,
): Promise<{ dashboard: SchedulerDashboardData; overview: SchedulerJobOverview; job: JobView } | undefined> {
	const dashboard = await loadDashboardData(cwd, dependencies, { signal });
	const overview = dashboard.jobs.find((job) => job.id === id);
	if (!overview) return undefined;
	return { dashboard, overview, job: await loadJob(overview, dependencies, signal) };
}

async function loadDetailView(
	cwd: string,
	id: string,
	dependencies: SchedulerDependencies,
	signal: AbortSignal,
): Promise<SchedulerDetailView | undefined> {
	const loaded = await loadSelectedTask(cwd, id, dependencies, signal);
	if (!loaded) return undefined;
	return {
		dashboard: loaded.dashboard,
		overview: loaded.overview,
		definition: inspectionText(loaded.job),
		doctorCommand: schedulerDoctorCommand(loaded.overview),
	};
}

function successMessage(job: JobView, action: SchedulerAction): string {
	if (action === "run") return `Completed ${sanitizeDisplay(job.id)}. Open Runs to inspect its receipt and output.`;
	if (action === "enable") return "Scheduled runs resumed.";
	if (action === "disable") return "Scheduled runs paused.";
	if (action === "remove") return "Installed schedule removed. The declaration remains a draft.";
	return `${ACTION_LABELS[action]} completed for ${sanitizeDisplay(job.id)}.`;
}

async function showReloadableText(
	ctx: UiContext,
	label: string,
	load: (signal: AbortSignal) => Promise<SchedulerTextView>,
): Promise<void> {
	for (;;) {
		const loaded = await withLoader(ctx, label, load);
		if (!loaded.completed) return;
		if (await showText(ctx, loaded.value) === "back") return;
	}
}

async function runAction(
	ctx: UiContext,
	dependencies: SchedulerDependencies,
	id: string,
): Promise<void> {
	const loaded = await withLoader(ctx, "Loading current scheduler state…", (signal) => loadSelectedTask(ctx.cwd, id, dependencies, signal));
	if (!loaded.completed) return;
	if (!loaded.value) {
		ctx.ui.notify("The selected scheduler task changed or disappeared.", "warning");
		return;
	}
	const { job } = loaded.value;
	const actions = applicableActions(job);
	const labels = actions.map((action) => ACTION_LABELS[action]);
	const selected = await ctx.ui.select(`${sanitizeDisplay(job.id)}\n${jobStatus(job)}`, labels);
	if (!selected) return;
	const action = actions[labels.indexOf(selected)];
	if (!action) return;
	if (action === "inspect") {
		await showReloadableText(ctx, "Loading current definition…", async (signal) => {
			const current = await loadSelectedTask(ctx.cwd, id, dependencies, signal);
			if (!current) throw new SchedulerCommandError("The selected scheduler task changed or disappeared.", "STALE_STATE");
			return { title: `Definition · ${sanitizeDisplay(id)}`, text: inspectionText(current.job) };
		});
		return;
	}
	if (action === "logs") {
		await showReloadableText(ctx, "Loading recent output…", async (signal) => {
			const logs = await runCliJson(dependencies, ["logs", job.id, "--lines", "200"], { signal });
			const result = logs.result ?? {};
			return {
				title: `Recent output · ${sanitizeDisplay(job.id)}`,
				text: `${sanitizeDisplay(result.logPath)}\n\n${boundedDisplay(result.content || "No log output.")}${result.truncated ? "\n\nEarlier output was truncated by the CLI." : ""}`,
			};
		});
		return;
	}
	let review: string;
	try {
		review = actionReviewText(job, action);
	} catch (error) {
		ctx.ui.notify(boundedDisplay(error instanceof Error ? error.message : error), "error");
		return;
	}
	if (!await ctx.ui.confirm(`${ACTION_LABELS[action]}?`, review)) return;
	try {
		const outcome = await withLoader(ctx, `${ACTION_LABELS[action]}…`, (signal) => runCliJson(dependencies, operationArguments(job, action), { signal }));
		if (!outcome.completed) {
			ctx.ui.notify("Cancellation requested. Scheduler state may have changed; refresh before another action.", "warning");
			return;
		}
		ctx.ui.notify(successMessage(job, action), "info");
	} catch (error) {
		const failure = error instanceof SchedulerCommandError ? error : new SchedulerCommandError(String(error));
		ctx.ui.notify(
			failure.code === "STALE_STATE" || failure.code === "STALE_CANDIDATE"
				? "Scheduler state changed. Refresh and review the task before trying again."
				: boundedDisplay(failure.message),
			"error",
		);
	}
}

export function createSchedulerCommandHandler(
	dependencies: SchedulerDependencies,
	sendUserMessage: (prompt: string) => void = () => {},
) {
	return async (_args: string, ctx: UiContext): Promise<void> => {
		if (!ctx.hasUI) return;
		if (ctx.mode !== "tui") {
			ctx.ui.notify("/scheduler requires Pi's interactive TUI.", "error");
			return;
		}
		try {
			const result = await showSchedulerPanel(ctx, dependencies);
			if (result.kind === "ask-pi") sendUserMessage(result.prompt);
		} catch (error) {
			ctx.ui.notify(boundedDisplay(error instanceof Error ? error.message : error), "error");
		}
	};
}

export default function scheduledJobsExtension(pi: ExtensionAPI): void {
	const dependencies: SchedulerDependencies = {
		env: process.env,
		exists: existsSync,
		exec: (command, args, options) => pi.exec(command, args, options),
	};
	const handler = createSchedulerCommandHandler(dependencies, (prompt) => pi.sendUserMessage(prompt));
	const statusMonitor = createSchedulerStatusMonitor(dependencies);

	pi.on("session_start", (_event, ctx) => statusMonitor.start(ctx as ExtensionCommandContext & UiContext));
	pi.on("input", (_event, ctx) => statusMonitor.updateContext(ctx as ExtensionCommandContext & UiContext));
	pi.on("session_shutdown", () => statusMonitor.stop());

	pi.registerCommand("scheduler", {
		description: "Inspect and operate reviewed user or current-project scheduled jobs",
		handler: async (args, ctx) => {
			const target = ctx as ExtensionCommandContext & UiContext;
			await statusMonitor.updateContext(target);
			try {
				await handler(args, target);
			} finally {
				await statusMonitor.reconcile(target);
			}
		},
	});
}
