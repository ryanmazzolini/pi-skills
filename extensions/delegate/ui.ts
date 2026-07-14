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
	type DelegateRuntime,
	type DelegatedChild,
	type DelegationRun,
	type RunView,
} from "./runtime.ts";

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_FRAME_MS = 200;
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

function formatDuration(startedAt: string): string {
	return compactDuration(Date.now() - Date.parse(startedAt));
}

function resultText(result: NonNullable<RunView["children"][number]["result"]>, expanded = false): string {
	return result.kind === "text" ? result.value : JSON.stringify(result.value, null, expanded ? 2 : undefined);
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

function stateIcon(state: DelegatedChild["state"], theme: Theme): string {
	if (state === "running" || state === "starting" || state === "queued") {
		const frame = SPINNER[Math.floor(Date.now() / SPINNER_FRAME_MS) % SPINNER.length] ?? "⠋";
		return theme.fg(state === "queued" ? "muted" : "warning", frame);
	}
	if (state === "completed") return theme.fg("success", "✓");
	if (state === "failed") return theme.fg("error", "✗");
	if (state === "needs_attention") return theme.fg("warning", "?");
	if (state === "interrupted") return theme.fg("warning", "■");
	return theme.fg("muted", "○");
}

function runIcon(run: DelegationRun, theme: Theme): string {
	const status = deriveRunStatus(run);
	if (status === "running" || status === "queued") {
		const frame = SPINNER[Math.floor(Date.now() / SPINNER_FRAME_MS) % SPINNER.length] ?? "⠋";
		return theme.fg("warning", frame);
	}
	if (status === "completed") return theme.fg("success", "✓");
	if (status === "failed") return theme.fg("error", "✗");
	if (status === "needs_attention") return theme.fg("warning", "?");
	if (status === "interrupted") return theme.fg("warning", "■");
	if (status === "cancelled") return theme.fg("muted", "○");
	return theme.fg("warning", "◐");
}

class LiveRunComponent implements Component {
	private readonly runtime: DelegateRuntime;
	private readonly runId: string;
	private expanded: boolean;
	private theme: Theme;

	constructor(runtime: DelegateRuntime, runId: string, expanded: boolean, theme: Theme) {
		this.runtime = runtime;
		this.runId = runId;
		this.expanded = expanded;
		this.theme = theme;
	}

	update(expanded: boolean, theme: Theme): void {
		this.expanded = expanded;
		this.theme = theme;
	}

	render(width: number): string[] {
		const run = this.runtime.get(this.runId);
		if (!run) return [truncateToWidth(this.theme.fg("warning", `Unknown agent run ${this.runId}`), width)];
		const status = deriveRunStatus(run);
		if (run.children.length === 0) return [truncateToWidth(this.theme.fg("warning", "Agent run has no agents"), width)];

		const lines: string[] = [];
		if (run.children.length === 1) {
			const child = run.children[0]!;
			lines.push(
				`${runIcon(run, this.theme)} ${this.theme.fg("toolTitle", this.theme.bold(child.label))} `
				+ this.theme.fg("dim", `${status} · ${formatDuration(run.createdAt)}`),
			);
			const activity = describeLatestActivity(run);
			lines.push(this.theme.fg(activity.startsWith("Still running") ? "warning" : "muted", `  ${activity}`));
			if (child.attention) lines.push(this.theme.fg("warning", `  ?  ${child.attention.question}`));
			if (!this.expanded && child.result) {
				const preview = child.result.kind === "text"
					? child.result.value.split("\n", 1)[0]?.trim()
					: JSON.stringify(child.result.value);
				if (preview) lines.push(this.theme.fg("dim", `  ⎿  ${preview}`));
			}
			if (!this.expanded && child.failure) lines.push(this.theme.fg("error", `  ⎿  ${child.failure.message}`));
		} else {
			lines.push(
				`${runIcon(run, this.theme)} ${this.theme.fg("toolTitle", this.theme.bold(`${run.children.length} agents`))} `
				+ this.theme.fg("dim", `${status} · ${formatDuration(run.createdAt)}`),
			);
			const visibleChildren = this.expanded ? run.children : run.children.slice(0, 6);
			for (const child of visibleChildren) {
				const index = run.children.indexOf(child);
				const activity = describeLatestActivity(run, Date.now(), 10_000, index);
				const detail = child.state === "completed" || child.state === "cancelled" ? child.state : `${child.state} · ${activity}`;
				lines.push(`${stateIcon(child.state, this.theme)} ${this.theme.fg("accent", child.label)} ${this.theme.fg("dim", detail)}`);
			}
			if (!this.expanded && run.children.length > visibleChildren.length) {
				lines.push(this.theme.fg("dim", `… ${run.children.length - visibleChildren.length} more · /agents`));
			}
		}
		if (!this.expanded && run.children.length <= 6) lines.push(this.theme.fg("dim", "  Open: /agents"));

		if (this.expanded) {
			for (const child of run.children) {
				lines.push("", `${stateIcon(child.state, this.theme)} ${this.theme.bold(child.label)} ${this.theme.fg("dim", child.state)}`);
				lines.push(this.theme.fg("dim", "Task"));
				lines.push(...wrapTextWithAnsi(child.task, Math.max(1, width)));
				if (child.attention) lines.push(this.theme.fg("warning", `Needs ${child.attention.kind}: ${child.attention.question}`));
				if (child.result) {
					lines.push(this.theme.fg("dim", "Final answer"));
					lines.push(...wrapTextWithAnsi(
						child.result.kind === "text" ? child.result.value : JSON.stringify(child.result.value, null, 2),
						Math.max(1, width),
					));
				}
				if (child.failure) lines.push(this.theme.fg("error", `Error: ${child.failure.message}`));
			}
			lines.push("", this.theme.fg("dim", `Run: ${run.id}`));
			lines.push(this.theme.fg("dim", `Record: ${run.recordRef}`));
			if (run.delivery.state === "held") lines.push(this.theme.fg("warning", "Add result here: /agents use"));
			if (status === "running" || status === "queued" || status === "needs_attention") {
				lines.push(this.theme.fg("dim", "Open: /agents"));
				lines.push(this.theme.fg("dim", `Cancel: /agents cancel ${run.id}`));
			}
		}
		return lines.map((line) => truncateToWidth(line, Math.max(1, width)));
	}

	invalidate(): void {}
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
	) {
		this.runtime = runtime;
		this.runId = runId;
		this.tui = tui;
		this.theme = theme;
		this.done = done;
		this.historyLoader = historyLoader;
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
			if (this.transcriptFocused) {
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
			this.transcriptFocused = false;
			this.tui.requestRender();
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
		const header = `${this.theme.bold("Agents")} ${this.theme.fg("accent", run.id)} ${this.theme.fg("dim", `${deriveRunStatus(run)} · ${this.selected + 1}/${run.children.length}`)}${held}`;
		const bodyHeight = this.bodyHeight();

		if (innerWidth < NARROW_OVERLAY_WIDTH) {
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
		return Math.max(7, Math.floor(terminalRows * 0.85));
	}

	private bodyHeight(): number {
		return Math.max(2, this.maxLines() - 5);
	}

	private transcriptHeight(): number {
		return Math.max(1, this.bodyHeight() - 1);
	}

	private footerHints(scrollable: boolean): string {
		const text = !this.transcriptFocused
			? "↑/↓ j/k select · Enter transcript · Esc close"
			: scrollable
				? "↑/↓ j/k scroll · PgUp/PgDn page · End live · Enter detail · Esc agents"
				: "All transcript lines visible · Enter detail · Esc agents";
		return this.theme.fg("dim", text);
	}

	private childHeader(_run: DelegationRun, child: DelegatedChild): string {
		const focus = this.transcriptFocused ? `${this.theme.fg("accent", "▶")} ` : "";
		const route = `${child.resolved.model.id} · ${child.resolved.reasoning}`;
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
			if (child.attention.context) lines.push(...wrapTextWithAnsi(this.theme.fg("dim", child.attention.context), width));
		}
		if (child.failure) {
			if (lines.length > 0) lines.push("");
			lines.push(this.theme.fg("error", `✗ ${child.failure.message}`));
			if (child.failure.partialOutput && this.expanded) lines.push(...wrapTextWithAnsi(boundedDisplay(child.failure.partialOutput), width));
		}
		if (child.state === "queued" || child.state === "starting" || child.state === "running") {
			if (lines.length > 0) lines.push("");
			lines.push(this.theme.fg("dim", `${stateIcon(child.state, this.theme)} ${describeLatestActivity(run, Date.now(), 10_000, this.selected)}`));
		}
		if (run.delivery.state === "held" && child.result) {
			if (lines.length > 0) lines.push("");
			lines.push(this.theme.fg("warning", "Result not added to this branch · /agents use"));
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
	renderRun(runId: string, expanded: boolean, theme: Theme, invalidate: () => void, previous?: Component): Component;
	renderCompletion(view: RunView, expanded: boolean, theme: Theme): Component;
	openRun(runId: string, context: ExtensionContext): Promise<void>;
	dispose(): void;
}

export function createDelegateUi(runtime: DelegateRuntime): DelegateUi {
	const invalidators = new Map<string, () => void>();
	const isAnimating = (run: DelegationRun): boolean => run.children.some((child) =>
		child.state === "queued" || child.state === "starting" || child.state === "running",
	);
	const canChange = (run: DelegationRun): boolean => run.children.some((child) =>
		child.state === "queued"
		|| child.state === "starting"
		|| child.state === "running"
		|| child.state === "needs_attention"
		|| child.state === "interrupted",
	);
	const unsubscribe = runtime.subscribe((run) => {
		invalidators.get(run.id)?.();
		if (!canChange(run)) invalidators.delete(run.id);
	});
	const timer = setInterval(() => {
		for (const [runId, invalidate] of [...invalidators]) {
			const run = runtime.get(runId);
			if (!run || !canChange(run)) {
				invalidators.delete(runId);
				continue;
			}
			if (isAnimating(run)) invalidate();
		}
	}, SPINNER_FRAME_MS);
	timer.unref?.();

	return {
		renderRun(runId, expanded, theme, invalidate, previous) {
			const run = runtime.get(runId);
			if (run && canChange(run)) invalidators.set(runId, invalidate);
			else invalidators.delete(runId);
			if (previous instanceof LiveRunComponent) {
				previous.update(expanded, theme);
				return previous;
			}
			return new LiveRunComponent(runtime, runId, expanded, theme);
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
			}
			const hidden = view.children.length - visibleChildren.length + (view.omittedChildren ?? 0);
			if (hidden > 0) text += `\n  ${theme.fg("dim", `… ${hidden} more · /agents`)}`;
			if (expanded) text += `\n${theme.fg("dim", `Full run: ${view.recordRef}`)}`;
			else if (hidden === 0) text += `\n  ${theme.fg("dim", "Open: /agents")}`;
			return new Text(text, 0, 0);
		},
		async openRun(runId, context) {
			if (context.mode !== "tui") throw new Error("Agent detail overlay is available only in interactive TUI mode");
			await context.ui.custom<void>(
				(tui, theme, _keybindings, done) => new RunOverlayComponent(runtime, runId, tui, theme, done),
				{
					overlay: true,
					overlayOptions: { anchor: "center", width: "90%", maxHeight: "85%", margin: 1 },
				},
			);
		},
		dispose() {
			clearInterval(timer);
			unsubscribe();
			invalidators.clear();
		},
	};
}
