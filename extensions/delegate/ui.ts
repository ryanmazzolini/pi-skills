import { open } from "node:fs/promises";
import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import {
	Box,
	matchesKey,
	Text,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
	type Component,
	type TUI,
} from "@earendil-works/pi-tui";
import {
	deriveRunStatus,
	isGitTemporaryWorkspace,
	type DelegateHandle,
	type DelegateRuntime,
	type DelegatedChild,
	type DelegationRun,
	type RunView,
} from "./runtime.ts";

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_FRAME_MS = 200;
const PINNED_SPINNER_FRAME_MS = 80; // Match Pi's built-in Loader.
const TERMINAL_RETENTION_MS = 30_000;
const STALE_ACTIVITY_MS = 10_000;
const MAX_PINNED_ROWS = 6;
const NARROW_WIDGET_WIDTH = 72;
const NARROW_OVERLAY_WIDTH = 80;
const MAX_HISTORY_EVENTS = 100;
const MAX_HISTORY_READ_BYTES = 512 * 1024;

export type ChildHistoryEvent =
	| { kind: "user"; text: string }
	| { kind: "assistant"; text: string }
	| { kind: "tool_call"; toolName: string; arguments: unknown }
	| { kind: "tool_result"; toolName: string; text: string; isError: boolean };

function compactDuration(elapsed: number): string {
	const seconds = Math.floor(Math.max(0, elapsed) / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	return `${minutes}m ${seconds % 60}s`;
}

function resultText(result: NonNullable<RunView["children"][number]["result"]>, expanded = false): string {
	return result.kind === "text" ? result.value : JSON.stringify(result.value, null, expanded ? 2 : undefined);
}

function temporaryWorkspaceLines(runId: string, child: DelegatedChild, theme: Theme, showControls = true): string[] {
	if (child.workspace.kind !== "temporary") return [];
	const integration = child.workspace.integration;
	const scratch = !isGitTemporaryWorkspace(child.workspace) ? child.workspace : undefined;
	const git = scratch === undefined;
	if (integration.state === "working") {
		const lines = git
			? (isFinalState(child.state)
				? [theme.fg("warning", showControls ? "Temporary workspace ready for review" : "Temporary workspace ready for conductor review")]
				: [theme.fg("dim", "Working in an isolated temporary workspace")])
			: (isFinalState(child.state)
				? [theme.fg("warning", "Scratch artifacts are ready for disposition")]
				: [theme.fg("dim", "Working in an isolated scratch workspace")]);
		if (scratch) {
			lines.push(theme.fg("dim", `Scratch: ${scratch.worktreePath}`));
			for (const entry of scratch.contents?.entries ?? []) lines.push(theme.fg("dim", `  ${entry}`));
			if (scratch.contents?.truncated) lines.push(theme.fg("dim", "  [additional entries omitted]"));
			if (scratch.contents?.error) lines.push(theme.fg("warning", scratch.contents.error));
		}
		if (integration.message) lines.push(theme.fg("warning", integration.message));
		if (showControls && isFinalState(child.state)) {
			lines.push(theme.fg("dim", git
				? `Review: /agents review ${runId} ${child.id}`
				: `After preserving useful artifacts: /agents cleanup ${runId} ${child.id}`));
		}
		return lines;
	}
	if (integration.state === "review_pending" || integration.state === "conflict") {
		const review = integration.review;
		const lines = [
			theme.fg(integration.state === "conflict" ? "warning" : "accent", `Workspace ${integration.state === "conflict" ? "conflict" : "review pending"} · ${review.summary.stat}`),
			theme.fg("dim", `Revision: ${review.revision}`),
			theme.fg("dim", `Patch: ${review.patchPath}`),
			theme.fg("dim", `Manifest: ${review.manifestPath}`),
		];
		if (integration.state === "conflict") lines.push(theme.fg("error", integration.message));
		if (showControls) {
			lines.push(theme.fg("dim", `Apply: /agents apply ${runId} ${review.revision} ${child.id}`));
			lines.push(theme.fg("dim", `Discard: /agents discard ${runId} ${review.revision} ${child.id}`));
		} else {
			lines.push(theme.fg("dim", "The conductor can apply or discard this reviewed revision"));
		}
		return lines;
	}
	if (integration.state === "applying" || integration.state === "discarding") {
		return [theme.fg("warning", `Workspace ${integration.state} · ${integration.review.revision}`)];
	}
	const cleanupError = "cleanupError" in integration ? integration.cleanupError : undefined;
	const lines = [theme.fg(integration.state === "applied" || integration.state === "cleaned" ? "success" : "dim", `Workspace ${integration.state.replace("_", " ")}`)];
	if (cleanupError) {
		lines.push(theme.fg("warning", `Cleanup failed: ${cleanupError}`));
		lines.push(theme.fg("dim", showControls ? `Retry cleanup: /agents cleanup ${runId} ${child.id}` : "The conductor can retry cleanup"));
	}
	return lines;
}

function isFinalState(state: DelegatedChild["state"]): boolean {
	return state === "completed" || state === "failed" || state === "cancelled";
}

export function describeLatestActivity(
	run: DelegationRun,
	now = Date.now(),
	staleAfterMs = 10_000,
	childIndex = 0,
): string {
	const child = run.children[childIndex];
	if (!child) return "No child activity";
	const observedAt = Date.parse(child.latestActivity.observedAt);
	const age = Number.isFinite(observedAt) ? Math.max(0, now - observedAt) : 0;
	const active = child.state === "starting" || child.state === "running";
	if (active && age >= staleAfterMs) {
		return `Still running · last activity ${compactDuration(age)} ago (${child.latestActivity.summary})`;
	}
	return active
		? `${child.latestActivity.summary} · ${compactDuration(age)} ago`
		: child.latestActivity.summary;
}

export function stateIcon(
	state: DelegatedChild["state"],
	theme: Theme,
	animated = true,
	now = Date.now(),
	frameMs = SPINNER_FRAME_MS,
): string {
	if (state === "running" || state === "starting" || state === "queued") {
		const frame = animated
			? SPINNER[Math.floor(now / frameMs) % SPINNER.length] ?? "⠋"
			: "◐";
		return theme.fg(state === "queued" ? "muted" : "warning", frame);
	}
	if (state === "completed") return theme.fg("success", "✓");
	if (state === "failed") return theme.fg("error", "✗");
	if (state === "needs_attention") return theme.fg("warning", "?");
	if (state === "interrupted") return theme.fg("warning", "■");
	return theme.fg("muted", "○");
}

export interface PinnedStatusOptions {
	now?: () => number;
	spinnerFrameMs?: number;
	terminalRetentionMs?: number;
	staleAfterMs?: number;
	maxRows?: number;
	narrowWidth?: number;
}

interface PinnedChildRow {
	run: DelegationRun;
	child: DelegatedChild;
	order: number;
}

function terminalTimestamp(run: DelegationRun, child: DelegatedChild): number {
	const value = child.result?.completedAt
		?? child.failure?.failedAt
		?? child.latestActivity.observedAt
		?? run.updatedAt;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : Date.now();
}

function pinnedPriority(state: DelegatedChild["state"]): number {
	if (state === "needs_attention") return 0;
	if (state === "failed") return 1;
	if (state === "interrupted") return 2;
	if (state === "running" || state === "starting") return 3;
	if (state === "queued") return 4;
	if (state === "completed") return 5;
	return 6;
}

function firstDisplayLine(value: string): string {
	return value.split(/[\r\n]+/).map((line) => line.trim()).find(Boolean) ?? "";
}

function pinnedStateSummary(child: DelegatedChild, now: number, staleAfterMs: number): string {
	if (child.state === "needs_attention") {
		const kind = child.attention?.kind ?? "attention";
		const question = child.attention?.question;
		return question ? `Needs ${kind}: ${question}` : "Needs attention";
	}
	if (child.state === "failed") return `Failed${child.failure?.message ? `: ${child.failure.message}` : ""}`;
	if (child.state === "interrupted") return "Interrupted · resume in /agents";
	if (child.state === "completed") return "Completed";
	if (child.state === "cancelled") return "Cancelled";
	if (child.state === "queued") return `Queued · ${child.latestActivity.summary}`;

	const observedAt = Date.parse(child.latestActivity.observedAt);
	const age = Number.isFinite(observedAt) ? Math.max(0, now - observedAt) : 0;
	if (age >= staleAfterMs) {
		return `Still running · ${child.latestActivity.summary} · quiet ${compactDuration(age)}`;
	}
	return child.state === "starting"
		? `Starting · ${child.latestActivity.summary}`
		: child.latestActivity.summary;
}

function statusCounts(rows: PinnedChildRow[]): string[] {
	const counts = new Map<string, number>();
	for (const { child } of rows) {
		const label = child.state === "starting" || child.state === "running" ? "running" : child.state.replace("_", " ");
		counts.set(label, (counts.get(label) ?? 0) + 1);
	}
	const order = ["needs attention", "failed", "interrupted", "running", "queued", "completed", "cancelled"];
	return order.flatMap((label) => {
		const count = counts.get(label);
		return count ? [`${count} ${label}`] : [];
	});
}

export class PinnedAgentStatusComponent implements Component {
	private readonly runtime: DelegateRuntime;
	private readonly tui: Pick<TUI, "requestRender">;
	private readonly theme: Theme;
	private readonly now: () => number;
	private readonly spinnerFrameMs: number;
	private readonly terminalRetentionMs: number;
	private readonly staleAfterMs: number;
	private readonly maxRows: number;
	private readonly narrowWidth: number;
	private readonly terminalUntil = new Map<string, number>();
	private readonly dismissedTerminal = new Set<string>();
	private readonly unsubscribe: () => void;
	private animationTimer: ReturnType<typeof setInterval> | undefined;
	private expiryTimer: ReturnType<typeof setTimeout> | undefined;
	private disposed = false;

	constructor(
		runtime: DelegateRuntime,
		tui: Pick<TUI, "requestRender">,
		theme: Theme,
		options: PinnedStatusOptions = {},
	) {
		this.runtime = runtime;
		this.tui = tui;
		this.theme = theme;
		this.now = options.now ?? Date.now;
		this.spinnerFrameMs = options.spinnerFrameMs ?? PINNED_SPINNER_FRAME_MS;
		this.terminalRetentionMs = options.terminalRetentionMs ?? TERMINAL_RETENTION_MS;
		this.staleAfterMs = options.staleAfterMs ?? STALE_ACTIVITY_MS;
		this.maxRows = options.maxRows ?? MAX_PINNED_ROWS;
		this.narrowWidth = options.narrowWidth ?? NARROW_WIDGET_WIDTH;
		for (const run of runtime.list()) this.trackTerminalChildren(run, false);
		this.unsubscribe = runtime.subscribe((run) => {
			this.trackTerminalChildren(run, true);
			this.syncAnimationTimer();
			this.scheduleTerminalExpiry();
			this.tui.requestRender();
		});
		this.syncAnimationTimer();
		this.scheduleTerminalExpiry();
	}

	render(width: number): string[] {
		const safeWidth = Math.max(1, width);
		const now = this.now();
		const rows = this.visibleRows(now);
		if (rows.length === 0) return [];
		const longestElapsed = Math.max(...rows.map(({ run, child }) => this.elapsedFor(run, child, now)));
		const counts = statusCounts(rows);
		const header = this.theme.bold(`Agents · ${counts.join(" · ")} · ${compactDuration(longestElapsed)}`);
		if (safeWidth < this.narrowWidth) {
			const compactCounts = counts.map((count) => count.replace("needs attention", "attention").replace("completed", "done"));
			const compactHeader = this.theme.bold(`Agents · ${compactCounts.join(" · ")} · ${compactDuration(longestElapsed)}`);
			const suffix = this.theme.fg("dim", " · /agents");
			if (safeWidth <= visibleWidth(suffix)) return [truncateToWidth(this.theme.fg("dim", "/agents"), safeWidth)];
			return [`${truncateToWidth(compactHeader, safeWidth - visibleWidth(suffix))}${suffix}`];
		}

		const prioritized = [...rows].sort((left, right) => pinnedPriority(left.child.state) - pinnedPriority(right.child.state) || left.order - right.order);
		const visible = prioritized.slice(0, this.maxRows);
		const lines = [header];
		for (const { run, child } of visible) {
			const icon = stateIcon(child.state, this.theme, true, now, this.spinnerFrameMs);
			const label = this.theme.fg("accent", firstDisplayLine(child.label));
			const detail = this.theme.fg(
				child.state === "failed" ? "error" : child.state === "needs_attention" || child.state === "interrupted" ? "warning" : "dim",
				`${firstDisplayLine(pinnedStateSummary(child, now, this.staleAfterMs))} · ${compactDuration(this.elapsedFor(run, child, now))}`,
			);
			lines.push(`${icon} ${label} · ${detail}`);
		}
		if (prioritized.length > visible.length) {
			lines.push(this.theme.fg("dim", `… ${prioritized.length - visible.length} more · /agents`));
		}
		return lines.map((line) => truncateToWidth(line, safeWidth));
	}

	invalidate(): void {}

	dismissTerminal(): void {
		if (this.terminalUntil.size === 0) return;
		for (const childId of this.terminalUntil.keys()) this.dismissedTerminal.add(childId);
		this.terminalUntil.clear();
		this.scheduleTerminalExpiry();
		this.tui.requestRender();
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		if (this.animationTimer) clearInterval(this.animationTimer);
		this.animationTimer = undefined;
		if (this.expiryTimer) clearTimeout(this.expiryTimer);
		this.unsubscribe();
	}

	private visibleRows(now = this.now()): PinnedChildRow[] {
		const runs = this.runtime.list().sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
		const rows: PinnedChildRow[] = [];
		let order = 0;
		for (const run of runs) {
			for (const child of run.children) {
				const terminal = isFinalState(child.state);
				const until = terminal ? this.terminalUntil.get(child.id) : undefined;
				if (!terminal || (until !== undefined && until > now)) rows.push({ run, child, order });
				if (terminal && until !== undefined && until <= now) this.terminalUntil.delete(child.id);
				order++;
			}
		}
		return rows;
	}

	private trackTerminalChildren(run: DelegationRun, newlyObserved: boolean): void {
		const now = this.now();
		for (const child of run.children) {
			if (!isFinalState(child.state)) {
				this.terminalUntil.delete(child.id);
				this.dismissedTerminal.delete(child.id);
				continue;
			}
			if (this.dismissedTerminal.has(child.id) || this.terminalUntil.has(child.id)) continue;
			const endedAt = newlyObserved ? Math.max(now, terminalTimestamp(run, child)) : terminalTimestamp(run, child);
			const until = endedAt + this.terminalRetentionMs;
			if (until > now) this.terminalUntil.set(child.id, until);
		}
	}

	private syncAnimationTimer(): void {
		const active = this.runtime.list().some((run) => run.children.some((child) =>
			child.state === "queued" || child.state === "starting" || child.state === "running",
		));
		if (!active || this.disposed) {
			if (this.animationTimer) clearInterval(this.animationTimer);
			this.animationTimer = undefined;
			return;
		}
		if (this.animationTimer) return;
		this.animationTimer = setInterval(() => {
			if (!this.disposed) this.tui.requestRender();
		}, this.spinnerFrameMs);
		this.animationTimer.unref?.();
	}

	private scheduleTerminalExpiry(): void {
		if (this.expiryTimer) clearTimeout(this.expiryTimer);
		this.expiryTimer = undefined;
		if (this.disposed || this.terminalUntil.size === 0) return;
		const nextExpiry = Math.min(...this.terminalUntil.values());
		this.expiryTimer = setTimeout(() => {
			this.expiryTimer = undefined;
			if (this.disposed) return;
			this.visibleRows(this.now());
			this.tui.requestRender();
			this.scheduleTerminalExpiry();
		}, Math.max(0, nextExpiry - this.now()));
		this.expiryTimer.unref?.();
	}

	private elapsedFor(run: DelegationRun, child: DelegatedChild, now: number): number {
		const startedAt = Date.parse(run.createdAt);
		const paused = child.state === "needs_attention" || child.state === "interrupted";
		const pausedAt = Date.parse(child.latestActivity.observedAt);
		const end = isFinalState(child.state)
			? terminalTimestamp(run, child)
			: paused && Number.isFinite(pausedAt)
				? pausedAt
				: now;
		return Math.max(0, end - (Number.isFinite(startedAt) ? startedAt : end));
	}
}

function textParts(content: unknown): string[] {
	if (typeof content === "string") return [content];
	if (!Array.isArray(content)) return [];
	return content.flatMap((part) => {
		if (!part || typeof part !== "object") return [];
		const value = part as { type?: string; text?: string };
		return value.type === "text" && typeof value.text === "string" ? [value.text] : [];
	});
}

export async function readChildHistory(sessionFile: string): Promise<ChildHistoryEvent[]> {
	const file = await open(sessionFile, "r");
	let raw: string;
	try {
		const info = await file.stat();
		const length = Math.min(info.size, MAX_HISTORY_READ_BYTES);
		const start = Math.max(0, info.size - length);
		const buffer = Buffer.alloc(length);
		const { bytesRead } = await file.read(buffer, 0, length, start);
		raw = buffer.subarray(0, bytesRead).toString("utf8");
		if (start > 0) {
			const firstNewline = raw.indexOf("\n");
			raw = firstNewline >= 0 ? raw.slice(firstNewline + 1) : "";
		}
	} finally {
		await file.close();
	}
	const entries: Array<Record<string, unknown>> = [];
	for (const line of raw.split("\n")) {
		if (!line.trim()) continue;
		try {
			const entry = JSON.parse(line) as unknown;
			if (entry && typeof entry === "object") entries.push(entry as Record<string, unknown>);
		} catch {
			// The active JSONL file may have an incomplete final write; the next refresh will recover it.
		}
	}
	const marker = entries.findLastIndex((entry) => entry.type === "session_info"
		&& typeof entry.name === "string"
		&& entry.name.startsWith("delegate:"));
	const selected = marker >= 0 ? entries.slice(marker + 1) : entries;
	const events: ChildHistoryEvent[] = [];
	const hiddenTerminalCalls = new Set<string>();
	for (const entry of selected) {
		if (entry.type !== "message" || !entry.message || typeof entry.message !== "object") continue;
		const message = entry.message as {
			role?: string;
			content?: unknown;
			toolName?: string;
			toolCallId?: string;
			isError?: boolean;
		};
		if (message.role === "user") {
			const text = textParts(message.content).join("\n").trim();
			if (text) events.push({ kind: "user", text });
			continue;
		}
		if (message.role === "assistant" && Array.isArray(message.content)) {
			for (const part of message.content) {
				if (!part || typeof part !== "object") continue;
				const value = part as { type?: string; text?: string; id?: string; name?: string; arguments?: unknown };
				if (value.type === "text" && value.text?.trim()) events.push({ kind: "assistant", text: value.text.trim() });
				if (value.type === "toolCall") {
					if (value.name === "delegate_final" || value.name === "delegate_attention") {
						if (value.id) hiddenTerminalCalls.add(value.id);
						continue;
					}
					events.push({ kind: "tool_call", toolName: value.name ?? "tool", arguments: value.arguments });
				}
			}
			continue;
		}
		if (message.role === "toolResult") {
			if (message.toolCallId && hiddenTerminalCalls.has(message.toolCallId)) continue;
			const text = textParts(message.content).join("\n").trim();
			if (text) events.push({ kind: "tool_result", toolName: message.toolName ?? "tool", text, isError: message.isError === true });
		}
	}
	return events.slice(-MAX_HISTORY_EVENTS);
}

function padAnsi(value: string, width: number): string {
	const truncated = truncateToWidth(value, Math.max(1, width));
	return truncated + " ".repeat(Math.max(0, width - visibleWidth(truncated)));
}

function boundedDisplay(value: string, maxChars = 16_000): string {
	return value.length <= maxChars ? value : `${value.slice(0, maxChars)}\n[Display truncated]`;
}

function opaqueOverlay(lines: string[], width: number, theme: Theme): string[] {
	const box = new Box(0, 0, (text) => theme.bg("toolPendingBg", text));
	box.addChild(new Text(lines.map((line) => padAnsi(line, width)).join("\n"), 0, 0));
	return box.render(width);
}

function framedOverlay(lines: string[], width: number, theme: Theme): string[] {
	if (width < 3) return opaqueOverlay(lines.map((line) => truncateToWidth(line, width)), width, theme);
	const innerWidth = width - 2;
	const border = (value: string) => theme.fg("borderMuted", value);
	return opaqueOverlay([
		border(`╭${"─".repeat(innerWidth)}╮`),
		...lines.map((line) => `${border("│")}${padAnsi(line, innerWidth)}${border("│")}`),
		border(`╰${"─".repeat(innerWidth)}╯`),
	], width, theme);
}

function toolCallSummary(toolName: string, args: unknown): string {
	if (!args || typeof args !== "object" || Array.isArray(args)) return toolName;
	const values = args as Record<string, unknown>;
	if (toolName === "bash" && typeof values.command === "string") return `$ ${values.command}`;
	if (typeof values.path === "string") return `${toolName} ${values.path}`;
	if (toolName === "grep" && typeof values.pattern === "string") {
		return `grep ${JSON.stringify(values.pattern)}${typeof values.path === "string" ? ` ${values.path}` : ""}`;
	}
	const encoded = JSON.stringify(values);
	return encoded && encoded !== "{}" ? `${toolName} ${encoded}` : toolName;
}

function historyEventLines(event: ChildHistoryEvent, width: number, expanded: boolean, theme: Theme): string[] {
	if (event.kind === "user") {
		const lines = wrapTextWithAnsi(boundedDisplay(event.text, 8_000), Math.max(1, width - 2));
		return lines.map((line, index) => index === 0 ? `${theme.fg("accent", "❯")} ${line}` : `  ${line}`);
	}
	if (event.kind === "assistant") return wrapTextWithAnsi(boundedDisplay(event.text), width);
	if (event.kind === "tool_call") {
		return wrapTextWithAnsi(`${theme.fg("toolTitle", "●")} ${toolCallSummary(event.toolName, event.arguments)}`, width);
	}
	const output = boundedDisplay(event.text, expanded ? 16_000 : 4_000);
	const wrapped = wrapTextWithAnsi(output, Math.max(1, width - 4));
	const limit = expanded ? 40 : 8;
	const visible = wrapped.slice(0, limit);
	const color = event.isError ? "error" : "toolOutput";
	const lines = visible.map((line, index) => theme.fg(color, `${index === 0 ? "  ⎿ " : "    "}${line}`));
	if (wrapped.length > visible.length) lines.push(theme.fg("dim", `    … ${wrapped.length - visible.length} more lines · Enter for detail`));
	return lines;
}

function historyHasResult(history: ChildHistoryEvent[], child: DelegatedChild): boolean {
	if (!child.result || child.result.kind !== "text") return false;
	const expected = child.result.value.trim();
	return history.some((event) => event.kind === "assistant" && event.text.trim() === expected);
}

export type DeskSection = "recovery" | "managed" | "recent";

export interface DeskAssignment {
	run: DelegationRun;
	child: DelegatedChild;
	childIndex: number;
	section: DeskSection;
}

export interface AgentDeskTarget {
	runId?: string;
	childId?: string;
}

export interface AgentDeskActions {
	resume(runId: string, childId: string): Promise<void>;
}

interface RunOverlayOptions {
	initialChildId?: string;
	detailOnly?: boolean;
}

const DESK_SECTIONS: Array<{ section: DeskSection; label: string }> = [
	{ section: "recovery", label: "NEEDS RECOVERY" },
	{ section: "managed", label: "MANAGED BY CONDUCTOR" },
	{ section: "recent", label: "RECENT" },
];

function deskSection(child: DelegatedChild): DeskSection {
	if (child.state === "interrupted") return "recovery";
	if (child.state === "completed" || child.state === "failed" || child.state === "cancelled") return "recent";
	return "managed";
}

export function listDeskAssignments(runs: DelegationRun[]): DeskAssignment[] {
	const orderedRuns = [...runs].sort((left, right) => {
		const time = Date.parse(right.createdAt) - Date.parse(left.createdAt);
		return time || left.id.localeCompare(right.id);
	});
	return DESK_SECTIONS.flatMap(({ section }) => orderedRuns.flatMap((run) => run.children.flatMap((child, childIndex) => (
		deskSection(child) === section ? [{ run, child, childIndex, section }] : []
	))));
}

function attentionDeliverySummary(child: DelegatedChild): string {
	const notification = child.attention?.notification;
	if (!notification || notification.state === "pending") return "Notifying conductor";
	if (notification.state === "delivered") return "Waiting on conductor";
	return "Update held · /agents use";
}

function deskAssignmentSummary(assignment: DeskAssignment): string {
	const { run, child } = assignment;
	if (child.state === "interrupted") return "Interrupted";
	if (child.state === "needs_attention") return attentionDeliverySummary(child);
	if (child.state === "queued") return `Queued · ${child.latestActivity.summary}`;
	if (child.state === "starting") return `Starting · ${child.latestActivity.summary}`;
	if (child.state === "running") return child.latestActivity.summary;
	if (child.state === "completed") {
		return run.delivery.state === "held" ? "Completed · update held · /agents use" : "Completed";
	}
	if (child.state === "failed") {
		const failed = `Failed${child.failure?.message ? ` · ${child.failure.message}` : ""}`;
		return run.delivery.state === "held" ? `${failed} · update held · /agents use` : failed;
	}
	return run.delivery.state === "held" ? "Cancelled · update held · /agents use" : "Cancelled";
}

interface DeskDisplayLine {
	text: string;
	childId?: string;
}

export class AgentDeskOverlayComponent implements Component {
	private readonly runtime: DelegateRuntime;
	private readonly tui: Pick<TUI, "requestRender"> & { terminal?: { rows: number } };
	private readonly theme: Theme;
	private readonly done: () => void;
	private readonly actions: AgentDeskActions;
	private readonly unsubscribe: () => void;
	private readonly timer: ReturnType<typeof setInterval>;
	private readonly resumePending = new Set<string>();
	private readonly resumeErrors = new Map<string, string>();
	private selectedChildId: string | undefined;
	private selectedIndexHint = 0;
	private detail: RunOverlayComponent | undefined;
	private disposed = false;

	constructor(
		runtime: DelegateRuntime,
		target: AgentDeskTarget,
		tui: Pick<TUI, "requestRender"> & { terminal?: { rows: number } },
		theme: Theme,
		done: () => void,
		actions: AgentDeskActions,
	) {
		this.runtime = runtime;
		this.tui = tui;
		this.theme = theme;
		this.done = done;
		this.actions = actions;
		const assignments = this.assignments();
		const initialIndex = target.childId
			? assignments.findIndex(({ run, child }) => child.id === target.childId && (!target.runId || run.id === target.runId))
			: target.runId
				? assignments.findIndex(({ run }) => run.id === target.runId)
				: 0;
		this.selectIndex(assignments, initialIndex >= 0 ? initialIndex : 0);
		this.unsubscribe = runtime.subscribe(() => {
			this.reconcileSelection();
			this.tui.requestRender();
		});
		this.timer = setInterval(() => {
			if (this.disposed) return;
			const selected = this.selectedAssignment();
			if (selected && (selected.child.state === "queued" || selected.child.state === "starting" || selected.child.state === "running")) {
				this.tui.requestRender();
			}
		}, SPINNER_FRAME_MS);
		this.timer.unref?.();
	}

	handleInput(data: string): void {
		if (matchesKey(data, "ctrl+c")) {
			this.done();
			return;
		}
		if (this.detail) {
			this.detail.handleInput(data);
			return;
		}
		if (matchesKey(data, "escape")) {
			this.done();
			return;
		}
		const assignments = this.assignments();
		const selectedIndex = this.reconcileSelection(assignments);
		if ((matchesKey(data, "up") || data === "k") && selectedIndex > 0) {
			this.selectIndex(assignments, selectedIndex - 1);
			this.tui.requestRender();
			return;
		}
		if ((matchesKey(data, "down") || data === "j") && selectedIndex >= 0 && selectedIndex < assignments.length - 1) {
			this.selectIndex(assignments, selectedIndex + 1);
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, "return") || matchesKey(data, "right")) {
			this.openDetail();
			return;
		}
		if (matchesKey(data, "r") || matchesKey(data, "shift+r") || data === "R") void this.resumeSelected();
	}

	render(width: number): string[] {
		if (this.detail) return this.detail.render(width);
		const safeWidth = Math.max(1, width);
		const innerWidth = Math.max(1, safeWidth - 2);
		const assignments = this.assignments();
		const selectedIndex = this.reconcileSelection(assignments);
		const selected = selectedIndex >= 0 ? assignments[selectedIndex] : undefined;
		const header = `${this.theme.bold("Agents")} ${this.theme.fg("dim", `· conductor manages subagents · ${assignments.length} assignment${assignments.length === 1 ? "" : "s"}`)}`;
		if (!selected) {
			return framedOverlay([
				truncateToWidth(header, innerWidth),
				this.theme.fg("borderMuted", "─".repeat(innerWidth)),
				this.theme.fg("dim", "No agent assignments in this session."),
				this.theme.fg("dim", "Esc close"),
			], safeWidth, this.theme);
		}

		const bodyHeight = this.bodyHeight();
		const display = this.displayLines(assignments);
		const selectedLine = Math.max(0, display.findIndex((line) => line.childId === selected.child.id));
		const maxStart = Math.max(0, display.length - bodyHeight);
		const start = Math.min(Math.max(0, selectedLine - Math.floor(bodyHeight / 2)), maxStart);
		const visible = this.maxLines() < 8
			? [this.assignmentLine(selected, true)]
			: display.slice(start, start + bodyHeight).map(({ text }) => text);
		const padded = Array.from({ length: bodyHeight }, (_, index) => visible[index] ?? "");
		const resume = selected.child.state === "interrupted" && !this.resumePending.has(selected.child.id) ? " · r/R resume" : "";
		const footer = this.theme.fg("dim", `↑/↓ j/k select · Enter live status${resume} · Esc close`);
		return framedOverlay([
			truncateToWidth(header, innerWidth),
			this.theme.fg("borderMuted", "─".repeat(innerWidth)),
			...padded.map((line) => truncateToWidth(line, innerWidth)),
			truncateToWidth(footer, innerWidth),
		], safeWidth, this.theme);
	}

	invalidate(): void {
		this.detail?.invalidate();
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.detail?.dispose();
		this.detail = undefined;
		clearInterval(this.timer);
		this.unsubscribe();
	}

	private assignments(): DeskAssignment[] {
		return listDeskAssignments(this.runtime.list());
	}

	private reconcileSelection(assignments = this.assignments()): number {
		if (assignments.length === 0) {
			this.selectedChildId = undefined;
			this.selectedIndexHint = 0;
			return -1;
		}
		const currentIndex = this.selectedChildId
			? assignments.findIndex(({ child }) => child.id === this.selectedChildId)
			: -1;
		if (currentIndex >= 0) {
			this.selectedIndexHint = currentIndex;
			return currentIndex;
		}
		this.selectIndex(assignments, Math.min(this.selectedIndexHint, assignments.length - 1));
		return this.selectedIndexHint;
	}

	private selectIndex(assignments: DeskAssignment[], index: number): void {
		if (assignments.length === 0) {
			this.selectedChildId = undefined;
			this.selectedIndexHint = 0;
			return;
		}
		const bounded = Math.max(0, Math.min(index, assignments.length - 1));
		this.selectedIndexHint = bounded;
		this.selectedChildId = assignments[bounded]?.child.id;
	}

	private selectedAssignment(): DeskAssignment | undefined {
		const assignments = this.assignments();
		const index = this.reconcileSelection(assignments);
		return index >= 0 ? assignments[index] : undefined;
	}

	private displayLines(assignments: DeskAssignment[]): DeskDisplayLine[] {
		const lines: DeskDisplayLine[] = [];
		for (const { section, label } of DESK_SECTIONS) {
			const sectionAssignments = assignments.filter((assignment) => assignment.section === section);
			if (sectionAssignments.length === 0) continue;
			if (lines.length > 0) lines.push({ text: "" });
			lines.push({ text: this.theme.fg("dim", label) });
			for (const assignment of sectionAssignments) {
				lines.push({ text: this.assignmentLine(assignment, assignment.child.id === this.selectedChildId), childId: assignment.child.id });
			}
		}
		return lines;
	}

	private assignmentLine(assignment: DeskAssignment, selected: boolean): string {
		const { child } = assignment;
		const marker = selected ? this.theme.fg("accent", "›") : " ";
		const label = selected ? this.theme.fg("accent", child.label) : child.label;
		const pending = this.resumePending.has(child.id) && child.state === "interrupted";
		const error = this.resumeErrors.get(child.id);
		const summary = pending
			? "Resume requested…"
			: error && child.state === "interrupted"
				? `Interrupted · ${error}`
				: deskAssignmentSummary(assignment);
		const color = child.state === "failed" ? "error" : child.state === "interrupted" || child.state === "needs_attention" ? "warning" : "dim";
		const model = this.theme.fg("dim", child.resolved.model.id);
		return `${marker} ${stateIcon(child.state, this.theme)} ${label} · ${model} · ${this.theme.fg(color, summary)}`;
	}

	private openDetail(): void {
		const selected = this.selectedAssignment();
		if (!selected) return;
		let detail: RunOverlayComponent;
		detail = new RunOverlayComponent(
			this.runtime,
			selected.run.id,
			this.tui,
			this.theme,
			() => {
				detail.dispose();
				if (this.detail === detail) this.detail = undefined;
				if (!this.disposed) this.tui.requestRender();
			},
			readChildHistory,
			{ initialChildId: selected.child.id, detailOnly: true },
		);
		this.detail = detail;
		this.tui.requestRender();
	}

	private async resumeSelected(): Promise<void> {
		if (this.disposed) return;
		const selected = this.selectedAssignment();
		if (!selected || selected.child.state !== "interrupted" || this.resumePending.has(selected.child.id)) return;
		const childId = selected.child.id;
		this.resumePending.add(childId);
		this.resumeErrors.delete(childId);
		this.tui.requestRender();
		try {
			await this.actions.resume(selected.run.id, childId);
		} catch (error) {
			if (!this.disposed) this.resumeErrors.set(childId, error instanceof Error ? error.message : String(error));
		} finally {
			this.resumePending.delete(childId);
			if (!this.disposed) this.tui.requestRender();
		}
	}

	private maxLines(): number {
		const terminalRows = this.tui.terminal?.rows ?? 24;
		return Math.max(6, Math.floor(terminalRows * 0.85));
	}

	private bodyHeight(): number {
		return Math.max(1, this.maxLines() - 5);
	}
}

export class RunOverlayComponent implements Component {
	private selected = 0;
	private transcriptFocused = false;
	private expanded = false;
	private readonly history = new Map<string, ChildHistoryEvent[]>();
	private readonly loading = new Set<string>();
	private readonly refreshAgain = new Set<string>();
	private readonly runtime: DelegateRuntime;
	private readonly runId: string;
	private readonly tui: Pick<TUI, "requestRender"> & { terminal?: { rows: number } };
	private readonly theme: Theme;
	private readonly done: () => void;
	private readonly historyLoader: (sessionFile: string) => Promise<ChildHistoryEvent[]>;
	private readonly options: RunOverlayOptions;
	private readonly unsubscribe: () => void;
	private readonly timer: ReturnType<typeof setInterval>;
	private ticks = 0;
	private transcriptScroll = 0;
	private disposed = false;

	constructor(
		runtime: DelegateRuntime,
		runId: string,
		tui: Pick<TUI, "requestRender"> & { terminal?: { rows: number } },
		theme: Theme,
		done: () => void,
		historyLoader: (sessionFile: string) => Promise<ChildHistoryEvent[]> = readChildHistory,
		options: RunOverlayOptions = {},
	) {
		this.runtime = runtime;
		this.runId = runId;
		this.tui = tui;
		this.theme = theme;
		this.done = done;
		this.historyLoader = historyLoader;
		this.options = options;
		const initialRun = runtime.get(runId);
		const initialIndex = options.initialChildId
			? initialRun?.children.findIndex((child) => child.id === options.initialChildId) ?? -1
			: 0;
		this.selected = initialIndex >= 0 ? initialIndex : 0;
		this.transcriptFocused = options.detailOnly === true;
		this.unsubscribe = runtime.subscribe((run) => {
			if (run.id !== runId) return;
			this.tui.requestRender();
			void this.refreshHistory();
		});
		this.timer = setInterval(() => {
			if (this.disposed) return;
			this.ticks++;
			const run = this.runtime.get(this.runId);
			if (run?.children.some((child) => child.state === "queued" || child.state === "starting" || child.state === "running")) {
				this.tui.requestRender();
			}
			const selected = run?.children[this.selected];
			if (this.ticks % 5 === 0 && (selected?.state === "starting" || selected?.state === "running")) {
				void this.refreshHistory();
			}
		}, SPINNER_FRAME_MS);
		this.timer.unref?.();
		void this.refreshHistory();
	}

	handleInput(data: string): void {
		const run = this.runtime.get(this.runId);
		const count = run?.children.length ?? 0;
		if (matchesKey(data, "ctrl+c")) {
			this.done();
			return;
		}
		if (matchesKey(data, "escape")) {
			if (this.options.detailOnly) {
				this.done();
			} else if (this.transcriptFocused) {
				this.transcriptFocused = false;
				this.tui.requestRender();
			} else {
				this.done();
			}
			return;
		}
		if (!this.transcriptFocused) {
			if ((matchesKey(data, "up") || data === "k") && this.selected > 0) {
				this.selected--;
				this.transcriptScroll = 0;
				void this.refreshHistory();
				this.tui.requestRender();
				return;
			}
			if ((matchesKey(data, "down") || data === "j") && this.selected < count - 1) {
				this.selected++;
				this.transcriptScroll = 0;
				void this.refreshHistory();
				this.tui.requestRender();
				return;
			}
			if (matchesKey(data, "return") || matchesKey(data, "right")) {
				this.transcriptFocused = true;
				this.tui.requestRender();
			}
			return;
		}
		if (matchesKey(data, "left")) {
			if (this.options.detailOnly) this.done();
			else {
				this.transcriptFocused = false;
				this.tui.requestRender();
			}
			return;
		}
		if (matchesKey(data, "up") || data === "k") {
			this.transcriptScroll++;
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, "down") || data === "j") {
			this.transcriptScroll = Math.max(0, this.transcriptScroll - 1);
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, "pageUp") || matchesKey(data, "ctrl+u")) {
			this.transcriptScroll += this.transcriptHeight();
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, "pageDown") || matchesKey(data, "ctrl+d")) {
			this.transcriptScroll = Math.max(0, this.transcriptScroll - this.transcriptHeight());
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, "end")) {
			this.transcriptScroll = 0;
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, "return")) {
			this.expanded = !this.expanded;
			this.transcriptScroll = 0;
			this.tui.requestRender();
		}
	}

	render(width: number): string[] {
		const safeWidth = Math.max(1, width);
		const run = this.runtime.get(this.runId);
		if (!run) return framedOverlay([truncateToWidth(this.theme.fg("warning", `Unknown agent run ${this.runId}`), Math.max(1, safeWidth - 2))], safeWidth, this.theme);
		this.selected = Math.min(this.selected, Math.max(0, run.children.length - 1));
		const child = run.children[this.selected];
		if (!child) return framedOverlay([this.theme.fg("warning", "Agent run has no agents")], safeWidth, this.theme);

		const innerWidth = Math.max(1, safeWidth - 2);
		const held = run.delivery.state === "held" ? this.theme.fg("warning", " · result ready") : "";
		const header = this.options.detailOnly
			? `${this.theme.bold(`Agents / ${child.label}`)} ${this.theme.fg("dim", "· conductor manages subagents")}${held}`
			: `${this.theme.bold("Agents")} ${this.theme.fg("accent", run.id)} ${this.theme.fg("dim", `${deriveRunStatus(run)} · ${this.selected + 1}/${run.children.length}`)}${held}`;
		const bodyHeight = this.bodyHeight();

		if (this.options.detailOnly && this.maxLines() < 7) {
			const availableTranscriptLines = Math.max(0, this.maxLines() - 5);
			const allTranscript = this.transcriptLines(run, child, innerWidth);
			const transcript = availableTranscriptLines > 0
				? this.visibleTranscript(allTranscript, availableTranscriptLines)
				: [];
			const footer = availableTranscriptLines > 0
				? this.footerHints(allTranscript.length > availableTranscriptLines)
				: this.theme.fg("dim", "Compact detail · Esc agents");
			return framedOverlay([
				truncateToWidth(header, innerWidth),
				truncateToWidth(this.childHeader(run, child), innerWidth),
				...transcript,
				truncateToWidth(footer, innerWidth),
			], safeWidth, this.theme);
		}

		if (this.options.detailOnly || innerWidth < NARROW_OVERLAY_WIDTH) {
			const transcriptHeight = Math.max(1, bodyHeight - 1);
			const transcript = this.transcriptLines(run, child, innerWidth);
			const visibleTranscript = this.visibleTranscript(transcript, transcriptHeight);
			const paddedTranscript = Array.from({ length: transcriptHeight }, (_, index) => visibleTranscript[index] ?? "");
			const hints = this.footerHints(transcript.length > transcriptHeight);
			return framedOverlay([
				truncateToWidth(header, innerWidth),
				truncateToWidth(this.childHeader(run, child), innerWidth),
				this.theme.fg("borderMuted", "─".repeat(innerWidth)),
				...paddedTranscript,
				truncateToWidth(hints, innerWidth),
			], safeWidth, this.theme);
		}

		const leftWidth = Math.min(32, Math.max(16, Math.floor(innerWidth * 0.3)));
		const rightWidth = Math.max(1, innerWidth - leftWidth - 3);
		const transcriptHeight = Math.max(1, bodyHeight - 1);
		const transcript = this.transcriptLines(run, child, rightWidth);
		const visibleTranscript = this.visibleTranscript(transcript, transcriptHeight);
		const hints = this.footerHints(transcript.length > transcriptHeight);
		const indexOffset = Math.min(
			Math.max(0, this.selected - bodyHeight + 1),
			Math.max(0, run.children.length - bodyHeight),
		);
		const left = run.children.slice(indexOffset, indexOffset + bodyHeight).map((candidate, relativeIndex) => {
			const index = indexOffset + relativeIndex;
			const marker = index === this.selected
				? this.theme.fg(this.transcriptFocused ? "muted" : "accent", this.transcriptFocused ? "•" : "›")
				: " ";
			return `${marker} ${stateIcon(candidate.state, this.theme)} ${index + 1}. ${candidate.label} ${this.theme.fg("dim", candidate.state)}`;
		});
		const body: string[] = [];
		for (let index = 0; index < bodyHeight; index++) {
			const right = index === 0 ? this.childHeader(run, child) : visibleTranscript[index - 1] ?? "";
			body.push(`${padAnsi(left[index] ?? "", leftWidth)} ${this.theme.fg(this.transcriptFocused ? "borderAccent" : "borderMuted", "│")} ${truncateToWidth(right, rightWidth)}`);
		}
		return framedOverlay([
			truncateToWidth(header, innerWidth),
			this.theme.fg("borderMuted", "─".repeat(innerWidth)),
			...body,
			truncateToWidth(hints, innerWidth),
		], safeWidth, this.theme);
	}

	invalidate(): void {}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		clearInterval(this.timer);
		this.unsubscribe();
	}

	private maxLines(): number {
		const terminalRows = this.tui.terminal?.rows ?? 24;
		return Math.max(5, Math.floor(terminalRows * 0.85));
	}

	private bodyHeight(): number {
		return Math.max(1, this.maxLines() - 5);
	}

	private transcriptHeight(): number {
		return Math.max(1, this.bodyHeight() - 1);
	}

	private footerHints(scrollable: boolean): string {
		const text = this.options.detailOnly
			? scrollable
				? "↑/↓ j/k scroll · PgUp/PgDn page · End live · Enter detail · Esc agents"
				: "All transcript lines visible · Enter detail · Esc agents"
			: !this.transcriptFocused
				? "↑/↓ j/k select · Enter transcript · Esc close"
				: scrollable
					? "↑/↓ j/k scroll · PgUp/PgDn page · End live · Enter detail · Esc agents"
					: "All transcript lines visible · Enter detail · Esc agents";
		return this.theme.fg("dim", text);
	}

	private childHeader(_run: DelegationRun, child: DelegatedChild): string {
		const focus = this.transcriptFocused ? `${this.theme.fg("accent", "▶")} ` : "";
		const route = `${child.resolved.model.provider}/${child.resolved.model.id} · ${child.resolved.reasoning}`;
		return `${focus}${stateIcon(child.state, this.theme)} ${this.theme.bold(child.label)} ${this.theme.fg("dim", `${child.state} · ${route}`)}`;
	}

	private transcriptLines(run: DelegationRun, child: DelegatedChild, width: number): string[] {
		const history = this.history.get(child.id) ?? [];
		const lines: string[] = [];
		if (history.length > 0) {
			for (const event of history) {
				if (lines.length > 0) lines.push("");
				lines.push(...historyEventLines(event, width, this.expanded, this.theme));
			}
		} else if (child.sessionFile && this.loading.has(child.id)) {
			lines.push(this.theme.fg("dim", "Loading transcript…"));
		} else {
			lines.push(...historyEventLines({ kind: "user", text: child.task }, width, this.expanded, this.theme));
		}

		if (child.result && !historyHasResult(history, child)) {
			if (lines.length > 0) lines.push("");
			const result = child.result.kind === "text" ? child.result.value : JSON.stringify(child.result.value, null, 2);
			lines.push(...wrapTextWithAnsi(boundedDisplay(result), width));
		}
		if (child.attention) {
			if (lines.length > 0) lines.push("");
			lines.push(this.theme.fg("warning", `? ${child.attention.question}`));
			lines.push(this.theme.fg("dim", attentionDeliverySummary(child)));
			if (child.attention.context) lines.push(...wrapTextWithAnsi(this.theme.fg("dim", child.attention.context), width));
		}
		if (child.failure) {
			if (lines.length > 0) lines.push("");
			lines.push(this.theme.fg("error", `✗ ${child.failure.message}`));
			if (child.failure.partialOutput && this.expanded) lines.push(...wrapTextWithAnsi(boundedDisplay(child.failure.partialOutput), width));
		}
		const workspaceLines = temporaryWorkspaceLines(run.id, child, this.theme, !this.options.detailOnly);
		if (workspaceLines.length > 0) {
			if (lines.length > 0) lines.push("");
			lines.push(...workspaceLines.flatMap((line) => wrapTextWithAnsi(line, width)));
		}
		if (child.state === "queued" || child.state === "starting" || child.state === "running") {
			if (lines.length > 0) lines.push("");
			lines.push(this.theme.fg("dim", `${stateIcon(child.state, this.theme)} ${describeLatestActivity(run, Date.now(), 10_000, this.selected)}`));
		}
		if (run.delivery.state === "held" && isFinalState(child.state)) {
			if (lines.length > 0) lines.push("");
			lines.push(this.theme.fg("warning", "Run update not added to this branch · /agents use"));
		}
		return lines.map((line) => truncateToWidth(line, width));
	}

	private visibleTranscript(lines: string[], height: number): string[] {
		const maxStart = Math.max(0, lines.length - height);
		this.transcriptScroll = Math.min(this.transcriptScroll, maxStart);
		const start = Math.max(0, maxStart - this.transcriptScroll);
		return lines.slice(start, start + height);
	}

	private async refreshHistory(): Promise<void> {
		const run = this.runtime.get(this.runId);
		const child = run?.children[this.selected];
		if (!child?.sessionFile) return;
		if (this.loading.has(child.id)) {
			this.refreshAgain.add(child.id);
			return;
		}
		this.loading.add(child.id);
		let changed = !this.history.has(child.id);
		try {
			const next = await this.historyLoader(child.sessionFile);
			const previous = this.history.get(child.id);
			changed ||= JSON.stringify(previous) !== JSON.stringify(next);
			if (changed) this.history.set(child.id, next);
		} catch {
			changed ||= (this.history.get(child.id)?.length ?? 0) > 0;
			if (changed) this.history.set(child.id, []);
		} finally {
			this.loading.delete(child.id);
			if (!this.disposed && changed) this.tui.requestRender();
			if (!this.disposed && this.refreshAgain.delete(child.id)) void this.refreshHistory();
		}
	}
}

export interface DelegateUi {
	createStatus(tui: Pick<TUI, "requestRender">, theme: Theme, options?: PinnedStatusOptions): PinnedAgentStatusComponent;
	renderLaunch(handle: DelegateHandle, expanded: boolean, theme: Theme): Component;
	renderCompletion(view: RunView, expanded: boolean, theme: Theme): Component;
	openDesk(target: AgentDeskTarget, context: ExtensionContext, actions: AgentDeskActions): Promise<void>;
	dispose(): void;
}

export function createDelegateUi(runtime: DelegateRuntime): DelegateUi {
	let closeActiveOverlay: (() => void) | undefined;
	return {
		createStatus(tui, theme, options) {
			return new PinnedAgentStatusComponent(runtime, tui, theme, options);
		},
		renderLaunch(handle, expanded, theme) {
			const count = handle.children.length;
			const title = count === 1 ? handle.children[0]?.label ?? "Agent" : `${count} agents`;
			let text = `${theme.fg("accent", "↗")} ${theme.bold(title)} ${theme.fg("dim", "started")}`;
			if (expanded) {
				if (count > 1) {
					for (const child of handle.children) text += `\n  ${theme.fg("accent", child.label)} ${theme.fg("dim", child.state)}`;
				}
				text += `\n${theme.fg("dim", `Run: ${handle.runId}`)}`;
				text += `\n${theme.fg("dim", `Record: ${handle.recordRef}`)}`;
			}
			return new Text(text, 0, 0);
		},
		renderCompletion(view, expanded, theme) {
			let text = `${view.status === "completed" ? theme.fg("success", "✓") : theme.fg("warning", view.status === "needs_attention" ? "?" : "◐")} `;
			text += `${theme.bold(`${view.children.length + (view.omittedChildren ?? 0)} agent${view.children.length + (view.omittedChildren ?? 0) === 1 ? "" : "s"}`)} ${theme.fg("dim", view.status)}`;
			const visibleChildren = expanded ? view.children : view.children.slice(0, 6);
			for (const child of visibleChildren) {
				text += `\n  ${theme.fg("accent", child.label)} ${theme.fg("dim", child.state)}`;
				if (child.attention) text += `\n  ${theme.fg("warning", `?  ${child.attention.question}`)}`;
				if (child.result) {
					const value = resultText(child.result, expanded);
					const rendered = expanded ? value : value.split("\n", 1)[0]?.trim();
					if (rendered) text += `\n  ${theme.fg("dim", `⎿  ${rendered}`)}`;
				}
				if (child.error) text += `\n  ${theme.fg("error", child.error.message)}`;
				if (child.workspace) {
					const state = child.workspace.state === "working" ? "review required" : child.workspace.state.replace("_", " ");
					text += `\n  ${theme.fg(child.workspace.state === "conflict" ? "warning" : "dim", `Workspace: ${state}`)}`;
					if (expanded && child.workspace.revision) text += `\n  ${theme.fg("dim", `Revision: ${child.workspace.revision}`)}`;
					if (expanded && child.workspace.patchRef) text += `\n  ${theme.fg("dim", `Patch: ${child.workspace.patchRef}`)}`;
					if (expanded && child.workspace.manifestRef) text += `\n  ${theme.fg("dim", `Manifest: ${child.workspace.manifestRef}`)}`;
					if (child.workspace.message) text += `\n  ${theme.fg("error", child.workspace.message)}`;
					if (child.workspace.cleanupError) {
						text += `\n  ${theme.fg("warning", `Cleanup failed: ${child.workspace.cleanupError}`)}`;
						if (expanded) text += `\n  ${theme.fg("dim", `Retry: /agents cleanup ${view.runId} ${child.childId}`)}`;
					}
				}
			}
			const hidden = view.children.length - visibleChildren.length + (view.omittedChildren ?? 0);
			if (hidden > 0) text += `\n  ${theme.fg("dim", `… ${hidden} more · /agents`)}`;
			if (expanded) {
				text += `\n${theme.fg("dim", `Run: ${view.runId}`)}`;
				text += `\n${theme.fg("dim", `Record: ${view.recordRef}`)}`;
			} else if (hidden === 0) text += `\n  ${theme.fg("dim", "Open: /agents")}`;
			return new Text(text, 0, 0);
		},
		async openDesk(target, context, actions) {
			if (context.mode !== "tui") throw new Error("Agent Desk is available only in interactive TUI mode");
			closeActiveOverlay?.();
			let component: AgentDeskOverlayComponent | undefined;
			let ownedClose: (() => void) | undefined;
			try {
				await context.ui.custom<void>(
					(tui, theme, _keybindings, done) => {
						let closed = false;
						ownedClose = () => {
							if (closed) return;
							closed = true;
							component?.dispose();
							if (closeActiveOverlay === ownedClose) closeActiveOverlay = undefined;
							done();
						};
						component = new AgentDeskOverlayComponent(runtime, target, tui, theme, ownedClose, actions);
						closeActiveOverlay = ownedClose;
						return component;
					},
					{
						overlay: true,
						overlayOptions: { anchor: "center", width: "90%", maxHeight: "85%", margin: 1 },
					},
				);
			} finally {
				component?.dispose();
				if (closeActiveOverlay === ownedClose) closeActiveOverlay = undefined;
			}
		},
		dispose() {
			const close = closeActiveOverlay;
			closeActiveOverlay = undefined;
			close?.();
		},
	};
}
