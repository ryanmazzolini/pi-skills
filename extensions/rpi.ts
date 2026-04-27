import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WORKFLOW_DIR_PATTERN = /^\d{4}-\d{2}-\d{2}-.+/;
const DEFAULT_THOUGHTS_PROFILE = "default";
const PLANS_ROOT_ENV = "PI_SKILLS_PLANS_ROOT";
const THOUGHTS_PROFILE_ENV = "PI_SKILLS_THOUGHTS_PROFILE";
const MAX_CANDIDATES = 5;
const RPI_SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../skills/rpi");
const RPI_SKILL_PATH = join(RPI_SKILL_DIR, "SKILL.md");

let latestCommandContext: ExtensionCommandContext | undefined;

type WorkflowCandidate = {
	dir: string;
	goal: string;
	status?: string;
	artifacts: string[];
	mtimeMs: number;
};

type HandoffPayload = {
	user_confirmed: boolean;
	next_step: string;
	workflow_dir?: string;
	carryover?: string[];
	kickoff: string;
};

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

	for (const candidate of [".plans", `thoughts/${DEFAULT_THOUGHTS_PROFILE}/plans`, "docs/plans", "PRPs"]) {
		roots.push(join(cwd, candidate));
	}

	for (const thoughtsProfile of listThoughtsProfiles(cwd)) {
		roots.push(join(cwd, "thoughts", thoughtsProfile, "plans"));
	}

	return Array.from(new Set(roots)).filter(directoryExists);
}

function isWithin(parent: string, child: string): boolean {
	const relation = relative(parent, child);
	return relation === "" || (!!relation && !relation.startsWith("..") && !isAbsolute(relation));
}

function resolveWorkflowDir(cwd: string, input: string): string | undefined {
	const trimmed = input.trim();
	if (!trimmed) return undefined;

	const resolved = resolve(cwd, trimmed);
	const allowedRoots = [cwd, ...getPlanRoots(cwd)];
	return allowedRoots.some((root) => isWithin(root, resolved)) ? resolved : undefined;
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

function getWorkflowMtime(dir: string): number {
	const mtimes = artifactNames(dir).map((name) => statSync(join(dir, name)).mtimeMs);
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
				mtimeMs: getWorkflowMtime(dir),
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

function encodePayload(payload: HandoffPayload): string {
	return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function isHandoffPayload(value: unknown): value is HandoffPayload {
	if (typeof value !== "object" || value === null) return false;
	const payload = value as Partial<HandoffPayload>;
	return (
		typeof payload.user_confirmed === "boolean" &&
		typeof payload.next_step === "string" &&
		typeof payload.kickoff === "string" &&
		(payload.workflow_dir === undefined || typeof payload.workflow_dir === "string") &&
		(payload.carryover === undefined ||
			(Array.isArray(payload.carryover) && payload.carryover.every((item) => typeof item === "string")))
	);
}

function decodePayload(value: string): HandoffPayload | undefined {
	try {
		const parsed = JSON.parse(Buffer.from(value.trim(), "base64url").toString("utf8"));
		return isHandoffPayload(parsed) ? parsed : undefined;
	} catch {
		return undefined;
	}
}

function stripFrontmatter(content: string): string {
	return content.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "").trim();
}

function readRpiSkillBlock(): string {
	const content = readText(RPI_SKILL_PATH);
	if (!content) {
		return `Use the rpi skill. Its expected location is ${RPI_SKILL_PATH}.`;
	}

	return `<skill name="rpi" location="${RPI_SKILL_PATH}">
References are relative to ${RPI_SKILL_DIR}.

${stripFrontmatter(content)}
</skill>`;
}

function buildRpiPrompt(args: string, candidates: WorkflowCandidate[]): string {
	const userIntent = args.trim() || "Continue or start the appropriate RPI workflow.";
	return `${readRpiSkillBlock()}

User intent:
${userIntent}

Lightweight workflow candidates from the pi /rpi extension:
${formatCandidates(candidates)}

Use these candidates as context, not as a hard routing decision. If the next workflow or next step is ambiguous, ask one conversational question with your recommended answer. Otherwise proceed by loading the relevant rpi stage guidance.`;
}

function buildFreshKickoff(payload: HandoffPayload): string {
	const carryover = payload.carryover?.length ? payload.carryover.map((item) => `- ${item}`).join("\n") : "- None provided";
	return `${readRpiSkillBlock()}

Fresh RPI handoff. Automatically start working on the agreed next step.

Next step:
${payload.next_step}

${payload.workflow_dir ? `Workflow directory:\n${payload.workflow_dir}\n\n` : ""}Carryover context:
${carryover}

Kickoff:
${payload.kickoff}`;
}

async function startFreshHandoff(payload: HandoffPayload, ctx: ExtensionCommandContext): Promise<boolean> {
	if (!payload.user_confirmed) {
		ctx.ui.notify("RPI handoff requires conversational user confirmation first.", "warning");
		return false;
	}

	const workflowDir = payload.workflow_dir ? resolveWorkflowDir(ctx.cwd, payload.workflow_dir) : undefined;
	if (payload.workflow_dir && !workflowDir) {
		ctx.ui.notify("RPI handoff workflow_dir must stay inside the repo or a configured plans root.", "error");
		return false;
	}

	if (workflowDir) {
		mkdirSync(workflowDir, { recursive: true });
	}

	const kickoff = buildFreshKickoff({ ...payload, workflow_dir: workflowDir });
	const result = await ctx.newSession({
		parentSession: ctx.sessionManager.getSessionFile(),
		withSession: async (replacementCtx) => {
			await replacementCtx.sendUserMessage(kickoff);
		},
	});
	if (result.cancelled) {
		ctx.ui.notify("RPI handoff cancelled.", "info");
		return false;
	}
	return true;
}

function queueFreshHandoff(payload: HandoffPayload, ctx: ExtensionCommandContext): void {
	setTimeout(() => {
		ctx.waitForIdle()
			.then(() => startFreshHandoff(payload, ctx))
			.catch((error: unknown) => {
				const message = error instanceof Error ? error.message : String(error);
				ctx.ui.notify(`RPI handoff failed: ${message}`, "error");
			});
	}, 0);
}

export default function rpiExtension(pi: ExtensionAPI) {
	pi.registerCommand("rpi", {
		description: "Start or continue the RPI workflow with skill context and handoff hooks",
		handler: async (args, ctx) => {
			latestCommandContext = ctx;
			await ctx.waitForIdle();
			const candidates = listWorkflowCandidates(ctx.cwd);
			pi.sendUserMessage(buildRpiPrompt(args, candidates));
		},
	});

	pi.registerCommand("rpi-handoff", {
		description: "Internal RPI fresh-session handoff command",
		handler: async (args, ctx) => {
			latestCommandContext = ctx;
			await ctx.waitForIdle();
			const payload = decodePayload(args);
			if (!payload) {
				ctx.ui.notify("Invalid rpi handoff payload.", "error");
				return;
			}
			await startFreshHandoff(payload, ctx);
		},
	});

	pi.registerTool({
		name: "rpi_handoff",
		label: "RPI Handoff",
		description:
			"Start a fresh RPI session after the user has conversationally confirmed the next step. Requires user_confirmed true.",
		parameters: Type.Object({
			user_confirmed: Type.Boolean({ description: "Must be true only after the user agreed in conversation." }),
			next_step: Type.String({ description: "The agreed next step for the fresh session." }),
			workflow_dir: Type.Optional(Type.String({ description: "Workflow directory, if known." })),
			carryover: Type.Optional(Type.Array(Type.String(), { description: "Compact context bullets to carry over." })),
			kickoff: Type.String({ description: "Instruction for the fresh session; it should start working immediately." }),
		}),
		async execute(_toolCallId, params) {
			if (!params.user_confirmed) {
				return {
					content: [
						{
							type: "text",
							text: "RPI handoff not started: ask the user conversationally first, then call rpi_handoff with user_confirmed: true.",
						},
					],
				};
			}

			if (!latestCommandContext) {
				return {
					content: [
						{
							type: "text",
							text: `RPI handoff not started automatically: no active /rpi command context is available. Ask the user to run /rpi and retry, or run /rpi-handoff ${encodePayload(params)}.`,
						},
					],
				};
			}

			queueFreshHandoff(params, latestCommandContext);
			return {
				content: [{ type: "text", text: "Queued RPI fresh-session handoff." }],
			};
		},
	});
}
