import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

type WorkflowShape = "agent-choice" | "dynamic-audit" | "safe-fix" | "migration";
type RunStatus = "running" | "complete" | "failed" | "paused";
type ProgressStatus = "pending" | "running" | "completed" | "complete" | "failed" | "detached" | "paused";

type WorkflowRequest = {
	name: string;
	goal: string;
	shape: WorkflowShape;
	maxFanout: number;
	concurrency: number;
	runAfterCreate: boolean;
};

type WorkflowCommand =
	| { kind: "auto"; goal: string }
	| { kind: "wizard"; goal?: string }
	| { kind: "status" }
	| { kind: "help" };

type AgentProgressLike = {
	index?: number;
	agent?: string;
	status?: ProgressStatus;
	task?: string;
	currentTool?: string;
	currentToolArgs?: string;
	currentPath?: string;
	toolCount?: number;
	turnCount?: number;
	tokens?: number;
	durationMs?: number;
	error?: string;
};

type ResultLike = {
	agent?: string;
	exitCode?: number;
	model?: string;
	progress?: AgentProgressLike;
	progressSummary?: { toolCount?: number; tokens?: number; durationMs?: number };
	error?: string;
};

type WorkflowGraphNodeLike = {
	id?: string;
	kind?: string;
	agent?: string;
	phase?: string;
	label?: string;
	status?: ProgressStatus;
	children?: WorkflowGraphNodeLike[];
};

type WorkflowGraphLike = {
	phases?: Array<{ title?: string; nodeIds?: string[] }>;
	nodes?: WorkflowGraphNodeLike[];
	currentNodeId?: string;
};

type DetailsLike = {
	mode?: string;
	runId?: string;
	asyncId?: string;
	context?: string;
	results?: ResultLike[];
	progress?: AgentProgressLike[];
	chainAgents?: string[];
	totalSteps?: number;
	currentStepIndex?: number;
	workflowGraph?: WorkflowGraphLike;
};

type ActiveWorkflowState = {
	toolCallId: string;
	startedAt: number;
	updatedAt: number;
	status: RunStatus;
	isError?: boolean;
	argsSummary: string;
	details?: DetailsLike;
};

const WIDGET_KEY = "chain-workflows";
const STATE_ENTRY_TYPE = "chain-workflows-state";
const DISMISS_WIDGET_MS = 4_000;
const TICK_MS = 1_000;
const PERSIST_MIN_INTERVAL_MS = 2_000;
const RESTORED_RUNNING_STALE_MS = 10 * 60_000;
const OVERLAY_VISIBLE_ROWS = 12;
const STATUS_DETAIL_ROWS = 5;
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export default function dynamicWorkflowsExtension(pi: ExtensionAPI) {
	let current: ActiveWorkflowState | undefined;
	let tickTimer: ReturnType<typeof setInterval> | undefined;
	let dismissTimer: ReturnType<typeof setTimeout> | undefined;
	let statusOverlayOpen = false;
	let lastPersistAt = 0;

	function clearTimers(): void {
		if (tickTimer) clearInterval(tickTimer);
		if (dismissTimer) clearTimeout(dismissTimer);
		tickTimer = undefined;
		dismissTimer = undefined;
	}

	function clearWidget(ctx: ExtensionContext): void {
		try {
			ctx.ui.setWidget(WIDGET_KEY, undefined);
		} catch {
			// Ignore stale UI contexts after reload/session replacement.
		}
	}

	function refreshWidget(ctx: ExtensionContext): void {
		if (!ctx.hasUI || !current) return;
		if (statusOverlayOpen) {
			clearWidget(ctx);
			return;
		}
		try {
			ctx.ui.setWidget(WIDGET_KEY, buildWidgetLines(current, ctx.ui.theme, process.stdout.columns || 100));
		} catch {
			clearTimers();
		}
	}

	function ensureTicker(ctx: ExtensionContext): void {
		if (tickTimer || !current || current.status !== "running") return;
		tickTimer = setInterval(() => refreshWidget(ctx), TICK_MS);
	}

	function scheduleDismiss(ctx: ExtensionContext): void {
		if (tickTimer) clearInterval(tickTimer);
		tickTimer = undefined;
		if (dismissTimer) clearTimeout(dismissTimer);
		dismissTimer = setTimeout(() => clearWidget(ctx), DISMISS_WIDGET_MS);
	}

	function persistCurrent(force = false): void {
		if (!current) return;
		const now = Date.now();
		if (!force && now - lastPersistAt < PERSIST_MIN_INTERVAL_MS) return;
		lastPersistAt = now;
		try {
			pi.appendEntry(STATE_ENTRY_TYPE, { version: 1, savedAt: now, current });
		} catch {
			// Persistence is best-effort; the live widget should never fail because of it.
		}
	}

	function restoreCurrent(ctx: ExtensionContext): void {
		current = restoreWorkflowState(ctx.sessionManager.getBranch() as unknown[]);
		if (current?.status === "running" && Date.now() - current.updatedAt > RESTORED_RUNNING_STALE_MS) {
			current = { ...current, status: "paused", argsSummary: `${current.argsSummary} (restored)` };
		}
		if (current?.status === "running") {
			refreshWidget(ctx);
			ensureTicker(ctx);
		} else {
			clearWidget(ctx);
		}
	}

	async function showCurrentWorkflowStatus(ctx: ExtensionCommandContext): Promise<void> {
		if (!ctx.hasUI) {
			ctx.ui.notify("/chain-workflow status requires interactive mode", "warning");
			return;
		}
		if (!current) {
			ctx.ui.notify("No chain workflow run has been observed in this session yet.", "info");
			return;
		}
		clearWidget(ctx);
		statusOverlayOpen = true;
		try {
			await ctx.ui.custom<void>((tui, theme, _keybindings, done) => new WorkflowStatusOverlay(current!, theme, () => tui.requestRender(true), done));
		} finally {
			statusOverlayOpen = false;
			if (current?.status === "running") {
				refreshWidget(ctx);
				ensureTicker(ctx);
			} else {
				clearWidget(ctx);
			}
		}
	}

	pi.registerCommand("chain-workflow", {
		description: "Create or inspect pi-subagents chain workflows. Use /chain-workflow <task>, /chain-workflow wizard, /chain-workflow status, or /chain-workflow help",
		handler: async (args, ctx) => {
			await ctx.waitForIdle();
			const command = parseWorkflowCommand(args);
			if (command.kind === "help") {
				ctx.ui.notify(workflowHelpText(), "info");
				return;
			}
			if (command.kind === "status") {
				await showCurrentWorkflowStatus(ctx);
				return;
			}
			if (command.kind === "wizard") {
				const request = await collectWorkflowRequest(command.goal ?? "", ctx);
				if (!request) return;
				pi.sendUserMessage(buildWizardSkillPrompt(request));
				return;
			}

			const goal = command.goal || await collectAutonomousGoal(ctx);
			if (!goal) return;
			pi.sendUserMessage(buildAutonomousSkillPrompt(goal));
		},
	});

	pi.registerCommand("chain-workflow-status", {
		description: "Shortcut for /chain-workflow status",
		handler: async (_args, ctx) => {
			await ctx.waitForIdle();
			await showCurrentWorkflowStatus(ctx);
		},
	});

	pi.on("input", async (event) => {
		if (event.source === "extension") return { action: "continue" as const };
		if (!shouldRouteDynamicWorkflow(event.text)) return { action: "continue" as const };
		return { action: "transform" as const, text: buildAutonomousSkillPrompt(event.text.trim()), images: event.images };
	});

	pi.on("tool_execution_start", async (event, ctx) => {
		if (event.toolName !== "subagent") return;
		if (dismissTimer) clearTimeout(dismissTimer);
		current = {
			toolCallId: event.toolCallId,
			startedAt: Date.now(),
			updatedAt: Date.now(),
			status: "running",
			argsSummary: summarizeArgs(event.args),
		};
		persistCurrent(true);
		refreshWidget(ctx);
		ensureTicker(ctx);
	});

	pi.on("tool_execution_update", async (event, ctx) => {
		if (event.toolName !== "subagent") return;
		if (!current || current.toolCallId !== event.toolCallId) {
			current = {
				toolCallId: event.toolCallId,
				startedAt: Date.now(),
				updatedAt: Date.now(),
				status: "running",
				argsSummary: summarizeArgs(event.args),
			};
		}
		current.updatedAt = Date.now();
		current.status = "running";
		current.details = extractDetails(event.partialResult) ?? current.details;
		persistCurrent();
		refreshWidget(ctx);
		ensureTicker(ctx);
	});

	pi.on("tool_execution_end", async (event, ctx) => {
		if (event.toolName !== "subagent") return;
		if (!current || current.toolCallId !== event.toolCallId) {
			current = {
				toolCallId: event.toolCallId,
				startedAt: Date.now(),
				updatedAt: Date.now(),
				status: event.isError ? "failed" : "complete",
				isError: event.isError,
				argsSummary: summarizeArgs(event.args),
			};
		}
		current.updatedAt = Date.now();
		current.status = event.isError ? "failed" : "complete";
		current.isError = event.isError;
		current.details = extractDetails(event.result) ?? current.details;
		persistCurrent(true);
		refreshWidget(ctx);
		scheduleDismiss(ctx);
	});

	pi.on("session_start", async (_event, ctx) => {
		restoreCurrent(ctx);
	});

	pi.on("session_tree", async (_event, ctx) => {
		restoreCurrent(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		persistCurrent(true);
		clearTimers();
		clearWidget(ctx);
	});
}

function parseWorkflowCommand(args: string): WorkflowCommand {
	const trimmed = args.trim();
	if (!trimmed) return { kind: "auto", goal: "" };
	const [first = "", ...rest] = trimmed.split(/\s+/);
	const remainder = rest.join(" ").trim();
	if (first === "wizard") return { kind: "wizard", goal: remainder || undefined };
	if (first === "status") return { kind: "status" };
	if (first === "help") return { kind: "help" };
	return { kind: "auto", goal: trimmed };
}

function workflowHelpText(): string {
	return `Pi-subagents chain workflows\n\n/chain-workflow <task> — infer and create a pi-subagents chain workflow\n/chain-workflow wizard [task] — interactive setup\n/chain-workflow status — show the latest chain workflow status panel\n/chain-workflow help — show this help\n\nNatural language routing is explicit-only: “create a pi-subagents chain workflow for ...”`;
}

async function collectAutonomousGoal(ctx: ExtensionCommandContext): Promise<string | undefined> {
	if (!ctx.hasUI) {
		ctx.ui.notify("Usage: /chain-workflow <task>", "warning");
		return undefined;
	}
	const goal = await ctx.ui.editor("Chain workflow goal", "");
	if (!goal?.trim()) {
		ctx.ui.notify("Chain workflow creation cancelled: no goal provided.", "info");
		return undefined;
	}
	return goal.trim();
}

async function collectWorkflowRequest(args: string, ctx: ExtensionCommandContext): Promise<WorkflowRequest | undefined> {
	const initialGoal = args.trim();
	if (!ctx.hasUI) {
		return {
			name: slugify(initialGoal || "chain-workflow"),
			goal: initialGoal || "Create an appropriate pi-subagents chain workflow.",
			shape: "agent-choice",
			maxFanout: 12,
			concurrency: 4,
			runAfterCreate: false,
		};
	}

	const goal = await ctx.ui.editor("Chain workflow goal", initialGoal);
	if (!goal?.trim()) {
		ctx.ui.notify("Chain workflow creation cancelled: no goal provided.", "info");
		return undefined;
	}

	const defaultName = slugify(goal);
	const rawName = await ctx.ui.input("Chain workflow name", defaultName);
	if (rawName === undefined) return undefined;

	const shapeLabel = await ctx.ui.select("Chain workflow shape", [
		"Let the agent choose",
		"Dynamic audit (read-only fanout)",
		"Safe fix (planning fanout → one writer → validation fanout)",
		"Migration workflow (inventory → phased batches → verification)",
	]);
	if (!shapeLabel) return undefined;

	const rawMaxFanout = await ctx.ui.input("Max fanout", "12");
	if (rawMaxFanout === undefined) return undefined;
	const rawConcurrency = await ctx.ui.input("Concurrency", "4");
	if (rawConcurrency === undefined) return undefined;
	const runAfterCreate = await ctx.ui.confirm("Run after creation?", "Ask the agent to run the saved workflow after previewing it?");

	return {
		name: slugify(rawName || defaultName),
		goal: goal.trim(),
		shape: shapeFromLabel(shapeLabel),
		maxFanout: clampPositiveInt(rawMaxFanout, 12, 1, 100),
		concurrency: clampPositiveInt(rawConcurrency, 4, 1, 24),
		runAfterCreate,
	};
}

function buildAutonomousSkillPrompt(goal: string): string {
	return `/skill:dynamic-workflows Create a pi-subagents chain workflow autonomously.

Goal:
${goal.trim()}

Infer the workflow name, shape, chain file type, phases, fanout bounds, concurrency, agents, model profile, and verification strategy. Use defaults unless evidence says otherwise: max fanout 12, concurrency 4, inherit Pi model defaults unless a configured dynamic-workflows model profile exists, and read-only fanout → one writer → read-only validation for edits. Do not ask setup questions unless a real blocker prevents a safe workflow design. Save the workflow under .pi/chains/, then summarize what was created and ask before running if it edits files, has broad/high-cost fanout, or changes shared state.`;
}

function buildWizardSkillPrompt(request: WorkflowRequest): string {
	return `/skill:dynamic-workflows Create a pi-subagents chain workflow with this brief.

Chain workflow name: ${request.name}
Shape preference: ${request.shape}
Max fanout: ${request.maxFanout}
Concurrency: ${request.concurrency}
Run after creation: ${request.runAfterCreate ? "yes, after showing me what will run" : "no, stop after writing and explaining the chain"}

Goal:
${request.goal}

Create the workflow file in .pi/chains/. If dynamic fanout is useful, use .chain.json with structured outputSchema and expand/collect. Respect any configured dynamic-workflows model profile; otherwise inherit Pi defaults. Use phase and label metadata so /chain-workflow status and pi-subagents status views are readable.`;
}

function shouldRouteDynamicWorkflow(text: string): boolean {
	const trimmed = text.trim();
	if (!trimmed || trimmed.startsWith("/") || trimmed.includes("`")) return false;
	const lower = trimmed.toLowerCase();
	if (/^(what|how|why|should|could|would|do you think|any thoughts)\b/.test(lower)) return false;
	const hasLaunchVerb = /\b(create|start|run|use|build|make|launch|kick off|setup|set up)\b/.test(lower);
	if (!hasLaunchVerb) return false;

	const mentionsWorkflow = /\bworkflows?\b/.test(lower);
	const mentionsChainRuntime = /\b(pi[- ]?subagents?|subagents?|chain(?:\.json|\.md)?|run-chain)\b/.test(lower);
	const explicitChainWorkflow = mentionsWorkflow && mentionsChainRuntime;
	const explicitSubagentChain = /\b(pi[- ]?subagents?|subagents?)\b.*\bchains?\b|\bchains?\b.*\b(pi[- ]?subagents?|subagents?)\b/.test(lower);
	return explicitChainWorkflow || explicitSubagentChain;
}

function shapeFromLabel(label: string): WorkflowShape {
	if (label.startsWith("Dynamic audit")) return "dynamic-audit";
	if (label.startsWith("Safe fix")) return "safe-fix";
	if (label.startsWith("Migration")) return "migration";
	return "agent-choice";
}

function slugify(value: string): string {
	const firstLine = value.split("\n").find((line) => line.trim()) ?? "chain-workflow";
	const slug = firstLine
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48)
		.replace(/-+$/g, "");
	return slug || "chain-workflow";
}

function clampPositiveInt(value: string, fallback: number, min: number, max: number): number {
	const parsed = Number.parseInt(value.trim(), 10);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.max(min, Math.min(max, parsed));
}

function summarizeArgs(args: unknown): string {
	const record = asRecord(args);
	if (!record) return "subagent";
	if (typeof record.agent === "string") return `run ${record.agent}`;
	if (Array.isArray(record.tasks)) return `parallel · ${record.tasks.length} tasks`;
	if (Array.isArray(record.chain)) return `chain · ${record.chain.length} steps`;
	if (typeof record.action === "string") return `subagent ${record.action}`;
	return "subagent";
}

function extractDetails(value: unknown): DetailsLike | undefined {
	const record = asRecord(value);
	const details = asRecord(record?.details);
	if (!details) return undefined;
	return normalizeDetails(details);
}

function restoreWorkflowState(entries: unknown[]): ActiveWorkflowState | undefined {
	for (const entry of [...entries].reverse()) {
		const restored = restoreFromCustomEntry(entry);
		if (restored) return restored;
	}
	for (const entry of [...entries].reverse()) {
		const restored = restoreFromSubagentToolResult(entry);
		if (restored) return restored;
	}
	return undefined;
}

function restoreFromCustomEntry(entry: unknown): ActiveWorkflowState | undefined {
	const record = asRecord(entry);
	if (record?.type !== "custom" || record.customType !== STATE_ENTRY_TYPE) return undefined;
	const data = asRecord(record.data);
	return normalizeActiveWorkflowState(asRecord(data?.current));
}

function restoreFromSubagentToolResult(entry: unknown): ActiveWorkflowState | undefined {
	const record = asRecord(entry);
	if (record?.type !== "message") return undefined;
	const message = asRecord(record.message);
	if (message?.role !== "toolResult" || message.toolName !== "subagent") return undefined;
	const timestamp = timestampMs(message.timestamp) ?? timestampMs(record.timestamp) ?? Date.now();
	const details = asRecord(message.details) ? normalizeDetails(asRecord(message.details)!) : undefined;
	const isError = message.isError === true;
	return {
		toolCallId: stringValue(message.toolCallId) ?? `restored-${timestamp}`,
		startedAt: timestamp,
		updatedAt: timestamp,
		status: isError ? "failed" : "complete",
		isError,
		argsSummary: details?.mode ? `restored ${details.mode}` : "restored subagent",
		details,
	};
}

function normalizeActiveWorkflowState(record: Record<string, unknown> | undefined): ActiveWorkflowState | undefined {
	if (!record) return undefined;
	const updatedAt = numberValue(record.updatedAt) ?? Date.now();
	const startedAt = numberValue(record.startedAt) ?? updatedAt;
	return {
		toolCallId: stringValue(record.toolCallId) ?? `restored-${updatedAt}`,
		startedAt,
		updatedAt,
		status: runStatusValue(record.status) ?? "complete",
		isError: record.isError === true,
		argsSummary: stringValue(record.argsSummary) ?? "restored chain workflow",
		details: asRecord(record.details) ? normalizeDetails(asRecord(record.details)!) : undefined,
	};
}

function timestampMs(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value !== "string") return undefined;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function runStatusValue(value: unknown): RunStatus | undefined {
	if (value === "running" || value === "complete" || value === "failed" || value === "paused") return value;
	return undefined;
}

function normalizeDetails(record: Record<string, unknown>): DetailsLike {
	return {
		mode: stringValue(record.mode),
		runId: stringValue(record.runId),
		asyncId: stringValue(record.asyncId),
		context: stringValue(record.context),
		results: arrayValue(record.results).map(normalizeResult),
		progress: arrayValue(record.progress).map(normalizeProgress),
		chainAgents: arrayValue(record.chainAgents).filter((item): item is string => typeof item === "string"),
		totalSteps: numberValue(record.totalSteps),
		currentStepIndex: numberValue(record.currentStepIndex),
		workflowGraph: normalizeWorkflowGraph(asRecord(record.workflowGraph)),
	};
}

function normalizeResult(value: unknown): ResultLike {
	const record = asRecord(value) ?? {};
	const progress = normalizeProgress(asRecord(record.progress));
	const summaryRecord = asRecord(record.progressSummary);
	return {
		agent: stringValue(record.agent),
		exitCode: numberValue(record.exitCode),
		model: stringValue(record.model),
		progress: Object.keys(progress).length > 0 ? progress : undefined,
		progressSummary: summaryRecord
			? {
				toolCount: numberValue(summaryRecord.toolCount),
				tokens: numberValue(summaryRecord.tokens),
				durationMs: numberValue(summaryRecord.durationMs),
			}
			: undefined,
		error: stringValue(record.error),
	};
}

function normalizeProgress(value: unknown): AgentProgressLike {
	const record = asRecord(value) ?? {};
	return {
		index: numberValue(record.index),
		agent: stringValue(record.agent),
		status: progressStatusValue(record.status),
		task: stringValue(record.task),
		currentTool: stringValue(record.currentTool),
		currentToolArgs: stringValue(record.currentToolArgs),
		currentPath: stringValue(record.currentPath),
		toolCount: numberValue(record.toolCount),
		turnCount: numberValue(record.turnCount),
		tokens: numberValue(record.tokens),
		durationMs: numberValue(record.durationMs),
		error: stringValue(record.error),
	};
}

function normalizeWorkflowGraph(value: Record<string, unknown> | undefined): WorkflowGraphLike | undefined {
	if (!value) return undefined;
	return {
		phases: arrayValue(value.phases).map((phase) => {
			const phaseRecord = asRecord(phase) ?? {};
			return {
				title: stringValue(phaseRecord.title),
				nodeIds: arrayValue(phaseRecord.nodeIds).filter((item): item is string => typeof item === "string"),
			};
		}),
		nodes: arrayValue(value.nodes).map(normalizeGraphNode),
		currentNodeId: stringValue(value.currentNodeId),
	};
}

function normalizeGraphNode(value: unknown): WorkflowGraphNodeLike {
	const record = asRecord(value) ?? {};
	return {
		id: stringValue(record.id),
		kind: stringValue(record.kind),
		agent: stringValue(record.agent),
		phase: stringValue(record.phase),
		label: stringValue(record.label),
		status: progressStatusValue(record.status),
		children: arrayValue(record.children).map(normalizeGraphNode),
	};
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function arrayValue(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function progressStatusValue(value: unknown): ProgressStatus | undefined {
	if (typeof value !== "string") return undefined;
	if (["pending", "running", "completed", "complete", "failed", "detached", "paused"].includes(value)) {
		return value as ProgressStatus;
	}
	return undefined;
}

function buildWidgetLines(state: ActiveWorkflowState, theme: Theme, width: number): string[] {
	const lines = buildDashboardLines(state, theme, Math.max(40, width), { compact: true });
	return lines.map((line) => truncateToWidth(line, Math.max(1, width)));
}

function buildDashboardLines(state: ActiveWorkflowState, theme: Theme, width: number, options?: { compact?: boolean }): string[] {
	const details = state.details;
	const progress = collectProgress(details);
	const mode = details?.mode ?? state.argsSummary;
	const elapsed = formatDuration(Date.now() - state.startedAt);
	const stats = summarizeProgress(progress, details);
	const titleGlyph = workflowGlyph(state, theme);
	const title = `${titleGlyph} ${theme.fg("accent", theme.bold("chain workflow"))} ${theme.fg("dim", `· ${mode}`)} ${theme.fg("dim", `· ${stats}`)} ${theme.fg("dim", `· ${elapsed}`)}`;
	const lines = [title];

	const phaseLine = formatPhaseLine(details, theme);
	if (phaseLine) lines.push(phaseLine);

	if (!details && state.status === "running") {
		lines.push(theme.fg("dim", `starting ${state.argsSummary}...`));
		return lines;
	}

	const activeRows = rankProgress(progress).slice(0, options?.compact ? 5 : 14);
	for (const row of activeRows) lines.push(formatProgressRow(row, theme));
	if (progress.length > activeRows.length) {
		lines.push(theme.fg("dim", `… +${progress.length - activeRows.length} more agents`));
	}
	if (progress.length === 0 && details?.chainAgents?.length) {
		lines.push(theme.fg("dim", `chain: ${details.chainAgents.join(" → ")}`));
	}
	if (state.status !== "running") {
		lines.push(workflowTerminalLine(state, theme));
	}
	lines.push(theme.fg("dim", "Ctrl+O expands pi-subagents tool detail · /chain-workflow status opens the status panel"));
	return lines.map((line) => truncateToWidth(line, width));
}

function collectProgress(details: DetailsLike | undefined): AgentProgressLike[] {
	if (!details) return [];
	const direct = details.progress ?? [];
	const fromResults = (details.results ?? [])
		.map((result, index) => {
			if (result.progress) return result.progress;
			return {
				index,
				agent: result.agent,
				status: result.exitCode === undefined ? undefined : result.exitCode === 0 ? "completed" : "failed",
				toolCount: result.progressSummary?.toolCount,
				tokens: result.progressSummary?.tokens,
				durationMs: result.progressSummary?.durationMs,
				error: result.error,
			} satisfies AgentProgressLike;
		})
		.filter((item) => item.agent || item.status || item.toolCount !== undefined);
	return direct.length > 0 ? direct : fromResults;
}

function summarizeProgress(progress: AgentProgressLike[], details: DetailsLike | undefined): string {
	const total = progress.length || details?.totalSteps || details?.chainAgents?.length || 1;
	const done = progress.filter((item) => isDone(item.status)).length;
	const running = progress.filter((item) => item.status === "running").length;
	const tokens = progress.reduce((sum, item) => sum + (item.tokens ?? 0), 0);
	const tools = progress.reduce((sum, item) => sum + (item.toolCount ?? 0), 0);
	const parts = [`${done}/${total} done`];
	if (running > 0) parts.push(`${running} running`);
	if (tokens > 0) parts.push(`${formatTokens(tokens)} tok`);
	if (tools > 0) parts.push(`${tools} tools`);
	return parts.join(" · ");
}

function formatPhaseLine(details: DetailsLike | undefined, theme: Theme): string | undefined {
	const graph = details?.workflowGraph;
	if (!graph?.phases?.length || !graph.nodes?.length) {
		if (details?.totalSteps !== undefined && details.currentStepIndex !== undefined) {
			return theme.fg("muted", `phase: step ${details.currentStepIndex + 1}/${details.totalSteps}`);
		}
		return undefined;
	}
	const nodesById = new Map(flattenGraphNodes(graph.nodes).filter((node) => node.id).map((node) => [node.id!, node]));
	const phaseParts = graph.phases.slice(0, 4).map((phase, index) => {
		const nodes = (phase.nodeIds ?? []).map((id) => nodesById.get(id)).filter((node): node is WorkflowGraphNodeLike => Boolean(node));
		const done = nodes.filter((node) => isDone(node.status)).length;
		const active = graph.currentNodeId ? nodes.some((node) => node.id === graph.currentNodeId) : nodes.some((node) => node.status === "running");
		const label = `${index + 1}. ${phase.title ?? "Phase"} ${done}/${Math.max(1, nodes.length)}`;
		return active ? theme.fg("accent", `› ${label}`) : done === nodes.length ? theme.fg("success", `✓ ${label}`) : theme.fg("dim", label);
	});
	return `Phases: ${phaseParts.join(theme.fg("dim", " · "))}`;
}

function rankProgress(progress: AgentProgressLike[]): AgentProgressLike[] {
	return [...progress].sort((left, right) => progressRank(left.status) - progressRank(right.status));
}

function progressRank(status: ProgressStatus | undefined): number {
	if (status === "running") return 0;
	if (status === "failed" || status === "paused" || status === "detached") return 1;
	if (status === "pending") return 2;
	return 3;
}

function formatProgressRow(progress: AgentProgressLike, theme: Theme): string {
	const status = progress.status ?? "pending";
	const glyph = statusGlyph(status, theme);
	const agent = progress.agent ?? `agent ${progress.index ?? "?"}`;
	const activity = progress.error ?? progress.currentPath ?? formatTool(progress) ?? status;
	const stats = [
		progress.tokens ? `${formatTokens(progress.tokens)} tok` : undefined,
		progress.toolCount ? `${progress.toolCount} tools` : undefined,
		progress.durationMs ? formatDuration(progress.durationMs) : undefined,
	]
		.filter((item): item is string => Boolean(item))
		.join(" · ");
	return `  ${glyph} ${theme.fg("toolTitle", agent)} ${theme.fg("dim", "·")} ${activity}${stats ? ` ${theme.fg("dim", "·")} ${theme.fg("dim", stats)}` : ""}`;
}

function formatTool(progress: AgentProgressLike): string | undefined {
	if (!progress.currentTool) return undefined;
	const args = progress.currentToolArgs ? ` ${progress.currentToolArgs}` : "";
	return `${progress.currentTool}${args}`;
}

function workflowGlyph(state: ActiveWorkflowState, theme: Theme): string {
	if (state.status === "running") return theme.fg("accent", spinner(state.startedAt));
	if (state.status === "failed") return theme.fg("error", "✗");
	if (state.status === "paused") return theme.fg("warning", "■");
	return theme.fg("success", "✓");
}

function workflowTerminalLine(state: ActiveWorkflowState, theme: Theme): string {
	if (state.status === "failed") return theme.fg("error", "chain workflow failed");
	if (state.status === "paused") return theme.fg("warning", "chain workflow state restored; run may no longer be active");
	return theme.fg("success", "chain workflow complete");
}

function statusGlyph(status: ProgressStatus, theme: Theme): string {
	if (status === "running") return theme.fg("accent", spinner(Date.now()));
	if (status === "failed") return theme.fg("error", "✗");
	if (status === "detached" || status === "paused") return theme.fg("warning", "■");
	if (isDone(status)) return theme.fg("success", "✓");
	return theme.fg("dim", "•");
}

function isDone(status: ProgressStatus | undefined): boolean {
	return status === "completed" || status === "complete";
}

function spinner(seed: number): string {
	return SPINNER[Math.floor((Date.now() - seed) / 120) % SPINNER.length] ?? "⠋";
}

function formatTokens(tokens: number): string {
	if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}m`;
	if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
	return String(tokens);
}

function formatDuration(ms: number): string {
	const seconds = Math.max(0, Math.round(ms / 1000));
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const rest = seconds % 60;
	if (minutes < 60) return `${minutes}m${rest.toString().padStart(2, "0")}s`;
	const hours = Math.floor(minutes / 60);
	return `${hours}h${(minutes % 60).toString().padStart(2, "0")}m`;
}

type OverlayRow = {
	label: string;
	agent?: string;
	status?: ProgressStatus;
	activity?: string;
	task?: string;
	model?: string;
	tokens?: number;
	toolCount?: number;
	durationMs?: number;
	error?: string;
};

type OverlayPhase = {
	title: string;
	rows: OverlayRow[];
	done: number;
	total: number;
	active: boolean;
};

type OverlayPane = "phases" | "rows";

class WorkflowStatusOverlay {
	private readonly state: ActiveWorkflowState;
	private readonly theme: Theme;
	private readonly requestRender: () => void;
	private readonly done: () => void;
	private selectedPhaseIndex = 0;
	private selectedRowIndex = 0;
	private rowScrollStart = 0;
	private renderEpoch = 0;
	private focusedPane: OverlayPane = "phases";

	constructor(state: ActiveWorkflowState, theme: Theme, requestRender: () => void, done: () => void) {
		this.state = state;
		this.theme = theme;
		this.requestRender = requestRender;
		this.done = done;
		const activePhaseIndex = buildOverlayPhases(state).findIndex((phase) => phase.active);
		if (activePhaseIndex >= 0) this.selectedPhaseIndex = activePhaseIndex;
	}

	handleInput(data: string): void {
		const phases = buildOverlayPhases(this.state);
		this.clampSelection(phases);
		const rows = phases[this.selectedPhaseIndex]?.rows ?? [];
		if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c") || data === "q") {
			this.done();
			return;
		}
		if (matchesKey(data, "tab")) {
			this.focusedPane = this.focusedPane === "phases" ? "rows" : "phases";
			this.requestRender();
			return;
		}
		if (matchesKey(data, "return") || matchesKey(data, "enter")) {
			this.focusedPane = "rows";
			this.requestRender();
			return;
		}
		if (matchesKey(data, "left")) {
			if (this.focusedPane === "rows") {
				this.focusedPane = "phases";
			} else {
				this.movePhase(-1, phases);
			}
			this.requestRender();
			return;
		}
		if (matchesKey(data, "right")) {
			if (this.focusedPane === "phases") {
				this.focusedPane = "rows";
			} else {
				this.movePhase(1, phases);
			}
			this.requestRender();
			return;
		}
		if (matchesKey(data, "up")) {
			if (this.focusedPane === "phases") this.movePhase(-1, phases);
			else this.moveRow(-1, rows);
			this.requestRender();
			return;
		}
		if (matchesKey(data, "down")) {
			if (this.focusedPane === "phases") this.movePhase(1, phases);
			else this.moveRow(1, rows);
			this.requestRender();
		}
	}

	render(width: number): string[] {
		const panelWidth = Math.max(40, Math.min(width, 140));
		const innerWidth = panelWidth - 2;
		const phases = buildOverlayPhases(this.state);
		this.clampSelection(phases);
		const selectedPhase = phases[this.selectedPhaseIndex];
		const selectedRows = selectedPhase?.rows ?? [];
		const lines = [this.theme.fg("border", `╭${"─".repeat(innerWidth)}╮`)];
		for (const line of this.headerLines(innerWidth, phases)) lines.push(this.row(line, innerWidth));
		lines.push(this.row(this.theme.fg("borderMuted", "─".repeat(innerWidth)), innerWidth));

		if (innerWidth >= 86 && phases.length > 1) {
			for (const line of this.splitBodyLines(innerWidth, phases, selectedRows)) lines.push(this.row(line, innerWidth));
		} else {
			for (const line of this.stackedBodyLines(innerWidth, phases, selectedRows)) lines.push(this.row(line, innerWidth));
		}

		for (const line of this.detailLines(innerWidth, selectedRows[this.selectedRowIndex])) lines.push(this.row(line, innerWidth));
		lines.push(this.row(this.theme.fg("dim", this.keyHint()), innerWidth));
		lines.push(this.theme.fg("border", `╰${"─".repeat(innerWidth)}╯`));
		this.renderEpoch = (this.renderEpoch + 1) % 216;
		const repaintNonce = this.repaintNonce();
		return lines.map((line) => `${repaintNonce}${line}`);
	}

	invalidate(): void {}

	private repaintNonce(): string {
		// The status panel deliberately changes a zero-width prefix every render so
		// pi-tui repaints every panel row. Without this, unchanged blank cells can
		// keep stale text when only the selected step changes.
		return `\x1b[38;5;${16 + this.renderEpoch}m\x1b[39m`;
	}

	private clampSelection(phases: OverlayPhase[]): void {
		this.selectedPhaseIndex = Math.min(Math.max(0, this.selectedPhaseIndex), Math.max(0, phases.length - 1));
		const rows = phases[this.selectedPhaseIndex]?.rows ?? [];
		this.selectedRowIndex = Math.min(Math.max(0, this.selectedRowIndex), Math.max(0, rows.length - 1));
		this.rowScrollStart = Math.min(Math.max(0, this.rowScrollStart), Math.max(0, rows.length - OVERLAY_VISIBLE_ROWS));
		this.ensureSelectedRowVisible(rows);
	}

	private movePhase(delta: number, phases: OverlayPhase[]): void {
		this.selectedPhaseIndex = Math.min(Math.max(0, this.selectedPhaseIndex + delta), Math.max(0, phases.length - 1));
		this.selectedRowIndex = 0;
		this.rowScrollStart = 0;
	}

	private moveRow(delta: number, rows: OverlayRow[]): void {
		this.selectedRowIndex = Math.min(Math.max(0, this.selectedRowIndex + delta), Math.max(0, rows.length - 1));
		this.ensureSelectedRowVisible(rows);
	}

	private ensureSelectedRowVisible(rows: OverlayRow[]): void {
		const maxStart = Math.max(0, rows.length - OVERLAY_VISIBLE_ROWS);
		if (this.selectedRowIndex < this.rowScrollStart) this.rowScrollStart = this.selectedRowIndex;
		if (this.selectedRowIndex >= this.rowScrollStart + OVERLAY_VISIBLE_ROWS) {
			this.rowScrollStart = this.selectedRowIndex - OVERLAY_VISIBLE_ROWS + 1;
		}
		this.rowScrollStart = Math.min(Math.max(0, this.rowScrollStart), maxStart);
	}

	private keyHint(): string {
		return this.focusedPane === "phases"
			? "phase focus: ↑↓ phases • →/enter steps • tab toggle • q/esc close"
			: "step focus: ↑↓ steps • ← phases • tab toggle • q/esc close";
	}

	private headerLines(width: number, phases: OverlayPhase[]): string[] {
		const progress = collectProgress(this.state.details);
		const mode = this.state.details?.mode ?? this.state.argsSummary;
		const elapsed = formatDuration(Date.now() - this.state.startedAt);
		const stats = summarizeProgress(progress, this.state.details);
		const glyph = workflowGlyph(this.state, this.theme);
		const title = `${glyph} ${this.theme.fg("accent", this.theme.bold("chain workflow"))} ${this.theme.fg("dim", `· ${mode}`)} ${this.theme.fg("dim", `· ${stats}`)} ${this.theme.fg("dim", `· ${elapsed}`)}`;
		const current = phases[this.selectedPhaseIndex];
		const focus = this.focusedPane === "phases" ? "phase focus" : "step focus";
		const subtitle = current ? `Phase ${this.selectedPhaseIndex + 1}/${phases.length}: ${current.title} (${current.done}/${current.total}) · ${focus}` : `No phase data yet · ${focus}`;
		return [truncateToWidth(title, width), this.theme.fg("muted", subtitle)];
	}

	private splitBodyLines(width: number, phases: OverlayPhase[], rows: OverlayRow[]): string[] {
		const leftWidth = Math.min(38, Math.max(26, Math.floor(width * 0.32)));
		const rightWidth = width - leftWidth - 3;
		const rowWindow = this.visibleRowWindow(rows);
		const bodyRows = Math.max(OVERLAY_VISIBLE_ROWS, phases.length, 1);
		const lines: string[] = [];
		const rowRange = rows.length > OVERLAY_VISIBLE_ROWS ? ` ${rowWindow.start + 1}-${rowWindow.end}/${rows.length}` : "";
		const rightTitle = `${phases[this.selectedPhaseIndex]?.title ?? "Steps"}${rowRange}`;
		lines.push(`${padVisible(this.paneTitle("Phases", "phases"), leftWidth)} ${this.theme.fg("borderMuted", "│")} ${padVisible(this.paneTitle(rightTitle, "rows"), rightWidth)}`);
		for (let index = 0; index < bodyRows; index++) {
			const phaseText = phases[index] ? this.formatPhase(phases[index], index, leftWidth) : "";
			const row = rowWindow.rows[index];
			const rowText = row ? this.formatOverlayRow(row, rowWindow.start + index, rightWidth) : "";
			lines.push(`${padVisible(phaseText, leftWidth)} ${this.theme.fg("borderMuted", "│")} ${padVisible(rowText, rightWidth)}`);
		}
		return lines;
	}

	private stackedBodyLines(width: number, phases: OverlayPhase[], rows: OverlayRow[]): string[] {
		const rowWindow = this.visibleRowWindow(rows);
		const lines = [this.paneTitle("Phases", "phases")];
		for (const [index, phase] of phases.entries()) lines.push(this.formatPhase(phase, index, width));
		lines.push("");
		const rowRange = rows.length > OVERLAY_VISIBLE_ROWS ? ` ${rowWindow.start + 1}-${rowWindow.end}/${rows.length}` : "";
		lines.push(this.paneTitle(`${phases[this.selectedPhaseIndex]?.title ?? "Steps"}${rowRange}`, "rows"));
		for (let index = 0; index < OVERLAY_VISIBLE_ROWS; index++) {
			const row = rowWindow.rows[index];
			lines.push(row ? this.formatOverlayRow(row, rowWindow.start + index, width) : "");
		}
		return lines;
	}

	private visibleRowWindow(rows: OverlayRow[]): { rows: OverlayRow[]; start: number; end: number } {
		this.ensureSelectedRowVisible(rows);
		const start = this.rowScrollStart;
		const visibleRows = rows.slice(start, start + OVERLAY_VISIBLE_ROWS);
		return { rows: visibleRows, start, end: start + visibleRows.length };
	}

	private paneTitle(label: string, pane: OverlayPane): string {
		const content = `${this.focusedPane === pane ? "▶ " : "  "}${label}`;
		return this.focusedPane === pane ? this.theme.fg("accent", this.theme.bold(content)) : this.theme.fg("muted", content);
	}

	private detailLines(width: number, row: OverlayRow | undefined): string[] {
		const separator = this.theme.fg("borderMuted", "─".repeat(width));
		if (!row) return [separator, this.theme.fg("dim", "Selected: none"), ...Array.from({ length: STATUS_DETAIL_ROWS }, () => "")];
		const details = [
			row.model ? `model ${row.model}` : undefined,
			row.tokens ? `${formatTokens(row.tokens)} tok` : undefined,
			row.toolCount ? `${row.toolCount} tools` : undefined,
			row.durationMs ? formatDuration(row.durationMs) : undefined,
		]
			.filter((part): part is string => Boolean(part))
			.join(" · ");
		const selectedLine = `${this.theme.fg("accent", "Selected:")} ${row.label}${details ? ` ${this.theme.fg("dim", `· ${details}`)}` : ""}`;
		const detailRows = summarizeTaskForDetail(row)
			.slice(0, STATUS_DETAIL_ROWS)
			.map((line) => this.theme.fg(row.error ? "error" : "muted", truncateToWidth(line, width, "…")));
		while (detailRows.length < STATUS_DETAIL_ROWS) detailRows.push("");
		return [separator, selectedLine, ...detailRows];
	}

	private formatPhase(phase: OverlayPhase, index: number, width: number): string {
		const selected = index === this.selectedPhaseIndex;
		const focusSelected = selected && this.focusedPane === "phases";
		const glyph = focusSelected ? "▶" : selected ? "›" : phase.active ? "●" : phase.done >= phase.total ? "✓" : `${index + 1}.`;
		const label = `${glyph} ${phase.title} ${phase.done}/${phase.total}`;
		const styled = selected
			? this.theme.fg("accent", this.theme.bold(label))
			: phase.active
				? this.theme.fg("accent", label)
				: phase.done >= phase.total
					? this.theme.fg("success", label)
					: this.theme.fg("muted", label);
		return truncateToWidth(styled, width);
	}

	private formatOverlayRow(row: OverlayRow, index: number, width: number): string {
		const selected = index === this.selectedRowIndex;
		const glyph = statusGlyph(row.status ?? "pending", this.theme);
		const prefix = selected ? this.theme.fg("accent", this.focusedPane === "rows" ? "▶" : "›") : " ";
		const stats = [
			row.tokens ? `${formatTokens(row.tokens)} tok` : undefined,
			row.toolCount ? `${row.toolCount} tools` : undefined,
			row.durationMs ? formatDuration(row.durationMs) : undefined,
		]
			.filter((part): part is string => Boolean(part))
			.join(" · ");
		const activity = row.error ?? row.activity ?? row.status ?? "pending";
		const label = selected ? this.theme.fg("accent", this.theme.bold(row.label)) : this.theme.fg("toolTitle", row.label);
		return truncateToWidth(`${prefix} ${glyph} ${label} ${this.theme.fg("dim", "·")} ${activity}${stats ? ` ${this.theme.fg("dim", "·")} ${this.theme.fg("dim", stats)}` : ""}`, width);
	}

	private row(content: string, innerWidth: number): string {
		return `${this.theme.fg("border", "│")}${truncateToWidth(content, innerWidth, "", true)}${this.theme.fg("border", "│")}`;
	}
}

function summarizeTaskForDetail(row: OverlayRow): string[] {
	if (row.error) return [row.error];
	const task = row.task;
	const activity = row.activity && row.activity !== "agent" ? row.activity : undefined;
	if (!task) return activity ? [activity] : [];

	const sourceLines = task.replace(/\r/g, "").split("\n").map((line) => line.trimEnd());
	const lines: string[] = [];
	const first = sourceLines.find((line) => line.trim().length > 0);
	if (first) lines.push(first);
	if (activity && activity !== first) lines.push(activity);

	for (const heading of ["Assigned item:", "Collected touch result:"]) {
		const index = sourceLines.findIndex((line) => line.trim() === heading);
		if (index < 0) continue;
		if (!lines.includes(heading)) lines.push(heading);
		for (const line of sourceLines.slice(index + 1)) {
			if (!line.trim()) break;
			lines.push(line);
			if (lines.length >= STATUS_DETAIL_ROWS) break;
		}
		break;
	}

	return lines.length > 0 ? lines : [task.replace(/\s+/g, " ").trim()];
}

function flattenGraphNodes(nodes: WorkflowGraphNodeLike[]): WorkflowGraphNodeLike[] {
	return nodes.flatMap((node) => [node, ...flattenGraphNodes(node.children ?? [])]);
}

function buildOverlayPhases(state: ActiveWorkflowState): OverlayPhase[] {
	const details = state.details;
	const progress = rankProgress(collectProgress(details));
	const fallbackRows = progress.map(progressToOverlayRow);
	const graph = details?.workflowGraph;
	if (!graph?.phases?.length || !graph.nodes?.length) {
		return [{ title: "Agents", rows: fallbackRows, done: fallbackRows.filter((row) => isDone(row.status)).length, total: Math.max(1, fallbackRows.length), active: state.status === "running" }];
	}

	const nodesById = new Map(flattenGraphNodes(graph.nodes).filter((node) => node.id).map((node) => [node.id!, node]));
	const progressByAgent = groupProgressByAgent(progress);
	return graph.phases.map((phase, index) => {
		const roots = (phase.nodeIds ?? []).map((id) => nodesById.get(id)).filter((node): node is WorkflowGraphNodeLike => Boolean(node));
		const graphRows = roots.flatMap((node) => graphNodeRows(node, progressByAgent));
		const rows = graphRows.length > 0 ? graphRows : fallbackRows;
		const done = rows.filter((row) => isDone(row.status)).length;
		const total = Math.max(1, rows.length);
		const active = graph.currentNodeId ? roots.some((node) => graphNodeContains(node, graph.currentNodeId)) : rows.some((row) => row.status === "running");
		return { title: phase.title ?? `Phase ${index + 1}`, rows, done, total, active };
	});
}

function groupProgressByAgent(progress: AgentProgressLike[]): Map<string, AgentProgressLike[]> {
	const byAgent = new Map<string, AgentProgressLike[]>();
	for (const item of progress) {
		if (!item.agent) continue;
		const current = byAgent.get(item.agent) ?? [];
		current.push(item);
		byAgent.set(item.agent, current);
	}
	return byAgent;
}

function graphNodeRows(node: WorkflowGraphNodeLike, progressByAgent: Map<string, AgentProgressLike[]>): OverlayRow[] {
	if (node.children?.length) {
		const childRows = node.children.flatMap((child) => graphNodeRows(child, progressByAgent));
		if (childRows.length > 0) return childRows;
	}
	const progress = node.agent ? progressByAgent.get(node.agent)?.shift() : undefined;
	return [{
		label: node.label ?? node.agent ?? node.kind ?? "step",
		agent: node.agent,
		status: progress?.status ?? node.status,
		activity: progress?.currentPath ?? formatTool(progress ?? {}) ?? node.kind,
		task: progress?.task,
		tokens: progress?.tokens,
		toolCount: progress?.toolCount,
		durationMs: progress?.durationMs,
		error: progress?.error,
	}];
}

function graphNodeContains(node: WorkflowGraphNodeLike, id: string): boolean {
	if (node.id === id) return true;
	return node.children?.some((child) => graphNodeContains(child, id)) ?? false;
}

function progressToOverlayRow(progress: AgentProgressLike): OverlayRow {
	return {
		label: progress.agent ?? `agent ${progress.index ?? "?"}`,
		agent: progress.agent,
		status: progress.status,
		activity: progress.error ?? progress.currentPath ?? formatTool(progress),
		task: progress.task,
		tokens: progress.tokens,
		toolCount: progress.toolCount,
		durationMs: progress.durationMs,
		error: progress.error,
	};
}

function padVisible(value: string, width: number): string {
	const truncated = truncateToWidth(value, width);
	return `${truncated}${" ".repeat(Math.max(0, width - visibleWidth(truncated)))}`;
}
