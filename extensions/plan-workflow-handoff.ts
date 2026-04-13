import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";

type WorkflowStage = "question" | "research" | "design" | "structure" | "create" | "implement" | "verify" | "task";

type StageDefinition = {
	skillName: string;
	label: string;
	description: string;
};

type PlanSummary = {
	title?: string;
	status?: string;
	hasRemainingIntent: boolean;
};

type DirectoryArtifacts = {
	question?: string;
	research?: string;
	design?: string;
	structure?: string;
	plan?: string;
};

type DirectoryWorkflowTarget = {
	kind: "directory";
	dir: string;
	goal: string;
	artifacts: DirectoryArtifacts;
};

type LegacyPlanTarget = {
	kind: "legacy-plan";
	planPath: string;
	goal: string;
};

type WorkflowTarget = DirectoryWorkflowTarget | LegacyPlanTarget;

type RouteDecision = {
	stage: WorkflowStage;
	reason: string;
};

type ResolvedTarget = {
	target: WorkflowTarget;
	source: string;
	shouldCreateDirectory?: boolean;
};

type MessageEntry = {
	type: "message";
	message: { role?: string; content?: unknown };
};

const MAX_CONTEXT_MESSAGES = 6;
const MAX_CONTEXT_CHARS = 280;
const WORKFLOW_DIR_PATTERN = /^\d{4}-\d{2}-\d{2}-.+/;

const STAGES: Record<WorkflowStage, StageDefinition> = {
	question: {
		skillName: "plan-question",
		label: "Question",
		description: "Clarify unknowns and frame the workflow before research",
	},
	research: {
		skillName: "plan-research",
		label: "Research",
		description: "Write the durable research artifact for this workflow",
	},
	design: {
		skillName: "plan-design",
		label: "Design",
		description: "Align on current state, target state, and key choices",
	},
	structure: {
		skillName: "plan-structure",
		label: "Structure",
		description: "Turn the design into slices, milestones, and dependencies",
	},
	create: {
		skillName: "plan-create",
		label: "Plan",
		description: "Write plan.md for the workflow directory",
	},
	implement: {
		skillName: "plan-implement",
		label: "Implement",
		description: "Execute plan.md adaptively with ratcheting checks",
	},
	verify: {
		skillName: "plan-verify",
		label: "Verify",
		description: "Verify the finished workflow against plan.md",
	},
	task: {
		skillName: "plan-task",
		label: "Task",
		description: "Use the lighter single-concern path in the same workflow directory",
	},
};

function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function trimForPrompt(value: string, maxChars: number): string {
	const normalized = value.replace(/\s+/g, " ").trim();
	if (normalized.length <= maxChars) {
		return normalized;
	}
	return `${normalized.slice(0, maxChars - 1).trimEnd()}…`;
}

function fileExists(path: string | undefined): path is string {
	if (!path) {
		return false;
	}

	try {
		return statSync(path).isFile();
	} catch {
		return false;
	}
}

function directoryExists(path: string | undefined): path is string {
	if (!path) {
		return false;
	}

	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

function getPlansRoot(cwd: string): string {
	return join(cwd, "thoughts", "ryan", "plans");
}

function workflowDirPath(cwd: string, name: string): string {
	return join(getPlansRoot(cwd), name);
}

function normalizePath(input: string, cwd: string): string {
	return resolve(cwd, input.replace(/^@/, "").trim());
}

function readText(path: string | undefined): string | undefined {
	if (!fileExists(path)) {
		return undefined;
	}

	try {
		return readFileSync(path, "utf8");
	} catch {
		return undefined;
	}
}

function readHeading(content: string | undefined): string | undefined {
	if (!content) {
		return undefined;
	}
	return content.match(/^#\s+(.+)$/m)?.[1]?.trim();
}

function readGoal(content: string | undefined): string | undefined {
	if (!content) {
		return undefined;
	}

	const frontmatterGoal = content.match(/^goal:\s*(.+)$/m)?.[1]?.trim();
	if (frontmatterGoal) {
		return frontmatterGoal;
	}

	return readHeading(content);
}

function prettifyWorkflowName(name: string): string {
	return name.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/-/g, " ").trim() || name;
}

function getDirectoryArtifacts(dir: string): DirectoryArtifacts {
	const artifact = (name: keyof DirectoryArtifacts) => {
		const path = join(dir, `${name}.md`);
		return fileExists(path) ? path : undefined;
	};

	return {
		question: artifact("question"),
		research: artifact("research"),
		design: artifact("design"),
		structure: artifact("structure"),
		plan: artifact("plan"),
	};
}

function hasAnyDirectoryArtifacts(artifacts: DirectoryArtifacts): boolean {
	return Boolean(artifacts.question || artifacts.research || artifacts.design || artifacts.structure || artifacts.plan);
}

function createDirectoryTarget(dir: string): DirectoryWorkflowTarget {
	const artifacts = getDirectoryArtifacts(dir);
	const goal =
		readGoal(readText(artifacts.plan)) ??
		readGoal(readText(artifacts.structure)) ??
		readGoal(readText(artifacts.design)) ??
		readGoal(readText(artifacts.research)) ??
		readGoal(readText(artifacts.question)) ??
		prettifyWorkflowName(basename(dir));

	return {
		kind: "directory",
		dir,
		goal,
		artifacts,
	};
}

function createLegacyPlanTarget(planPath: string): LegacyPlanTarget {
	const goal = readHeading(readText(planPath)) ?? basename(planPath);
	return {
		kind: "legacy-plan",
		planPath,
		goal,
	};
}

function getWorkflowDirectoryMtime(dir: string): number {
	const artifacts = ["question.md", "research.md", "design.md", "structure.md", "plan.md"]
		.map((name) => join(dir, name))
		.filter(fileExists)
		.map((path) => statSync(path).mtimeMs);
	return Math.max(statSync(dir).mtimeMs, ...artifacts);
}

function listWorkflowDirectories(cwd: string): string[] {
	const root = getPlansRoot(cwd);
	if (!directoryExists(root)) {
		return [];
	}

	return readdirSync(root)
		.filter((name) => WORKFLOW_DIR_PATTERN.test(name))
		.map((name) => workflowDirPath(cwd, name))
		.filter(directoryExists)
		.sort((a, b) => getWorkflowDirectoryMtime(b) - getWorkflowDirectoryMtime(a));
}

function listLegacyPlanFiles(cwd: string): string[] {
	const root = getPlansRoot(cwd);
	if (!directoryExists(root)) {
		return [];
	}

	return readdirSync(root)
		.filter((name) => name.endsWith(".md"))
		.map((name) => join(root, name))
		.filter(fileExists)
		.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
}

function matchExistingWorkflowDirectory(cwd: string, query: string): string | undefined {
	const normalized = query.trim();
	if (!normalized) {
		return undefined;
	}

	const slug = slugify(normalized);
	const dirs = listWorkflowDirectories(cwd);
	const exact = dirs.find((dir) => basename(dir) === normalized || basename(dir) === slug);
	if (exact) {
		return exact;
	}

	if (slug.length > 0) {
		const slugMatch = dirs.find((dir) => basename(dir).includes(slug));
		if (slugMatch) {
			return slugMatch;
		}

		const parts = slug.split("-").filter((part) => part.length >= 4);
		if (parts.length > 0) {
			return dirs.find((dir) => parts.some((part) => basename(dir).includes(part)));
		}
	}

	return undefined;
}

function matchLegacyPlanFile(cwd: string, query: string): string | undefined {
	const normalized = query.trim();
	if (!normalized) {
		return undefined;
	}

	const files = listLegacyPlanFiles(cwd);
	const exact = files.find((path) => basename(path) === normalized);
	if (exact) {
		return exact;
	}

	const slug = slugify(normalized);
	if (slug.length === 0) {
		return undefined;
	}

	return files.find((path) => basename(path).includes(slug));
}

function isMessageEntry(entry: unknown): entry is MessageEntry {
	return typeof entry === "object" && entry !== null && (entry as { type?: string }).type === "message";
}

function getTextContent(content: unknown): string {
	if (typeof content === "string") {
		return content;
	}

	if (!Array.isArray(content)) {
		return "";
	}

	return content
		.filter(
			(block): block is { type: "text"; text: string } =>
				typeof block === "object" &&
				block !== null &&
				"type" in block &&
				(block as { type?: string }).type === "text" &&
				"text" in block &&
				typeof (block as { text?: unknown }).text === "string",
		)
		.map((block) => block.text)
		.join("\n");
}

function detectWorkflowDirectoryFromSession(entries: unknown[], cwd: string): string | undefined {
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const entry = entries[index];
		if (!isMessageEntry(entry)) {
			continue;
		}

		const text = getTextContent(entry.message.content);
		const match = text.match(/Workflow directory:\s*(.+)$/m);
		if (!match) {
			continue;
		}

		const candidate = normalizePath(match[1] ?? "", cwd);
		if (directoryExists(candidate)) {
			return candidate;
		}
	}

	return undefined;
}

function extractSection(content: string, startHeader: string, endHeader: string): string {
	const start = content.indexOf(startHeader);
	if (start === -1) {
		return "";
	}

	const afterStart = content.slice(start + startHeader.length);
	const end = afterStart.indexOf(endHeader);
	return (end === -1 ? afterStart : afterStart.slice(0, end)).trim();
}

function readPlanSummary(planPath: string | undefined): PlanSummary {
	const content = readText(planPath);
	if (!content) {
		return { hasRemainingIntent: false };
	}

	const title = readHeading(content);
	const status = content.match(/\*\*Status\*\*:\s*([^|\n]+)/)?.[1]?.trim();
	const remainingIntent = extractSection(content, "## Remaining Intent", "## Deviations");
	return {
		title,
		status,
		hasRemainingIntent: /^\s*-\s+/m.test(remainingIntent),
	};
}

function resolveWorkflowTarget(cwd: string, args: string, entries: unknown[]): ResolvedTarget | undefined {
	const input = args.trim();

	if (input) {
		const explicitPath = normalizePath(input, cwd);
		if (directoryExists(explicitPath)) {
			return { target: createDirectoryTarget(explicitPath), source: "explicit workflow directory" };
		}

		if (fileExists(explicitPath)) {
			if (["question.md", "research.md", "design.md", "structure.md", "plan.md"].includes(basename(explicitPath))) {
				const parent = resolve(explicitPath, "..");
				if (directoryExists(parent) && WORKFLOW_DIR_PATTERN.test(basename(parent))) {
					return { target: createDirectoryTarget(parent), source: "workflow artifact path" };
				}
			}
			return { target: createLegacyPlanTarget(explicitPath), source: "explicit plan file" };
		}

		const matchedDirectory = matchExistingWorkflowDirectory(cwd, input);
		if (matchedDirectory) {
			return { target: createDirectoryTarget(matchedDirectory), source: "matched workflow directory" };
		}

		const matchedPlan = matchLegacyPlanFile(cwd, input);
		if (matchedPlan) {
			return { target: createLegacyPlanTarget(matchedPlan), source: "matched legacy plan" };
		}

		const name = `${new Date().toISOString().slice(0, 10)}-${slugify(input)}`;
		const dir = workflowDirPath(cwd, name);
		return {
			target: {
				kind: "directory",
				dir,
				goal: input,
				artifacts: {},
			},
			source: "new workflow goal",
			shouldCreateDirectory: true,
		};
	}

	const fromSession = detectWorkflowDirectoryFromSession(entries, cwd);
	if (fromSession) {
		return { target: createDirectoryTarget(fromSession), source: "current session handoff" };
	}

	const latestDirectory = listWorkflowDirectories(cwd)[0];
	if (latestDirectory) {
		return { target: createDirectoryTarget(latestDirectory), source: "latest workflow directory" };
	}

	const latestLegacyPlan = listLegacyPlanFiles(cwd)[0];
	if (latestLegacyPlan) {
		return { target: createLegacyPlanTarget(latestLegacyPlan), source: "latest legacy plan" };
	}

	return undefined;
}

function chooseRecommendedStage(target: WorkflowTarget): RouteDecision {
	if (target.kind === "legacy-plan") {
		const planSummary = readPlanSummary(target.planPath);
		return planSummary.hasRemainingIntent
			? {
				stage: "implement",
				reason: "This legacy plan file still has remaining intent, so the next step is implementation against the plan.",
			}
			: {
				stage: "verify",
				reason: "This legacy plan file no longer has remaining intent, so the next step is verification.",
			};
	}

	if (!target.artifacts.question) {
		return {
			stage: "question",
			reason: "This workflow directory has no question artifact yet, so it should start by framing the problem and unknowns.",
		};
	}
	if (!target.artifacts.research) {
		return {
			stage: "research",
			reason: "question.md exists, so the next durable artifact should be research.md.",
		};
	}
	if (!target.artifacts.design) {
		return {
			stage: "design",
			reason: "research.md exists, so the next stage should align on the design before structuring the work.",
		};
	}
	if (!target.artifacts.structure) {
		return {
			stage: "structure",
			reason: "design.md exists, so the next durable artifact should turn the design into milestones and dependencies.",
		};
	}
	if (!target.artifacts.plan) {
		return {
			stage: "create",
			reason: "structure.md exists, so the next stage should distill the workflow into plan.md.",
		};
	}

	const planSummary = readPlanSummary(target.artifacts.plan);
	return planSummary.hasRemainingIntent
		? {
			stage: "implement",
			reason: "plan.md still has remaining intent, so stay in implementation until the planned outcomes are addressed.",
		}
		: {
			stage: "verify",
			reason: "plan.md no longer shows remaining intent, so the next stage should verify the finished work.",
		};
}

function getAvailableStages(pi: ExtensionAPI): WorkflowStage[] {
	const commands = pi.getCommands();
	return (Object.keys(STAGES) as WorkflowStage[]).filter((stage) =>
		commands.some((command) => command.source === "skill" && command.name === `skill:${STAGES[stage].skillName}`),
	);
}

function buildStageOptions(target: WorkflowTarget, recommended: WorkflowStage, availableStages: WorkflowStage[]) {
	let ordered: WorkflowStage[];
	if (target.kind === "legacy-plan") {
		ordered = ["implement", "verify"];
	} else if (!hasAnyDirectoryArtifacts(target.artifacts)) {
		ordered = ["question", "task", "research", "design", "structure", "create"];
	} else if (!target.artifacts.plan) {
		ordered = ["question", "research", "design", "structure", "create"];
	} else {
		ordered = ["question", "research", "design", "structure", "create", "implement", "verify"];
	}

	const unique = [recommended, ...ordered].filter((stage, index, list) => list.indexOf(stage) === index);
	return unique
		.filter((stage) => availableStages.includes(stage))
		.map((stage) => ({
			stage,
			label: `${stage === recommended ? "Recommended: " : ""}${STAGES[stage].label} — ${STAGES[stage].description}`,
		}));
}

function getPrimaryArgument(stage: WorkflowStage, target: WorkflowTarget): string {
	if (target.kind === "legacy-plan") {
		return target.planPath;
	}

	if (stage === "implement" || stage === "verify") {
		return target.artifacts.plan ?? join(target.dir, "plan.md");
	}

	return target.dir;
}

function getRecentConversationContext(entries: unknown[]): string[] {
	return entries
		.filter(isMessageEntry)
		.filter((entry) => entry.message.role === "user" || entry.message.role === "assistant")
		.slice(-MAX_CONTEXT_MESSAGES)
		.map((entry) => {
			const role = entry.message.role === "assistant" ? "assistant" : "user";
			const text = trimForPrompt(getTextContent(entry.message.content), MAX_CONTEXT_CHARS);
			return text ? `- ${role}: ${text}` : "";
		})
		.filter((line) => line.length > 0);
}

function buildStagePrompt(stage: WorkflowStage, target: WorkflowTarget, recentContext: string[]): string {
	const command = `/skill:${STAGES[stage].skillName}`;
	const primaryArg = getPrimaryArgument(stage, target).trim();
	const lines = [`${command} ${primaryArg}`.trim(), "", "Workflow context:"];

	if (target.kind === "directory") {
		lines.push(`- Workflow directory: ${target.dir}`);
		lines.push(`- Goal: ${target.goal}`);
		lines.push("- Durable stage artifacts should live in this directory.");
		if (target.artifacts.question || target.artifacts.research || target.artifacts.design || target.artifacts.structure || target.artifacts.plan) {
			lines.push("- Existing artifacts:");
			if (target.artifacts.question) lines.push(`  - Question: ${target.artifacts.question}`);
			if (target.artifacts.research) lines.push(`  - Research: ${target.artifacts.research}`);
			if (target.artifacts.design) lines.push(`  - Design: ${target.artifacts.design}`);
			if (target.artifacts.structure) lines.push(`  - Structure: ${target.artifacts.structure}`);
			if (target.artifacts.plan) {
				const planSummary = readPlanSummary(target.artifacts.plan);
				const suffix = planSummary.status ? ` (status: ${planSummary.status})` : "";
				lines.push(`  - Plan: ${target.artifacts.plan}${suffix}`);
			}
		}
	} else {
		lines.push(`- Goal: ${target.goal}`);
		lines.push(`- Legacy plan file: ${target.planPath}`);
	}

	lines.push(`- Routing stage: ${STAGES[stage].label}`);

	if (recentContext.length > 0) {
		lines.push("", "Recent context from the previous session:", ...recentContext);
	}

	lines.push("", "Continue from this handoff and keep the workflow artifacts as the source of truth.");
	return lines.join("\n");
}

export default function planWorkflowHandoffExtension(pi: ExtensionAPI) {
	pi.registerCommand("plan-next", {
		description: "Start or advance the staged planning workflow in a fresh session",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("/plan-next requires interactive mode so it can confirm the session handoff.", "warning");
				return;
			}

			await ctx.waitForIdle();

			const availableStages = getAvailableStages(pi);
			const branchEntries = ctx.sessionManager.getBranch();
			const resolved = resolveWorkflowTarget(ctx.cwd, args, branchEntries);
			if (!resolved) {
				ctx.ui.notify(
					"Usage: /plan-next <goal> to start a workflow, or run /plan-next from a session already tied to a workflow directory.",
					"info",
				);
				return;
			}

			const { target, source, shouldCreateDirectory } = resolved;
			const recommended = chooseRecommendedStage(target);
			const optionStages = buildStageOptions(target, recommended.stage, availableStages);
			if (optionStages.length === 0) {
				ctx.ui.notify("The required plan stage skills are not available in this session.", "error");
				return;
			}

			const selectedLabel = await ctx.ui.select(
				"Choose the next planning stage",
				optionStages.map((option) => option.label),
			);
			if (!selectedLabel) {
				ctx.ui.notify("Cancelled", "info");
				return;
			}

			const selected = optionStages.find((option) => option.label === selectedLabel);
			if (!selected) {
				ctx.ui.notify("Could not resolve the selected stage.", "error");
				return;
			}

			const selectedStage = selected.stage;
			const selectedSkill = STAGES[selectedStage].skillName;
			const targetDescription =
				target.kind === "directory"
					? `Workflow directory: ${target.dir}`
					: `Legacy plan file: ${target.planPath}`;
			const overrideNote =
				selectedStage !== recommended.stage ? `Override selected: ${STAGES[selectedStage].label}` : undefined;
			const confirmBody = [
				`Goal: ${target.goal}`,
				targetDescription,
				`Workflow source: ${source}`,
				`Recommended route: ${STAGES[recommended.stage].label}`,
				`Will invoke: /skill:${selectedSkill}`,
				`Why: ${recommended.reason}`,
				overrideNote,
				shouldCreateDirectory ? "A new workflow directory will be created before the handoff." : undefined,
				"This will create a fresh session and immediately invoke the selected stage.",
			]
				.filter((line): line is string => Boolean(line))
				.join("\n\n");

			const confirmed = await ctx.ui.confirm(
				`Start a fresh ${STAGES[selectedStage].label.toLowerCase()} session?`,
				confirmBody,
			);
			if (!confirmed) {
				ctx.ui.notify("Stayed in the current session.", "info");
				return;
			}

			if (target.kind === "directory" && (shouldCreateDirectory || !directoryExists(target.dir))) {
				mkdirSync(target.dir, { recursive: true });
			}

			const handoffPrompt = buildStagePrompt(selectedStage, target, getRecentConversationContext(branchEntries));
			const newSessionResult = await ctx.newSession({
				parentSession: ctx.sessionManager.getSessionFile(),
			});
			if (newSessionResult.cancelled) {
				ctx.ui.notify("New session cancelled.", "info");
				return;
			}

			pi.sendUserMessage(handoffPrompt);
		},
	});
}
