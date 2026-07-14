import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
	getAgentDir,
	type ExtensionAPI,
	type ExtensionContext,
	type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { createPiChildSessionAdapter, resolveChildResources } from "./child-session.ts";
import { createParentDelivery, type DeliveryMetadata } from "./delivery.ts";
import { createFileRunRepository } from "./persistence.ts";
import {
	DelegateRuntime,
	projectRun,
	runNeedsControl,
	type DelegateHandle,
	type DelegatedChild,
	type DelegationRun,
	type LaunchResources,
	type ResolvedChildConfig,
	type RunView,
} from "./runtime.ts";
import { createDelegateUi, type DelegateUi } from "./ui.ts";

const TaskParams = Type.Object({
	task: Type.String({ minLength: 1, description: "One self-contained task" }),
	label: Type.Optional(Type.String({ minLength: 1, description: "Short human-facing label" })),
}, { additionalProperties: false });

const DelegateParams = Type.Object({
	task: Type.Optional(Type.String({ minLength: 1, description: "One self-contained task to delegate" })),
	label: Type.Optional(Type.String({ minLength: 1, description: "Label for task; only valid with task" })),
	tasks: Type.Optional(Type.Array(TaskParams, { minItems: 1, maxItems: 32, description: "A homogeneous labeled task batch" })),
	cwd: Type.Optional(Type.String({ minLength: 1, description: "Existing working directory; defaults to the parent cwd" })),
	context: Type.Optional(Type.String({ enum: ["fresh", "fork"], description: "Fresh agent context or a full parent-session fork" })),
	skills: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { uniqueItems: true, description: "Explicit skill names" })),
	tools: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { uniqueItems: true, description: "Explicit built-in coding tool allowlist" })),
	model: Type.Optional(Type.String({ minLength: 3, description: "Exact provider/model override" })),
	reasoning: Type.Optional(Type.String({ enum: ["off", "minimal", "low", "medium", "high", "xhigh", "max"] })),
	outputSchema: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: "Object JSON Schema for validated structured output" })),
}, { additionalProperties: false });

const DelegateControlParams = Type.Object({
	action: Type.String({ enum: ["status", "wait", "steer", "reply", "cancel", "resume"], description: "Lifecycle operation" }),
	runId: Type.String({ minLength: 1, description: "Agent run identifier" }),
	childId: Type.Optional(Type.String({ minLength: 1, description: "Optional agent identifier; omission targets the run or unique eligible agent" })),
	message: Type.Optional(Type.String({ minLength: 1, description: "Required for steer and reply" })),
	timeoutMs: Type.Optional(Type.Integer({ minimum: 1, maximum: 600_000, description: "Wait timeout; work keeps running" })),
}, { additionalProperties: false });

interface DelegateToolDetails extends DelegateHandle {}
interface DelegateControlDetails {
	view: RunView;
}

interface HeldEntry {
	runId: string;
	reason: "user_intervened" | "session_changed";
	recordRef: string;
	kind: DeliveryMetadata["kind"];
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

function toolText(result: RunView): string {
	const lines = [`Agents ${result.status}: ${result.runId}`];
	for (const child of result.children) lines.push(`${child.label}: ${child.state} — ${renderedResult(child)}`);
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

async function existingDirectory(parentCwd: string, value: string | undefined): Promise<string> {
	const cwd = value ? resolve(parentCwd, value) : parentCwd;
	let info;
	try {
		info = await stat(cwd);
	} catch {
		throw new Error(`Delegated working directory does not exist: ${cwd}`);
	}
	if (!info.isDirectory()) throw new Error(`Delegated working directory is not a directory: ${cwd}`);
	return cwd;
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

function validateControl(params: {
	action: string;
	message?: string;
	timeoutMs?: number;
}): void {
	const needsMessage = params.action === "steer" || params.action === "reply";
	if (needsMessage && !params.message?.trim()) throw new Error(`${params.action} requires message`);
	if (!needsMessage && params.message !== undefined) throw new Error(`message is not valid for ${params.action}`);
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
		description: "Start one agent or a homogeneous labeled agent batch and immediately return a live handle. Shared options can select cwd, fresh or forked context, named skills, coding tools, an exact model/reasoning route, and structured output. Agents never inherit ambient extensions or delegation capability.",
		promptSnippet: "Start focused agent work without blocking the parent turn",
		promptGuidelines: [
			"Use delegate when isolated context, independent judgment, or concurrency materially helps; continue useful parent work after it returns.",
			"Use tasks for homogeneous parallel work. Use separate delegate calls when agents need different resources or models.",
			"Do not call delegate and immediately wait when useful independent parent work remains.",
		],
		renderShell: "self",
		parameters: DelegateParams,
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
				content: [{
					type: "text",
					text: handle.children.length === 1
						? `Started agent ${handle.children[0]?.label ?? "task"}. Run: ${handle.runId}`
						: `Started ${handle.children.length} agents. Run: ${handle.runId}`,
				}],
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
			return delegateUi.renderRun(runId, options.expanded, theme, context.invalidate, context.lastComponent);
		},
	};

	const controlTool: ToolDefinition<typeof DelegateControlParams, DelegateControlDetails> = {
		name: "delegate_control",
		label: "Agent Control",
		description: "Inspect, wait for, steer, reply to, cancel, or resume an agent run. Status is a one-time snapshot; wait is the blocking completion path. Wait timeout or cancellation affects only the wait. Steer and reply target one eligible agent. Resume may target one interrupted agent or every interrupted agent in a run. Invalid IDs, fields, and transitions are tool errors; agent failures are returned as run data.",
		promptSnippet: "Control one existing agent run without polling",
		promptGuidelines: [
			"Choose one result path per dependency: continue and rely on automatic delivery, or call wait once when blocked. Reserve status for one-time inspection after a state change. Switch modes or retry only after an explicit failure or timeout.",
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
			} else {
				throw new Error(`Unsupported agent control action: ${params.action}`);
			}
			const view = projectRun(run);
			syncControlTool();
			return { content: [{ type: "text", text: toolText(view) }], details: { view } };
		},
		renderCall(args, theme) {
			return new Text(
				`${theme.fg("toolTitle", theme.bold("agents "))}${args.action} ${theme.fg("accent", args.runId)}`,
				0,
				0,
			);
		},
		renderResult(result, options, theme) {
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
		const reason = data.reason === "user_intervened"
			? "The conversation moved on before it finished, so it was not added automatically."
			: "The parent session changed before it finished, so it was not added automatically.";
		let text = `${theme.fg("warning", "■")} ${theme.bold(`agent ${data.kind} ready`)}\n`;
		text += `${theme.fg("dim", reason)}\n`;
		text += `Inspect: ${theme.fg("accent", "/agents")} · Add here: ${theme.fg("accent", "/agents use")}`;
		if (options.expanded) text += `\n${theme.fg("dim", data.recordRef)}`;
		return new Text(text, 0, 0);
	});

	pi.registerEntryRenderer<{ text: string }>("delegate-command", (entry, _options, theme) => {
		return new Text(theme.fg("dim", entry.data?.text ?? "No agent runs."), 0, 0);
	});

	pi.registerCommand("agents", {
		description: "Open the current agent run: /agents [list|<run-id>|use [<run-id>]|cancel <run-id>]",
		async handler(args, ctx) {
			currentContext = ctx;
			const [action, runId] = args.trim().split(/\s+/, 2);
			const activeRuntime = requireRuntime();
			if (action === "cancel" || action === "use") {
				if (action === "cancel") {
					if (!runId) {
						ctx.ui.notify("Usage: /agents cancel <run-id>", "warning");
						return;
					}
					await activeRuntime.cancel(runId);
					ctx.ui.notify(`Cancelled ${runId}`, "info");
				} else {
					const held = runId ? activeRuntime.get(runId) : currentHeldRun(activeRuntime.list());
					if (!held) {
						ctx.ui.notify(runId ? `Unknown agent run: ${runId}` : "No held agent update is ready.", "warning");
						return;
					}
					await activeRuntime.useHeld(held.id, currentOrigin(ctx, inputGeneration));
					ctx.ui.notify(`Added ${held.id} to the current conversation`, "info");
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
			const run = action ? activeRuntime.get(action) : currentDelegationRun(activeRuntime.list());
			if (!run) {
				ctx.ui.notify(action ? `Unknown agent run: ${action}` : "No agent runs in this session.", "warning");
				return;
			}
			if (ctx.mode === "tui" && delegateUi) {
				await delegateUi.openRun(run.id, ctx);
			} else {
				pi.appendEntry("delegate-command", { text: toolText(projectRun(run)) });
			}
		},
	});

	pi.on("input", (event, ctx) => {
		currentContext = ctx;
		if (event.source !== "extension") inputGeneration++;
	});

	pi.on("session_start", async (_event, ctx) => {
		currentContext = ctx;
		inputGeneration = persistedInputGeneration(ctx);
		runtimeSubscription?.();
		delegateUi?.dispose();
		if (runtime) await runtime.dispose();

		const repository = createFileRunRepository(
			join(getAgentDir(), "delegate-runs"),
			(message) => ctx.ui.notify(message, "warning"),
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
				pi.appendEntry("delegate-held", { runId: run.id, reason, recordRef: run.recordRef, kind: metadata.kind });
				currentContext?.ui.notify("Agent update ready. Open /agents or run /agents use.", "info");
			},
		});
		runtime = new DelegateRuntime({
			repository,
			children: createPiChildSessionAdapter(),
			delivery,
			maxActiveChildren: 3,
		});
		delegateUi = createDelegateUi(runtime);
		runtimeSubscription = runtime.subscribe(() => syncControlTool());
		await runtime.restore(ctx.sessionManager.getSessionId());
		syncControlTool();
	});

	pi.on("session_shutdown", async () => {
		currentContext = undefined;
		runtimeSubscription?.();
		runtimeSubscription = undefined;
		delegateUi?.dispose();
		delegateUi = undefined;
		if (runtime) await runtime.dispose();
		runtime = undefined;
	});
}
