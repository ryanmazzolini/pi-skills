import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const WORKFLOW_DIR_PATTERN = /^\d{4}-\d{2}-\d{2}-.+/;
const DEFAULT_THOUGHTS_PROFILE = "default";
const PLANS_ROOT_ENV = "PI_SKILLS_PLANS_ROOT";
const THOUGHTS_PROFILE_ENV = "PI_SKILLS_THOUGHTS_PROFILE";
const MAX_CANDIDATES = 5;
const DEFAULT_PLAN_ROOT_PATTERNS = [
	".plans/",
	".plan/",
	`thoughts/${DEFAULT_THOUGHTS_PROFILE}/plans/`,
	"docs/plans/",
	"PRPs/",
];

type WorkflowCandidate = {
	dir: string;
	goal: string;
	status?: string;
	artifacts: string[];
	mtimeMs: number;
};

type RpiCommand =
	| { kind: "handoff"; brief?: string }
	| { kind: "workflow"; intent: string };

function directoryExists(path: string | undefined): path is string {
	if (!path) return false;
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

function fileExists(path: string | undefined): path is string {
	if (!path) return false;
	try {
		return statSync(path).isFile();
	} catch {
		return false;
	}
}

function readText(path: string | undefined): string | undefined {
	if (!fileExists(path)) return undefined;
	try {
		return readFileSync(path, "utf8");
	} catch {
		return undefined;
	}
}

function normalizeProfileName(value: string | undefined): string | undefined {
	const normalized = value?.trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
	return normalized || undefined;
}

function listThoughtsProfiles(cwd: string): string[] {
	const thoughtsRoot = join(cwd, "thoughts");
	if (!directoryExists(thoughtsRoot)) return [];
	return readdirSync(thoughtsRoot)
		.filter((name) => !["global", "searchable"].includes(name))
		.filter((name) => directoryExists(join(thoughtsRoot, name, "plans")))
		.sort();
}

function getPlanRoots(cwd: string): string[] {
	const roots: string[] = [];
	const explicitRoot = process.env[PLANS_ROOT_ENV]?.trim();
	if (explicitRoot) roots.push(resolve(cwd, explicitRoot));

	const profile = normalizeProfileName(process.env[THOUGHTS_PROFILE_ENV]);
	if (profile) roots.push(join(cwd, "thoughts", profile, "plans"));

	for (const candidate of DEFAULT_PLAN_ROOT_PATTERNS) {
		roots.push(join(cwd, candidate));
	}

	for (const thoughtsProfile of listThoughtsProfiles(cwd)) {
		roots.push(join(cwd, "thoughts", thoughtsProfile, "plans"));
	}

	return Array.from(new Set(roots)).filter(directoryExists);
}

function readGoal(content: string | undefined, fallback: string): string {
	if (!content) return fallback;
	return (
		content.match(/^goal:\s*(.+)$/m)?.[1]?.trim() ??
		content.match(/^#\s+(.+)$/m)?.[1]?.trim() ??
		fallback
	);
}

function readStatus(content: string | undefined): string | undefined {
	return content?.match(/\*\*Status\*\*:\s*([^|\n]+)/)?.[1]?.trim();
}

function artifactNames(dir: string): string[] {
	const names = ["question.md", "research.md", "design.md", "structure.md", "plan.md", "board/index.md"];
	return names.filter((name) => fileExists(join(dir, name)));
}

function getWorkflowMtime(dir: string, artifacts: string[]): number {
	const mtimes = artifacts.map((name) => statSync(join(dir, name)).mtimeMs);
	return Math.max(statSync(dir).mtimeMs, ...mtimes);
}

function listWorkflowCandidates(cwd: string): WorkflowCandidate[] {
	return getPlanRoots(cwd)
		.flatMap((root) =>
			readdirSync(root)
				.filter((name) => WORKFLOW_DIR_PATTERN.test(name))
				.map((name) => join(root, name))
				.filter(directoryExists),
		)
		.map((dir) => {
			const plan = readText(join(dir, "plan.md"));
			const artifacts = artifactNames(dir);
			return {
				dir,
				goal: readGoal(plan ?? readText(join(dir, "question.md")), basename(dir)),
				status: readStatus(plan),
				artifacts,
				mtimeMs: getWorkflowMtime(dir, artifacts),
			};
		})
		.sort((left, right) => right.mtimeMs - left.mtimeMs)
		.slice(0, MAX_CANDIDATES);
}

function formatCandidates(candidates: WorkflowCandidate[]): string {
	if (candidates.length === 0) return "No existing workflow directories were found.";
	return candidates
		.map((candidate, index) => {
			const relativeDir = candidate.dir;
			const status = candidate.status ? `; status: ${candidate.status}` : "";
			const artifacts = candidate.artifacts.length > 0 ? candidate.artifacts.join(", ") : "none";
			return `${index + 1}. ${relativeDir}\n   Goal: ${candidate.goal}${status}\n   Artifacts: ${artifacts}`;
		})
		.join("\n");
}

function buildRpiSkillInvocation(body: string): string {
	return `/skill:rpi ${body.trim()}`;
}

function buildWorkflowSkillCommand(intent: string, candidates: WorkflowCandidate[]): string {
	const userIntent = intent.trim() || "Continue or start the appropriate RPI workflow.";
	return buildRpiSkillInvocation(`User intent:
${userIntent}

Lightweight workflow candidates from the pi /rpi extension:
${formatCandidates(candidates)}

Use these candidates as context, not as a hard routing decision. If the next workflow or next step is ambiguous, ask one conversational question with your recommended answer. Otherwise proceed by loading the relevant rpi stage guidance.`);
}

function buildFreshHandoffKickoff(brief: string): string {
	return buildRpiSkillInvocation(`Fresh RPI handoff. Start working immediately.

Handoff brief:
${brief}`);
}

function buildHandoffFailurePrompt(errorMessage: string, brief: string): string {
	return `RPI handoff failed while creating the fresh session.

Error:
${errorMessage}

Ask me what I want to do next. Offer these options:
- Retry with a readable /rpi handoff <brief> command
- Continue in this session using the handoff brief
- Revise the handoff brief before retrying

Handoff brief:
${brief}`;
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function parseRpiArgs(args: string): RpiCommand {
	const trimmed = args.trim();
	if (trimmed === "handoff") return { kind: "handoff" };
	if (trimmed.startsWith("handoff ")) return { kind: "handoff", brief: trimmed.slice("handoff ".length).trim() || undefined };
	return { kind: "workflow", intent: trimmed };
}

async function runHandoffCommand(pi: ExtensionAPI, command: Extract<RpiCommand, { kind: "handoff" }>, ctx: ExtensionCommandContext): Promise<void> {
	await ctx.waitForIdle();

	const brief = command.brief;
	if (!brief) {
		ctx.ui.notify("Usage: /rpi handoff <brief>", "warning");
		return;
	}

	try {
		const result = await ctx.newSession({
			parentSession: ctx.sessionManager.getSessionFile(),
			withSession: async (replacementCtx) => {
				await replacementCtx.sendUserMessage(buildFreshHandoffKickoff(brief));
			},
		});

		if (result.cancelled) {
			ctx.ui.notify("RPI handoff cancelled.", "info");
		}
	} catch (error: unknown) {
		const message = getErrorMessage(error);
		ctx.ui.notify(`RPI handoff failed: ${message}`, "error");
		pi.sendUserMessage(buildHandoffFailurePrompt(message, brief));
	}
}

export default function rpiExtension(pi: ExtensionAPI) {
	pi.registerCommand("rpi", {
		description: "Start or continue the RPI workflow with skill context, workflow candidates, and handoff support",
		handler: async (args, ctx) => {
			const command = parseRpiArgs(args);
			if (command.kind === "handoff") {
				await runHandoffCommand(pi, command, ctx);
				return;
			}

			await ctx.waitForIdle();
			const candidates = listWorkflowCandidates(ctx.cwd);
			pi.sendUserMessage(buildWorkflowSkillCommand(command.intent, candidates));
		},
	});
}
