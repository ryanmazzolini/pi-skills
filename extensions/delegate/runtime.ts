import { join } from "node:path";

export const RUN_SCHEMA_VERSION = 3;
export const DEFAULT_RESULT_LIMIT_BYTES = 32 * 1024;
export const DEFAULT_MAX_ACTIVE_CHILDREN = 10;

export type ChildState =
	| "queued"
	| "starting"
	| "running"
	| "needs_attention"
	| "completed"
	| "failed"
	| "cancelled"
	| "interrupted";

export type RunStatus =
	| "queued"
	| "running"
	| "needs_attention"
	| "completed"
	| "partial"
	| "failed"
	| "cancelled"
	| "interrupted";

export type AttentionKind = "clarification" | "approval" | "decision";
export type ChildContext = "fresh" | "fork";
export type PendingWorkKind = "initial" | "reply" | "resume";

export interface ParentOrigin {
	sessionId: string;
	leafId: string | null;
	inputGeneration: number;
}

export interface Activity {
	kind: "queued" | "starting" | "thinking" | "tool" | "waiting" | "message";
	summary: string;
	observedAt: string;
}

export interface ChildUsage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	total: number;
	cost: number;
}

export interface ResolvedSkill {
	name: string;
	filePath: string;
}

export type ChildOutputContract = "text" | { schema: Record<string, unknown> };

export interface ResolvedChildConfig {
	model: { provider: string; id: string };
	reasoning: string;
	context: ChildContext;
	skills: ResolvedSkill[];
	tools: string[];
	output: ChildOutputContract;
}

export interface DiffSummary {
	filesChanged: number;
	additions: number;
	deletions: number;
	stat: string;
}

export interface WorkspaceReview {
	revision: string;
	baseTree: string;
	summary: DiffSummary;
	patchPath: string;
	manifestPath: string;
	reviewedAt: string;
}

export type IntegrationState =
	| { state: "working"; message?: string }
	| { state: "no_changes"; reviewedAt: string; cleanupError?: string }
	| { state: "review_pending"; review: WorkspaceReview }
	| { state: "applying"; review: WorkspaceReview }
	| { state: "discarding"; review: WorkspaceReview }
	| { state: "applied"; revision: string; appliedAt: string; cleanupError?: string }
	| { state: "conflict"; review: WorkspaceReview; message: string }
	| { state: "discarded"; revision: string; discardedAt: string; cleanupError?: string }
	| { state: "cleaned"; cleanedAt: string };

export interface ExistingWorkspace {
	kind: "existing";
	cwd: string;
	owner: "external";
}

interface TemporaryWorkspaceBase {
	kind: "temporary";
	sourceCwd: string;
	worktreePath: string;
	integration: IntegrationState;
}

export interface GitTemporaryWorkspace extends TemporaryWorkspaceBase {
	repoRoot: string;
	relativeCwd: string;
	branch: string;
	baseCommit: string;
	patchPath: string;
	manifestPath: string;
}

export interface ScratchContentsSummary {
	entries: string[];
	truncated: boolean;
	error?: string;
}

export interface ScratchTemporaryWorkspace extends TemporaryWorkspaceBase {
	contents?: ScratchContentsSummary;
}

export type TemporaryWorkspace = GitTemporaryWorkspace | ScratchTemporaryWorkspace;
export type ChildWorkspace = ExistingWorkspace | TemporaryWorkspace;

export function isGitTemporaryWorkspace(workspace: TemporaryWorkspace): workspace is GitTemporaryWorkspace {
	return "repoRoot" in workspace;
}

export function childWorkspaceCwd(workspace: ChildWorkspace): string {
	if (workspace.kind === "existing") return workspace.cwd;
	return isGitTemporaryWorkspace(workspace) && workspace.relativeCwd
		? join(workspace.worktreePath, workspace.relativeCwd)
		: workspace.worktreePath;
}

export type ChildResult =
	| { kind: "text"; value: string; completedAt: string }
	| { kind: "structured"; value: unknown; completedAt: string };

export interface ChildFailure {
	message: string;
	stopReason?: string;
	lastActivity: Activity;
	partialOutput?: string;
	failedAt: string;
}

export type AttentionNotification =
	| { state: "pending" }
	| { state: "delivered"; deliveredAt: string }
	| { state: "held"; reason: "user_intervened" | "session_changed" };

export interface AttentionRequest {
	id: string;
	kind: AttentionKind;
	question: string;
	context?: string;
	requestedAt: string;
	notification: AttentionNotification;
}

export interface PendingChildWork {
	kind: PendingWorkKind;
	sequence: number;
	enqueuedAt: string;
	message?: string;
}

export interface DelegatedChild {
	id: string;
	label: string;
	task: string;
	state: ChildState;
	resolved: ResolvedChildConfig;
	contextSource?: { sessionFile: string; leafId: string | null };
	sessionDir: string;
	sessionFile?: string;
	sessionId?: string;
	workspace: ChildWorkspace;
	latestActivity: Activity;
	attention?: AttentionRequest;
	pending?: PendingChildWork;
	result?: ChildResult;
	failure?: ChildFailure;
	usage: ChildUsage;
}

export type DeliveryState =
	| { state: "pending" }
	| { state: "delivered"; deliveredAt: string }
	| { state: "held"; reason: "user_intervened" | "session_changed" }
	| { state: "dismissed" };

export interface DelegationRun {
	schemaVersion: typeof RUN_SCHEMA_VERSION;
	id: string;
	parent: ParentOrigin;
	recordRef: string;
	createdAt: string;
	updatedAt: string;
	children: DelegatedChild[];
	delivery: DeliveryState;
}

export interface DelegateHandle {
	runId: string;
	children: Array<{ childId: string; label: string; state: "queued" | "starting" }>;
	recordRef: string;
}

interface ChildViewResultBase {
	truncated: boolean;
	fullResultRef: string;
}

export type ChildViewResult =
	| (ChildViewResultBase & { kind: "text"; value: string })
	| (ChildViewResultBase & { kind: "structured"; value: unknown });

export interface ChildWorkspaceView {
	kind: "temporary";
	backing: "git" | "scratch";
	state: IntegrationState["state"];
	pathRef: string;
	revision?: string;
	summary?: DiffSummary;
	patchRef?: string;
	manifestRef?: string;
	message?: string;
	cleanupError?: string;
	contents?: string[];
	contentsTruncated?: boolean;
}

export interface ChildView {
	childId: string;
	label: string;
	state: ChildState;
	lastActivity: Activity;
	workspace?: ChildWorkspaceView;
	attention?: {
		kind: AttentionKind;
		question: string;
		context?: string;
	};
	result?: ChildViewResult;
	error?: {
		message: string;
		stopReason?: string;
		partialOutput?: string;
	};
	usage: ChildUsage;
}

export interface RunView {
	runId: string;
	status: RunStatus;
	delivery: DeliveryState["state"];
	children: ChildView[];
	omittedChildren?: number;
	truncated: boolean;
	recordRef: string;
}

export interface RunPaths {
	runFile: string;
	childSessionDir: string;
	worktreeDir: string;
	patchFile: string;
	manifestFile: string;
}

export interface RunRepository {
	paths(parentSessionId: string, runId: string, childId: string): RunPaths;
	save(run: DelegationRun): Promise<void>;
	list(parentSessionId: string): Promise<DelegationRun[]>;
}

export type ChildOutcome =
	| {
		kind: "success";
		result: { kind: "text"; value: string } | { kind: "structured"; value: unknown };
		usage: ChildUsage;
	}
	| {
		kind: "attention";
		request: { kind: AttentionKind; question: string; context?: string };
		usage: ChildUsage;
	}
	| {
		kind: "failure";
		message: string;
		stopReason?: string;
		partialOutput?: string;
		usage: ChildUsage;
	};

export interface ChildActivitySink {
	activity(activity: Omit<Activity, "observedAt">): void;
}

export interface RunningChild {
	sessionId: string;
	sessionFile?: string;
	completion: Promise<ChildOutcome>;
	continue(message: string): Promise<ChildOutcome>;
	steer(message: string): Promise<void>;
	cancel(): Promise<void>;
	dispose(): void;
}

export interface ChildLaunchInput {
	child: DelegatedChild;
	model: unknown;
	modelRegistry: unknown;
	signal: AbortSignal;
}

export interface ChildSessionAdapter {
	start(input: ChildLaunchInput, sink: ChildActivitySink): Promise<RunningChild>;
	resume(input: ChildLaunchInput, continuation: string, sink: ChildActivitySink): Promise<RunningChild>;
}

export type DeliveryOutcome = "delivered" | "held:user_intervened" | "held:session_changed";

export interface ParentDelivery {
	deliver(run: DelegationRun, view: RunView): Promise<DeliveryOutcome>;
	deliverAttention(run: DelegationRun, view: RunView, childId: string): Promise<DeliveryOutcome>;
	shutdown(): void;
}

export interface StartRunInput {
	tasks: Array<{ task: string; label: string }>;
	cwd: string;
	workspace?: "existing" | "temporary";
	parent: ParentOrigin;
	parentSessionFile?: string;
	model: unknown;
	modelRegistry: unknown;
	resolved: ResolvedChildConfig;
}

export interface LaunchResources {
	model: unknown;
	modelRegistry: unknown;
}

export interface ParentReauthorization {
	inputGeneration: number;
	leafId: string | null;
}

export interface WorkspacePreparationInput {
	sourceCwd: string;
	runId: string;
	childId: string;
	worktreePath: string;
	patchPath: string;
	manifestPath: string;
}

export type WorkspaceInspection =
	| { kind: "no_changes" }
	| { kind: "changes"; review: Omit<WorkspaceReview, "reviewedAt"> };

export type WorkspaceDestinationInspection =
	| { kind: "base"; revision: string }
	| { kind: "reviewed"; revision: string }
	| { kind: "changed"; revision?: string; message: string };

export interface WorkspaceManager {
	prepare(input: WorkspacePreparationInput): Promise<TemporaryWorkspace>;
	inspect(workspace: GitTemporaryWorkspace): Promise<WorkspaceInspection>;
	inspectDestination(workspace: GitTemporaryWorkspace, review: WorkspaceReview): Promise<WorkspaceDestinationInspection>;
	assertRevision(workspace: GitTemporaryWorkspace, revision: string): Promise<void>;
	apply(workspace: GitTemporaryWorkspace, review: WorkspaceReview): Promise<void>;
	inspectScratch(workspace: ScratchTemporaryWorkspace): Promise<ScratchContentsSummary>;
	cleanup(workspace: TemporaryWorkspace, expectedRevision?: string): Promise<void>;
}

export class WorkspaceConflictError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WorkspaceConflictError";
	}
}

export interface DelegateRuntimeOptions {
	repository: RunRepository;
	children: ChildSessionAdapter;
	delivery: ParentDelivery;
	workspaces?: WorkspaceManager;
	maxActiveChildren?: number;
	now?: () => Date;
	createId?: (kind: "run" | "child" | "attention") => string;
}

interface QueueItem {
	runId: string;
	childId: string;
	sequence: number;
}

const ACTIVITY_HEARTBEAT_MS = 5_000;

const ZERO_USAGE: ChildUsage = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	total: 0,
	cost: 0,
};

function clone<T>(value: T): T {
	return structuredClone(value);
}

function isTerminalChild(state: ChildState): boolean {
	return state === "completed" || state === "failed" || state === "cancelled" || state === "interrupted";
}

function isFinalChild(state: ChildState): boolean {
	return state === "completed" || state === "failed" || state === "cancelled";
}

function canFinalize(run: DelegationRun): boolean {
	return run.children.length > 0 && run.children.every((child) => isFinalChild(child.state));
}

export function deriveRunStatus(run: DelegationRun): RunStatus {
	const states = run.children.map((child) => child.state);
	if (states.some((state) => state === "needs_attention")) return "needs_attention";
	if (states.some((state) => state === "starting" || state === "running")) return "running";
	if (states.some((state) => state === "queued")) return "queued";
	if (states.every((state) => state === "completed")) return "completed";
	if (states.some((state) => state === "completed")) return "partial";
	if (states.every((state) => state === "cancelled")) return "cancelled";
	if (states.some((state) => state === "failed")) return "failed";
	return "interrupted";
}

function clipUtf8(value: string, maxBytes: number): { value: string; truncated: boolean } {
	if (Buffer.byteLength(value, "utf8") <= maxBytes) return { value, truncated: false };
	let end = Math.min(value.length, maxBytes);
	while (end > 0 && Buffer.byteLength(value.slice(0, end), "utf8") > maxBytes) end--;
	return { value: value.slice(0, end), truncated: true };
}

function truncateUtf8(value: string, maxBytes: number): { value: string; truncated: boolean } {
	const marker = "\n\n[Output truncated. Full result is persisted.]";
	if (Buffer.byteLength(value, "utf8") <= maxBytes) return { value, truncated: false };
	const contentBudget = Math.max(0, maxBytes - Buffer.byteLength(marker, "utf8"));
	return { value: `${clipUtf8(value, contentBudget).value}${marker}`, truncated: true };
}

function serialized(value: unknown): string {
	try {
		return JSON.stringify(value);
	} catch {
		return JSON.stringify({ error: "Structured result could not be serialized" });
	}
}

function integrationReview(integration: IntegrationState): WorkspaceReview | undefined {
	return integration.state === "review_pending"
		|| integration.state === "applying"
		|| integration.state === "discarding"
		|| integration.state === "conflict"
		? integration.review
		: undefined;
}

export function projectRun(run: DelegationRun, maxBytes = DEFAULT_RESULT_LIMIT_BYTES): RunView {
	const effectiveLimit = Math.max(1024, maxBytes);
	const fixedBudget = Math.max(512, effectiveLimit - 4096);
	const perChildBudget = Math.max(256, Math.floor(fixedBudget / Math.max(1, run.children.length)));
	let anyTruncated = false;
	const bounded = (value: string, limit: number): string => {
		const projected = clipUtf8(value, limit);
		anyTruncated ||= projected.truncated;
		return projected.value;
	};
	const children = run.children.map((child): ChildView => {
		let result: ChildViewResult | undefined;
		if (child.result?.kind === "text") {
			const projected = truncateUtf8(child.result.value, perChildBudget);
			anyTruncated ||= projected.truncated;
			result = {
				kind: "text",
				value: projected.value,
				truncated: projected.truncated,
				fullResultRef: bounded(child.sessionFile ?? run.recordRef, 1024),
			};
		} else if (child.result?.kind === "structured") {
			const encoded = serialized(child.result.value);
			const truncated = Buffer.byteLength(encoded, "utf8") > perChildBudget;
			anyTruncated ||= truncated;
			result = {
				kind: "structured",
				value: truncated
					? { truncated: true, message: "Structured result omitted from bounded view; inspect the full result." }
					: clone(child.result.value),
				truncated,
				fullResultRef: bounded(child.sessionFile ?? run.recordRef, 1024),
			};
		}
		let workspace: ChildWorkspaceView | undefined;
		if (child.workspace.kind === "temporary") {
			const integration = child.workspace.integration;
			const review = integrationReview(integration);
			const finalRevision = integration.state === "applied" || integration.state === "discarded"
				? integration.revision
				: undefined;
			const cleanupError = "cleanupError" in integration ? integration.cleanupError : undefined;
			const scratchContents = !isGitTemporaryWorkspace(child.workspace) ? child.workspace.contents : undefined;
			workspace = {
				kind: "temporary",
				backing: isGitTemporaryWorkspace(child.workspace) ? "git" : "scratch",
				state: integration.state,
				pathRef: bounded(child.workspace.worktreePath, 1024),
				...(review || finalRevision ? { revision: bounded(review?.revision ?? finalRevision!, 128) } : {}),
				...(review
					? {
						summary: {
							filesChanged: review.summary.filesChanged,
							additions: review.summary.additions,
							deletions: review.summary.deletions,
							stat: bounded(review.summary.stat, Math.min(4096, perChildBudget)),
						},
						patchRef: bounded(review.patchPath, 1024),
						manifestRef: bounded(review.manifestPath, 1024),
					}
					: {}),
				...(integration.state === "conflict" || (integration.state === "working" && integration.message)
					? { message: bounded(integration.message!, 2048) }
					: scratchContents?.error ? { message: bounded(scratchContents.error, 2048) } : {}),
				...(cleanupError ? { cleanupError: bounded(cleanupError, 2048) } : {}),
				...(scratchContents
					? {
						contents: scratchContents.entries.map((entry) => bounded(entry, 512)),
						contentsTruncated: scratchContents.truncated,
					}
					: {}),
			};
		}
		return {
			childId: bounded(child.id, 256),
			label: bounded(child.label, 256),
			state: child.state,
			lastActivity: {
				kind: child.latestActivity.kind,
				summary: bounded(child.latestActivity.summary, 512),
				observedAt: bounded(child.latestActivity.observedAt, 64),
			},
			...(workspace ? { workspace } : {}),
			...(child.attention
				? {
					attention: {
						kind: child.attention.kind,
						question: bounded(child.attention.question, Math.min(4096, perChildBudget)),
						...(child.attention.context
							? { context: bounded(child.attention.context, Math.min(4096, perChildBudget)) }
							: {}),
					},
				}
				: {}),
			...(result ? { result } : {}),
			...(child.failure
				? {
					error: {
						message: bounded(child.failure.message, Math.min(4096, perChildBudget)),
						...(child.failure.stopReason ? { stopReason: bounded(child.failure.stopReason, 128) } : {}),
						...(child.failure.partialOutput ? { partialOutput: bounded(child.failure.partialOutput, 2048) } : {}),
					},
				}
				: {}),
			usage: clone(child.usage),
		};
	});

	const view: RunView = {
		runId: bounded(run.id, 256),
		status: deriveRunStatus(run),
		delivery: run.delivery.state,
		children,
		truncated: anyTruncated,
		recordRef: bounded(run.recordRef, 2048),
	};
	view.truncated = anyTruncated;

	if (Buffer.byteLength(JSON.stringify(view), "utf8") > effectiveLimit) {
		view.truncated = true;
		view.runId = clipUtf8(view.runId, 96).value;
		view.recordRef = clipUtf8(view.recordRef, 512).value;
		view.children = view.children.map((child): ChildView => ({
			childId: clipUtf8(child.childId, 64).value,
			label: clipUtf8(child.label, 64).value,
			state: child.state,
			lastActivity: {
				kind: child.lastActivity.kind,
				summary: clipUtf8(child.lastActivity.summary, 48).value,
				observedAt: clipUtf8(child.lastActivity.observedAt, 40).value,
			},
			...(child.workspace
				? {
					workspace: {
						kind: "temporary" as const,
						backing: child.workspace.backing,
						state: child.workspace.state,
						pathRef: clipUtf8(child.workspace.pathRef, 96).value,
						...(child.workspace.revision ? { revision: clipUtf8(child.workspace.revision, 64).value } : {}),
						...(child.workspace.patchRef ? { patchRef: clipUtf8(child.workspace.patchRef, 96).value } : {}),
						...(child.workspace.manifestRef ? { manifestRef: clipUtf8(child.workspace.manifestRef, 96).value } : {}),
						...(child.workspace.message ? { message: clipUtf8(child.workspace.message, 96).value } : {}),
						...(child.workspace.cleanupError ? { cleanupError: clipUtf8(child.workspace.cleanupError, 96).value } : {}),
						...(child.workspace.contents
							? {
								contents: child.workspace.contents.slice(0, 8).map((entry) => clipUtf8(entry, 96).value),
								contentsTruncated: child.workspace.contentsTruncated || child.workspace.contents.length > 8,
							}
							: {}),
					},
				}
				: {}),
			...(child.attention
				? { attention: { kind: child.attention.kind, question: clipUtf8(child.attention.question, 160).value } }
				: {}),
			...(child.result?.kind === "text"
				? {
					result: {
						kind: "text" as const,
						value: clipUtf8(child.result.value, 160).value,
						truncated: true,
						fullResultRef: clipUtf8(child.result.fullResultRef, 160).value,
					},
				}
				: child.result?.kind === "structured"
					? {
						result: {
							kind: "structured" as const,
							value: { truncated: true, message: "Inspect the full result." },
							truncated: true,
							fullResultRef: clipUtf8(child.result.fullResultRef, 160).value,
						},
					}
					: {}),
			...(child.error
				? { error: { message: clipUtf8(child.error.message, 96).value, ...(child.error.stopReason ? { stopReason: clipUtf8(child.error.stopReason, 48).value } : {}) } }
				: {}),
			usage: child.usage,
		}));
		while (view.children.length > 0 && Buffer.byteLength(JSON.stringify(view), "utf8") > effectiveLimit) {
			view.children.pop();
			view.omittedChildren = (view.omittedChildren ?? 0) + 1;
		}
		if (Buffer.byteLength(JSON.stringify(view), "utf8") > effectiveLimit) {
			return {
				runId: clipUtf8(run.id, 64).value,
				status: deriveRunStatus(run),
				delivery: run.delivery.state,
				children: [],
				omittedChildren: run.children.length,
				truncated: true,
				recordRef: clipUtf8(run.recordRef, 256).value,
			};
		}
	}
	return view;
}

export function runNeedsControl(run: DelegationRun): boolean {
	if (run.delivery.state === "pending" || run.delivery.state === "held") return true;
	return run.children.some((child) =>
		child.state === "queued"
		|| child.state === "starting"
		|| child.state === "running"
		|| child.state === "needs_attention"
		|| child.state === "interrupted"
		|| (child.workspace.kind === "temporary" && (
			(child.workspace.integration.state !== "no_changes"
				&& child.workspace.integration.state !== "applied"
				&& child.workspace.integration.state !== "discarded"
				&& child.workspace.integration.state !== "cleaned")
			|| ("cleanupError" in child.workspace.integration && !!child.workspace.integration.cleanupError)
		))
	);
}

export class DelegateRuntime {
	private readonly repository: RunRepository;
	private readonly children: ChildSessionAdapter;
	private readonly delivery: ParentDelivery;
	private readonly workspaces: WorkspaceManager | undefined;
	private readonly maxActiveChildren: number;
	private readonly now: () => Date;
	private readonly createId: (kind: "run" | "child" | "attention") => string;
	private readonly runs = new Map<string, DelegationRun>();
	private readonly queue: QueueItem[] = [];
	private readonly launchResources = new Map<string, LaunchResources>();
	private readonly starting = new Map<string, AbortController>();
	private readonly active = new Map<string, RunningChild>();
	private readonly paused = new Map<string, RunningChild>();
	private readonly stopping = new Set<string>();
	private readonly generations = new Map<string, number>();
	private readonly listeners = new Set<(run: DelegationRun) => void>();
	private readonly saveChains = new Map<string, Promise<void>>();
	private readonly finalizeChains = new Map<string, Promise<void>>();
	private readonly workspaceChains = new Map<string, Promise<void>>();
	private nextQueueSequence = 0;
	private disposed = false;

	constructor(options: DelegateRuntimeOptions) {
		this.repository = options.repository;
		this.children = options.children;
		this.delivery = options.delivery;
		this.workspaces = options.workspaces;
		this.maxActiveChildren = options.maxActiveChildren ?? DEFAULT_MAX_ACTIVE_CHILDREN;
		this.now = options.now ?? (() => new Date());
		this.createId = options.createId ?? ((kind) => `${kind}_${crypto.randomUUID()}`);
	}

	async restore(parentSessionId: string): Promise<void> {
		const restored = await this.repository.list(parentSessionId);
		for (const run of restored) {
			let changed = false;
			for (const child of run.children) {
				if (child.pending) this.nextQueueSequence = Math.max(this.nextQueueSequence, child.pending.sequence);
				if (child.state === "queued" || child.state === "starting" || child.state === "running") {
					child.state = "interrupted";
					child.latestActivity = this.activity("waiting", "Interrupted when the parent session stopped; resume to continue");
					changed = true;
				}
				if (child.workspace.kind === "temporary"
					&& isGitTemporaryWorkspace(child.workspace)
					&& await this.reconcileRestoredWorkspace(child.workspace)) {
					changed = true;
				}
			}
			if (changed) {
				run.updatedAt = this.timestamp();
				await this.repository.save(run);
			}
			this.runs.set(run.id, run);
			this.emit(run);
			for (const child of run.children) {
				if (child.state === "needs_attention" && child.attention?.notification.state === "pending") {
					await this.notifyAttention(run, child);
				}
			}
			if (canFinalize(run) && run.delivery.state === "pending") await this.finalizeIfSettled(run, true);
		}
	}

	async start(input: StartRunInput): Promise<DelegateHandle> {
		if (this.disposed) throw new Error("Delegation runtime is not active");
		if (input.tasks.length === 0) throw new Error("Delegation requires at least one task");
		const tasks = input.tasks.map((item) => {
			const task = item.task.trim();
			if (!task) throw new Error("Delegated task cannot be empty");
			return { task, label: item.label.trim() || "Delegated task" };
		});
		const runId = this.createId("run");
		const timestamp = this.timestamp();
		let recordRef = "";
		const children: DelegatedChild[] = [];
		const prepared: TemporaryWorkspace[] = [];
		try {
			for (const item of tasks) {
				const childId = this.createId("child");
				const paths = this.repository.paths(input.parent.sessionId, runId, childId);
				recordRef ||= paths.runFile;
				const pending = this.pending("initial");
				let workspace: ChildWorkspace = { kind: "existing", cwd: input.cwd, owner: "external" };
				if (input.workspace === "temporary") {
					if (!this.workspaces) throw new Error("Temporary agent workspaces are unavailable");
					workspace = await this.workspaces.prepare({
						sourceCwd: input.cwd,
						runId,
						childId,
						worktreePath: paths.worktreeDir,
						patchPath: paths.patchFile,
						manifestPath: paths.manifestFile,
					});
					prepared.push(workspace);
				}
				children.push({
					id: childId,
					label: item.label,
					task: item.task,
					state: "queued",
					resolved: clone(input.resolved),
					...(input.resolved.context === "fork" && input.parentSessionFile
						? { contextSource: { sessionFile: input.parentSessionFile, leafId: input.parent.leafId } }
						: {}),
					sessionDir: paths.childSessionDir,
					workspace,
					latestActivity: { kind: "queued", summary: "Waiting for an inference slot", observedAt: timestamp },
					pending,
					usage: clone(ZERO_USAGE),
				});
			}
		} catch (error) {
			const cleanupErrors = await this.cleanupPrepared(prepared);
			if (cleanupErrors.length > 0) throw new AggregateError([error, ...cleanupErrors], "Temporary workspace setup and cleanup failed");
			throw error;
		}
		const run: DelegationRun = {
			schemaVersion: RUN_SCHEMA_VERSION,
			id: runId,
			parent: clone(input.parent),
			recordRef,
			createdAt: timestamp,
			updatedAt: timestamp,
			children,
			delivery: { state: "pending" },
		};

		this.runs.set(run.id, run);
		for (const child of children) {
			this.launchResources.set(child.id, { model: input.model, modelRegistry: input.modelRegistry });
			this.queue.push({ runId, childId: child.id, sequence: child.pending!.sequence });
		}
		try {
			await this.persist(run);
		} catch (error) {
			this.runs.delete(run.id);
			for (const child of children) this.launchResources.delete(child.id);
			for (let index = this.queue.length - 1; index >= 0; index--) {
				if (this.queue[index]?.runId === run.id) this.queue.splice(index, 1);
			}
			const cleanupErrors = await this.cleanupPrepared(prepared);
			if (cleanupErrors.length > 0) throw new AggregateError([error, ...cleanupErrors], "Delegation persistence and workspace cleanup failed");
			throw error;
		}
		this.emit(run);
		this.pump();
		return {
			runId,
			children: children.map((child) => ({
				childId: child.id,
				label: child.label,
				state: child.state === "starting" ? "starting" : "queued",
			})),
			recordRef: run.recordRef,
		};
	}

	get(runId: string): DelegationRun | undefined {
		const run = this.runs.get(runId);
		return run ? clone(run) : undefined;
	}

	list(): DelegationRun[] {
		return [...this.runs.values()].map(clone);
	}

	subscribe(listener: (run: DelegationRun) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	async steer(runId: string, childId: string | undefined, message: string, origin?: ParentReauthorization): Promise<DelegationRun> {
		const run = this.requireRun(runId);
		const child = this.selectOne(run, childId, "running", "steer");
		const text = message.trim();
		if (!text) throw new Error("Steer requires a non-empty message");
		const running = this.active.get(child.id);
		if (!running) throw new Error(`Child ${child.id} has no live session to steer`);
		await running.steer(text);
		this.reauthorize(run, origin);
		child.latestActivity = this.activity("message", "Parent guidance queued");
		run.updatedAt = this.timestamp();
		await this.persist(run);
		this.emit(run);
		return clone(run);
	}

	async reply(
		runId: string,
		childId: string | undefined,
		message: string,
		resources: LaunchResources,
		origin?: ParentReauthorization,
	): Promise<DelegationRun> {
		const run = this.requireRun(runId);
		const child = this.selectOne(run, childId, "needs_attention", "reply");
		const text = message.trim();
		if (!text) throw new Error("Reply requires a non-empty message");
		if (child.pending) throw new Error(`Child ${child.id} already has queued work`);
		this.reauthorize(run, origin);
		const pending = this.pending("reply", text);
		child.pending = pending;
		child.state = "queued";
		delete child.attention;
		child.latestActivity = this.activity("queued", "Parent reply queued for an inference slot");
		this.launchResources.set(child.id, resources);
		this.queue.push({ runId, childId: child.id, sequence: pending.sequence });
		run.updatedAt = this.timestamp();
		await this.persist(run);
		this.emit(run);
		this.pump();
		return clone(run);
	}

	async resume(
		runId: string,
		childId: string | undefined,
		resources: LaunchResources,
		origin?: ParentReauthorization,
	): Promise<DelegationRun> {
		if (this.disposed) throw new Error("Delegation runtime is not active");
		const run = this.requireRun(runId);
		const selected = childId
			? [this.requireChild(run, childId)]
			: run.children.filter((child) => child.state === "interrupted");
		if (selected.length === 0) throw new Error(`Run ${run.id} has no interrupted children to resume`);
		for (const child of selected) {
			if (child.state !== "interrupted") throw new Error(`Child ${child.id} is ${child.state}; only interrupted children can resume`);
		}
		const parentBefore = clone(run.parent);
		this.reauthorize(run, origin);
		const prepared = selected.map((child) => {
			const before = {
				state: child.state,
				pending: child.pending ? clone(child.pending) : undefined,
				latestActivity: clone(child.latestActivity),
			};
			const prior = child.pending;
			const kind: PendingWorkKind = prior?.kind === "reply" ? "reply" : child.sessionFile ? "resume" : "initial";
			const message = prior?.message;
			const pending = this.pending(kind, message);
			child.pending = pending;
			child.state = "queued";
			child.latestActivity = this.activity("queued", kind === "reply" ? "Parent reply queued after interruption" : "Resume queued for an inference slot");
			return { child, before, pending };
		});
		run.updatedAt = this.timestamp();
		try {
			await this.persist(run);
			if (this.disposed || prepared.some(({ child, pending }) => child.state !== "queued" || child.pending?.sequence !== pending.sequence)) {
				throw new Error("Delegation runtime is not active");
			}
		} catch (error) {
			for (const { child, before, pending } of prepared) {
				if (child.state !== "queued" || child.pending?.sequence !== pending.sequence) continue;
				child.state = before.state;
				child.latestActivity = before.latestActivity;
				if (before.pending) child.pending = before.pending;
				else delete child.pending;
			}
			if (origin
				&& run.parent.inputGeneration === origin.inputGeneration
				&& run.parent.leafId === origin.leafId) {
				run.parent = parentBefore;
			}
			run.updatedAt = this.timestamp();
			try {
				await this.persist(run);
			} catch {
				// Preserve the corrected in-memory state; the original persistence failure remains actionable.
			}
			this.emit(run);
			throw error;
		}
		for (const { child, pending } of prepared) {
			this.launchResources.set(child.id, resources);
			this.queue.push({ runId, childId: child.id, sequence: pending.sequence });
		}
		this.emit(run);
		this.pump();
		return clone(run);
	}

	async useHeld(runId: string, origin: ParentReauthorization): Promise<DelegationRun> {
		const run = this.requireRun(runId);
		const heldResult = run.delivery.state === "held";
		const heldAttention = run.children.filter((child) => child.state === "needs_attention"
			&& child.attention?.notification.state === "held");
		if (!heldResult && heldAttention.length === 0) throw new Error(`Run ${run.id} has no held update to use`);

		this.reauthorize(run, origin);
		if (heldResult) run.delivery = { state: "pending" };
		for (const child of heldAttention) child.attention!.notification = { state: "pending" };
		run.updatedAt = this.timestamp();
		await this.persist(run);
		this.emit(run);

		for (const child of heldAttention) await this.notifyAttention(run, child);
		if (heldResult) await this.finalizeIfSettled(run, true);
		return clone(this.requireRun(runId));
	}

	async review(runId: string, childId?: string): Promise<DelegationRun> {
		const selected = this.selectGitTemporary(this.requireRun(runId), childId, "review");
		return this.serializeWorkspace(selected.id, async () => {
			const run = this.requireRun(runId);
			const child = this.selectGitTemporary(run, selected.id, "review");
			if (!isFinalChild(child.state)) throw new Error(`Child ${child.id} is ${child.state}; review requires finalized work`);
			const integration = child.workspace.integration;
			if (integration.state === "applied" || integration.state === "discarded" || integration.state === "no_changes") {
				throw new Error(`Child ${child.id} workspace is already ${integration.state}`);
			}
			if (integration.state === "applying" || integration.state === "discarding") {
				throw new Error(`Child ${child.id} workspace is currently ${integration.state}`);
			}
			const manager = this.requireWorkspaceManager();
			const inspection = await manager.inspect(child.workspace);
			if (inspection.kind === "no_changes") {
				child.workspace.integration = { state: "no_changes", reviewedAt: this.timestamp() };
				run.updatedAt = this.timestamp();
				await this.persist(run);
				this.emit(run);
				try {
					await manager.cleanup(child.workspace);
				} catch (error) {
					child.workspace.integration = error instanceof WorkspaceConflictError
						? { state: "working", message: error.message }
						: {
							...child.workspace.integration,
							cleanupError: error instanceof Error ? error.message : String(error),
						};
					run.updatedAt = this.timestamp();
					await this.persist(run);
					this.emit(run);
				}
				return clone(run);
			}
			child.workspace.integration = {
				state: "review_pending",
				review: { ...inspection.review, reviewedAt: this.timestamp() },
			};
			run.updatedAt = this.timestamp();
			await this.persist(run);
			this.emit(run);
			return clone(run);
		});
	}

	async apply(runId: string, childId: string | undefined, revision: string): Promise<DelegationRun> {
		const selected = this.selectGitTemporary(this.requireRun(runId), childId, "apply");
		return this.serializeWorkspace(selected.id, async () => {
			const run = this.requireRun(runId);
			const child = this.selectGitTemporary(run, selected.id, "apply");
			const integration = child.workspace.integration;
			if (integration.state !== "review_pending" && integration.state !== "conflict") {
				throw new Error(`Child ${child.id} workspace is ${integration.state}; apply requires reviewed changes`);
			}
			const expected = revision.trim();
			if (!expected) throw new Error("Apply requires a reviewed revision");
			const review = integration.review;
			if (review.revision !== expected) throw new Error(`Reviewed workspace revision is ${review.revision}, not ${expected}`);
			const manager = this.requireWorkspaceManager();
			await manager.assertRevision(child.workspace, expected);
			child.workspace.integration = { state: "applying", review };
			run.updatedAt = this.timestamp();
			await this.persist(run);
			this.emit(run);
			try {
				await manager.apply(child.workspace, review);
			} catch (error) {
				child.workspace.integration = {
					state: "conflict",
					review,
					message: error instanceof Error ? error.message : String(error),
				};
				run.updatedAt = this.timestamp();
				await this.persist(run);
				this.emit(run);
				if (!(error instanceof WorkspaceConflictError)) throw error;
				return clone(run);
			}
			child.workspace.integration = { state: "applied", revision: expected, appliedAt: this.timestamp() };
			run.updatedAt = this.timestamp();
			await this.persist(run);
			this.emit(run);
			try {
				await manager.cleanup(child.workspace, expected);
			} catch (error) {
				child.workspace.integration = {
					...child.workspace.integration,
					cleanupError: error instanceof Error ? error.message : String(error),
				};
				run.updatedAt = this.timestamp();
				await this.persist(run);
				this.emit(run);
			}
			return clone(run);
		});
	}

	async discard(runId: string, childId: string | undefined, revision: string): Promise<DelegationRun> {
		const selected = this.selectGitTemporary(this.requireRun(runId), childId, "discard");
		return this.serializeWorkspace(selected.id, async () => {
			const run = this.requireRun(runId);
			const child = this.selectGitTemporary(run, selected.id, "discard");
			const integration = child.workspace.integration;
			if (integration.state !== "review_pending" && integration.state !== "conflict") {
				throw new Error(`Child ${child.id} workspace is ${integration.state}; discard requires reviewed changes`);
			}
			const expected = revision.trim();
			if (!expected) throw new Error("Discard requires a reviewed revision");
			const review = integration.review;
			if (review.revision !== expected) throw new Error(`Reviewed workspace revision is ${review.revision}, not ${expected}`);
			const manager = this.requireWorkspaceManager();
			await manager.assertRevision(child.workspace, expected);
			child.workspace.integration = { state: "discarding", review };
			run.updatedAt = this.timestamp();
			await this.persist(run);
			this.emit(run);
			try {
				await manager.cleanup(child.workspace, expected);
			} catch (error) {
				if (error instanceof WorkspaceConflictError) {
					child.workspace.integration = { state: "conflict", review, message: error.message };
				} else {
					child.workspace.integration = {
						state: "discarded",
						revision: expected,
						discardedAt: this.timestamp(),
						cleanupError: error instanceof Error ? error.message : String(error),
					};
				}
				run.updatedAt = this.timestamp();
				await this.persist(run);
				this.emit(run);
				return clone(run);
			}
			child.workspace.integration = { state: "discarded", revision: expected, discardedAt: this.timestamp() };
			run.updatedAt = this.timestamp();
			await this.persist(run);
			this.emit(run);
			return clone(run);
		});
	}

	async cleanup(runId: string, childId?: string): Promise<DelegationRun> {
		const selected = this.selectTemporary(this.requireRun(runId), childId, "cleanup");
		return this.serializeWorkspace(selected.id, async () => {
			const run = this.requireRun(runId);
			const child = this.selectTemporary(run, selected.id, "cleanup");
			const integration = child.workspace.integration;
			if (!isGitTemporaryWorkspace(child.workspace)) {
				if (!isFinalChild(child.state)) throw new Error(`Child ${child.id} is ${child.state}; scratch cleanup requires finalized work`);
				if (integration.state === "cleaned") throw new Error(`Child ${child.id} scratch workspace is already cleaned`);
				if (integration.state !== "working") throw new Error(`Child ${child.id} scratch workspace is ${integration.state}`);
				try {
					await this.requireWorkspaceManager().cleanup(child.workspace);
					child.workspace.integration = { state: "cleaned", cleanedAt: this.timestamp() };
				} catch (error) {
					child.workspace.integration = {
						state: "working",
						message: error instanceof Error ? error.message : String(error),
					};
				}
			} else {
				if ((integration.state !== "no_changes" && integration.state !== "applied" && integration.state !== "discarded")
					|| !integration.cleanupError) {
					throw new Error(`Child ${child.id} workspace has no failed cleanup to retry`);
				}
				const expected = integration.state === "no_changes" ? undefined : integration.revision;
				try {
					await this.requireWorkspaceManager().cleanup(child.workspace, expected);
					const recovered = { ...integration };
					delete recovered.cleanupError;
					child.workspace.integration = recovered;
				} catch (error) {
					child.workspace.integration = {
						...integration,
						cleanupError: error instanceof Error ? error.message : String(error),
					};
				}
			}
			run.updatedAt = this.timestamp();
			await this.persist(run);
			this.emit(run);
			return clone(run);
		});
	}

	async cancel(runId: string, childId?: string): Promise<DelegationRun> {
		const run = this.requireRun(runId);
		const selected = childId ? [this.requireChild(run, childId)] : run.children;
		const cancellations: Promise<void>[] = [];
		for (const child of selected) {
			if (child.state === "completed" || child.state === "failed" || child.state === "cancelled") continue;
			child.state = "cancelled";
			child.pending = undefined;
			delete child.attention;
			child.latestActivity = this.activity("waiting", "Cancelled");
			this.invalidateGeneration(child.id);
			this.starting.get(child.id)?.abort();
			this.starting.delete(child.id);
			const controller = this.active.get(child.id) ?? this.paused.get(child.id);
			this.active.delete(child.id);
			this.paused.delete(child.id);
			if (controller) {
				this.stopping.add(child.id);
				cancellations.push(controller.cancel().finally(() => {
					controller.dispose();
					this.stopping.delete(child.id);
				}));
			}
			this.launchResources.delete(child.id);
		}
		await Promise.allSettled(cancellations);
		run.updatedAt = this.timestamp();
		await this.persist(run);
		this.emit(run);
		await this.finalizeIfSettled(run, true);
		this.pump();
		return clone(run);
	}

	async wait(runId: string, childId?: string, signal?: AbortSignal, timeoutMs?: number): Promise<DelegationRun> {
		const initial = this.requireRun(runId);
		if (childId) this.requireChild(initial, childId);
		if (this.waitCondition(initial, childId)) return clone(initial);

		return new Promise<DelegationRun>((resolve, reject) => {
			let timer: ReturnType<typeof setTimeout> | undefined;
			const cleanup = () => {
				unsubscribe();
				if (timer) clearTimeout(timer);
				signal?.removeEventListener("abort", onAbort);
			};
			const finish = () => {
				cleanup();
				resolve(clone(this.requireRun(runId)));
			};
			const onAbort = () => {
				cleanup();
				reject(new Error("Wait cancelled; delegated work is still running"));
			};
			const unsubscribe = this.subscribe((run) => {
				if (run.id === runId && this.waitCondition(run, childId)) finish();
			});
			if (timeoutMs !== undefined) timer = setTimeout(finish, timeoutMs);
			if (signal?.aborted) onAbort();
			else signal?.addEventListener("abort", onAbort, { once: true });
		});
	}

	async interruptAll(): Promise<void> {
		const cancellations: Promise<void>[] = [];
		for (const run of this.runs.values()) {
			let changed = false;
			for (const child of run.children) {
				if (child.state === "queued" || child.state === "starting" || child.state === "running") {
					child.state = "interrupted";
					child.latestActivity = this.activity("waiting", "Interrupted when the parent session stopped; resume to continue");
					changed = true;
				}
				this.invalidateGeneration(child.id);
				this.starting.get(child.id)?.abort();
				this.starting.delete(child.id);
				const running = this.active.get(child.id);
				if (running) {
					this.active.delete(child.id);
					cancellations.push(running.cancel().finally(() => running.dispose()));
				}
			}
			if (changed) {
				run.updatedAt = this.timestamp();
				await this.persist(run);
				this.emit(run);
			}
		}
		await Promise.allSettled(cancellations);
	}

	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		await this.interruptAll();
		for (const controller of this.paused.values()) controller.dispose();
		this.paused.clear();
		this.delivery.shutdown();
		this.listeners.clear();
	}

	private pump(): void {
		if (this.disposed) return;
		while (this.activeOrStartingCount() < this.maxActiveChildren) {
			const next = this.queue.shift();
			if (!next) return;
			const run = this.runs.get(next.runId);
			const child = run?.children.find((candidate) => candidate.id === next.childId);
			if (!run || !child || child.state !== "queued" || child.pending?.sequence !== next.sequence) continue;
			void this.launch(run, child);
		}
	}

	private async launch(run: DelegationRun, child: DelegatedChild): Promise<void> {
		const pending = child.pending;
		if (!pending) return;
		const startController = new AbortController();
		this.starting.set(child.id, startController);
		child.state = "starting";
		child.latestActivity = this.activity("starting", pending.kind === "initial" ? "Creating an isolated child session" : "Restoring the child session");
		run.updatedAt = this.timestamp();
		this.emit(run);
		await this.persist(run);
		const stateBeforeStart = this.requireChild(run, child.id).state;
		if (stateBeforeStart === "cancelled" || stateBeforeStart === "interrupted" || startController.signal.aborted) {
			this.starting.delete(child.id);
			this.launchResources.delete(child.id);
			return;
		}
		const resources = this.launchResources.get(child.id);
		if (!resources) {
			this.starting.delete(child.id);
			await this.failChild(run, child, {
				kind: "failure",
				message: "Child launch resources are unavailable",
				usage: clone(ZERO_USAGE),
			});
			return;
		}

		let controller: RunningChild | undefined;
		try {
			const sink = { activity: (activity: Omit<Activity, "observedAt">) => void this.updateActivity(run.id, child.id, activity) };
			const paused = this.paused.get(child.id);
			let completion: Promise<ChildOutcome>;
			if (pending.kind === "reply" && paused) {
				this.paused.delete(child.id);
				controller = paused;
				completion = controller.continue(pending.message ?? "Continue with the parent reply.");
			} else if (pending.kind === "initial" && !child.sessionFile) {
				controller = await this.children.start(
					{ child: clone(child), model: resources.model, modelRegistry: resources.modelRegistry, signal: startController.signal },
					sink,
				);
				completion = controller.completion;
			} else {
				const continuation = pending.message
					?? "Continue the assigned delegated task from where it stopped. Do not restart completed work.";
				controller = await this.children.resume(
					{ child: clone(child), model: resources.model, modelRegistry: resources.modelRegistry, signal: startController.signal },
					continuation,
					sink,
				);
				completion = controller.completion;
			}
			this.starting.delete(child.id);
			const stateAfterStart = this.requireChild(run, child.id).state;
			if (stateAfterStart === "cancelled" || stateAfterStart === "interrupted") {
				await controller.cancel();
				controller.dispose();
				return;
			}
			this.active.set(child.id, controller);
			child.sessionFile = controller.sessionFile;
			child.sessionId = controller.sessionId;
			child.pending = undefined;
			delete child.attention;
			delete child.failure;
			child.state = "running";
			child.latestActivity = this.activity("thinking", "Child session is running");
			run.updatedAt = this.timestamp();
			const generation = this.nextGeneration(child.id);
			await this.persist(run);
			this.emit(run);
			this.attachCompletion(run.id, child.id, generation, controller, completion);
		} catch (error) {
			this.starting.delete(child.id);
			controller?.dispose();
			await this.failChild(run, child, {
				kind: "failure",
				message: error instanceof Error ? error.message : String(error),
				usage: clone(ZERO_USAGE),
			});
		}
	}

	private attachCompletion(
		runId: string,
		childId: string,
		generation: number,
		controller: RunningChild,
		completion: Promise<ChildOutcome>,
	): void {
		void completion.then(
			(outcome) => this.finishChild(runId, childId, generation, controller, outcome),
			(error) => this.finishChild(runId, childId, generation, controller, {
				kind: "failure",
				message: error instanceof Error ? error.message : String(error),
				usage: clone(ZERO_USAGE),
			}),
		);
	}

	private async finishChild(
		runId: string,
		childId: string,
		generation: number,
		controller: RunningChild,
		outcome: ChildOutcome,
	): Promise<void> {
		if (this.generations.get(childId) !== generation) {
			controller.dispose();
			return;
		}
		const run = this.runs.get(runId);
		const child = run?.children.find((candidate) => candidate.id === childId);
		if (!run || !child) {
			controller.dispose();
			return;
		}
		this.active.delete(child.id);
		this.launchResources.delete(child.id);
		if (child.state === "cancelled" || child.state === "interrupted") {
			controller.dispose();
			this.pump();
			return;
		}
		if (outcome.kind === "attention") {
			child.state = "needs_attention";
			child.attention = {
				id: this.createId("attention"),
				kind: outcome.request.kind,
				question: outcome.request.question,
				...(outcome.request.context ? { context: outcome.request.context } : {}),
				requestedAt: this.timestamp(),
				notification: { state: "pending" },
			};
			child.latestActivity = this.activity("waiting", "Waiting for a parent reply");
			child.usage = clone(outcome.usage);
			this.paused.set(child.id, controller);
			run.updatedAt = this.timestamp();
			await this.persist(run);
			this.emit(run);
			await this.notifyAttention(run, child);
			this.pump();
			return;
		}
		controller.dispose();
		if (outcome.kind === "success") {
			child.state = "completed";
			child.result = outcome.result.kind === "text"
				? { kind: "text", value: outcome.result.value, completedAt: this.timestamp() }
				: { kind: "structured", value: clone(outcome.result.value), completedAt: this.timestamp() };
			delete child.failure;
			delete child.attention;
			child.latestActivity = this.activity("message", "Completed");
			child.usage = clone(outcome.usage);
			run.updatedAt = this.timestamp();
			await this.persist(run);
			this.emit(run);
			await this.finalizeIfSettled(run, true);
			this.pump();
			return;
		}
		await this.failChild(run, child, outcome);
	}

	private async failChild(
		run: DelegationRun,
		child: DelegatedChild,
		outcome: Extract<ChildOutcome, { kind: "failure" }>,
		startNext = true,
	): Promise<void> {
		const controller = this.active.get(child.id) ?? this.paused.get(child.id);
		this.active.delete(child.id);
		this.paused.delete(child.id);
		controller?.dispose();
		this.launchResources.delete(child.id);
		child.pending = undefined;
		if (child.state !== "cancelled" && child.state !== "interrupted") {
			child.state = "failed";
			child.failure = {
				message: outcome.message,
				...(outcome.stopReason ? { stopReason: outcome.stopReason } : {}),
				lastActivity: clone(child.latestActivity),
				...(outcome.partialOutput ? { partialOutput: outcome.partialOutput } : {}),
				failedAt: this.timestamp(),
			};
			delete child.attention;
			child.latestActivity = this.activity("waiting", `Failed: ${outcome.message}`);
			child.usage = clone(outcome.usage);
		}
		run.updatedAt = this.timestamp();
		await this.persist(run);
		this.emit(run);
		await this.finalizeIfSettled(run, true);
		if (startNext) this.pump();
	}

	private async notifyAttention(run: DelegationRun, child: DelegatedChild): Promise<void> {
		const attention = child.attention;
		if (!attention || attention.notification.state !== "pending") return;
		let outcome: DeliveryOutcome;
		try {
			outcome = await this.delivery.deliverAttention(clone(run), projectRun(run), child.id);
		} catch {
			outcome = "held:session_changed";
		}
		const current = this.runs.get(run.id);
		const currentChild = current?.children.find((candidate) => candidate.id === child.id);
		if (!current || !currentChild?.attention || currentChild.attention.id !== attention.id) return;
		currentChild.attention.notification = outcome === "delivered"
			? { state: "delivered", deliveredAt: this.timestamp() }
			: { state: "held", reason: outcome === "held:session_changed" ? "session_changed" : "user_intervened" };
		current.updatedAt = this.timestamp();
		await this.persist(current);
		this.emit(current);
	}

	private async updateActivity(runId: string, childId: string, value: Omit<Activity, "observedAt">): Promise<void> {
		const run = this.runs.get(runId);
		const child = run?.children.find((candidate) => candidate.id === childId);
		if (!run || !child || (child.state !== "starting" && child.state !== "running")) return;
		const next = this.activity(value.kind, value.summary);
		const unchanged = child.latestActivity.kind === next.kind && child.latestActivity.summary === next.summary;
		const elapsed = Math.max(0, Date.parse(next.observedAt) - Date.parse(child.latestActivity.observedAt));
		if (unchanged && elapsed < ACTIVITY_HEARTBEAT_MS) return;
		child.latestActivity = next;
		run.updatedAt = next.observedAt;
		this.emit(run);
		await this.persist(run);
	}

	private finalizeIfSettled(run: DelegationRun, notify: boolean): Promise<void> {
		const previous = this.finalizeChains.get(run.id) ?? Promise.resolve();
		const next = previous.catch(() => {}).then(async () => {
			const current = this.runs.get(run.id);
			if (!current || !notify || !canFinalize(current) || current.delivery.state !== "pending") return;
			if (await this.captureScratchContents(current)) {
				current.updatedAt = this.timestamp();
				await this.persist(current);
				this.emit(current);
			}
			try {
				const delivery = await this.delivery.deliver(clone(current), projectRun(current));
				if (delivery === "delivered") current.delivery = { state: "delivered", deliveredAt: this.timestamp() };
				else current.delivery = { state: "held", reason: delivery === "held:session_changed" ? "session_changed" : "user_intervened" };
			} catch {
				current.delivery = { state: "held", reason: "session_changed" };
			}
			current.updatedAt = this.timestamp();
			await this.persist(current);
			this.emit(current);
		});
		this.finalizeChains.set(run.id, next);
		void next.then(
			() => {
				if (this.finalizeChains.get(run.id) === next) this.finalizeChains.delete(run.id);
			},
			() => {
				if (this.finalizeChains.get(run.id) === next) this.finalizeChains.delete(run.id);
			},
		);
		return next;
	}

	private async captureScratchContents(run: DelegationRun): Promise<boolean> {
		let changed = false;
		for (const child of run.children) {
			if (child.workspace.kind !== "temporary"
				|| isGitTemporaryWorkspace(child.workspace)
				|| child.workspace.integration.state === "cleaned") continue;
			try {
				child.workspace.contents = await this.requireWorkspaceManager().inspectScratch(child.workspace);
			} catch (error) {
				child.workspace.contents = {
					entries: [],
					truncated: false,
					error: `Could not inspect scratch contents: ${clipUtf8(error instanceof Error ? error.message : String(error), 2048).value}`,
				};
			}
			changed = true;
		}
		return changed;
	}

	private waitCondition(run: DelegationRun, childId?: string): boolean {
		if (childId) {
			const child = this.requireChild(run, childId);
			return isTerminalChild(child.state) || child.state === "needs_attention";
		}
		return run.children.some((child) => child.state === "needs_attention")
			|| run.children.every((child) => isTerminalChild(child.state));
	}

	private activeOrStartingCount(): number {
		let count = this.stopping.size;
		for (const run of this.runs.values()) {
			for (const child of run.children) {
				if (child.state === "starting" || child.state === "running") count++;
			}
		}
		return count;
	}

	private async reconcileRestoredWorkspace(workspace: GitTemporaryWorkspace): Promise<boolean> {
		const manager = this.requireWorkspaceManager();
		const integration = workspace.integration;
		if (integration.state === "applying") {
			try {
				const destination = await manager.inspectDestination(workspace, integration.review);
				if (destination.kind === "base") {
					await manager.assertRevision(workspace, integration.review.revision);
					workspace.integration = { state: "review_pending", review: integration.review };
					return true;
				}
				if (destination.kind === "changed") {
					workspace.integration = { state: "conflict", review: integration.review, message: destination.message };
					return true;
				}
				workspace.integration = {
					state: "applied",
					revision: integration.review.revision,
					appliedAt: this.timestamp(),
				};
				try {
					await manager.cleanup(workspace, integration.review.revision);
				} catch (error) {
					workspace.integration = {
						...workspace.integration,
						cleanupError: error instanceof Error ? error.message : String(error),
					};
				}
				return true;
			} catch (error) {
				workspace.integration = {
					state: "conflict",
					review: integration.review,
					message: `Could not reconcile interrupted apply: ${error instanceof Error ? error.message : String(error)}`,
				};
				return true;
			}
		}
		if (integration.state === "discarding") {
			try {
				await manager.cleanup(workspace, integration.review.revision);
				workspace.integration = {
					state: "discarded",
					revision: integration.review.revision,
					discardedAt: this.timestamp(),
				};
			} catch (error) {
				workspace.integration = error instanceof WorkspaceConflictError
					? { state: "conflict", review: integration.review, message: error.message }
					: {
						state: "discarded",
						revision: integration.review.revision,
						discardedAt: this.timestamp(),
						cleanupError: error instanceof Error ? error.message : String(error),
					};
			}
			return true;
		}
		if (integration.state === "no_changes" || integration.state === "applied" || integration.state === "discarded") {
			const expected = integration.state === "no_changes" ? undefined : integration.revision;
			try {
				await manager.cleanup(workspace, expected);
				if (integration.cleanupError) {
					const recovered = { ...integration };
					delete recovered.cleanupError;
					workspace.integration = recovered;
					return true;
				}
			} catch (error) {
				if (integration.state === "no_changes" && error instanceof WorkspaceConflictError) {
					workspace.integration = { state: "working", message: error.message };
					return true;
				}
				const message = error instanceof Error ? error.message : String(error);
				if (integration.cleanupError !== message) {
					workspace.integration = { ...integration, cleanupError: message };
					return true;
				}
			}
		}
		return false;
	}

	private serializeWorkspace<T>(childId: string, operation: () => Promise<T>): Promise<T> {
		const previous = this.workspaceChains.get(childId) ?? Promise.resolve();
		const result = previous.catch(() => {}).then(operation);
		const settled = result.then(() => {}, () => {});
		this.workspaceChains.set(childId, settled);
		void settled.then(() => {
			if (this.workspaceChains.get(childId) === settled) this.workspaceChains.delete(childId);
		});
		return result;
	}

	private selectTemporary(
		run: DelegationRun,
		childId: string | undefined,
		action: string,
	): DelegatedChild & { workspace: TemporaryWorkspace } {
		const candidates = childId
			? [this.requireChild(run, childId)]
			: run.children.filter((child) => child.workspace.kind === "temporary");
		if (candidates.length !== 1) throw new Error(`${action} requires childId unless exactly one temporary workspace exists`);
		const child = candidates[0]!;
		if (child.workspace.kind !== "temporary") throw new Error(`Child ${child.id} does not use a temporary workspace`);
		return child as DelegatedChild & { workspace: TemporaryWorkspace };
	}

	private selectGitTemporary(
		run: DelegationRun,
		childId: string | undefined,
		action: string,
	): DelegatedChild & { workspace: GitTemporaryWorkspace } {
		const child = this.selectTemporary(run, childId, action);
		if (!isGitTemporaryWorkspace(child.workspace)) {
			throw new Error(`Child ${child.id} uses a scratch workspace; ${action} requires Git work`);
		}
		return child as DelegatedChild & { workspace: GitTemporaryWorkspace };
	}

	private requireWorkspaceManager(): WorkspaceManager {
		if (!this.workspaces) throw new Error("Temporary agent workspaces are unavailable");
		return this.workspaces;
	}

	private selectOne(run: DelegationRun, childId: string | undefined, state: ChildState, action: string): DelegatedChild {
		if (childId) {
			const child = this.requireChild(run, childId);
			if (child.state !== state) throw new Error(`Child ${child.id} is ${child.state}; ${action} requires ${state}`);
			return child;
		}
		const eligible = run.children.filter((child) => child.state === state);
		if (eligible.length !== 1) throw new Error(`${action} requires childId unless exactly one child is ${state}`);
		return eligible[0]!;
	}

	private requireRun(runId: string): DelegationRun {
		const run = this.runs.get(runId);
		if (!run) throw new Error(`Unknown delegation run: ${runId}`);
		return run;
	}

	private requireChild(run: DelegationRun, childId: string): DelegatedChild {
		const child = run.children.find((candidate) => candidate.id === childId);
		if (!child) throw new Error(`Run ${run.id} has no child ${childId}`);
		return child;
	}

	private pending(kind: PendingWorkKind, message?: string): PendingChildWork {
		return {
			kind,
			sequence: ++this.nextQueueSequence,
			enqueuedAt: this.timestamp(),
			...(message ? { message } : {}),
		};
	}

	private reauthorize(run: DelegationRun, origin: ParentReauthorization | undefined): void {
		if (!origin) return;
		run.parent.inputGeneration = origin.inputGeneration;
		run.parent.leafId = origin.leafId;
	}

	private nextGeneration(childId: string): number {
		const next = (this.generations.get(childId) ?? 0) + 1;
		this.generations.set(childId, next);
		return next;
	}

	private invalidateGeneration(childId: string): void {
		this.generations.set(childId, (this.generations.get(childId) ?? 0) + 1);
	}

	private async cleanupPrepared(workspaces: TemporaryWorkspace[]): Promise<unknown[]> {
		if (!this.workspaces || workspaces.length === 0) return [];
		const results = await Promise.allSettled([...workspaces].reverse().map((workspace) => this.workspaces!.cleanup(workspace)));
		return results.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
	}

	private activity(kind: Activity["kind"], summary: string): Activity {
		return { kind, summary, observedAt: this.timestamp() };
	}

	private timestamp(): string {
		return this.now().toISOString();
	}

	private emit(run: DelegationRun): void {
		const snapshot = clone(run);
		for (const listener of this.listeners) listener(snapshot);
	}

	private persist(run: DelegationRun): Promise<void> {
		const snapshot = clone(run);
		const previous = this.saveChains.get(run.id) ?? Promise.resolve();
		const next = previous.catch(() => {}).then(() => this.repository.save(snapshot));
		this.saveChains.set(run.id, next);
		void next.then(
			() => {
				if (this.saveChains.get(run.id) === next) this.saveChains.delete(run.id);
			},
			() => {
				if (this.saveChains.get(run.id) === next) this.saveChains.delete(run.id);
			},
		);
		return next;
	}
}
