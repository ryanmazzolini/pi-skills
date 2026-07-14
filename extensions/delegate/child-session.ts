import { mkdir } from "node:fs/promises";
import { isAbsolute, relative, sep } from "node:path";
import {
	createAgentSession,
	DefaultResourceLoader,
	defineTool,
	getAgentDir,
	SessionManager,
	SettingsManager,
	type AgentSessionEvent,
	type CreateAgentSessionOptions,
	type ExtensionContext,
	type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type, type TSchema } from "typebox";
import {
	childWorkspaceCwd,
	type AttentionKind,
	type ChildOutcome,
	type ChildOutputContract,
	type ChildSessionAdapter,
	type ChildUsage,
	type DelegatedChild,
	type ResolvedSkill,
	type RunningChild,
} from "./runtime.ts";

export const DEFAULT_CHILD_TOOLS = ["read", "bash", "edit", "write"] as const;
export const AVAILABLE_CHILD_TOOLS = ["read", "bash", "edit", "write", "grep", "find", "ls"] as const;

const ATTENTION_TOOL = "delegate_attention";
const FINAL_TOOL = "delegate_final";

const CHILD_GUIDANCE = [
	"You are a delegated child working for a parent Pi session.",
	"Complete only the assigned task and return a concise final answer with concrete evidence.",
	"Do not address the end user, open interactive dialogs, or delegate to other agents.",
	"Follow the applicable AGENTS.md instructions and use only the tools provided to this child session.",
	`When you need clarification, approval, or a parent-owned decision, call ${ATTENTION_TOOL} once instead of guessing or addressing the user.`,
].join("\n");

interface TurnCapture {
	attention?: { kind: AttentionKind; question: string; context?: string };
	structured?: unknown;
}

function usageFromSession(session: { getSessionStats(): { tokens: Omit<ChildUsage, "cost">; cost: number } }): ChildUsage {
	try {
		const stats = session.getSessionStats();
		return {
			input: stats.tokens.input,
			output: stats.tokens.output,
			cacheRead: stats.tokens.cacheRead,
			cacheWrite: stats.tokens.cacheWrite,
			total: stats.tokens.total,
			cost: stats.cost,
		};
	} catch {
		return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, cost: 0 };
	}
}

function lastAssistant(messages: unknown[]): {
	text: string;
	stopReason?: string;
	errorMessage?: string;
} {
	for (let index = messages.length - 1; index >= 0; index--) {
		const message = messages[index] as {
			role?: string;
			content?: Array<{ type?: string; text?: string }>;
			stopReason?: string;
			errorMessage?: string;
		};
		if (message.role !== "assistant" || !Array.isArray(message.content)) continue;
		const text = message.content
			.filter((part) => part.type === "text" && typeof part.text === "string")
			.map((part) => part.text)
			.join("\n")
			.trim();
		return { text, stopReason: message.stopReason, errorMessage: message.errorMessage };
	}
	return { text: "" };
}

function summarizeTool(name: string, args: unknown): string {
	const input = args && typeof args === "object" ? args as Record<string, unknown> : {};
	if (name === "bash" && typeof input.command === "string") {
		const command = input.command.replace(/\s+/g, " ").trim();
		return `Running: ${command.length > 100 ? `${command.slice(0, 100)}…` : command}`;
	}
	const path = typeof input.path === "string" ? input.path : undefined;
	if (path) return `${name}: ${path}`;
	return `Using ${name}`;
}

function emitActivity(event: AgentSessionEvent, sink: Parameters<ChildSessionAdapter["start"]>[1]): void {
	switch (event.type) {
		case "agent_start":
		case "turn_start":
			sink.activity({ kind: "thinking", summary: "Thinking" });
			return;
		case "message_update":
			if (event.assistantMessageEvent.type === "thinking_delta") {
				sink.activity({ kind: "thinking", summary: "Thinking" });
			} else if (event.assistantMessageEvent.type === "text_delta") {
				sink.activity({ kind: "message", summary: "Writing the response" });
			}
			return;
		case "tool_execution_start":
			sink.activity({ kind: "tool", summary: summarizeTool(event.toolName, event.args) });
			return;
		case "tool_execution_end":
			sink.activity({
				kind: event.isError ? "waiting" : "thinking",
				summary: event.isError ? `${event.toolName} failed` : `${event.toolName} finished`,
			});
			return;
		default:
			return;
	}
}

function normalizeNames(values: readonly string[]): string[] {
	return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export async function createChildResourceLoader(
	cwd: string,
	agentDir = getAgentDir(),
	selectedSkillNames: readonly string[] = [],
	additionalGuidance: readonly string[] = [],
): Promise<{
	loader: DefaultResourceLoader;
	settingsManager: SettingsManager;
	resolvedSkills: ResolvedSkill[];
}> {
	const requested = normalizeNames(selectedSkillNames);
	const requestedSet = new Set(requested);
	const settingsManager = SettingsManager.create(cwd, agentDir);
	const loader = new DefaultResourceLoader({
		cwd,
		agentDir,
		settingsManager,
		noExtensions: true,
		noSkills: requested.length === 0,
		noPromptTemplates: true,
		noThemes: true,
		systemPromptOverride: () => undefined,
		appendSystemPromptOverride: () => [CHILD_GUIDANCE, ...additionalGuidance],
		...(requested.length > 0
			? {
				skillsOverride: (base) => ({
					skills: base.skills.filter((skill) => requestedSet.has(skill.name)),
					diagnostics: base.diagnostics,
				}),
			}
			: {}),
	});
	await loader.reload();
	const skills = loader.getSkills().skills;
	const found = new Set(skills.map((skill) => skill.name));
	const missing = requested.filter((name) => !found.has(name));
	if (missing.length > 0) throw new Error(`Unknown delegated skill${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`);
	return {
		loader,
		settingsManager,
		resolvedSkills: skills.map((skill) => ({ name: skill.name, filePath: skill.filePath })),
	};
}

export async function resolveChildResources(
	cwd: string,
	options: { skills?: readonly string[]; tools?: readonly string[] },
	agentDir = getAgentDir(),
): Promise<{ skills: ResolvedSkill[]; tools: string[] }> {
	const tools = options.tools === undefined ? [...DEFAULT_CHILD_TOOLS] : normalizeNames(options.tools);
	const available = new Set<string>(AVAILABLE_CHILD_TOOLS);
	const unknown = tools.filter((tool) => !available.has(tool));
	if (unknown.length > 0) throw new Error(`Unknown delegated tool${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}`);
	const { resolvedSkills } = await createChildResourceLoader(cwd, agentDir, options.skills ?? []);
	return { skills: resolvedSkills, tools };
}

export function createRuntimeTools(
	output: ChildOutputContract,
	capture: () => TurnCapture,
	stopTurn: () => void = () => {},
): ToolDefinition[] {
	const attentionTool = defineTool({
		name: ATTENTION_TOOL,
		label: "Ask Parent",
		description: "Pause this delegated task and ask the parent coordinator for clarification, approval, or a decision.",
		parameters: Type.Object({
			kind: Type.String({ enum: ["clarification", "approval", "decision"] }),
			question: Type.String({ minLength: 1 }),
			context: Type.Optional(Type.String()),
		}, { additionalProperties: false }),
		executionMode: "sequential",
		async execute(_toolCallId, params) {
			const current = capture();
			if (current.attention) throw new Error("A parent attention request is already pending");
			current.attention = {
				kind: params.kind as AttentionKind,
				question: params.question.trim(),
				...(params.context?.trim() ? { context: params.context.trim() } : {}),
			};
			queueMicrotask(stopTurn);
			return {
				content: [{ type: "text", text: "The parent coordinator will answer this request." }],
				details: current.attention,
				terminate: true,
			};
		},
	});
	if (output === "text") return [attentionTool];
	const finalTool: ToolDefinition<TSchema, unknown> = {
		name: FINAL_TOOL,
		label: "Submit Result",
		description: "Submit the final structured result. Call this exactly once when the delegated task is complete.",
		parameters: Type.Unsafe(output.schema),
		executionMode: "sequential",
		async execute(_toolCallId, params) {
			const current = capture();
			current.structured = structuredClone(params);
			queueMicrotask(stopTurn);
			return {
				content: [{ type: "text", text: "Structured result accepted." }],
				details: current.structured,
				terminate: true,
			};
		},
	};
	return [attentionTool, finalTool];
}

export function resolvedSkillIdentity(child: DelegatedChild, skill: ResolvedSkill, actual: boolean): string {
	if (child.workspace.kind !== "temporary") return `${skill.name}\u0000${skill.filePath}`;
	const root = actual ? child.workspace.worktreePath : child.workspace.repoRoot;
	const path = relative(root, skill.filePath);
	if (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path)) {
		return `${skill.name}\u0000<repository>/${path}`;
	}
	return `${skill.name}\u0000${skill.filePath}`;
}

function sessionManagerFor(child: DelegatedChild, resume: boolean): SessionManager {
	const cwd = childWorkspaceCwd(child.workspace);
	if (resume) {
		if (!child.sessionFile) throw new Error(`Child ${child.id} has no persisted session to resume`);
		return SessionManager.open(child.sessionFile, child.sessionDir, cwd);
	}
	if (child.resolved.context === "fork") {
		const source = child.contextSource;
		if (!source) throw new Error("Forked child context requires a persisted parent session");
		const manager = SessionManager.forkFrom(source.sessionFile, cwd, child.sessionDir);
		if (source.leafId) {
			if (!manager.getEntry(source.leafId)) throw new Error(`Parent context leaf ${source.leafId} is unavailable`);
			manager.branch(source.leafId);
		} else {
			manager.resetLeaf();
		}
		return manager;
	}
	return SessionManager.create(cwd, child.sessionDir);
}

async function createChild(
	child: DelegatedChild,
	model: NonNullable<ExtensionContext["model"]>,
	modelRegistry: ExtensionContext["modelRegistry"],
	signal: AbortSignal,
	sink: Parameters<ChildSessionAdapter["start"]>[1],
	options: { resume: boolean; prompt: string },
): Promise<RunningChild> {
	if (signal.aborted) throw new Error("Child start cancelled");
	await mkdir(child.sessionDir, { recursive: true, mode: 0o700 });
	if (signal.aborted) throw new Error("Child start cancelled");
	const agentDir = getAgentDir();
	const cwd = childWorkspaceCwd(child.workspace);
	const { loader, settingsManager, resolvedSkills } = await createChildResourceLoader(
		cwd,
		agentDir,
		child.resolved.skills.map((skill) => skill.name),
		child.workspace.kind === "temporary"
			? ["This is an extension-owned temporary workspace. Do not commit, create branches, or change Git history; leave filesystem changes for parent review."]
			: [],
	);
	const expectedSkills = child.resolved.skills
		.map((skill) => resolvedSkillIdentity(child, skill, false))
		.sort();
	const actualSkills = resolvedSkills
		.map((skill) => resolvedSkillIdentity(child, skill, true))
		.sort();
	if (JSON.stringify(actualSkills) !== JSON.stringify(expectedSkills)) {
		throw new Error("Delegated skill resolution changed before child launch");
	}
	if (signal.aborted) throw new Error("Child start cancelled");
	const sessionManager = sessionManagerFor(child, options.resume);
	if (!options.resume) sessionManager.appendSessionInfo(`delegate:${child.id} ${child.label}`);
	let turnCapture: TurnCapture = {};
	let sessionRef: { abort(): Promise<void> } | undefined;
	const customTools = createRuntimeTools(
		child.resolved.output,
		() => turnCapture,
		() => { void sessionRef?.abort(); },
	);
	const runtimeToolNames = customTools.map((tool) => tool.name);
	const { session } = await createAgentSession({
		cwd,
		agentDir,
		model,
		modelRegistry,
		thinkingLevel: child.resolved.reasoning as CreateAgentSessionOptions["thinkingLevel"],
		tools: [...child.resolved.tools, ...runtimeToolNames],
		customTools,
		resourceLoader: loader,
		sessionManager,
		settingsManager,
	});
	sessionRef = session;
	if (session.thinkingLevel !== child.resolved.reasoning) {
		session.dispose();
		throw new Error(`Reasoning ${child.resolved.reasoning} is unsupported by ${child.resolved.model.provider}/${child.resolved.model.id}`);
	}
	if (child.sessionId && session.sessionId !== child.sessionId) {
		session.dispose();
		throw new Error(`Resumed child session identity changed for ${child.id}`);
	}

	let disposed = false;
	const unsubscribe = session.subscribe((event) => emitActivity(event, sink));
	const onAbort = () => void session.abort();
	signal.addEventListener("abort", onAbort, { once: true });
	if (signal.aborted) {
		signal.removeEventListener("abort", onAbort);
		unsubscribe();
		session.dispose();
		throw new Error("Child start cancelled");
	}

	const runPrompt = async (prompt: string): Promise<ChildOutcome> => {
		turnCapture = {};
		try {
			await session.prompt(prompt, { expandPromptTemplates: false, source: "extension" });
			const usage = usageFromSession(session);
			if (turnCapture.attention) return { kind: "attention", request: turnCapture.attention, usage };
			if (child.resolved.output !== "text") {
				if (turnCapture.structured === undefined) {
					return { kind: "failure", message: `Child did not submit a result through ${FINAL_TOOL}`, usage };
				}
				return { kind: "success", result: { kind: "structured", value: turnCapture.structured }, usage };
			}
			const assistant = lastAssistant(session.messages);
			if (assistant.stopReason === "error" || assistant.stopReason === "aborted") {
				return {
					kind: "failure",
					message: assistant.errorMessage || `Child stopped: ${assistant.stopReason}`,
					stopReason: assistant.stopReason,
					...(assistant.text ? { partialOutput: assistant.text } : {}),
					usage,
				};
			}
			if (!assistant.text) return { kind: "failure", message: "Child produced no final answer", usage };
			return { kind: "success", result: { kind: "text", value: assistant.text }, usage };
		} catch (error) {
			const usage = usageFromSession(session);
			if (turnCapture.attention) return { kind: "attention", request: turnCapture.attention, usage };
			if (child.resolved.output !== "text" && turnCapture.structured !== undefined) {
				return { kind: "success", result: { kind: "structured", value: turnCapture.structured }, usage };
			}
			const assistant = lastAssistant(session.messages);
			return {
				kind: "failure",
				message: error instanceof Error ? error.message : String(error),
				...(assistant.stopReason ? { stopReason: assistant.stopReason } : {}),
				...(assistant.text ? { partialOutput: assistant.text } : {}),
				usage,
			};
		}
	};

	return {
		sessionId: session.sessionId,
		sessionFile: session.sessionFile,
		completion: runPrompt(options.prompt),
		continue: runPrompt,
		steer: (message) => session.steer(message),
		cancel: () => session.abort(),
		dispose() {
			if (disposed) return;
			disposed = true;
			signal.removeEventListener("abort", onAbort);
			unsubscribe();
			session.dispose();
		},
	};
}

export function createPiChildSessionAdapter(): ChildSessionAdapter {
	return {
		async start(input, sink) {
			const model = input.model as ExtensionContext["model"];
			const modelRegistry = input.modelRegistry as ExtensionContext["modelRegistry"] | undefined;
			if (!model) throw new Error("The delegated child has no resolved model");
			if (!modelRegistry) throw new Error("The parent model registry is unavailable");
			return createChild(input.child, model, modelRegistry, input.signal, sink, { resume: false, prompt: input.child.task });
		},
		async resume(input, continuation, sink) {
			const model = input.model as ExtensionContext["model"];
			const modelRegistry = input.modelRegistry as ExtensionContext["modelRegistry"] | undefined;
			if (!model) throw new Error("The delegated child has no resolved model");
			if (!modelRegistry) throw new Error("The parent model registry is unavailable");
			return createChild(input.child, model, modelRegistry, input.signal, sink, { resume: true, prompt: continuation });
		},
	};
}
