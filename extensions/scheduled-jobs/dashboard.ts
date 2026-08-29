import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { Box, matchesKey, Text, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { schedulerJobStatus, schedulerLatestExecution } from "../../lib/scheduled-jobs/job-status.mjs";

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
	outputTruncated: boolean;
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
	| { kind: "actions"; id: string }
	| { kind: "run"; id: string; runId: string };

export type SchedulerDetailResult =
	| { kind: "back" }
	| { kind: "refresh" }
	| { kind: "actions" }
	| { kind: "run"; id: string; runId: string };

export type SchedulerTextResult = "back" | "refresh";

type TuiView = Pick<TUI, "requestRender"> & { terminal?: { rows: number } };
type DashboardTab = "tasks" | "runs";
type DetailTab = "overview" | "runs" | "definition";

function schedulerPanelLines(tui: TuiView): number {
	return Math.max(1, Math.floor((tui.terminal?.rows ?? 24) * 0.85));
}

function compactPanelLines(height: number, header: string, content: string[], footer: string): string[] {
	if (height <= 1) return [footer];
	if (height === 2) return [header, footer];
	return [header, ...content.slice(0, height - 2), footer];
}

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

function sizedPanel(lines: string[], width: number, height: number, theme: Theme): string[] {
	const safeWidth = Math.max(1, width);
	const safeHeight = Math.max(1, height);
	if (safeWidth < 3) {
		const visible = lines.slice(0, safeHeight);
		return opaque([...visible, ...Array.from({ length: safeHeight - visible.length }, () => "")], safeWidth, theme);
	}
	if (safeHeight < 3) {
		const compact = safeHeight === 1 ? [lines.at(-1) ?? ""] : [lines[0] ?? "", lines.at(-1) ?? ""];
		return opaque(compact, safeWidth, theme);
	}
	const innerHeight = safeHeight - 2;
	const visible = lines.slice(0, innerHeight);
	return framed([...visible, ...Array.from({ length: innerHeight - visible.length }, () => "")], safeWidth, theme);
}

interface SchedulerHotkeyHint {
	key: string;
	label: string;
	priority: number;
	keyColor?: "accent" | "error" | "warning";
	labelColor?: "dim" | "error" | "warning";
}

interface SchedulerPanelOptions {
	header: string;
	chrome?: string[];
	body: (width: number, height: number) => string[];
	compactBody?: (width: number) => string[];
	hints: SchedulerHotkeyHint[];
}

function schedulerTabs<T extends string>(tabs: Array<{ id: T; label: string }>, active: T, theme: Theme): string {
	return tabs.map(({ id, label }) => id === active
		? theme.fg("accent", `[${label}]`)
		: theme.fg("dim", label)).join("  ");
}

function schedulerHotkeyFooter(hints: SchedulerHotkeyHint[], width: number, theme: Theme): string {
	const separator = theme.fg("dim", " · ");
	const rendered = hints.map((hint, index) => ({
		index,
		priority: hint.priority,
		text: `${theme.fg(hint.keyColor ?? "accent", hint.key)} ${theme.fg(hint.labelColor ?? "dim", hint.label)}`,
	}));
	const selected = new Set<number>();
	for (const candidate of [...rendered].sort((left, right) => left.priority - right.priority || left.index - right.index)) {
		const next = rendered.filter((item) => selected.has(item.index) || item.index === candidate.index).map((item) => item.text).join(separator);
		if (visibleWidth(next) <= width || selected.size === 0) selected.add(candidate.index);
	}
	const footer = rendered.filter((item) => selected.has(item.index)).map((item) => item.text).join(separator);
	return truncateToWidth(footer, width, "");
}

function renderSchedulerPanel(width: number, tui: TuiView, theme: Theme, options: SchedulerPanelOptions): string[] {
	const safeWidth = Math.max(1, width);
	const innerWidth = Math.max(1, safeWidth - 2);
	const panelHeight = schedulerPanelLines(tui);
	const innerHeight = Math.max(0, panelHeight - 2);
	const header = truncateToWidth(options.header, innerWidth, "");
	const chrome = (options.chrome ?? []).map((line) => truncateToWidth(line, innerWidth, ""));
	const footer = schedulerHotkeyFooter(options.hints, innerWidth, theme);
	const bodyHeight = Math.max(0, innerHeight - chrome.length - 2);
	if (bodyHeight < 1) {
		const compactBody = options.compactBody?.(innerWidth) ?? options.body(innerWidth, 1);
		return sizedPanel(compactPanelLines(innerHeight, header, compactBody, footer), safeWidth, panelHeight, theme);
	}
	const body = options.body(innerWidth, bodyHeight).slice(0, bodyHeight);
	return sizedPanel([
		header,
		...chrome,
		...body,
		...Array.from({ length: bodyHeight - body.length }, () => ""),
		footer,
	], safeWidth, panelHeight, theme);
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
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

function humanScheduleTime(hour: string, minute: string): string | undefined {
	if (!/^\d+$/.test(hour) || !/^\d+$/.test(minute)) return undefined;
	if (hour === "0" && minute === "0") return "midnight";
	if (hour === "12" && minute === "0") return "noon";
	return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

export function humanizeSchedule(schedule: string): string {
	const [minute = "", hour = "", dayOfMonth = "", month = "", dayOfWeek = ""] = schedule.trim().split(/\s+/);
	const time = humanScheduleTime(hour, minute);
	if (time && dayOfMonth === "*" && month === "*") {
		const days = weekdayLabel(dayOfWeek);
		if (days) return `${days} at ${time} local time`;
	}
	if (time && /^\d+$/.test(dayOfMonth) && /^\d+$/.test(month) && dayOfWeek === "*") {
		const monthLabel = MONTHS[Number(month) - 1];
		if (monthLabel) return `Every ${monthLabel} ${Number(dayOfMonth)} at ${time} local time`;
	}
	if (time && /^\d+$/.test(dayOfMonth) && month === "*" && dayOfWeek === "*") {
		return `Monthly on day ${Number(dayOfMonth)} at ${time} local time`;
	}
	if (/^\*\/\d+$/.test(minute) && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
		return `Every ${Number(minute.slice(2))} minutes`;
	}
	return `${schedule} · local time`;
}

function formatSchedulerDateTime(value: string): string {
	const date = new Date(value);
	if (!Number.isFinite(date.getTime())) return "Unknown";
	const month = MONTHS[date.getMonth()] ?? "Unknown";
	const time = humanScheduleTime(String(date.getHours()), String(date.getMinutes())) ?? clockTime(date);
	return `${month} ${date.getDate()}, ${date.getFullYear()} at ${time}`;
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
	switch (schedulerJobStatus(job)) {
		case "running": return { label: "Running", icon: "↻", color: "accent" };
		case "needs-attention": return { label: "Needs attention", icon: "!", color: "error" };
		case "draft": return { label: "Draft", icon: "◇", color: "muted" };
		case "active-update": return { label: "Active · Update available", icon: "●", color: "warning" };
		case "active": return { label: "Active", icon: "●", color: "success" };
		case "paused-update": return { label: "Paused · Update available", icon: "○", color: "warning" };
		case "paused": return { label: "Paused", icon: "○", color: "muted" };
	}
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

function orderedTasks(data: SchedulerDashboardData): SchedulerJobOverview[] {
	return TASK_SECTIONS.flatMap(({ section }) => data.jobs.filter((job) => taskSection(job) === section));
}

export class SchedulerDashboardComponent implements Component {
	private tab: DashboardTab = "tasks";
	private selectedTask = 0;
	private selectedRun = 0;
	private readonly data: SchedulerDashboardData;
	private readonly tui: TuiView;
	private readonly theme: Theme;
	private readonly done: (result: SchedulerDashboardResult) => void;
	private readonly now: Date;

	constructor(
		data: SchedulerDashboardData,
		tui: TuiView,
		theme: Theme,
		done: (result: SchedulerDashboardResult) => void,
		now = new Date(),
		selectedTaskId?: string,
	) {
		this.data = data;
		this.tui = tui;
		this.theme = theme;
		this.done = done;
		this.now = now;
		if (selectedTaskId) {
			this.selectedTask = Math.max(0, orderedTasks(data).findIndex((job) => job.id === selectedTaskId));
		}
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
			this.done({ kind: "refresh" });
			return;
		}
		if ((data === "a" || data === "A") && this.tab === "tasks") {
			const job = orderedTasks(this.data)[this.selectedTask];
			if (job) this.done({ kind: "actions", id: job.id });
			return;
		}
		const count = this.tab === "tasks" ? orderedTasks(this.data).length : allRuns(this.data).length;
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
				const job = orderedTasks(this.data)[this.selectedTask];
				if (job) this.done({ kind: "job", id: job.id });
			} else {
				const selectedRun = allRuns(this.data)[this.selectedRun];
				if (selectedRun) this.done({ kind: "run", id: selectedRun.job.id, runId: selectedRun.run.runId });
			}
		}
	}

	render(width: number): string[] {
		const states = this.data.jobs.map(schedulerJobState);
		const active = states.filter((state) => state.label.startsWith("Active") || state.label === "Running").length;
		const paused = states.filter((state) => state.label.startsWith("Paused")).length;
		const issues = states.filter((state) => state.label === "Needs attention").length + this.data.sourceErrors.length;
		const tabs = schedulerTabs([
			{ id: "tasks", label: "Tasks" },
			{ id: "runs", label: "Runs" },
		], this.tab, this.theme);
		const counts = [
			`${this.data.jobs.length} task${this.data.jobs.length === 1 ? "" : "s"}`,
			...(active ? [`${active} active`] : []),
			...(paused ? [`${paused} paused`] : []),
			...(issues ? [`${issues} need${issues === 1 ? "s" : ""} attention`] : []),
		].join(" · ");
		const headerCore = `${this.theme.bold("Scheduler")} ${this.theme.fg("dim", "· ")}${tabs}`;
		const header = `${headerCore} ${this.theme.fg("dim", `· ${counts}`)}`;
		const wrapsHeader = visibleWidth(header) > Math.max(1, width - 2);
		const chrome = [
			...(wrapsHeader ? wrapTextWithAnsi(this.theme.fg("dim", counts), Math.max(1, width - 2)) : []),
			this.theme.fg("borderMuted", "─".repeat(Math.max(1, width - 2))),
		];
		if (this.data.sourceErrors.length > 0) {
			chrome.push(this.theme.bold("SOURCE ERRORS"));
			for (const sourceError of this.data.sourceErrors.slice(0, 2)) {
				chrome.push(`${this.theme.fg("error", "!")} ${sourceError.scope === "global" ? "Global" : "Project"} tasks · ${this.theme.fg("error", sourceError.error.message)}`);
				chrome.push(this.theme.fg("dim", `  ${sourceError.manifestPath}`));
			}
			if (this.data.jobs.length > 0) chrome.push("");
		}
		return renderSchedulerPanel(width, this.tui, this.theme, {
			header: wrapsHeader ? headerCore : header,
			chrome,
			body: (bodyWidth, bodyHeight) => this.tab === "tasks" ? this.taskLines(bodyWidth, bodyHeight) : this.runLines(bodyWidth, bodyHeight),
			compactBody: (bodyWidth) => this.tab === "tasks" ? this.taskLines(bodyWidth, 1) : this.runLines(bodyWidth, 1),
			hints: [
				{ key: "↑/↓ j/k", label: "select", priority: 3 },
				{ key: "Enter", label: this.tab === "tasks" ? "details" : "output", priority: 1 },
				{ key: "Tab", label: this.tab === "tasks" ? "runs" : "tasks", priority: 2 },
				...(this.tab === "tasks" ? [{ key: "a", label: "actions", priority: 1 }] : []),
				{ key: "r", label: "refresh", priority: 4 },
				{ key: "q/Esc", label: "close", priority: 0 },
			],
		});
	}

	invalidate(): void {}

	private taskLines(width: number, height: number): string[] {
		if (this.data.jobs.length === 0) {
			return this.data.sourceErrors.length > 0
				? [`No tasks loaded. Fix the source above, then press ${this.theme.fg("accent", "r")} to retry.`]
				: ["No scheduler tasks declared. Use /skill:scheduled-jobs to create one."];
		}
		this.selectedTask = Math.min(this.selectedTask, orderedTasks(this.data).length - 1);
		const display = this.taskDisplayLines(width);
		const selectedLine = Math.max(0, display.findIndex((line) => line.taskIndex === this.selectedTask));
		const start = Math.min(Math.max(0, selectedLine - Math.floor(height / 2)), Math.max(0, display.length - height));
		return display.slice(start, start + height).map(({ text }) => text);
	}

	private taskDisplayLines(width: number): SchedulerDisplayLine[] {
		const lines: SchedulerDisplayLine[] = [];
		const tasks = orderedTasks(this.data);
		for (const { section, label } of TASK_SECTIONS) {
			const jobs = tasks.map((job, taskIndex) => ({ job, taskIndex })).filter(({ job }) => taskSection(job) === section);
			if (jobs.length === 0) continue;
			if (lines.length > 0) lines.push({ text: "" });
			lines.push({ text: this.theme.bold(label) });
			for (const { job, taskIndex } of jobs) {
				lines.push(...this.taskRows(job, taskIndex === this.selectedTask, width).map((text) => ({ text, taskIndex })));
			}
		}
		return lines;
	}

	private taskRows(job: SchedulerJobOverview, selected: boolean, width: number): string[] {
		const state = schedulerJobState(job);
		const marker = selected ? this.theme.fg("accent", "›") : " ";
		const label = selected ? this.theme.fg("accent", job.key) : job.key;
		const next = job.nextRun ? `next ${formatSchedulerTime(job.nextRun, this.now)}` : state.label.startsWith("Paused") ? "schedule paused" : state.label === "Draft" ? "not installed" : "next run unavailable";
		const latest = schedulerLatestExecution(job) as SchedulerRunView | undefined;
		const last = latest ? `last ${runState(latest).label.toLowerCase()} ${formatSchedulerTime(latest.startedAt, this.now)}` : "no recorded runs";
		const identity = `${marker} ${this.theme.fg(state.color, state.icon)} ${label}`;
		const status = `${this.theme.fg("dim", `· ${job.scope.kind} ·`)} ${this.theme.fg(state.color, state.label)}`;
		const schedule = humanizeSchedule(effectiveSchedule(job));
		const history = this.theme.fg("dim", `· ${next} · ${last}`);
		const singleLine = `${identity} ${status} · ${schedule} ${history}`;
		if (visibleWidth(singleLine) <= width) return [singleLine];

		const rows = visibleWidth(`${identity} ${status}`) <= width
			? [`${identity} ${status}`]
			: [truncateToWidth(identity, width, ""), ...this.indentedRows(status, width)];
		rows.push(...this.indentedRows(`${schedule} ${history}`, width));
		return rows;
	}

	private indentedRows(value: string, width: number): string[] {
		const indent = "    ";
		if (width <= indent.length) return [truncateToWidth(value, width, "")];
		return wrapTextWithAnsi(value, width - indent.length).map((line) => `${indent}${line}`);
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
	private readonly doctorCommand: string;

	constructor(
		job: SchedulerJobOverview,
		definition: string,
		tui: TuiView,
		theme: Theme,
		done: (result: SchedulerDetailResult) => void,
		now = new Date(),
		doctorCommand = `scheduled-jobs doctor ${job.id} --manifest ${job.manifestPath} --json`,
	) {
		this.job = job;
		this.definition = definition;
		this.tui = tui;
		this.theme = theme;
		this.done = done;
		this.now = now;
		this.doctorCommand = doctorCommand;
		const latestExecution = schedulerLatestExecution(job);
		this.selectedRun = latestExecution ? Math.max(0, job.recentRuns.indexOf(latestExecution as SchedulerRunView)) : 0;
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
		if (data === "r" || data === "R") {
			this.done({ kind: "refresh" });
			return;
		}
		if (data === "a" || data === "A") {
			this.done({ kind: "actions" });
			return;
		}
		if (this.tab === "runs") {
			const runs = this.job.recentRuns;
			if ((matchesKey(data, "up") || data === "k") && this.selectedRun > 0) this.selectedRun--;
			else if ((matchesKey(data, "down") || data === "j") && this.selectedRun < runs.length - 1) this.selectedRun++;
			else if (matchesKey(data, "return") || matchesKey(data, "right")) {
				const run = runs[this.selectedRun];
				if (run) this.done({ kind: "run", id: this.job.id, runId: run.runId });
				return;
			}
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, "up") || data === "k") this.scroll = Math.max(0, this.scroll - 1);
		else if (matchesKey(data, "down") || data === "j") this.scroll++;
		else if (matchesKey(data, "pageUp") || matchesKey(data, "ctrl+u")) this.scroll = Math.max(0, this.scroll - 8);
		else if (matchesKey(data, "pageDown") || matchesKey(data, "ctrl+d")) this.scroll += 8;
		else if (matchesKey(data, "end")) this.scroll = Number.MAX_SAFE_INTEGER;
		this.tui.requestRender();
	}

	render(width: number): string[] {
		const state = schedulerJobState(this.job);
		const tabs = schedulerTabs([
			{ id: "overview", label: "Overview" },
			{ id: "runs", label: "Runs" },
			{ id: "definition", label: "Definition" },
		], this.tab, this.theme);
		const body = (bodyWidth: number) => this.tab === "overview"
			? this.overviewLines(bodyWidth)
			: this.tab === "runs"
				? this.detailRunLines(bodyWidth)
				: this.definitionLines(bodyWidth);
		return renderSchedulerPanel(width, this.tui, this.theme, {
			header: `${this.theme.bold(`Scheduler / ${this.job.key}`)} ${this.theme.fg(state.color, `· ${state.icon} ${state.label}`)}`,
			chrome: [
				tabs,
				this.theme.fg("borderMuted", "─".repeat(Math.max(1, width - 2))),
			],
			body: (bodyWidth, bodyHeight) => {
				const lines = body(bodyWidth);
				const start = this.tab === "runs" ? 0 : Math.min(this.scroll, Math.max(0, lines.length - bodyHeight));
				if (this.tab !== "runs") this.scroll = start;
				return lines.slice(start, start + bodyHeight);
			},
			compactBody: (bodyWidth) => [tabs, ...body(bodyWidth)],
			hints: [
				{ key: "Tab", label: "switch", priority: 1 },
				{ key: "↑/↓ j/k", label: this.tab === "runs" ? "select" : "scroll", priority: 3 },
				...(this.tab === "runs" ? [{ key: "Enter", label: "output", priority: 1 }] : []),
				{ key: "r", label: "refresh", priority: 4 },
				{ key: "a", label: "actions", priority: 2 },
				{ key: "q/Esc", label: "tasks", priority: 0 },
			],
		});
	}

	invalidate(): void {}

	private overviewLines(width: number): string[] {
		const latest = schedulerLatestExecution(this.job) as SchedulerRunView | undefined;
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
			lines.push(
				"",
				...failures.map((error) => this.theme.fg("error", `${error!.code}: ${error!.message}`)),
				`Recovery: run ${this.theme.fg("accent", this.doctorCommand)}. Refresh with r after resolving the issue through the declaration, environment, or reviewed lifecycle actions.`,
			);
		}
		if (this.job.candidate?.adapter.warning) lines.push("", this.theme.fg("warning", this.job.candidate.adapter.warning));
		if (this.job.installation.installed && this.job.installation.health !== "ok") {
			lines.push("", this.theme.fg("error", `Installed state: ${this.job.installation.health}${this.job.installation.healthReason ? ` · ${this.job.installation.healthReason}` : ""}`));
			if (this.job.installation.health === "unavailable" || this.job.installation.health === "conflict") {
				lines.push(`Recovery: press ${this.theme.fg("accent", "a")} and review Remove installed schedule, then reinstall the declaration.`);
			} else if (this.job.installation.health === "unhealthy" && this.job.installation.healthCategory === "commands" && this.job.installation.definitionDrift && !this.job.installation.enabled) {
				lines.push(`Recovery: press ${this.theme.fg("accent", "a")} and review Update installed snapshot.`);
			} else {
				lines.push(`Recovery: run ${this.theme.fg("accent", this.doctorCommand)}, then use only reviewed lifecycle actions; do not edit private state by hand.`);
			}
		} else if (this.job.installation.adapterDrift) {
			lines.push("", this.theme.fg("warning", "The host adapter differs from the reviewed installed state."));
			lines.push(`Recovery: press ${this.theme.fg("accent", "a")} and review Pause or Resume to reconcile it, or Remove to clean known adapters.`);
		}
		const latest = schedulerLatestExecution(this.job) as SchedulerRunView | undefined;
		if (latest && ["failed", "timed-out", "interrupted"].includes(latest.status)) {
			lines.push("", this.theme.fg("error", `Latest execution ${runState(latest).label.toLowerCase()}${latest.reason ? ` · ${latest.reason}` : ""}`));
			lines.push("Recovery: open Runs; the affected execution is selected. Press Enter to inspect its retained output before running again.");
		}
		return lines;
	}

	private detailRunLines(width: number): string[] {
		const runs = this.job.recentRuns;
		if (runs.length === 0) return [this.theme.fg("dim", "No recorded runs for this task.")];
		this.selectedRun = Math.min(this.selectedRun, runs.length - 1);
		return runs.map((run, index) => {
			const state = runState(run);
			const marker = index === this.selectedRun ? this.theme.fg("accent", "›") : " ";
			return truncateToWidth(`${marker} ${this.theme.fg(state.color, state.icon)} ${padAnsi(state.label, 12)} ${formatSchedulerTime(run.startedAt, this.now)} · ${duration(run.durationMilliseconds)} · ${run.trigger}${run.reason ? ` · ${run.reason}` : ""}`, width, "");
		});
	}

	private definitionLines(width: number): string[] {
		return this.definition.split("\n").flatMap((line) => wrapTextWithAnsi(line || " ", width));
	}
}

export class SchedulerTextComponent implements Component {
	private scroll = 0;
	private readonly title: string;
	private readonly text: string;
	private readonly tui: TuiView;
	private readonly theme: Theme;
	private readonly done: (result: SchedulerTextResult) => void;

	constructor(
		title: string,
		text: string,
		tui: TuiView,
		theme: Theme,
		done: (result: SchedulerTextResult) => void,
	) {
		this.title = title;
		this.text = text;
		this.tui = tui;
		this.theme = theme;
		this.done = done;
	}

	handleInput(data: string): void {
		if (matchesKey(data, "ctrl+c") || matchesKey(data, "escape") || matchesKey(data, "left") || data === "q") {
			this.done("back");
			return;
		}
		if (data === "r" || data === "R") {
			this.done("refresh");
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
		return renderSchedulerPanel(width, this.tui, this.theme, {
			header: this.theme.bold(this.title),
			chrome: [this.theme.fg("borderMuted", "─".repeat(Math.max(1, width - 2)))],
			body: (bodyWidth, bodyHeight) => {
				const content = this.text.split("\n").flatMap((line) => wrapTextWithAnsi(line || " ", bodyWidth));
				const start = Math.max(0, content.length - bodyHeight - this.scroll);
				return content.slice(start, start + bodyHeight);
			},
			hints: [
				{ key: "↑/↓ j/k", label: "scroll", priority: 3 },
				{ key: "End", label: "latest", priority: 2 },
				{ key: "r", label: "refresh", priority: 4 },
				{ key: "q/Esc", label: "back", priority: 0 },
			],
		});
	}

	invalidate(): void {}

}
