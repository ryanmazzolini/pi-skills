import { createHash } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
	getAgentDir,
	type ExtensionAPI,
	type ExtensionContext,
	type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Container, Text } from "@earendil-works/pi-tui";
import { Type, type Static } from "typebox";
import { createPiChildSessionAdapter, resolveChildResources } from "./child-session.ts";
import { createParentDelivery, type DeliveryMetadata } from "./delivery.ts";
import { createFileRunRepository } from "./persistence.ts";
import {
	DEFAULT_MAX_ACTIVE_CHILDREN,
	DelegateRuntime,
	deriveRunStatus,
	projectRun,
	runNeedsControl,
	type DelegateHandle,
	type DelegatedChild,
	type DelegationRun,
	type LaunchResources,
	type ResolvedChildConfig,
	type RunView,
} from "./runtime.ts";
import { createDelegateUi, stateIcon, type AgentDeskTarget, type DelegateUi } from "./ui.ts";
import { createGitWorkspaceManager } from "./workspace.ts";

const TaskParams = Type.Object({
	task: Type.String({ minLength: 1, description: "One self-contained task" }),
	label: Type.Optional(Type.String({ minLength: 1, description: "Short human-facing label" })),
}, { additionalProperties: false });

const DelegateParams = Type.Object({
	task: Type.Optional(Type.String({ minLength: 1, description: "One self-contained task to delegate" })),
	label: Type.Optional(Type.String({ minLength: 1, description: "Label for task; only valid with task" })),
	tasks: Type.Optional(Type.Array(TaskParams, { minItems: 1, maxItems: 32, description: "A homogeneous labeled task batch" })),
	cwd: Type.Optional(Type.String({ minLength: 1, description: "Working directory or clean source directory; defaults to the parent cwd" })),
	workspace: Type.Optional(Type.String({ enum: ["existing", "temporary"], description: "Use the existing directory or an isolated temporary workspace: a Git worktree in a repository, otherwise a scratch directory" })),
	context: Type.Optional(Type.String({ enum: ["fresh", "fork"], description: "Fresh agent context or a full parent-session fork" })),
	skills: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { uniqueItems: true, description: "Explicit skill names" })),
	tools: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { uniqueItems: true, description: "Explicit built-in coding tool allowlist" })),
	model: Type.Optional(Type.String({ minLength: 3, description: "Exact provider/model override" })),
	reasoning: Type.Optional(Type.String({ enum: ["off", "minimal", "low", "medium", "high", "xhigh", "max"] })),
	outputSchema: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: "Object JSON Schema for validated structured output" })),
}, { additionalProperties: false });

const DELEGATE_PARAM_NAMES = new Set(Object.keys(DelegateParams.properties));
const DELEGATE_STATUS_WIDGET = "delegate-agent-status";

const DelegateControlParams = Type.Object({
	action: Type.String({ enum: ["status", "wait", "steer", "reply", "cancel", "resume", "review", "apply", "discard", "cleanup"], description: "Lifecycle or temporary-workspace operation" }),
	runId: Type.String({ minLength: 1, description: "Agent run identifier" }),
	childId: Type.Optional(Type.String({ minLength: 1, description: "Optional agent identifier; omission targets the run or unique eligible agent" })),
	message: Type.Optional(Type.String({ minLength: 1, description: "Required for steer and reply" })),
	revision: Type.Optional(Type.String({ minLength: 1, description: "Required reviewed revision for apply and discard" })),
	timeoutMs: Type.Optional(Type.Integer({ minimum: 1, maximum: 600_000, description: "Wait timeout; work keeps running" })),
}, { additionalProperties: false });

interface DelegateToolDetails extends DelegateHandle {}
interface DelegateControlDetails {
	view: RunView;
}

interface HeldAgentSummary {
	childId: string;
	label: string;
	state: DelegatedChild["state"];
}

export interface HeldEntry {
	runId: string;
	reason: "user_intervened" | "session_changed";
	recordRef: string;
	kind: DeliveryMetadata["kind"];
	childId?: string;
	agentCount?: number;
	agents?: HeldAgentSummary[];
	status?: RunView["status"];
	outcome?: DelegatedChild["state"];
}

interface RenderedRunView extends RunView {
	eventId?: string;
	childId?: string;
}

function taskLabel(task: string): string {
	const firstLine = task.trim().split("\n", 1)[0] ?? "Delegated task";
	return firstLine.length > 56 ? `${firstLine.slice(0, 55)}…` : firstLine;
}

function renderedResult(child: RunView["children"][number]): string {
	if (!child.result) return child.error?.message ?? child.attention?.question ?? child.lastActivity.summary;
	return child.result.kind === "text" ? child.result.value : JSON.stringify(child.result.value);
}

export function delegateLaunchText(handle: DelegateHandle): string {
	const started = handle.children.length === 1
		? `Started agent ${handle.children[0]?.label ?? "task"}.`
		: `Started ${handle.children.length} agents.`;
	const internal = JSON.stringify({ runId: handle.runId });
	return `${started}\n<internal_delegate_handle>${internal}</internal_delegate_handle>\nNever repeat the internal handle in user-facing text.`;
}

export function toolText(result: RunView): string {
	const lines = [`Agents ${result.status}: ${result.runId}`];
	for (const child of result.children) {
		lines.push(`${child.label}: ${child.state} — ${renderedResult(child)}`);
		if (child.workspace) {
			const revision = child.workspace.revision ? ` · ${child.workspace.revision}` : "";
			const label = child.workspace.backing === "scratch" ? "Scratch" : "Workspace";
			lines.push(`  ${label}: ${child.workspace.state}${revision}`);
			lines.push(`  Path: ${child.workspace.pathRef}`);
			if (child.workspace.message) lines.push(`  Workspace note: ${child.workspace.message}`);
			if (child.workspace.cleanupError) lines.push(`  Cleanup failed: ${child.workspace.cleanupError}`);
			if (child.workspace.contents) {
				lines.push("  Contents:", ...child.workspace.contents.map((entry) => `    ${entry}`));
				if (child.workspace.contentsTruncated) lines.push("    [additional entries omitted]");
			}
			if (child.workspace.patchRef) lines.push(`  Patch: ${child.workspace.patchRef}`);
			if (child.workspace.manifestRef) lines.push(`  Manifest: ${child.workspace.manifestRef}`);
			if (child.workspace.state === "working"
				&& (child.state === "completed" || child.state === "failed" || child.state === "cancelled")) {
				lines.push(child.workspace.backing === "scratch"
					? "  Next: preserve useful artifacts, then clean this scratch workspace with delegate_control"
					: "  Next: review this child with delegate_control");
			}
			if ((child.workspace.state === "review_pending" || child.workspace.state === "conflict") && child.workspace.revision) {
				lines.push(`  Next: apply or discard revision ${child.workspace.revision} with delegate_control`);
			}
			if (child.workspace.cleanupError) lines.push("  Next: retry cleanup with delegate_control action=cleanup");
		}
	}
	lines.push(`Full run: ${result.recordRef}`);
	return lines.join("\n");
}

function newestFirst(runs: DelegationRun[]): DelegationRun[] {
	return [...runs].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

export function currentDelegationRun(runs: DelegationRun[]): DelegationRun | undefined {
	const ordered = newestFirst(runs);
	return ordered.find(runNeedsControl) ?? ordered[0];
}

export function currentHeldRun(runs: DelegationRun[]): DelegationRun | undefined {
	return newestFirst(runs).find((run) => run.delivery.state === "held"
		|| run.children.some((child) => child.attention?.notification.state === "held"));
}

function heldAgentLabel(label: string): string {
	const sanitized = label.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim();
	return taskLabel(sanitized || "Delegated task");
}

function heldOutcome(agents: HeldAgentSummary[]): DelegatedChild["state"] | undefined {
	if (agents.some((agent) => agent.state === "failed")) return "failed";
	if (agents.some((agent) => agent.state === "interrupted")) return "interrupted";
	if (agents.some((agent) => agent.state === "needs_attention")) return "needs_attention";
	if (agents.length > 0 && agents.every((agent) => agent.state === "completed")) return "completed";
	if (agents.some((agent) => agent.state === "cancelled")) return "cancelled";
	return agents[0]?.state;
}

export function heldEntryData(
	run: DelegationRun,
	reason: HeldEntry["reason"],
	metadata: DeliveryMetadata,
): HeldEntry {
	const allAgents = run.children.map((child) => ({
		childId: child.id,
		label: heldAgentLabel(child.label),
		state: child.state,
	}));
	const attentionAgent = metadata.childId
		? allAgents.find((agent) => agent.childId === metadata.childId)
		: undefined;
	return {
		runId: run.id,
		reason,
		recordRef: run.recordRef,
		kind: metadata.kind,
		...(metadata.childId ? { childId: metadata.childId } : {}),
		agentCount: allAgents.length,
		agents: metadata.kind === "attention"
			? (attentionAgent ? [attentionAgent] : [])
			: allAgents.slice(0, 3),
		status: deriveRunStatus(run),
		outcome: metadata.kind === "attention" ? "needs_attention" : heldOutcome(allAgents),
	};
}

function heldBatchTitle(status: HeldEntry["status"], agentCount: number): string {
	if (status === "completed") return `${agentCount} agents finished`;
	if (status === "partial") return `${agentCount}-agent run finished with mixed results`;
	if (status === "failed") return `${agentCount}-agent run failed`;
	if (status === "cancelled") return `${agentCount}-agent run was cancelled`;
	if (status === "interrupted") return `${agentCount}-agent run was interrupted`;
	return `${agentCount}-agent run finished`;
}

export function heldEntryTitle(data: HeldEntry): string {
	const agents = data.agents ?? [];
	if (data.kind === "attention") {
		const agent = agents.find((candidate) => candidate.childId === data.childId)
			?? (agents.length === 1 ? agents[0] : undefined);
		return agent ? `${agent.label} needs attention` : "agent attention ready";
	}
	const agentCount = data.agentCount ?? agents.length;
	if (agentCount === 1 && agents[0]) {
		const agent = agents[0];
		if (agent.state === "completed") return `${agent.label} finished`;
		if (agent.state === "failed") return `${agent.label} failed`;
		if (agent.state === "cancelled") return `${agent.label} was cancelled`;
		if (agent.state === "interrupted") return `${agent.label} was interrupted`;
		return `${agent.label} result ready`;
	}
	if (agentCount > 1) {
		const outcome = heldBatchTitle(data.status, agentCount);
		const shown = agents.map((agent) => agent.label).join(", ");
		const remaining = Math.max(0, agentCount - agents.length);
		return shown ? `${outcome}: ${shown}${remaining > 0 ? ` + ${remaining} more` : ""}` : outcome;
	}
	return "agent result ready";
}

export function heldEntryState(data: HeldEntry): DelegatedChild["state"] | undefined {
	if (data.kind === "attention") return "needs_attention";
	return data.outcome ?? heldOutcome(data.agents ?? []);
}

export function agentDeskTarget(runId?: string, childId?: string): AgentDeskTarget {
	return {
		...(runId ? { runId } : {}),
		...(childId ? { childId } : {}),
	};
}

export async function defaultDelegateTemporaryRoot(temporaryRoot = tmpdir()): Promise<string> {
	const userKey = process.getuid?.()?.toString()
		?? createHash("sha256").update(homedir()).digest("hex").slice(0, 16);
	return join(await realpath(temporaryRoot), `pi-delegate-${userKey}`);
}

export async function existingDirectory(parentCwd: string, value: string | undefined): Promise<string> {
	const cwd = value ? resolve(parentCwd, value) : parentCwd;
	let info;
	try {
		info = await stat(cwd);
	} catch {
		throw new Error(`Delegated working directory does not exist: ${cwd}`);
	}
	if (!info.isDirectory()) throw new Error(`Delegated working directory is not a directory: ${cwd}`);
	return realpath(cwd);
}

export function normalizeTasks(params: { task?: string; label?: string; tasks?: Array<{ task: string; label?: string }> }): Array<{ task: string; label: string }> {
	const hasTask = typeof params.task === "string";
	const hasTasks = Array.isArray(params.tasks);
	if (hasTask === hasTasks) throw new Error("Provide exactly one of task or tasks");
	if (hasTasks) {
		if (params.label !== undefined) throw new Error("label is only valid with task; batch labels belong inside tasks");
		if (params.tasks!.length === 0) throw new Error("tasks cannot be empty");
		return params.tasks!.map((item) => {
			const task = item.task.trim();
			if (!task) throw new Error("Delegated task cannot be empty");
			return { task, label: item.label?.trim() || taskLabel(task) };
		});
	}
	const task = params.task!.trim();
	if (!task) throw new Error("Delegated task cannot be empty");
	return [{ task, label: params.label?.trim() || taskLabel(task) }];
}

export function supportsReasoning(model: NonNullable<ExtensionContext["model"]>, reasoning: string): boolean {
	if (!model.reasoning) return reasoning === "off";
	const mapping = model.thinkingLevelMap as Record<string, unknown> | undefined;
	if (mapping?.[reasoning] === null) return false;
	if (reasoning === "xhigh" || reasoning === "max") return mapping?.[reasoning] !== undefined;
	return ["off", "minimal", "low", "medium", "high"].includes(reasoning);
}

function exactModel(
	ctx: ExtensionContext,
	reference: string | undefined,
): NonNullable<ExtensionContext["model"]> {
	if (!reference) {
		if (!ctx.model) throw new Error("The parent session has no active model to inherit");
		return ctx.model;
	}
	const slash = reference.indexOf("/");
	if (slash <= 0 || slash === reference.length - 1) throw new Error(`Model must use exact provider/model form: ${reference}`);
	const provider = reference.slice(0, slash);
	const id = reference.slice(slash + 1);
	const model = ctx.modelRegistry.find(provider, id);
	if (!model) throw new Error(`Unknown delegated model: ${reference}`);
	if (!ctx.modelRegistry.hasConfiguredAuth(model)) throw new Error(`No authentication is configured for delegated model: ${reference}`);
	return model;
}

const SUPPORTED_SCHEMA_TYPES = new Set(["object", "array", "string", "number", "integer", "boolean", "null"]);
const SUPPORTED_SCHEMA_KEYWORDS = new Set([
	"type", "description", "title", "enum", "const", "default",
	"properties", "required", "additionalProperties", "minProperties", "maxProperties",
	"items", "minItems", "maxItems", "uniqueItems",
	"minLength", "maxLength", "pattern",
	"minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
]);

function schemaObject(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value: unknown): boolean {
	return typeof value === "number" && Number.isFinite(value);
}

export function validateOutputSchema(schema: Record<string, unknown>, path = "outputSchema"): void {
	for (const keyword of Object.keys(schema)) {
		if (!SUPPORTED_SCHEMA_KEYWORDS.has(keyword)) throw new Error(`${path} uses unsupported keyword: ${keyword}`);
	}
	if (typeof schema.type !== "string" || !SUPPORTED_SCHEMA_TYPES.has(schema.type)) {
		throw new Error(`${path}.type must be one supported JSON Schema type`);
	}
	if (schema.description !== undefined && typeof schema.description !== "string") throw new Error(`${path}.description must be a string`);
	if (schema.title !== undefined && typeof schema.title !== "string") throw new Error(`${path}.title must be a string`);
	if (schema.enum !== undefined && (!Array.isArray(schema.enum) || schema.enum.length === 0)) throw new Error(`${path}.enum must be a non-empty array`);
	for (const keyword of ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"]) {
		if (schema[keyword] !== undefined && !finiteNumber(schema[keyword])) throw new Error(`${path}.${keyword} must be a finite number`);
	}
	if (schema.multipleOf !== undefined && (schema.multipleOf as number) <= 0) throw new Error(`${path}.multipleOf must be greater than zero`);
	for (const [minimum, maximum] of [["minimum", "maximum"], ["exclusiveMinimum", "exclusiveMaximum"]] as const) {
		if (schema[minimum] !== undefined && schema[maximum] !== undefined && (schema[minimum] as number) > (schema[maximum] as number)) {
			throw new Error(`${path}.${minimum} cannot exceed ${maximum}`);
		}
	}
	for (const keyword of ["minProperties", "maxProperties", "minItems", "maxItems", "minLength", "maxLength"]) {
		const value = schema[keyword];
		if (value !== undefined && (!Number.isInteger(value) || (value as number) < 0)) throw new Error(`${path}.${keyword} must be a non-negative integer`);
	}
	if (schema.pattern !== undefined) {
		if (typeof schema.pattern !== "string") throw new Error(`${path}.pattern must be a string`);
		try {
			new RegExp(schema.pattern);
		} catch {
			throw new Error(`${path}.pattern must be a valid regular expression`);
		}
	}
	if ("format" in schema) throw new Error(`${path} uses unsupported keyword: format`);
	for (const [minimum, maximum] of [["minProperties", "maxProperties"], ["minItems", "maxItems"], ["minLength", "maxLength"]] as const) {
		if (schema[minimum] !== undefined && schema[maximum] !== undefined && (schema[minimum] as number) > (schema[maximum] as number)) {
			throw new Error(`${path}.${minimum} cannot exceed ${maximum}`);
		}
	}
	if (schema.uniqueItems !== undefined && typeof schema.uniqueItems !== "boolean") throw new Error(`${path}.uniqueItems must be boolean`);
	if (schema.properties !== undefined) {
		if (schema.type !== "object" || !schemaObject(schema.properties)) throw new Error(`${path}.properties must be an object for type object`);
		for (const [name, child] of Object.entries(schema.properties)) {
			if (!schemaObject(child)) throw new Error(`${path}.properties.${name} must be a schema object`);
			validateOutputSchema(child, `${path}.properties.${name}`);
		}
	}
	if (schema.required !== undefined) {
		if (schema.type !== "object" || !Array.isArray(schema.required) || !schema.required.every((name) => typeof name === "string")) {
			throw new Error(`${path}.required must be an array of property names for type object`);
		}
		const names = schema.required as string[];
		if (new Set(names).size !== names.length) throw new Error(`${path}.required contains duplicates`);
		const properties = schemaObject(schema.properties) ? schema.properties : {};
		const missing = names.filter((name) => !(name in properties));
		if (missing.length > 0) throw new Error(`${path}.required names unknown properties: ${missing.join(", ")}`);
	}
	if (schema.additionalProperties !== undefined) {
		if (schema.type !== "object") throw new Error(`${path}.additionalProperties is only valid for type object`);
		if (typeof schema.additionalProperties !== "boolean") {
			if (!schemaObject(schema.additionalProperties)) throw new Error(`${path}.additionalProperties must be boolean or a schema object`);
			validateOutputSchema(schema.additionalProperties, `${path}.additionalProperties`);
		}
	}
	if (schema.items !== undefined) {
		if (schema.type !== "array" || !schemaObject(schema.items)) throw new Error(`${path}.items must be one schema object for type array`);
		validateOutputSchema(schema.items, `${path}.items`);
	}
}

function outputContract(value: Record<string, unknown> | undefined): ResolvedChildConfig["output"] {
	if (value === undefined) return "text";
	validateOutputSchema(value);
	if (value.type !== "object") throw new Error("outputSchema must have type: object at its root");
	return { schema: structuredClone(value) };
}

export function validateControl(params: {
	action: string;
	message?: string;
	revision?: string;
	timeoutMs?: number;
}): void {
	const needsMessage = params.action === "steer" || params.action === "reply";
	if (needsMessage && !params.message?.trim()) throw new Error(`${params.action} requires message`);
	if (!needsMessage && params.message !== undefined) throw new Error(`message is not valid for ${params.action}`);
	const needsRevision = params.action === "apply" || params.action === "discard";
	if (needsRevision && !params.revision?.trim()) throw new Error(`${params.action} requires revision`);
	if (!needsRevision && params.revision !== undefined) throw new Error(`revision is not valid for ${params.action}`);
	if (params.action !== "wait" && params.timeoutMs !== undefined) throw new Error(`timeoutMs is only valid for wait`);
}

export function persistedInputGeneration(ctx: ExtensionContext): number {
	return ctx.sessionManager.getBranch().filter((entry) => {
		if (entry.type !== "message") return false;
		return (entry.message as { role?: unknown }).role === "user";
	}).length;
}

function currentOrigin(ctx: ExtensionContext, inputGeneration: number): { inputGeneration: number; leafId: string | null } {
	return { inputGeneration, leafId: ctx.sessionManager.getLeafId() };
}

function launchResourcesForChild(ctx: ExtensionContext, child: DelegatedChild): LaunchResources {
	const model = ctx.modelRegistry.find(child.resolved.model.provider, child.resolved.model.id);
	if (!model) throw new Error(`Persisted delegated model is unavailable: ${child.resolved.model.provider}/${child.resolved.model.id}`);
	if (!ctx.modelRegistry.hasConfiguredAuth(model)) {
		throw new Error(`No authentication is configured for delegated model: ${child.resolved.model.provider}/${child.resolved.model.id}`);
	}
	if (!supportsReasoning(model, child.resolved.reasoning)) {
		throw new Error(`Reasoning ${child.resolved.reasoning} is unsupported by ${child.resolved.model.provider}/${child.resolved.model.id}`);
	}
	return { model, modelRegistry: ctx.modelRegistry };
}

export default function delegateExtension(pi: ExtensionAPI): void {
	let runtime: DelegateRuntime | undefined;
	let delegateUi: DelegateUi | undefined;
	let currentContext: ExtensionContext | undefined;
	let inputGeneration = 0;
	let runtimeSubscription: (() => void) | undefined;
	let pinnedStatus: ReturnType<DelegateUi["createStatus"]> | undefined;

	const requireRuntime = (): DelegateRuntime => {
		if (!runtime) throw new Error("Agent runtime is not ready");
		return runtime;
	};

	const syncControlTool = () => {
		if (!runtime) return;
		const shouldEnable = runtime.list().some(runNeedsControl);
		const active = pi.getActiveTools();
		const isEnabled = active.includes("delegate_control");
		if (shouldEnable && !isEnabled) pi.setActiveTools([...active, "delegate_control"]);
		if (!shouldEnable && isEnabled) pi.setActiveTools(active.filter((name) => name !== "delegate_control"));
	};

	const delegateTool: ToolDefinition<typeof DelegateParams, DelegateToolDetails> = {
		name: "delegate",
		label: "Agents",
		description: "Start one agent or a homogeneous labeled agent batch and immediately return a live handle. Shared options can select an existing directory or isolated temporary workspace, fresh or forked context, named skills, coding tools, an exact model/reasoning route, and structured output. Temporary work uses a Git worktree in a repository and a scratch directory otherwise. Agents never inherit ambient extensions or delegation capability.",
		promptSnippet: "Start focused agent work without blocking the parent turn",
		promptGuidelines: [
			"Use delegate when isolated context, independent judgment, or concurrency materially helps; continue useful parent work after it returns.",
			"Use tasks for homogeneous parallel work. Use separate delegate calls when agents need different resources or models.",
			"Use a temporary workspace for isolation. Review and explicitly apply or discard Git work; for scratch research, preserve or distill useful artifacts before explicit cleanup.",
			"Do not call delegate and immediately wait when useful independent parent work remains.",
			"Treat delegate run and child IDs as internal orchestration data. Never repeat them in user-facing prose; direct users to /agents for diagnostics.",
		],
		renderShell: "self",
		parameters: DelegateParams,
		prepareArguments(args): Static<typeof DelegateParams> {
			if (!args || typeof args !== "object" || Array.isArray(args)) return args as Static<typeof DelegateParams>;
			const unknown = Object.keys(args).filter((name) => !DELEGATE_PARAM_NAMES.has(name)).sort();
			if (unknown.length === 0) return args as Static<typeof DelegateParams>;
			const noun = unknown.length === 1 ? "option" : "options";
			throw new Error(
				`Unsupported delegate ${noun}: ${unknown.join(", ")}. Supported options: ${[...DELEGATE_PARAM_NAMES].join(", ")}`,
			);
		},
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			currentContext = ctx;
			const tasks = normalizeTasks(params);
			const cwd = await existingDirectory(ctx.cwd, params.cwd);
			const model = exactModel(ctx, params.model);
			const reasoning = params.reasoning ?? pi.getThinkingLevel();
			if (!supportsReasoning(model, reasoning)) {
				throw new Error(`Reasoning ${reasoning} is unsupported by ${model.provider}/${model.id}`);
			}
			const context: "fresh" | "fork" = params.context === "fork" ? "fork" : "fresh";
			const parentSessionFile = ctx.sessionManager.getSessionFile();
			if (context === "fork" && !parentSessionFile) throw new Error("Forked child context requires a persisted parent session");
			const resources = await resolveChildResources(cwd, { skills: params.skills, tools: params.tools });
			const resolved: ResolvedChildConfig = {
				model: { provider: model.provider, id: model.id },
				reasoning,
				context,
				skills: resources.skills,
				tools: resources.tools,
				output: outputContract(params.outputSchema),
			};
			const handle = await requireRuntime().start({
				tasks,
				cwd,
				workspace: params.workspace === "temporary" ? "temporary" : "existing",
				parent: {
					sessionId: ctx.sessionManager.getSessionId(),
					leafId: ctx.sessionManager.getLeafId(),
					inputGeneration,
				},
				...(parentSessionFile ? { parentSessionFile } : {}),
				model,
				modelRegistry: ctx.modelRegistry,
				resolved,
			});
			syncControlTool();
			return {
				content: [{ type: "text", text: delegateLaunchText(handle) }],
				details: handle,
			};
		},
		renderCall(args, theme) {
			const label = args.tasks
				? `${args.tasks.length} tasks`
				: args.label ?? taskLabel(args.task ?? "Agent task");
			return new Text(
				`${theme.fg("toolTitle", theme.bold("agents "))}${theme.fg("accent", label)}`,
				0,
				0,
			);
		},
		renderResult(result, options, theme, context) {
			const runId = result.details?.runId;
			if (!runId || !delegateUi) {
				const content = result.content[0];
				return new Text(content?.type === "text" ? content.text : "Agent run unavailable", 0, 0);
			}
			return delegateUi.renderLaunch(result.details, options.expanded, theme);
		},
	};

	const controlTool: ToolDefinition<typeof DelegateControlParams, DelegateControlDetails> = {
		name: "delegate_control",
		label: "Agent Control",
		description: "Inspect, wait for, steer, reply to, cancel, or resume an agent run. Review, apply, and discard manage finalized Git workspaces by exact revision. Cleanup retries failed Git cleanup or explicitly removes a finalized scratch workspace after useful artifacts are preserved. Status is a one-time snapshot; wait is the blocking completion path. Invalid IDs, fields, and transitions are tool errors; agent failures are returned as run data.",
		promptSnippet: "Control one existing agent run without polling",
		promptGuidelines: [
			"Choose one result path per dependency: continue and rely on automatic delivery, or call wait once when blocked. Reserve status for one-time inspection after a state change. Switch modes or retry only after an explicit failure or timeout.",
			"Treat delegate run and child IDs as internal orchestration data. Never repeat them in user-facing prose; direct users to /agents for diagnostics.",
		],
		parameters: DelegateControlParams,
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			currentContext = ctx;
			validateControl(params);
			const activeRuntime = requireRuntime();
			let run;
			if (params.action === "status") {
				run = activeRuntime.get(params.runId);
				if (!run) throw new Error(`Unknown agent run: ${params.runId}`);
			} else if (params.action === "wait") {
				run = await activeRuntime.wait(params.runId, params.childId, signal, params.timeoutMs);
			} else if (params.action === "cancel") {
				run = await activeRuntime.cancel(params.runId, params.childId);
			} else if (params.action === "steer") {
				run = await activeRuntime.steer(params.runId, params.childId, params.message!, currentOrigin(ctx, inputGeneration));
			} else if (params.action === "reply") {
				const before = activeRuntime.get(params.runId);
				if (!before) throw new Error(`Unknown agent run: ${params.runId}`);
				const eligible = params.childId
					? before.children.find((child) => child.id === params.childId)
					: before.children.filter((child) => child.state === "needs_attention")[0];
				if (!eligible) throw new Error(`Run ${params.runId} has no eligible agent for reply`);
				run = await activeRuntime.reply(params.runId, params.childId, params.message!, launchResourcesForChild(ctx, eligible), currentOrigin(ctx, inputGeneration));
			} else if (params.action === "resume") {
				const before = activeRuntime.get(params.runId);
				if (!before) throw new Error(`Unknown agent run: ${params.runId}`);
				const eligible = params.childId
					? before.children.find((child) => child.id === params.childId)
					: before.children.find((child) => child.state === "interrupted");
				if (!eligible) throw new Error(`Run ${params.runId} has no interrupted agent to resume`);
				run = await activeRuntime.resume(params.runId, params.childId, launchResourcesForChild(ctx, eligible), currentOrigin(ctx, inputGeneration));
			} else if (params.action === "review") {
				run = await activeRuntime.review(params.runId, params.childId);
			} else if (params.action === "apply") {
				run = await activeRuntime.apply(params.runId, params.childId, params.revision!);
			} else if (params.action === "discard") {
				run = await activeRuntime.discard(params.runId, params.childId, params.revision!);
			} else if (params.action === "cleanup") {
				run = await activeRuntime.cleanup(params.runId, params.childId);
			} else {
				throw new Error(`Unsupported agent control action: ${params.action}`);
			}
			const view = projectRun(run);
			syncControlTool();
			return { content: [{ type: "text", text: toolText(view) }], details: { view } };
		},
		renderCall(args, theme, context) {
			if (args.action === "wait" && !context.expanded) return new Container();
			const target = context.expanded ? ` ${theme.fg("accent", args.runId)}` : "";
			return new Text(
				`${theme.fg("toolTitle", theme.bold("agents "))}${args.action}${target}`,
				0,
				0,
			);
		},
		renderResult(result, options, theme, context) {
			if (context.args.action === "wait" && !options.expanded) return new Container();
			const view = result.details?.view;
			if (!view) {
				const content = result.content[0];
				return new Text(content?.type === "text" ? content.text : "No agent status", 0, 0);
			}
			return delegateUi?.renderCompletion(view, options.expanded, theme) ?? new Text(toolText(view), 0, 0);
		},
	};

	pi.registerTool(delegateTool);
	pi.registerTool(controlTool);

	const renderMessage = (message: { details?: RenderedRunView; content: unknown }, options: { expanded: boolean }, theme: Parameters<DelegateUi["renderCompletion"]>[2]) => {
		const view = message.details;
		if (view && delegateUi) return delegateUi.renderCompletion(view, options.expanded, theme);
		const content = typeof message.content === "string" ? message.content : "Agent update";
		return new Text(content, 0, 0);
	};
	pi.registerMessageRenderer<RenderedRunView>("delegate-result", renderMessage);
	pi.registerMessageRenderer<RenderedRunView>("delegate-attention", renderMessage);

	pi.registerEntryRenderer<HeldEntry>("delegate-held", (entry, options, theme) => {
		const data = entry.data;
		if (!data) return new Text(theme.fg("warning", "Agent update is ready"), 0, 0);
		const restoredAgents = data.agents ?? runtime?.get(data.runId)?.children.map((child) => ({
			childId: child.id,
			label: child.label,
			state: child.state,
		}));
		const displayData = { ...data, ...(restoredAgents ? { agents: restoredAgents } : {}) };
		const title = heldEntryTitle(displayData);
		const state = heldEntryState(displayData);
		const icon = state ? stateIcon(state, theme, false) : theme.fg("muted", "○");
		let text = `${icon} ${theme.bold(title)} ${theme.fg("dim", "· open ")}${theme.fg("accent", "/agents")}`;
		if (options.expanded) text += `\n${theme.fg("dim", data.recordRef)}`;
		return new Text(text, 0, 0);
	});

	pi.registerEntryRenderer<{ text: string }>("delegate-command", (entry, _options, theme) => {
		return new Text(theme.fg("dim", entry.data?.text ?? "No agent runs."), 0, 0);
	});

	pi.registerCommand("agents", {
		description: "Open Agent Desk or manage runs: /agents [<run-id> [child-id]|list|use|cancel|review|apply|discard|cleanup]",
		async handler(args, ctx) {
			currentContext = ctx;
			const [action, first, second, third] = args.trim().split(/\s+/, 4);
			const activeRuntime = requireRuntime();
			if (action === "cancel" || action === "use" || action === "review" || action === "apply" || action === "discard" || action === "cleanup") {
				if (action === "cancel") {
					if (!first) {
						ctx.ui.notify("Usage: /agents cancel <run-id>", "warning");
						return;
					}
					await activeRuntime.cancel(first);
					ctx.ui.notify(`Cancelled ${first}`, "info");
				} else if (action === "use") {
					const held = first ? activeRuntime.get(first) : currentHeldRun(activeRuntime.list());
					if (!held) {
						ctx.ui.notify(first ? `Unknown agent run: ${first}` : "No held agent update is ready.", "warning");
						return;
					}
					await activeRuntime.useHeld(held.id, currentOrigin(ctx, inputGeneration));
					ctx.ui.notify(`Added ${held.id} to the current conversation`, "info");
				} else if (action === "cleanup") {
					if (!first) {
						ctx.ui.notify("Usage: /agents cleanup <run-id> [child-id]", "warning");
						return;
					}
					const cleaned = await activeRuntime.cleanup(first, second);
					const child = second
						? cleaned.children.find((candidate) => candidate.id === second)
						: cleaned.children.find((candidate) => candidate.workspace.kind === "temporary");
					const integration = child?.workspace.kind === "temporary" ? child.workspace.integration : undefined;
					const failed = !!(integration && (("cleanupError" in integration && integration.cleanupError)
						|| (integration.state === "working" && integration.message)));
					ctx.ui.notify(failed ? `Cleanup still failed: ${first}` : `Cleanup completed: ${first}`, failed ? "warning" : "info");
				} else if (action === "review") {
					if (!first) {
						ctx.ui.notify("Usage: /agents review <run-id> [child-id]", "warning");
						return;
					}
					const reviewed = await activeRuntime.review(first, second);
					const child = second
						? reviewed.children.find((candidate) => candidate.id === second)
						: reviewed.children.find((candidate) => candidate.workspace.kind === "temporary");
					const integration = child?.workspace.kind === "temporary" ? child.workspace.integration : undefined;
					const revision = integration?.state === "review_pending" ? ` at ${integration.review.revision}` : "";
					ctx.ui.notify(`Reviewed ${first}${revision}`, "info");
				} else {
					if (!first || !second) {
						ctx.ui.notify(`Usage: /agents ${action} <run-id> <revision> [child-id]`, "warning");
						return;
					}
					const changed = action === "apply"
						? await activeRuntime.apply(first, third, second)
						: await activeRuntime.discard(first, third, second);
					const child = third
						? changed.children.find((candidate) => candidate.id === third)
						: changed.children.find((candidate) => candidate.workspace.kind === "temporary");
					const state = child?.workspace.kind === "temporary" ? child.workspace.integration.state : "unknown";
					ctx.ui.notify(`${action === "apply" ? "Apply" : "Discard"} ${state}: ${first}`, state === "conflict" ? "warning" : "info");
				}
				syncControlTool();
				return;
			}
			if (action === "list") {
				const runs = activeRuntime.list();
				const text = runs.length === 0
					? "No agent runs in this session."
					: runs.map((run) => `${projectRun(run).status}  ${run.id}  ${run.children.length} agent${run.children.length === 1 ? "" : "s"}`).join("\n");
				pi.appendEntry("delegate-command", { text });
				return;
			}
			const runs = activeRuntime.list();
			const targetRun = action ? activeRuntime.get(action) : undefined;
			if (ctx.mode === "tui" && delegateUi) {
				await delegateUi.openDesk(agentDeskTarget(action, first), ctx, {
					async resume(runId, childId) {
						const before = activeRuntime.get(runId);
						if (!before) throw new Error(`Unknown agent run: ${runId}`);
						const child = before.children.find((candidate) => candidate.id === childId);
						if (!child) throw new Error(`Unknown agent: ${childId}`);
						await activeRuntime.resume(runId, childId, launchResourcesForChild(ctx, child), currentOrigin(ctx, inputGeneration));
						syncControlTool();
					},
				});
			} else {
				if (action && !targetRun) {
					ctx.ui.notify(`Unknown agent run: ${action}`, "warning");
					return;
				}
				const run = targetRun ?? currentDelegationRun(runs);
				pi.appendEntry("delegate-command", { text: run ? toolText(projectRun(run)) : "No agent runs in this session." });
			}
		},
	});

	pi.on("input", (event, ctx) => {
		currentContext = ctx;
		if (event.source !== "extension") {
			pinnedStatus?.dismissTerminal();
			inputGeneration++;
		}
	});

	pi.on("session_start", async (_event, ctx) => {
		currentContext = ctx;
		inputGeneration = persistedInputGeneration(ctx);
		pinnedStatus?.dispose();
		pinnedStatus = undefined;
		if (ctx.mode === "tui") ctx.ui.setWidget(DELEGATE_STATUS_WIDGET, undefined);
		runtimeSubscription?.();
		delegateUi?.dispose();
		if (runtime) await runtime.dispose();

		const delegateRunsRoot = join(getAgentDir(), "delegate-runs");
		const delegateTemporaryRoot = await defaultDelegateTemporaryRoot();
		const repository = createFileRunRepository(
			delegateRunsRoot,
			(message) => ctx.ui.notify(message, "warning"),
			delegateTemporaryRoot,
		);
		const delivery = createParentDelivery({
			current: () => currentContext
				? {
					sessionId: currentContext.sessionManager.getSessionId(),
					inputGeneration,
					branchIds: currentContext.sessionManager.getBranch().map((entry) => entry.id),
				}
				: undefined,
			alreadyDelivered(eventId) {
				return currentContext?.sessionManager.getEntries().some((entry) => {
					if (entry.type !== "custom_message") return false;
					const details = entry.details as { eventId?: unknown } | undefined;
					return details?.eventId === eventId;
				}) ?? false;
			},
			send(content, details, metadata) {
				pi.sendMessage(
					{
						customType: metadata.kind === "attention" ? "delegate-attention" : "delegate-result",
						content,
						display: true,
						details: { ...details, eventId: metadata.eventId, ...(metadata.childId ? { childId: metadata.childId } : {}) },
					},
					{ triggerTurn: true, deliverAs: "steer" },
				);
			},
			onHeld(run, reason, metadata) {
				const data = heldEntryData(run, reason, metadata);
				pi.appendEntry("delegate-held", data);
				if (currentContext && currentContext.mode !== "tui") {
					currentContext.ui.notify(`${heldEntryTitle(data)}. Open /agents.`, "info");
				}
			},
		});
		runtime = new DelegateRuntime({
			repository,
			children: createPiChildSessionAdapter(),
			delivery,
			workspaces: createGitWorkspaceManager(delegateTemporaryRoot, delegateRunsRoot),
			maxActiveChildren: DEFAULT_MAX_ACTIVE_CHILDREN,
		});
		delegateUi = createDelegateUi(runtime);
		runtimeSubscription = runtime.subscribe(() => syncControlTool());
		await runtime.restore(ctx.sessionManager.getSessionId());
		syncControlTool();
		if (ctx.mode === "tui") {
			const mountedUi = delegateUi;
			ctx.ui.setWidget(
				DELEGATE_STATUS_WIDGET,
				(tui, theme) => {
					pinnedStatus = mountedUi.createStatus(tui, theme);
					return pinnedStatus;
				},
				{ placement: "aboveEditor" },
			);
		}
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		pinnedStatus?.dispose();
		pinnedStatus = undefined;
		if (ctx.mode === "tui") ctx.ui.setWidget(DELEGATE_STATUS_WIDGET, undefined);
		currentContext = undefined;
		runtimeSubscription?.();
		runtimeSubscription = undefined;
		delegateUi?.dispose();
		delegateUi = undefined;
		if (runtime) await runtime.dispose();
		runtime = undefined;
	});
}
