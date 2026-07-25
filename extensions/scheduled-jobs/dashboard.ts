import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { Box, matchesKey, Text, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

export interface SchedulerFailureView {
	code: string;
	message: string;
}

export interface SchedulerRunView {
	runId: string;
	trigger: "manual" | "scheduled";
	scheduledFor: string | null;
	startedAt: string;
	finishedAt: string | null;
	durationMilliseconds: number | null;
	status: "running" | "succeeded" | "failed" | "timed-out" | "skipped" | "interrupted";
	exitCode: number | null;
	signal: string | null;
	timedOut: boolean;
	reason: string | null;
	digest: string;
	revision: number;
}

export interface SchedulerJobOverview {
	id: string;
	key: string;
	scope: { kind: "global" | "project" };
	description: string;
	schedule: string;
	sourcePath: string;
	manifestPath: string;
	candidate: {
		digest: string;
		adapter: { mode: string; selected: string; warning: string | null };
		workingDirectory: string;
		timeoutSeconds: number;
	} | null;
	candidateError: SchedulerFailureView | null;
	installation: {
		installed: boolean;
		health: string;
		healthReason?: string | null;
		healthCategory?: string | null;
		enabled?: boolean;
		digest?: string | null;
		revision?: number | null;
		schedule?: string | null;
		workingDirectory?: string | null;
		definitionDrift?: boolean;
		adapterDrift?: boolean;
	};
	installationError: SchedulerFailureView | null;
	nextRun: string | null;
	nextRunError: SchedulerFailureView | null;
	recentRuns: SchedulerRunView[];
	historyError: SchedulerFailureView | null;
}

export interface SchedulerSourceError {
	scope: "global" | "project";
	manifestPath: string;
	error: SchedulerFailureView;
}

export interface SchedulerDashboardData {
	jobs: SchedulerJobOverview[];
	sourceErrors: SchedulerSourceError[];
	generatedAt: string;
}

export type SchedulerDashboardResult =
	| { kind: "close" }
	| { kind: "refresh" }
	| { kind: "job"; id: string }
	| { kind: "run"; id: string; runId: string };

export type SchedulerDetailResult =
	| { kind: "back" }
	| { kind: "actions" }
	| { kind: "run"; id: string; runId: string };

type TuiView = Pick<TUI, "requestRender"> & { terminal?: { rows: number } };
type DashboardTab = "tasks" | "runs";
type DetailTab = "overview" | "runs" | "definition";

function padAnsi(value: string, width: number): string {
	const truncated = truncateToWidth(value, Math.max(1, width), "");
	return truncated + " ".repeat(Math.max(0, width - visibleWidth(truncated)));
}

function opaque(lines: string[], width: number, theme: Theme): string[] {
	const box = new Box(0, 0, (text) => theme.bg("toolPendingBg", text));
	box.addChild(new Text(lines.map((line) => padAnsi(line, width)).join("\n"), 0, 0));
	return box.render(width);
}

function framed(lines: string[], width: number, theme: Theme): string[] {
	const safeWidth = Math.max(1, width);
	if (safeWidth < 3) return opaque(lines.map((line) => truncateToWidth(line, safeWidth, "")), safeWidth, theme);
	const innerWidth = safeWidth - 2;
	const border = (value: string) => theme.fg("borderMuted", value);
	return opaque([
		border(`╭${"─".repeat(innerWidth)}╮`),
		...lines.map((line) => `${border("│")}${padAnsi(line, innerWidth)}${border("│")}`),
		border(`╰${"─".repeat(innerWidth)}╯`),
	], safeWidth, theme);
}

function dayDifference(left: Date, right: Date): number {
	const leftDay = new Date(left.getFullYear(), left.getMonth(), left.getDate(), 12).getTime();
	const rightDay = new Date(right.getFullYear(), right.getMonth(), right.getDate(), 12).getTime();
	return Math.round((leftDay - rightDay) / 86_400_000);
}

function clockTime(date: Date): string {
	return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function formatSchedulerTime(value: string | null, now = new Date()): string {
	if (!value) return "—";
	const date = new Date(value);
	if (!Number.isFinite(date.getTime())) return "unknown";
	const difference = dayDifference(date, now);
	if (difference === 0) return `Today ${clockTime(date)}`;
	if (difference === 1) return `Tomorrow ${clockTime(date)}`;
	if (difference === -1) return `Yesterday ${clockTime(date)}`;
	return `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${clockTime(date)}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function weekdayLabel(field: string): string | undefined {
	if (field === "*") return "Daily";
	if (field === "1-5") return "Weekdays";
	if (/^[0-7]$/.test(field)) {
		const day = Number(field) === 7 ? 0 : Number(field);
		return `${WEEKDAYS[day]}s`;
	}
	if (field.split(",").every((part) => /^[0-7]$/.test(part))) {
		return field.split(",").map((part) => WEEKDAYS[Number(part) === 7 ? 0 : Number(part)]).join(", ");
	}
	return undefined;
}

export function humanizeSchedule(schedule: string): string {
	const [minute, hour, dayOfMonth, month, dayOfWeek] = schedule.trim().split(/\s+/);
	const days = dayOfMonth === "*" && month === "*" && dayOfWeek ? weekdayLabel(dayOfWeek) : undefined;
	if (days && /^\d+$/.test(minute ?? "") && /^\d+$/.test(hour ?? "")) {
		return `${days} at ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} local time`;
	}
	return `${schedule} · local time`;
}

function effectiveSchedule(job: SchedulerJobOverview): string {
	return job.installation.installed && job.installation.schedule ? job.installation.schedule : job.schedule;
}

function effectiveWorkingDirectory(job: SchedulerJobOverview): string {
	return job.installation.installed && job.installation.workingDirectory
		? job.installation.workingDirectory
		: job.candidate?.workingDirectory ?? job.sourcePath;
}

export function schedulerJobState(job: SchedulerJobOverview): { label: string; icon: string; color: "success" | "warning" | "error" | "muted" | "accent" } {
	const latest = job.recentRuns[0];
	if (latest?.status === "running") return { label: "Running", icon: "↻", color: "accent" };
	if (latest && ["failed", "timed-out", "interrupted"].includes(latest.status)) {
		return { label: "Needs attention", icon: "!", color: "error" };
	}
	if (
		job.candidateError
		|| job.installationError
		|| job.historyError
		|| job.nextRunError
		|| job.installation.health !== "ok" && job.installation.installed
		|| job.installation.adapterDrift
	) return { label: "Needs attention", icon: "!", color: "error" };
	if (!job.installation.installed) return { label: "Draft", icon: "◇", color: "muted" };
	const changed = job.installation.definitionDrift ? " · Update available" : "";
	return job.installation.enabled
		? { label: `Active${changed}`, icon: "●", color: job.installation.definitionDrift ? "warning" : "success" }
		: { label: `Paused${changed}`, icon: "○", color: job.installation.definitionDrift ? "warning" : "muted" };
}

function runState(run: SchedulerRunView): { label: string; icon: string; color: "success" | "warning" | "error" | "muted" | "accent" } {
	if (run.status === "running") return { label: "Running", icon: "↻", color: "accent" };
	if (run.status === "succeeded") return { label: "Completed", icon: "✓", color: "success" };
	if (run.status === "skipped") return { label: "Skipped", icon: "–", color: "warning" };
	if (run.status === "interrupted") return { label: "Interrupted", icon: "!", color: "error" };
	if (run.status === "timed-out") return { label: "Timed out", icon: "!", color: "error" };
	return { label: "Failed", icon: "✕", color: "error" };
}

function duration(value: number | null): string {
	if (value === null) return "—";
	if (value < 1_000) return `${value}ms`;
	if (value < 60_000) return `${Math.round(value / 1_000)}s`;
	return `${Math.floor(value / 60_000)}m ${Math.round((value % 60_000) / 1_000)}s`;
}

function allRuns(data: SchedulerDashboardData): Array<{ job: SchedulerJobOverview; run: SchedulerRunView }> {
	return data.jobs.flatMap((job) => job.recentRuns.map((run) => ({ job, run }))).sort((left, right) => {
		const time = Date.parse(right.run.startedAt) - Date.parse(left.run.startedAt);
		return time || right.run.runId.localeCompare(left.run.runId);
	});
}

type TaskSection = "attention" | "active" | "paused" | "draft";

interface SchedulerDisplayLine {
	text: string;
	taskIndex?: number;
	runIndex?: number;
}

const TASK_SECTIONS: Array<{ section: TaskSection; label: string }> = [
	{ section: "attention", label: "NEEDS ATTENTION" },
	{ section: "active", label: "ACTIVE" },
	{ section: "paused", label: "PAUSED" },
	{ section: "draft", label: "DRAFTS" },
];

function taskSection(job: SchedulerJobOverview): TaskSection {
	const state = schedulerJobState(job).label;
	if (state === "Needs attention") return "attention";
	if (state === "Draft") return "draft";
	if (state.startsWith("Paused")) return "paused";
	return "active";
}

function hasRunningRuns(data: SchedulerDashboardData): boolean {
	return data.jobs.some((job) => job.recentRuns.some((run) => run.status === "running"));
}

export class SchedulerDashboardComponent implements Component {
	private tab: DashboardTab = "tasks";
	private selectedTask = 0;
	private selectedRun = 0;
	private data: SchedulerDashboardData;
	private readonly tui: TuiView;
	private readonly theme: Theme;
	private readonly done: (result: SchedulerDashboardResult) => void;
	private now: Date;
	private readonly reload?: (signal: AbortSignal) => Promise<SchedulerDashboardData>;
	private refreshTimer?: ReturnType<typeof setInterval>;
	private refreshAbort?: AbortController;
	private refreshing = false;
	private refreshFailure: string | undefined;
	private disposed = false;

	constructor(
		data: SchedulerDashboardData,
		tui: TuiView,
		theme: Theme,
		done: (result: SchedulerDashboardResult) => void,
		now = new Date(),
		reload?: (signal: AbortSignal) => Promise<SchedulerDashboardData>,
	) {
		this.data = data;
		this.tui = tui;
		this.theme = theme;
		this.done = done;
		this.now = now;
		this.reload = reload;
		this.syncPolling();
	}

	handleInput(data: string): void {
		if (matchesKey(data, "ctrl+c") || matchesKey(data, "escape") || data === "q") {
			this.done({ kind: "close" });
			return;
		}
		if (matchesKey(data, "tab") || data === "\t") {
			this.tab = this.tab === "tasks" ? "runs" : "tasks";
			this.tui.requestRender();
			return;
		}
		if (data === "r" || data === "R") {
			if (this.reload) void this.refreshData();
			else this.done({ kind: "refresh" });
			return;
		}
		const count = this.tab === "tasks" ? this.data.jobs.length : allRuns(this.data).length;
		const selected = this.tab === "tasks" ? this.selectedTask : this.selectedRun;
		if ((matchesKey(data, "up") || data === "k") && selected > 0) {
			if (this.tab === "tasks") this.selectedTask--;
			else this.selectedRun--;
			this.tui.requestRender();
			return;
		}
		if ((matchesKey(data, "down") || data === "j") && selected < count - 1) {
			if (this.tab === "tasks") this.selectedTask++;
			else this.selectedRun++;
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, "return") || matchesKey(data, "right")) {
			if (this.tab === "tasks") {
				const job = this.data.jobs[this.selectedTask];
				if (job) this.done({ kind: "job", id: job.id });
			} else {
				const selectedRun = allRuns(this.data)[this.selectedRun];
				if (selectedRun) this.done({ kind: "run", id: selectedRun.job.id, runId: selectedRun.run.runId });
			}
		}
	}

	render(width: number): string[] {
		const safeWidth = Math.max(1, width);
		const innerWidth = Math.max(1, safeWidth - 2);
		const states = this.data.jobs.map(schedulerJobState);
		const active = states.filter((state) => state.label.startsWith("Active") || state.label === "Running").length;
		const paused = states.filter((state) => state.label.startsWith("Paused")).length;
		const issues = states.filter((state) => state.label === "Needs attention").length + this.data.sourceErrors.length;
		const selectedTab = this.theme.fg("accent", this.tab === "tasks" ? "[Tasks]" : "[Runs]");
		const otherTab = this.theme.fg("dim", this.tab === "tasks" ? "Runs" : "Tasks");
		const tabs = this.tab === "tasks" ? `${selectedTab}  ${otherTab}` : `${otherTab}  ${selectedTab}`;
		const counts = [
			`${this.data.jobs.length} task${this.data.jobs.length === 1 ? "" : "s"}`,
			...(active ? [`${active} active`] : []),
			...(paused ? [`${paused} paused`] : []),
			...(issues ? [`${issues} need${issues === 1 ? "s" : ""} attention`] : []),
		].join(" · ");
		const refreshState = this.refreshing ? ` ${this.theme.fg("warning", "↻ refreshing")}` : "";
		const lines = [
			truncateToWidth(`${this.theme.bold("Scheduler")} ${this.theme.fg("dim", "· ")}${tabs} ${this.theme.fg("dim", `· ${counts}`)}${refreshState}`, innerWidth, ""),
			this.theme.fg("borderMuted", "─".repeat(innerWidth)),
		];
		if (this.refreshFailure) {
			lines.push(truncateToWidth(`${this.theme.fg("error", "!")} Refresh failed · ${this.theme.fg("error", this.refreshFailure)}`, innerWidth, ""));
			lines.push(`  Press ${this.theme.fg("accent", "r")} to retry; the previous snapshot is still shown.`);
		}
		if (this.data.sourceErrors.length > 0) {
			lines.push(this.theme.bold("SOURCE ERRORS"));
			for (const sourceError of this.data.sourceErrors.slice(0, 2)) {
				lines.push(truncateToWidth(`${this.theme.fg("error", "!")} ${sourceError.scope === "global" ? "Global" : "Project"} tasks · ${this.theme.fg("error", sourceError.error.message)}`, innerWidth, ""));
				lines.push(truncateToWidth(this.theme.fg("dim", `  ${sourceError.manifestPath}`), innerWidth, ""));
			}
			if (this.data.jobs.length > 0) lines.push("");
		}
		const bodyHeight = this.bodyHeight(lines.length);
		const body = this.tab === "tasks" ? this.taskLines(innerWidth, bodyHeight) : this.runLines(innerWidth, bodyHeight);
		lines.push(...body, ...Array.from({ length: Math.max(0, bodyHeight - body.length) }, () => ""));
		const footer = [
			`${this.theme.fg("accent", "↑/↓ j/k")} ${this.theme.fg("dim", "select")}`,
			`${this.theme.fg("accent", "Enter")} ${this.theme.fg("dim", this.tab === "tasks" ? "details" : "output")}`,
			`${this.theme.fg("accent", "Tab")} ${this.theme.fg("dim", this.tab === "tasks" ? "runs" : "tasks")}`,
			`${this.theme.fg("accent", "r")} ${this.theme.fg("dim", "refresh")}`,
			`${this.theme.fg("accent", "q/Esc")} ${this.theme.fg("dim", "close")}`,
		].join(this.theme.fg("dim", " · "));
		lines.push(truncateToWidth(footer, innerWidth, ""));
		return framed(lines, safeWidth, this.theme);
	}

	invalidate(): void {}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		if (this.refreshTimer) clearInterval(this.refreshTimer);
		this.refreshTimer = undefined;
		this.refreshAbort?.abort();
		this.refreshAbort = undefined;
	}

	async refreshData(): Promise<void> {
		if (!this.reload || this.refreshing || this.disposed) return;
		this.refreshing = true;
		const abort = new AbortController();
		this.refreshAbort = abort;
		this.tui.requestRender();
		const selectedTaskId = this.data.jobs[this.selectedTask]?.id;
		const selectedRunId = allRuns(this.data)[this.selectedRun]?.run.runId;
		try {
			const next = await this.reload(abort.signal);
			if (this.disposed) return;
			this.data = next;
			this.now = new Date(next.generatedAt);
			this.refreshFailure = undefined;
			if (selectedTaskId) {
				const taskIndex = next.jobs.findIndex((job) => job.id === selectedTaskId);
				this.selectedTask = taskIndex >= 0 ? taskIndex : Math.min(this.selectedTask, Math.max(0, next.jobs.length - 1));
			}
			if (selectedRunId) {
				const runs = allRuns(next);
				const runIndex = runs.findIndex(({ run }) => run.runId === selectedRunId);
				this.selectedRun = runIndex >= 0 ? runIndex : Math.min(this.selectedRun, Math.max(0, runs.length - 1));
			}
			this.syncPolling();
		} catch (error) {
			if (!this.disposed && !abort.signal.aborted) this.refreshFailure = error instanceof Error ? error.message : String(error);
		} finally {
			if (this.refreshAbort === abort) this.refreshAbort = undefined;
			this.refreshing = false;
			if (!this.disposed) this.tui.requestRender();
		}
	}

	private syncPolling(): void {
		const shouldPoll = Boolean(this.reload) && hasRunningRuns(this.data) && !this.disposed;
		if (shouldPoll && !this.refreshTimer) {
			this.refreshTimer = setInterval(() => void this.refreshData(), 1_000);
			this.refreshTimer.unref?.();
		} else if (!shouldPoll && this.refreshTimer) {
			clearInterval(this.refreshTimer);
			this.refreshTimer = undefined;
		}
	}

	private taskLines(width: number, height: number): string[] {
		if (this.data.jobs.length === 0) {
			return this.data.sourceErrors.length > 0
				? [`No tasks loaded. Fix the source above, then press ${this.theme.fg("accent", "r")} to retry.`]
				: ["No scheduler tasks declared. Use /skill:scheduled-jobs to create one."];
		}
		this.selectedTask = Math.min(this.selectedTask, this.data.jobs.length - 1);
		const display = this.taskDisplayLines(width);
		const selectedLine = Math.max(0, display.findIndex((line) => line.taskIndex === this.selectedTask));
		const start = Math.min(Math.max(0, selectedLine - Math.floor(height / 2)), Math.max(0, display.length - height));
		return display.slice(start, start + height).map(({ text }) => text);
	}

	private taskDisplayLines(width: number): SchedulerDisplayLine[] {
		const lines: SchedulerDisplayLine[] = [];
		for (const { section, label } of TASK_SECTIONS) {
			const jobs = this.data.jobs.map((job, taskIndex) => ({ job, taskIndex })).filter(({ job }) => taskSection(job) === section);
			if (jobs.length === 0) continue;
			if (lines.length > 0) lines.push({ text: "" });
			lines.push({ text: this.theme.bold(label) });
			for (const { job, taskIndex } of jobs) {
				lines.push({ text: this.taskLine(job, taskIndex === this.selectedTask, width), taskIndex });
			}
		}
		return lines;
	}

	private taskLine(job: SchedulerJobOverview, selected: boolean, width: number): string {
		const state = schedulerJobState(job);
		const marker = selected ? this.theme.fg("accent", "›") : " ";
		const label = selected ? this.theme.fg("accent", job.key) : job.key;
		const next = job.nextRun ? `next ${formatSchedulerTime(job.nextRun, this.now)}` : state.label.startsWith("Paused") ? "schedule paused" : state.label === "Draft" ? "not installed" : "next run unavailable";
		const latest = job.recentRuns[0];
		const last = latest ? `last ${runState(latest).label.toLowerCase()} ${formatSchedulerTime(latest.startedAt, this.now)}` : "no recorded runs";
		return truncateToWidth(`${marker} ${this.theme.fg(state.color, state.icon)} ${label} ${this.theme.fg("dim", `· ${job.scope.kind} ·`)} ${this.theme.fg(state.color, state.label)} · ${humanizeSchedule(effectiveSchedule(job))} ${this.theme.fg("dim", `· ${next} · ${last}`)}`, width, "");
	}

	private runLines(width: number, height: number): string[] {
		const runs = allRuns(this.data);
		if (runs.length === 0) return ["No recorded scheduler runs yet. New runs will appear here."];
		this.selectedRun = Math.min(this.selectedRun, runs.length - 1);
		const display: SchedulerDisplayLine[] = [
			{ text: this.theme.bold("RECENT RUNS") },
			...runs.map(({ job, run }, runIndex) => ({
				text: this.runLine(job, run, runIndex === this.selectedRun, width),
				runIndex,
			})),
		];
		const selectedLine = Math.max(0, display.findIndex((line) => line.runIndex === this.selectedRun));
		const start = Math.min(Math.max(0, selectedLine - Math.floor(height / 2)), Math.max(0, display.length - height));
		return display.slice(start, start + height).map(({ text }) => text);
	}

	private runLine(job: SchedulerJobOverview, run: SchedulerRunView, selected: boolean, width: number): string {
		const state = runState(run);
		const marker = selected ? this.theme.fg("accent", "›") : " ";
		const label = selected ? this.theme.fg("accent", job.key) : job.key;
		return truncateToWidth(`${marker} ${this.theme.fg(state.color, state.icon)} ${label} · ${this.theme.fg(state.color, state.label)} ${this.theme.fg("dim", `· ${formatSchedulerTime(run.startedAt, this.now)} · ${duration(run.durationMilliseconds)} · ${run.trigger}`)}`, width, "");
	}

	private bodyHeight(linesBeforeBody: number): number {
		const terminalRows = this.tui.terminal?.rows ?? 24;
		const maxLines = Math.max(6, Math.floor(terminalRows * 0.85));
		return Math.max(1, maxLines - linesBeforeBody - 1);
	}
}

export interface SchedulerActionOption {
	id: string;
	label: string;
	description: string;
	danger?: boolean;
}

export class SchedulerActionComponent implements Component {
	private selected = 0;
	private readonly jobKey: string;
	private readonly options: SchedulerActionOption[];
	private readonly tui: TuiView;
	private readonly theme: Theme;
	private readonly done: (action: string | undefined) => void;

	constructor(
		jobKey: string,
		options: SchedulerActionOption[],
		tui: TuiView,
		theme: Theme,
		done: (action: string | undefined) => void,
	) {
		this.jobKey = jobKey;
		this.options = options;
		this.tui = tui;
		this.theme = theme;
		this.done = done;
	}

	handleInput(data: string): void {
		if (matchesKey(data, "ctrl+c") || matchesKey(data, "escape") || data === "q") {
			this.done(undefined);
			return;
		}
		if ((matchesKey(data, "up") || data === "k") && this.selected > 0) this.selected--;
		else if ((matchesKey(data, "down") || data === "j") && this.selected < this.options.length - 1) this.selected++;
		else if (matchesKey(data, "return") || matchesKey(data, "right")) {
			this.done(this.options[this.selected]?.id);
			return;
		}
		this.tui.requestRender();
	}

	render(width: number): string[] {
		const safeWidth = Math.max(1, width);
		const innerWidth = Math.max(1, safeWidth - 2);
		const bodyHeight = Math.max(3, Math.min(14, (this.tui.terminal?.rows ?? 24) - 6));
		const display = this.options.map((option, index) => {
			const selected = index === this.selected;
			const marker = selected ? this.theme.fg("accent", "›") : " ";
			const label = selected
				? this.theme.fg("accent", option.label)
				: option.danger
					? this.theme.fg("error", option.label)
					: option.label;
			return truncateToWidth(`${marker} ${label} ${this.theme.fg("dim", `· ${option.description}`)}`, innerWidth, "");
		});
		const start = Math.min(Math.max(0, this.selected - Math.floor(bodyHeight / 2)), Math.max(0, display.length - bodyHeight));
		const visible = display.slice(start, start + bodyHeight);
		return framed([
			truncateToWidth(`${this.theme.bold(`Scheduler / ${this.jobKey}`)} ${this.theme.fg("dim", "· Actions")}`, innerWidth, ""),
			this.theme.fg("borderMuted", "─".repeat(innerWidth)),
			this.theme.bold("AVAILABLE ACTIONS"),
			...visible,
			...Array.from({ length: Math.max(0, bodyHeight - visible.length) }, () => ""),
			this.theme.fg("dim", "↑/↓ j/k select · Enter review · q/Esc back"),
		], safeWidth, this.theme);
	}

	invalidate(): void {}
}

export class SchedulerJobDetailComponent implements Component {
	private tab: DetailTab = "overview";
	private selectedRun = 0;
	private scroll = 0;
	private readonly job: SchedulerJobOverview;
	private readonly definition: string;
	private readonly tui: TuiView;
	private readonly theme: Theme;
	private readonly done: (result: SchedulerDetailResult) => void;
	private readonly now: Date;

	constructor(
		job: SchedulerJobOverview,
		definition: string,
		tui: TuiView,
		theme: Theme,
		done: (result: SchedulerDetailResult) => void,
		now = new Date(),
	) {
		this.job = job;
		this.definition = definition;
		this.tui = tui;
		this.theme = theme;
		this.done = done;
		this.now = now;
	}

	handleInput(data: string): void {
		if (matchesKey(data, "ctrl+c") || matchesKey(data, "escape") || matchesKey(data, "left") || data === "q") {
			this.done({ kind: "back" });
			return;
		}
		if (matchesKey(data, "tab") || data === "\t") {
			this.tab = this.tab === "overview" ? "runs" : this.tab === "runs" ? "definition" : "overview";
			this.scroll = 0;
			this.tui.requestRender();
			return;
		}
		if (data === "a" || data === "A") {
			this.done({ kind: "actions" });
			return;
		}
		if (this.tab === "runs") {
			if ((matchesKey(data, "up") || data === "k") && this.selectedRun > 0) this.selectedRun--;
			else if ((matchesKey(data, "down") || data === "j") && this.selectedRun < this.job.recentRuns.length - 1) this.selectedRun++;
			else if (matchesKey(data, "return") || matchesKey(data, "right")) {
				const run = this.job.recentRuns[this.selectedRun];
				if (run) this.done({ kind: "run", id: this.job.id, runId: run.runId });
				return;
			}
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, "up") || data === "k") this.scroll++;
		else if (matchesKey(data, "down") || data === "j") this.scroll = Math.max(0, this.scroll - 1);
		else if (matchesKey(data, "pageUp") || matchesKey(data, "ctrl+u")) this.scroll += 8;
		else if (matchesKey(data, "pageDown") || matchesKey(data, "ctrl+d")) this.scroll = Math.max(0, this.scroll - 8);
		else if (matchesKey(data, "end")) this.scroll = 0;
		this.tui.requestRender();
	}

	render(width: number): string[] {
		const safeWidth = Math.max(1, width);
		const innerWidth = Math.max(1, safeWidth - 2);
		const state = schedulerJobState(this.job);
		const tabs = ["overview", "runs", "definition"].map((tab) => tab === this.tab
			? this.theme.fg("accent", `[${tab[0]!.toUpperCase()}${tab.slice(1)}]`)
			: this.theme.fg("dim", `${tab[0]!.toUpperCase()}${tab.slice(1)}`)).join("  ");
		const header = `${this.theme.bold(`Scheduler / ${this.job.key}`)} ${this.theme.fg(state.color, `· ${state.icon} ${state.label}`)}`;
		const bodyHeight = Math.max(4, Math.min(14, (this.tui.terminal?.rows ?? 24) - 7));
		const body = this.tab === "overview"
			? this.overviewLines(innerWidth)
			: this.tab === "runs"
				? this.detailRunLines(innerWidth)
				: this.definitionLines(innerWidth);
		const start = this.tab === "runs" ? 0 : Math.min(this.scroll, Math.max(0, body.length - bodyHeight));
		const visible = body.slice(start, start + bodyHeight);
		return framed([
			truncateToWidth(header, innerWidth, ""),
			this.theme.fg("dim", tabs),
			this.theme.fg("borderMuted", "─".repeat(innerWidth)),
			...visible,
			...Array.from({ length: Math.max(0, bodyHeight - visible.length) }, () => ""),
			this.theme.fg("borderMuted", "─".repeat(innerWidth)),
			truncateToWidth(this.theme.fg("dim", "Tab switch · ↑/↓ scroll · Enter run output · a actions · q/Esc tasks"), innerWidth, ""),
		], safeWidth, this.theme);
	}

	invalidate(): void {}

	private overviewLines(width: number): string[] {
		const latest = this.job.recentRuns[0];
		return [
			...wrapTextWithAnsi(this.job.description, width),
			"",
			`Schedule: ${humanizeSchedule(effectiveSchedule(this.job))}`,
			`Next run: ${formatSchedulerTime(this.job.nextRun, this.now)}`,
			`Last run: ${latest ? `${runState(latest).label} · ${formatSchedulerTime(latest.startedAt, this.now)} · ${duration(latest.durationMilliseconds)}` : "No recorded runs"}`,
			`Scope: ${this.job.scope.kind}`,
			`Source: ${this.job.sourcePath}`,
			`Working directory: ${effectiveWorkingDirectory(this.job)}`,
			...this.recoveryLines(),
		].flatMap((line) => wrapTextWithAnsi(line, width));
	}

	private recoveryLines(): string[] {
		const lines: string[] = [];
		const failures = [this.job.candidateError, this.job.installationError, this.job.historyError, this.job.nextRunError].filter((value) => value !== null);
		if (failures.length > 0) {
			lines.push("", ...failures.map((error) => this.theme.fg("error", `${error!.code}: ${error!.message}`)));
			if (this.job.candidateError) lines.push("Recovery: fix the declared command or environment, then return to Tasks and press r.");
			else if (this.job.installationError) lines.push("Recovery: press r to retry status inspection; use Definition to inspect the reviewed identities first.");
			else if (this.job.historyError) lines.push("Recovery: repair the private run-history state, then press r; lifecycle actions remain independently reviewed.");
		}
		if (this.job.candidate?.adapter.warning) lines.push("", this.theme.fg("warning", this.job.candidate.adapter.warning));
		if (this.job.installation.installed && this.job.installation.health !== "ok") {
			lines.push("", this.theme.fg("error", `Installed state: ${this.job.installation.health}${this.job.installation.healthReason ? ` · ${this.job.installation.healthReason}` : ""}`));
			if (this.job.installation.health === "unavailable" || this.job.installation.health === "conflict") {
				lines.push(`Recovery: press ${this.theme.fg("accent", "a")} and review Remove installed schedule, then reinstall the declaration.`);
			} else if (this.job.installation.health === "unhealthy" && this.job.installation.healthCategory === "commands" && this.job.installation.definitionDrift && !this.job.installation.enabled) {
				lines.push(`Recovery: press ${this.theme.fg("accent", "a")} and review Update installed snapshot.`);
			} else {
				lines.push("Recovery: inspect Definition and repair the private installed state before retrying; unsafe lifecycle actions remain unavailable.");
			}
		} else if (this.job.installation.adapterDrift) {
			lines.push("", this.theme.fg("warning", "The host adapter differs from the reviewed installed state."));
			lines.push(`Recovery: press ${this.theme.fg("accent", "a")} and review Pause or Resume to reconcile it, or Remove to clean known adapters.`);
		}
		const latest = this.job.recentRuns[0];
		if (latest && ["failed", "timed-out", "interrupted"].includes(latest.status)) {
			lines.push("", this.theme.fg("error", `Last run ${runState(latest).label.toLowerCase()}${latest.reason ? ` · ${latest.reason}` : ""}`));
			lines.push("Recovery: open Runs, select the failed run, and press Enter to inspect its retained output before running again.");
		}
		return lines;
	}

	private detailRunLines(width: number): string[] {
		if (this.job.recentRuns.length === 0) return [this.theme.fg("dim", "No recorded runs for this task.")];
		this.selectedRun = Math.min(this.selectedRun, this.job.recentRuns.length - 1);
		return this.job.recentRuns.map((run, index) => {
			const state = runState(run);
			const marker = index === this.selectedRun ? this.theme.fg("accent", "›") : " ";
			return truncateToWidth(`${marker} ${this.theme.fg(state.color, state.icon)} ${padAnsi(state.label, 12)} ${formatSchedulerTime(run.startedAt, this.now)} · ${duration(run.durationMilliseconds)} · ${run.trigger}${run.reason ? ` · ${run.reason}` : ""}`, width, "");
		});
	}

	private definitionLines(width: number): string[] {
		return this.definition.split("\n").flatMap((line) => wrapTextWithAnsi(line || " ", width));
	}
}

export interface SchedulerTextSnapshot {
	title: string;
	text: string;
	complete: boolean;
}

export class SchedulerTextComponent implements Component {
	private scroll = 0;
	private title: string;
	private text: string;
	private readonly tui: TuiView;
	private readonly theme: Theme;
	private readonly done: () => void;
	private readonly reload?: (signal: AbortSignal) => Promise<SchedulerTextSnapshot>;
	private readonly refreshTimer?: ReturnType<typeof setInterval>;
	private refreshAbort?: AbortController;
	private refreshing = false;
	private refreshFailure: string | undefined;
	private complete = false;
	private disposed = false;

	constructor(
		title: string,
		text: string,
		tui: TuiView,
		theme: Theme,
		done: () => void,
		reload?: (signal: AbortSignal) => Promise<SchedulerTextSnapshot>,
	) {
		this.title = title;
		this.text = text;
		this.tui = tui;
		this.theme = theme;
		this.done = done;
		this.reload = reload;
		if (reload) {
			this.refreshTimer = setInterval(() => void this.refreshText(), 1_000);
			this.refreshTimer.unref?.();
		}
	}

	handleInput(data: string): void {
		if (matchesKey(data, "ctrl+c") || matchesKey(data, "escape") || matchesKey(data, "left") || data === "q") {
			this.done();
			return;
		}
		if (matchesKey(data, "up") || data === "k") this.scroll++;
		else if (matchesKey(data, "down") || data === "j") this.scroll = Math.max(0, this.scroll - 1);
		else if (matchesKey(data, "pageUp") || matchesKey(data, "ctrl+u")) this.scroll += 8;
		else if (matchesKey(data, "pageDown") || matchesKey(data, "ctrl+d")) this.scroll = Math.max(0, this.scroll - 8);
		else if (matchesKey(data, "end")) this.scroll = 0;
		this.tui.requestRender();
	}

	render(width: number): string[] {
		const safeWidth = Math.max(1, width);
		const innerWidth = Math.max(1, safeWidth - 2);
		const height = Math.max(4, Math.min(16, (this.tui.terminal?.rows ?? 24) - 5));
		const content = this.text.split("\n").flatMap((line) => wrapTextWithAnsi(line || " ", innerWidth));
		const start = Math.max(0, content.length - height - this.scroll);
		const visible = content.slice(start, start + height);
		const refreshState = this.refreshing ? ` ${this.theme.fg("warning", "↻ updating")}` : "";
		const footer = this.refreshFailure
			? `${this.theme.fg("error", `Refresh failed: ${this.refreshFailure}`)} · ${this.theme.fg("dim", "q/Esc back")}`
			: this.theme.fg("dim", `↑/↓ scroll · End latest${this.reload && !this.complete ? " · updates automatically" : ""} · q/Esc back`);
		return framed([
			truncateToWidth(`${this.theme.bold(this.title)}${refreshState}`, innerWidth, ""),
			this.theme.fg("borderMuted", "─".repeat(innerWidth)),
			...visible,
			...Array.from({ length: Math.max(0, height - visible.length) }, () => ""),
			truncateToWidth(footer, innerWidth, ""),
		], safeWidth, this.theme);
	}

	invalidate(): void {}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		if (this.refreshTimer) clearInterval(this.refreshTimer);
		this.refreshAbort?.abort();
		this.refreshAbort = undefined;
	}

	async refreshText(): Promise<void> {
		if (!this.reload || this.refreshing || this.disposed) return;
		this.refreshing = true;
		const abort = new AbortController();
		this.refreshAbort = abort;
		this.tui.requestRender();
		try {
			const next = await this.reload(abort.signal);
			if (this.disposed) return;
			this.title = next.title;
			this.text = next.text;
			this.refreshFailure = undefined;
			this.complete = next.complete;
			if (next.complete && this.refreshTimer) clearInterval(this.refreshTimer);
		} catch (error) {
			if (!this.disposed && !abort.signal.aborted) this.refreshFailure = error instanceof Error ? error.message : String(error);
		} finally {
			if (this.refreshAbort === abort) this.refreshAbort = undefined;
			this.refreshing = false;
			if (!this.disposed) this.tui.requestRender();
		}
	}
}
