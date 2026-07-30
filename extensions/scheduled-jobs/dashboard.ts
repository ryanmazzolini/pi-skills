import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Component, OverlayHandle, OverlayOptions, TUI } from "@earendil-works/pi-tui";
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
	| { kind: "diagnose"; id: string }
	| { kind: "actions"; id: string }
	| { kind: "run"; id: string; runId: string };

export type SchedulerDetailResult =
	| { kind: "back" }
	| { kind: "diagnose" }
	| { kind: "actions" }
	| { kind: "run"; id: string; runId: string };

export interface SchedulerDetailSnapshot {
	job: SchedulerJobOverview;
	definition: string;
	generatedAt: string;
	dashboard: SchedulerDashboardData;
}

export interface SchedulerTextSnapshot {
	title: string;
	text: string;
	complete: boolean;
}

export interface SchedulerActionOutcome {
	status: "success" | "error";
	message: string;
	dashboard: SchedulerDashboardData;
	detail?: SchedulerDetailSnapshot;
}

export interface SchedulerActionPresentation {
	fromStatus: string;
	toStatus: string;
	schedule: string;
	adapter: string;
	nextRun?: string;
	note?: string;
}

export type SchedulerActionTarget =
	| { kind: "text"; load: (signal: AbortSignal) => Promise<SchedulerTextSnapshot> }
	| {
		kind: "mutation";
		review: string;
		presentation?: SchedulerActionPresentation;
		cancelled: SchedulerActionOutcome;
		apply: (signal: AbortSignal) => Promise<SchedulerActionOutcome>;
	};

export interface SchedulerPreparedAction extends SchedulerActionOption {
	open: (signal: AbortSignal) => Promise<SchedulerActionTarget>;
}

export interface SchedulerActionSession {
	id: string;
	key: string;
	job: SchedulerJobOverview;
	actions: SchedulerPreparedAction[];
}

export interface SchedulerWorkspaceController {
	reloadDashboard(signal: AbortSignal): Promise<SchedulerDashboardData>;
	loadDetail(id: string, signal: AbortSignal): Promise<SchedulerDetailSnapshot>;
	prepareActions(id: string, signal: AbortSignal): Promise<SchedulerActionSession>;
	loadRunOutput(id: string, runId: string, signal?: AbortSignal): Promise<SchedulerTextSnapshot>;
}

type TuiView = Pick<TUI, "requestRender"> & {
	terminal?: { rows: number };
	showOverlay?: (component: Component, options?: OverlayOptions) => OverlayHandle;
};
type DashboardTab = "tasks" | "runs";
type DetailTab = "overview" | "runs" | "definition";

const ACTION_MODAL_OPTIONS: OverlayOptions = { anchor: "center", width: 64, maxHeight: "100%", margin: 0 };
const DECISION_MODAL_OPTIONS: OverlayOptions = { anchor: "center", width: 68, maxHeight: "100%", margin: 0 };
const DOCUMENT_MODAL_OPTIONS: OverlayOptions = { anchor: "center", width: "80%", maxHeight: "100%", margin: 0 };
const BUSY_MODAL_OPTIONS: OverlayOptions = { anchor: "center", width: 52, maxHeight: 8, margin: 0 };

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

function compactDialog(title: string, lines: string[], width: number, theme: Theme): string[] {
	const safeWidth = Math.max(1, width);
	if (safeWidth < 6) return opaque(lines.map((line) => truncateToWidth(line, safeWidth, "")), safeWidth, theme);
	const innerWidth = safeWidth - 2;
	const contentWidth = Math.max(1, innerWidth - 2);
	const safeTitle = truncateToWidth(title, Math.max(1, innerWidth - 4), "");
	const titleBar = `─ ${safeTitle} `;
	const border = (value: string) => theme.fg("borderMuted", value);
	return opaque([
		border(`╭${titleBar}${"─".repeat(Math.max(0, innerWidth - visibleWidth(titleBar)))}╮`),
		...lines.flatMap((line) => wrapTextWithAnsi(line || " ", contentWidth)).map((line) => `${border("│")} ${padAnsi(line, contentWidth)} ${border("│")}`),
		border(`╰${"─".repeat(innerWidth)}╯`),
	], safeWidth, theme);
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

function orderedTasks(data: SchedulerDashboardData): SchedulerJobOverview[] {
	return TASK_SECTIONS.flatMap(({ section }) => data.jobs.filter((job) => taskSection(job) === section));
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
	private workspaceStatus: { message: string; color: "success" | "error" } | undefined;
	private suspended = false;
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
		const refreshState = this.refreshing ? this.theme.fg("warning", " · ↻ refreshing") : "";
		const headerCore = `${this.theme.bold("Scheduler")} ${this.theme.fg("dim", "· ")}${tabs}`;
		const headerMeta = `${this.theme.fg("dim", `· ${counts}`)}${refreshState}`;
		const header = `${headerCore} ${headerMeta}`;
		const wrapsHeader = visibleWidth(header) > Math.max(1, width - 2);
		const chrome = [
			...(wrapsHeader ? wrapTextWithAnsi(`${this.theme.fg("dim", counts)}${refreshState}`, Math.max(1, width - 2)) : []),
			this.theme.fg("borderMuted", "─".repeat(Math.max(1, width - 2))),
		];
		if (this.workspaceStatus) chrome.push(this.theme.fg(this.workspaceStatus.color, this.workspaceStatus.message));
		if (this.refreshFailure) {
			chrome.push(`${this.theme.fg("error", "!")} Refresh failed · ${this.theme.fg("error", this.refreshFailure)}`);
			chrome.push(`  Press ${this.theme.fg("accent", "r")} to retry; the previous snapshot is still shown.`);
		}
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

	suspend(): void {
		if (this.suspended || this.disposed) return;
		this.suspended = true;
		if (this.refreshTimer) clearInterval(this.refreshTimer);
		this.refreshTimer = undefined;
		this.refreshAbort?.abort();
		this.refreshAbort = undefined;
	}

	resume(data?: SchedulerDashboardData): void {
		if (this.disposed) return;
		if (data) this.applyData(data);
		this.suspended = false;
		this.syncPolling();
		this.tui.requestRender();
	}

	update(data: SchedulerDashboardData, status?: { message: string; color: "success" | "error" }): void {
		if (this.disposed) return;
		this.applyData(data);
		this.workspaceStatus = status;
		this.tui.requestRender();
	}

	setStatus(message: string, color: "success" | "error" = "error"): void {
		if (this.disposed) return;
		this.workspaceStatus = { message, color };
		this.tui.requestRender();
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		if (this.refreshTimer) clearInterval(this.refreshTimer);
		this.refreshTimer = undefined;
		this.refreshAbort?.abort();
		this.refreshAbort = undefined;
	}

	async refreshData(): Promise<void> {
		if (!this.reload || this.refreshing || this.suspended || this.disposed) return;
		this.refreshing = true;
		const abort = new AbortController();
		this.refreshAbort = abort;
		this.tui.requestRender();
		try {
			const next = await this.reload(abort.signal);
			if (this.disposed || this.suspended) return;
			this.applyData(next);
		} catch (error) {
			if (!this.disposed && !abort.signal.aborted) this.refreshFailure = error instanceof Error ? error.message : String(error);
		} finally {
			if (this.refreshAbort === abort) this.refreshAbort = undefined;
			this.refreshing = false;
			if (!this.disposed) this.tui.requestRender();
		}
	}

	private applyData(next: SchedulerDashboardData): void {
		const selectedTaskId = orderedTasks(this.data)[this.selectedTask]?.id;
		const selectedRunId = allRuns(this.data)[this.selectedRun]?.run.runId;
		this.data = next;
		this.now = new Date(next.generatedAt);
		this.refreshFailure = undefined;
		if (selectedTaskId) {
			const tasks = orderedTasks(next);
			const taskIndex = tasks.findIndex((job) => job.id === selectedTaskId);
			this.selectedTask = taskIndex >= 0 ? taskIndex : Math.min(this.selectedTask, Math.max(0, tasks.length - 1));
		}
		if (selectedRunId) {
			const runs = allRuns(next);
			const runIndex = runs.findIndex(({ run }) => run.runId === selectedRunId);
			this.selectedRun = runIndex >= 0 ? runIndex : Math.min(this.selectedRun, Math.max(0, runs.length - 1));
		}
		this.syncPolling();
	}

	private syncPolling(): void {
		const shouldPoll = Boolean(this.reload) && hasRunningRuns(this.data) && !this.suspended && !this.disposed;
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
		const latest = job.recentRuns[0];
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

export interface SchedulerActionOption {
	id: string;
	label: string;
	description: string;
	danger?: boolean;
}

export class SchedulerActionComponent implements Component {
	private selected = 0;
	private readonly job: SchedulerJobOverview;
	private readonly options: SchedulerActionOption[];
	private readonly tui: TuiView;
	private readonly theme: Theme;
	private readonly done: (action: string | undefined) => void;

	constructor(
		job: SchedulerJobOverview,
		options: SchedulerActionOption[],
		tui: TuiView,
		theme: Theme,
		done: (action: string | undefined) => void,
		initialActionId?: string,
	) {
		this.job = job;
		this.options = options;
		this.tui = tui;
		this.theme = theme;
		this.done = done;
		this.selected = Math.max(0, options.findIndex((option) => option.id === initialActionId));
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
		const state = schedulerJobState(this.job);
		const footer = `${this.theme.fg("accent", "↑/↓")} ${this.theme.fg("dim", "Choose")} ${this.theme.fg("dim", "·")} ${this.theme.fg("accent", "Enter")} ${this.theme.fg("dim", "Select")} ${this.theme.fg("dim", "·")} ${this.theme.fg("accent", "Esc")} ${this.theme.fg("dim", "Close")}`;
		const optionLines = this.options.map((option, index) => {
			const selected = index === this.selected;
			const marker = selected ? this.theme.fg("accent", "›") : " ";
			const label = selected
				? this.theme.fg("accent", option.label)
				: option.danger
					? this.theme.fg("error", option.label)
					: option.label;
			return `${marker} ${label}`;
		});
		const lines = (this.tui.terminal?.rows ?? 24) < 10
			? [optionLines[this.selected] ?? "No actions available.", footer]
			: [
				`${this.theme.fg(state.color, state.label)} ${this.theme.fg("dim", `· ${humanizeSchedule(effectiveSchedule(this.job))}`)}`,
				"",
				...optionLines,
				"",
				footer,
			];
		return compactDialog(`Actions for ${this.job.key}`, lines, width, this.theme);
	}

	invalidate(): void {}
}

export class SchedulerJobDetailComponent implements Component {
	private tab: DetailTab = "overview";
	private selectedRun = 0;
	private scroll = 0;
	private job: SchedulerJobOverview;
	private definition: string;
	private readonly tui: TuiView;
	private readonly theme: Theme;
	private readonly done: (result: SchedulerDetailResult) => void;
	private now: Date;
	private readonly reload?: (signal: AbortSignal) => Promise<SchedulerDetailSnapshot>;
	private refreshAbort?: AbortController;
	private refreshing = false;
	private refreshStatus: { message: string; color: "success" | "warning" | "error" } | undefined;
	private disposed = false;

	constructor(
		job: SchedulerJobOverview,
		definition: string,
		tui: TuiView,
		theme: Theme,
		done: (result: SchedulerDetailResult) => void,
		now = new Date(),
		reload?: (signal: AbortSignal) => Promise<SchedulerDetailSnapshot>,
	) {
		this.job = job;
		this.definition = definition;
		this.tui = tui;
		this.theme = theme;
		this.done = done;
		this.now = now;
		this.reload = reload;
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
			if (this.reload) void this.refreshData();
			return;
		}
		if ((data === "d" || data === "D") && schedulerJobState(this.job).label === "Needs attention") {
			this.done({ kind: "diagnose" });
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
		const state = schedulerJobState(this.job);
		const tabs = schedulerTabs([
			{ id: "overview", label: "Overview" },
			{ id: "runs", label: "Runs" },
			{ id: "definition", label: "Definition" },
		], this.tab, this.theme);
		const refreshState = this.refreshing
			? this.theme.fg("warning", " · ↻ refreshing")
			: this.refreshStatus
				? this.theme.fg(this.refreshStatus.color, ` · ${this.refreshStatus.message}`)
				: "";
		const body = (bodyWidth: number) => this.tab === "overview"
			? this.overviewLines(bodyWidth)
			: this.tab === "runs"
				? this.detailRunLines(bodyWidth)
				: this.definitionLines(bodyWidth);
		return renderSchedulerPanel(width, this.tui, this.theme, {
			header: `${this.theme.bold(`Scheduler / ${this.job.key}`)} ${this.theme.fg(state.color, `· ${state.icon} ${state.label}`)}${refreshState}`,
			chrome: [
				tabs,
				this.theme.fg("borderMuted", "─".repeat(Math.max(1, width - 2))),
			],
			body: (bodyWidth, bodyHeight) => {
				const lines = body(bodyWidth);
				const start = this.tab === "runs" ? 0 : Math.min(this.scroll, Math.max(0, lines.length - bodyHeight));
				return lines.slice(start, start + bodyHeight);
			},
			compactBody: (bodyWidth) => [tabs, ...body(bodyWidth)],
			hints: [
				{ key: "Tab", label: "switch", priority: 1 },
				{ key: "↑/↓ j/k", label: this.tab === "runs" ? "select" : "scroll", priority: 3 },
				...(this.tab === "runs" ? [{ key: "Enter", label: "output", priority: 1 }] : []),
				{ key: "r", label: "refresh", priority: 4 },
				...(state.label === "Needs attention" ? [{ key: "d", label: "diagnose", priority: 1 }] : []),
				{ key: "a", label: "actions", priority: 2 },
				{ key: "q/Esc", label: "tasks", priority: 0 },
			],
		});
	}

	invalidate(): void {}

	update(snapshot: SchedulerDetailSnapshot, status?: { message: string; color: "success" | "warning" | "error" }): void {
		if (this.disposed) return;
		this.job = snapshot.job;
		this.definition = snapshot.definition;
		this.now = new Date(snapshot.generatedAt);
		this.refreshStatus = status;
		this.tui.requestRender();
	}

	setStatus(status: { message: string; color: "success" | "warning" | "error" }): void {
		if (this.disposed) return;
		this.refreshStatus = status;
		this.tui.requestRender();
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.refreshAbort?.abort();
		this.refreshAbort = undefined;
	}

	async refreshData(): Promise<void> {
		if (!this.reload || this.refreshing || this.disposed) return;
		this.refreshing = true;
		this.refreshStatus = undefined;
		const abort = new AbortController();
		this.refreshAbort = abort;
		this.tui.requestRender();
		try {
			const next = await this.reload(abort.signal);
			if (this.disposed) return;
			this.job = next.job;
			this.definition = next.definition;
			this.now = new Date(next.generatedAt);
			const blocked = schedulerJobState(next.job).label === "Needs attention";
			this.refreshStatus = {
				message: blocked ? "Still blocked" : "Updated",
				color: blocked ? "warning" : "success",
			};
		} catch (error) {
			if (!this.disposed && !abort.signal.aborted) {
				this.refreshStatus = { message: `Refresh failed: ${error instanceof Error ? error.message : String(error)}`, color: "error" };
			}
		} finally {
			if (this.refreshAbort === abort) this.refreshAbort = undefined;
			this.refreshing = false;
			if (!this.disposed) this.tui.requestRender();
		}
	}

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
			if (this.job.candidateError) lines.push(`Recovery: press ${this.theme.fg("accent", "d")} to diagnose with the open agent. Refresh with r after the source or environment changes.`);
			else if (this.job.installationError) lines.push(`Recovery: press ${this.theme.fg("accent", "d")} to diagnose status inspection with the open agent; Definition retains the reviewed identities.`);
			else if (this.job.historyError) lines.push(`Recovery: press ${this.theme.fg("accent", "d")} to diagnose the private run-history state; lifecycle actions remain independently reviewed.`);
			else lines.push(`Recovery: press ${this.theme.fg("accent", "d")} to diagnose this task with the open agent.`);
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

class SchedulerActionReviewComponent implements Component {
	private scroll = 0;
	private confirmSelected: boolean;
	private readonly jobKey: string;
	private readonly action: SchedulerPreparedAction;
	private readonly review: string;
	private readonly presentation?: SchedulerActionPresentation;
	private readonly tui: TuiView;
	private readonly theme: Theme;
	private readonly done: (confirmed: boolean) => void;

	constructor(
		jobKey: string,
		action: SchedulerPreparedAction,
		review: string,
		presentation: SchedulerActionPresentation | undefined,
		tui: TuiView,
		theme: Theme,
		done: (confirmed: boolean) => void,
	) {
		this.jobKey = jobKey;
		this.action = action;
		this.review = review;
		this.presentation = presentation;
		this.confirmSelected = !action.danger;
		this.tui = tui;
		this.theme = theme;
		this.done = done;
	}

	handleInput(data: string): void {
		if (matchesKey(data, "ctrl+c") || matchesKey(data, "escape") || data === "q") {
			this.done(false);
			return;
		}
		if (this.presentation && (matchesKey(data, "left") || matchesKey(data, "right") || matchesKey(data, "tab") || data === "\t")) {
			this.confirmSelected = !this.confirmSelected;
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, "return")) {
			this.done(this.presentation ? this.confirmSelected : true);
			return;
		}
		if (!this.presentation && matchesKey(data, "right")) {
			this.done(true);
			return;
		}
		if (matchesKey(data, "down") || data === "j") this.scroll++;
		else if (matchesKey(data, "up") || data === "k") this.scroll = Math.max(0, this.scroll - 1);
		else if (matchesKey(data, "pageDown") || matchesKey(data, "ctrl+d")) this.scroll += 8;
		else if (matchesKey(data, "pageUp") || matchesKey(data, "ctrl+u")) this.scroll = Math.max(0, this.scroll - 8);
		else if (matchesKey(data, "home")) this.scroll = 0;
		this.tui.requestRender();
	}

	render(width: number): string[] {
		if (this.presentation) return this.renderDecision(width);
		return renderSchedulerPanel(width, this.tui, this.theme, {
			header: `${this.theme.bold(`Scheduler / ${this.jobKey}`)} ${this.theme.fg("dim", `· ${this.action.label}`)}`,
			chrome: [this.theme.fg("borderMuted", "─".repeat(Math.max(1, width - 2)))],
			body: (bodyWidth, bodyHeight) => {
				const content = this.review.split("\n").flatMap((line) => wrapTextWithAnsi(line || " ", bodyWidth));
				const start = Math.min(this.scroll, Math.max(0, content.length - bodyHeight));
				return content.slice(start, start + bodyHeight);
			},
			compactBody: (bodyWidth) => wrapTextWithAnsi(this.review, bodyWidth),
			hints: [
				{ key: "Enter", label: this.action.danger ? "confirm removal" : "confirm", priority: 1, keyColor: this.action.danger ? "error" : "accent" },
				{ key: "↑/↓ j/k", label: "scroll", priority: 3 },
				{ key: "q/Esc", label: "back", priority: 0 },
			],
		});
	}

	invalidate(): void {}

	private renderDecision(width: number): string[] {
		const presentation = this.presentation;
		if (!presentation) return [];
		const confirmColor = this.action.danger ? "error" : "accent";
		const confirmLabel = this.action.id === "enable"
			? "Resume schedule"
			: this.action.id === "disable"
				? "Pause schedule"
				: "Remove schedule";
		const button = (label: string, selected: boolean, color: "accent" | "error") => selected
			? `${this.theme.fg(color, "›")} ${this.theme.fg(color, `[ ${label} ]`)}`
			: `  ${this.theme.fg("dim", `[ ${label} ]`)}`;
		const fromColor = presentation.fromStatus === "Active" ? "success" : "muted";
		const stateLine = `Status       ${this.theme.fg(fromColor, presentation.fromStatus)}  →  ${this.theme.fg(presentation.toStatus === "Active" ? "success" : "muted", presentation.toStatus)}`;
		const buttons = `${button(confirmLabel, this.confirmSelected, confirmColor)}   ${button("Cancel", !this.confirmSelected, "accent")}`;
		const footer = `${this.theme.fg("accent", "←/→")} ${this.theme.fg("dim", "Choose")} ${this.theme.fg("dim", "·")} ${this.theme.fg("accent", "Enter")} ${this.theme.fg("dim", "Select")} ${this.theme.fg("dim", "·")} ${this.theme.fg("accent", "Esc")} ${this.theme.fg("dim", "Cancel")}`;
		const compact = (this.tui.terminal?.rows ?? 24) < 14;
		const compactWidth = Math.max(1, width - 4);
		const lines = compact
			? [
				stateLine,
				truncateToWidth(`${humanizeSchedule(presentation.schedule)} · ${presentation.schedule} · ${presentation.adapter}`, compactWidth, ""),
				...(presentation.note ? [truncateToWidth(`${this.theme.fg("warning", "Note:")} ${presentation.note}`, compactWidth, "")] : []),
				buttons,
				footer,
			]
			: [
				"",
				stateLine,
				`Schedule     ${humanizeSchedule(presentation.schedule)}`,
				`             ${this.theme.fg("dim", `${presentation.schedule} · ${presentation.adapter}`)}`,
				...(presentation.nextRun ? [`Next run     ${formatSchedulerDateTime(presentation.nextRun)}`] : []),
				...(presentation.note ? ["", `${this.theme.fg("warning", "Note:")} ${presentation.note}`] : []),
				"",
				buttons,
				footer,
			];
		const verb = this.action.id === "enable" ? "Resume" : this.action.id === "disable" ? "Pause" : "Remove";
		return compactDialog(`${verb} ${this.jobKey}?`, lines, width, this.theme);
	}
}

class SchedulerBusyComponent implements Component {
	private label: string;
	private readonly tui: TuiView;
	private readonly theme: Theme;
	private readonly cancel: () => void;

	constructor(label: string, tui: TuiView, theme: Theme, cancel: () => void) {
		this.label = label;
		this.tui = tui;
		this.theme = theme;
		this.cancel = cancel;
	}

	handleInput(data: string): void {
		if (matchesKey(data, "ctrl+c") || matchesKey(data, "escape") || data === "q") this.cancel();
	}

	render(width: number): string[] {
		return compactDialog(this.label, [
			this.theme.fg("warning", "↻ Working…"),
			"",
			`${this.theme.fg("accent", "Esc")} ${this.theme.fg("dim", "Stop waiting")}`,
		], width, this.theme);
	}

	invalidate(): void {}
}

export class SchedulerWorkspaceComponent implements Component {
	private readonly tui: TuiView;
	private readonly theme: Theme;
	private readonly done: (result: SchedulerDashboardResult) => void;
	private readonly controller: SchedulerWorkspaceController;
	private readonly dashboard: SchedulerDashboardComponent;
	private detail?: SchedulerJobDetailComponent;
	private detailId?: string;
	private detailDashboard?: SchedulerDashboardData;
	private actions?: SchedulerActionComponent;
	private actionSession?: SchedulerActionSession;
	private selectedActionId?: string;
	private review?: SchedulerActionReviewComponent;
	private text?: SchedulerTextComponent;
	private busy?: SchedulerBusyComponent;
	private modalComponent?: Component;
	private modalHandle?: OverlayHandle;
	private returnToDetail = false;
	private textReturnsToActions = false;
	private operationAbort?: AbortController;
	private disposed = false;

	constructor(
		data: SchedulerDashboardData,
		tui: TuiView,
		theme: Theme,
		done: (result: SchedulerDashboardResult) => void,
		controller: SchedulerWorkspaceController,
	) {
		this.tui = tui;
		this.theme = theme;
		this.done = done;
		this.controller = controller;
		this.dashboard = new SchedulerDashboardComponent(
			data,
			tui,
			theme,
			(result) => this.handleDashboardResult(result),
			new Date(data.generatedAt),
			(signal) => controller.reloadDashboard(signal),
		);
	}

	handleInput(data: string): void {
		this.activeComponent().handleInput?.(data);
	}

	render(width: number): string[] {
		return this.activeComponent().render(width);
	}

	invalidate(): void {
		this.activeComponent().invalidate();
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.operationAbort?.abort();
		this.operationAbort = undefined;
		this.dashboard.dispose();
		this.detail?.dispose();
		this.text?.dispose();
		this.closeModal();
		this.detail = undefined;
		this.text = undefined;
		this.actions = undefined;
		this.review = undefined;
		this.busy = undefined;
	}

	private activeComponent(): Component {
		return this.modalHandle ? this.text ?? this.detail ?? this.dashboard : this.modalComponent ?? this.text ?? this.detail ?? this.dashboard;
	}

	private handleDashboardResult(result: SchedulerDashboardResult): void {
		if (result.kind === "job") {
			void this.openDetail(result.id);
			return;
		}
		if (result.kind === "actions") {
			void this.openActions(result.id, false);
			return;
		}
		if (result.kind === "run") {
			void this.openRunOutput(result.id, result.runId, false);
			return;
		}
		this.done(result);
	}

	private handleDetailResult(result: SchedulerDetailResult): void {
		if (result.kind === "back") {
			this.detail?.dispose();
			this.detail = undefined;
			this.detailId = undefined;
			this.returnToDetail = false;
			this.dashboard.resume(this.detailDashboard);
			this.detailDashboard = undefined;
			return;
		}
		const id = this.detailId;
		if (!id) return;
		if (result.kind === "diagnose") {
			this.done({ kind: "diagnose", id });
			return;
		}
		if (result.kind === "actions") {
			void this.openActions(id, true);
			return;
		}
		void this.openRunOutput(result.id, result.runId, true);
	}

	private async openDetail(id: string): Promise<void> {
		if (this.operationAbort || this.disposed) return;
		this.returnToDetail = false;
		this.dashboard.suspend();
		const abort = this.beginBusy("Loading task details…", () => this.restoreOrigin());
		try {
			const snapshot = await this.controller.loadDetail(id, abort.signal);
			if (this.disposed || abort.signal.aborted) return;
			this.detailId = id;
			this.detailDashboard = snapshot.dashboard;
			this.detail = new SchedulerJobDetailComponent(
				snapshot.job,
				snapshot.definition,
				this.tui,
				this.theme,
				(result) => this.handleDetailResult(result),
				new Date(snapshot.generatedAt),
				async (signal) => {
					const refreshed = await this.controller.loadDetail(id, signal);
					this.detailDashboard = refreshed.dashboard;
					return refreshed;
				},
			);
		} catch (error) {
			if (!this.disposed && !abort.signal.aborted) {
				this.dashboard.resume();
				this.dashboard.setStatus(this.errorMessage(error));
			}
		} finally {
			this.finishBusy(abort);
		}
	}

	private async openActions(id: string, fromDetail: boolean): Promise<void> {
		if (this.operationAbort || this.disposed) return;
		this.returnToDetail = fromDetail;
		if (!fromDetail) this.dashboard.suspend();
		const abort = this.beginBusy("Loading current actions…", () => this.restoreOrigin());
		try {
			const session = await this.controller.prepareActions(id, abort.signal);
			if (this.disposed || abort.signal.aborted) return;
			this.actionSession = session;
			this.selectedActionId = undefined;
			this.showActions();
		} catch (error) {
			if (!this.disposed && !abort.signal.aborted) {
				this.restoreOrigin();
				this.setOriginStatus(this.errorMessage(error), "error");
			}
		} finally {
			this.finishBusy(abort);
		}
	}

	private async openAction(actionId: string): Promise<void> {
		const session = this.actionSession;
		const action = session?.actions.find((candidate) => candidate.id === actionId);
		if (!session || !action || this.operationAbort || this.disposed) return;
		const abort = this.beginBusy(`Preparing ${action.label.toLowerCase()}…`, () => this.showActions());
		try {
			const target = await action.open(abort.signal);
			if (this.disposed || abort.signal.aborted) return;
			if (target.kind === "mutation") {
				this.review = new SchedulerActionReviewComponent(
					session.key,
					action,
					target.review,
					target.presentation,
					this.tui,
					this.theme,
					(confirmed) => {
						this.closeModal(this.review);
						if (!confirmed) {
							this.review = undefined;
							this.showActions();
						} else void this.applyAction(action, target);
					},
				);
				this.showModal(this.review, target.presentation ? DECISION_MODAL_OPTIONS : DOCUMENT_MODAL_OPTIONS);
				return;
			}
			const snapshot = await target.load(abort.signal);
			if (this.disposed || abort.signal.aborted) return;
			this.textReturnsToActions = true;
			this.openText(snapshot, undefined);
		} catch (error) {
			if (!this.disposed && !abort.signal.aborted) {
				this.restoreOrigin();
				this.setOriginStatus(this.errorMessage(error), "error");
			}
		} finally {
			this.finishBusy(abort);
		}
	}

	private async applyAction(
		action: SchedulerPreparedAction,
		target: Extract<SchedulerActionTarget, { kind: "mutation" }>,
	): Promise<void> {
		if (this.operationAbort || this.disposed) return;
		const abort = this.beginBusy(`${action.label}…`, () => this.restoreOrigin(target.cancelled));
		try {
			const outcome = await target.apply(abort.signal);
			if (this.disposed || abort.signal.aborted) return;
			this.restoreOrigin(outcome);
		} catch (error) {
			if (!this.disposed && !abort.signal.aborted) {
				this.restoreOrigin();
				this.setOriginStatus(`Scheduler state refresh failed: ${this.errorMessage(error)}`, "error");
			}
		} finally {
			this.finishBusy(abort);
		}
	}

	private async openRunOutput(id: string, runId: string, fromDetail: boolean): Promise<void> {
		if (this.operationAbort || this.disposed) return;
		this.returnToDetail = fromDetail;
		this.textReturnsToActions = false;
		if (!fromDetail) this.dashboard.suspend();
		const abort = this.beginBusy("Loading run output…", () => this.restoreOrigin());
		try {
			const snapshot = await this.controller.loadRunOutput(id, runId, abort.signal);
			if (this.disposed || abort.signal.aborted) return;
			this.openText(
				snapshot,
				snapshot.complete ? undefined : (signal) => this.controller.loadRunOutput(id, runId, signal),
			);
		} catch (error) {
			if (!this.disposed && !abort.signal.aborted) {
				this.restoreOrigin();
				this.setOriginStatus(this.errorMessage(error), "error");
			}
		} finally {
			this.finishBusy(abort);
		}
	}

	private openText(
		snapshot: SchedulerTextSnapshot,
		reload?: (signal: AbortSignal) => Promise<SchedulerTextSnapshot>,
	): void {
		this.text?.dispose();
		this.text = new SchedulerTextComponent(
			snapshot.title,
			snapshot.text,
			this.tui,
			this.theme,
			() => this.closeText(),
			reload,
		);
		this.tui.requestRender();
	}

	private closeText(): void {
		this.text?.dispose();
		this.text = undefined;
		if (!this.textReturnsToActions) this.restoreOrigin();
		else this.showActions();
		this.tui.requestRender();
	}

	private showActions(): void {
		const session = this.actionSession;
		this.review = undefined;
		this.text?.dispose();
		this.text = undefined;
		if (session) {
			this.actions = new SchedulerActionComponent(
				session.job,
				session.actions,
				this.tui,
				this.theme,
				(action) => {
					this.closeModal(this.actions);
					if (!action) this.restoreOrigin();
					else {
						this.selectedActionId = action;
						void this.openAction(action);
					}
				},
				this.selectedActionId,
			);
			this.showModal(this.actions, ACTION_MODAL_OPTIONS);
		}
		this.tui.requestRender();
	}

	private restoreOrigin(outcome?: SchedulerActionOutcome): void {
		this.closeModal();
		this.operationAbort?.abort();
		this.operationAbort = undefined;
		this.busy = undefined;
		this.text?.dispose();
		this.text = undefined;
		this.review = undefined;
		this.actions = undefined;
		this.actionSession = undefined;
		this.selectedActionId = undefined;
		if (outcome) {
			const status = { message: outcome.message, color: outcome.status } as const;
			this.detailDashboard = outcome.dashboard;
			this.dashboard.update(outcome.dashboard, status);
			if (this.returnToDetail && this.detail && outcome.detail) this.detail.update(outcome.detail, status);
			else if (this.returnToDetail && !outcome.detail) {
				this.detail?.dispose();
				this.detail = undefined;
				this.detailId = undefined;
				this.returnToDetail = false;
			}
		}
		if (!this.returnToDetail) this.dashboard.resume();
		this.tui.requestRender();
	}

	private beginBusy(label: string, cancel: () => void): AbortController {
		const abort = new AbortController();
		this.operationAbort = abort;
		this.busy = new SchedulerBusyComponent(label, this.tui, this.theme, () => {
			abort.abort();
			cancel();
		});
		this.showModal(this.busy, BUSY_MODAL_OPTIONS);
		this.tui.requestRender();
		return abort;
	}

	private finishBusy(abort: AbortController): void {
		if (this.operationAbort === abort) {
			this.operationAbort = undefined;
			this.closeModal(this.busy);
			this.busy = undefined;
		}
		if (!this.disposed) this.tui.requestRender();
	}

	private showModal(component: Component, options: OverlayOptions): void {
		this.closeModal();
		this.modalComponent = component;
		this.modalHandle = this.tui.showOverlay?.(component, options);
		this.tui.requestRender();
	}

	private closeModal(component?: Component): void {
		if (component && this.modalComponent !== component) return;
		const handle = this.modalHandle;
		this.modalHandle = undefined;
		this.modalComponent = undefined;
		handle?.hide();
	}

	private setOriginStatus(message: string, color: "success" | "error"): void {
		if (this.returnToDetail && this.detail) this.detail.setStatus({ message, color });
		else this.dashboard.setStatus(message, color);
		this.tui.requestRender();
	}

	private errorMessage(error: unknown): string {
		return error instanceof Error ? error.message : String(error);
	}
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
		const refreshState = this.refreshing
			? ` ${this.theme.fg("warning", "↻ updating")}`
			: this.refreshFailure
				? this.theme.fg("error", " · refresh failed")
				: "";
		return renderSchedulerPanel(width, this.tui, this.theme, {
			header: `${this.theme.bold(this.title)}${refreshState}`,
			chrome: [this.theme.fg("borderMuted", "─".repeat(Math.max(1, width - 2)))],
			body: (bodyWidth, bodyHeight) => {
				const content = this.text.split("\n").flatMap((line) => wrapTextWithAnsi(line || " ", bodyWidth));
				const start = Math.max(0, content.length - bodyHeight - this.scroll);
				return content.slice(start, start + bodyHeight);
			},
			hints: [
				...(this.refreshFailure ? [{ key: "!", label: `Refresh failed: ${this.refreshFailure}`, priority: 1, keyColor: "error" as const, labelColor: "error" as const }] : []),
				{ key: "↑/↓ j/k", label: "scroll", priority: 3 },
				{ key: "End", label: "latest", priority: 2 },
				...(this.reload && !this.complete ? [{ key: "↻", label: "updates automatically", priority: 4, keyColor: "warning" as const }] : []),
				{ key: "q/Esc", label: "back", priority: 0 },
			],
		});
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
