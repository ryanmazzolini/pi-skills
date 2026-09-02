import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import {
	RUN_SCHEMA_VERSION,
	type DelegationRun,
	hasTemporaryWorkspaceEnvelope,
	isGitTemporaryWorkspace,
	type RunPaths,
	type RunRepository,
} from "./runtime.ts";
import { temporaryWorkspaceBranch } from "./workspace.ts";

function safeSegment(value: string): string {
	const safe = value.replace(/[^A-Za-z0-9._-]/g, "_");
	if (!safe || safe === "." || safe === "..") throw new Error(`Unsafe delegation path segment: ${value}`);
	return safe;
}

function normalizeDelegationRun(value: unknown): DelegationRun | undefined {
	if (!value || typeof value !== "object") return undefined;
	const candidate = value as Record<string, unknown>;
	if (candidate.schemaVersion === 1) {
		const children = Array.isArray(candidate.children) ? candidate.children : [];
		for (const value of children) {
			if (!value || typeof value !== "object") continue;
			const child = value as { resolved?: { skills?: unknown[] } };
			if (!child.resolved || !Array.isArray(child.resolved.skills)) continue;
			child.resolved.skills = child.resolved.skills
				.filter((skill): skill is string | { name: string; filePath: string } =>
					typeof skill === "string"
					|| (!!skill && typeof skill === "object" && typeof (skill as { name?: unknown }).name === "string"),
				)
				.map((skill) => typeof skill === "string" ? { name: skill, filePath: "" } : skill);
		}
	}
	if (candidate.schemaVersion === 1 || candidate.schemaVersion === 2 || candidate.schemaVersion === 3) {
		candidate.schemaVersion = RUN_SCHEMA_VERSION;
	}
	const run = candidate as unknown as Partial<DelegationRun>;
	if (run.schemaVersion !== RUN_SCHEMA_VERSION
		|| typeof run.id !== "string"
		|| typeof run.recordRef !== "string"
		|| typeof run.parent?.sessionId !== "string"
		|| !Array.isArray(run.children)
		|| typeof run.delivery?.state !== "string") return undefined;
	return run as DelegationRun;
}

export class FileRunRepository implements RunRepository {
	private readonly rootDir: string;
	private readonly onDiagnostic: (message: string) => void;
	private readonly temporaryRoot: string | undefined;
	private readonly loadedEnvelopeKeys = new Set<string>();

	constructor(
		rootDir: string,
		onDiagnostic: (message: string) => void = console.warn,
		temporaryRoot?: string,
	) {
		this.rootDir = rootDir;
		this.onDiagnostic = onDiagnostic;
		this.temporaryRoot = temporaryRoot ? resolve(temporaryRoot) : undefined;
	}

	paths(parentSessionId: string, runId: string, childId: string): RunPaths {
		const runDir = this.runDir(parentSessionId, runId);
		const safeChildId = safeSegment(childId);
		return {
			runFile: join(runDir, "run.json"),
			childSessionDir: join(runDir, "children", safeChildId),
			patchFile: join(runDir, "patches", `${safeChildId}.patch`),
			manifestFile: join(runDir, "patches", `${safeChildId}.manifest.json`),
		};
	}

	async save(run: DelegationRun): Promise<void> {
		this.validateRunPaths(run);
		const runDir = this.runDir(run.parent.sessionId, run.id);
		const runFile = join(runDir, "run.json");
		await mkdir(runDir, { recursive: true, mode: 0o700 });
		for (const child of run.children) {
			await mkdir(child.sessionDir, { recursive: true, mode: 0o700 });
		}
		const temporary = `${runFile}.tmp-${randomUUID()}`;
		try {
			await writeFile(temporary, `${JSON.stringify(run, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
			await rename(temporary, runFile);
		} finally {
			await rm(temporary, { force: true }).catch(() => {});
		}
	}

	async list(parentSessionId: string): Promise<DelegationRun[]> {
		const parentDir = this.parentDir(parentSessionId);
		let entries;
		try {
			entries = await readdir(parentDir, { withFileTypes: true });
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
			throw error;
		}

		const runs: DelegationRun[] = [];
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			try {
				const raw = await readFile(join(parentDir, entry.name, "run.json"), "utf8");
				const value = normalizeDelegationRun(JSON.parse(raw) as unknown);
				if (!value) throw new Error("unsupported or invalid run record");
				if (value.parent.sessionId !== parentSessionId) continue;
				this.validateRunPaths(value, true);
				this.rememberEnvelopeKeys(value);
				runs.push(value);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
				const message = error instanceof Error ? error.message : String(error);
				this.onDiagnostic(`Skipped unreadable delegation run ${entry.name}: ${message}`);
			}
		}
		return runs.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
	}

	private validateRunPaths(run: DelegationRun, allowForeignEnvelopes = false): void {
		const expectedRunFile = join(this.runDir(run.parent.sessionId, run.id), "run.json");
		if (run.recordRef !== expectedRunFile) throw new Error(`Delegation run ${run.id} has an invalid record path`);
		for (const child of run.children) {
			const expected = this.paths(run.parent.sessionId, run.id, child.id);
			if (child.sessionDir !== expected.childSessionDir) {
				throw new Error(`Delegation child ${child.id} has an invalid session path`);
			}
			if (child.workspace.kind === "temporary") {
				if (hasTemporaryWorkspaceEnvelope(child.workspace)) {
					const envelopeRoot = resolve(child.workspace.envelope.rootPath);
					const root = this.temporaryRoot;
					const path = root ? relative(root, envelopeRoot) : "..";
					const insideRoot = root !== undefined
						&& path !== ""
						&& path !== ".."
						&& !path.startsWith(`..${sep}`)
						&& !isAbsolute(path);
					const knownEnvelope = this.loadedEnvelopeKeys.has(this.envelopeKey(
						run.parent.sessionId,
						run.id,
						child.id,
						child.workspace.envelope.rootPath,
						child.workspace.envelope.ownerToken,
						child.workspace.envelope.directoryIdentity?.dev ?? "",
						child.workspace.envelope.directoryIdentity?.ino ?? "",
					));
					if ((!insideRoot && !allowForeignEnvelopes && !knownEnvelope)
						|| child.workspace.envelope.rootPath !== envelopeRoot
						|| child.workspace.worktreePath !== join(envelopeRoot, "workspace")
						|| !/^[A-Za-z0-9._-]{1,128}$/.test(child.workspace.envelope.ownerToken)
						|| !/^\d+$/.test(child.workspace.envelope.directoryIdentity?.dev ?? "")
						|| !/^\d+$/.test(child.workspace.envelope.directoryIdentity?.ino ?? "")) {
						throw new Error(`Delegation child ${child.id} has invalid temporary workspace ownership`);
					}
				} else {
					const legacyWorktreeDir = join(this.runDir(run.parent.sessionId, run.id), "worktrees", safeSegment(child.id));
					if (child.workspace.worktreePath !== legacyWorktreeDir) {
						throw new Error(`Delegation child ${child.id} has invalid temporary workspace ownership`);
					}
				}
				if (isGitTemporaryWorkspace(child.workspace)
					&& (child.workspace.patchPath !== expected.patchFile
						|| child.workspace.manifestPath !== expected.manifestFile
						|| child.workspace.branch !== temporaryWorkspaceBranch(run.id, child.id))) {
					throw new Error(`Delegation child ${child.id} has invalid temporary workspace ownership`);
				}
			}
		}
	}

	private rememberEnvelopeKeys(run: DelegationRun): void {
		for (const child of run.children) {
			if (child.workspace.kind !== "temporary" || !hasTemporaryWorkspaceEnvelope(child.workspace)) continue;
			this.loadedEnvelopeKeys.add(this.envelopeKey(
				run.parent.sessionId,
				run.id,
				child.id,
				child.workspace.envelope.rootPath,
				child.workspace.envelope.ownerToken,
				child.workspace.envelope.directoryIdentity?.dev ?? "",
				child.workspace.envelope.directoryIdentity?.ino ?? "",
			));
		}
	}

	private envelopeKey(
		parentSessionId: string,
		runId: string,
		childId: string,
		rootPath: string,
		ownerToken: string,
		device: string,
		inode: string,
	): string {
		return JSON.stringify([parentSessionId, runId, childId, rootPath, ownerToken, device, inode]);
	}

	private parentDir(parentSessionId: string): string {
		return join(this.rootDir, safeSegment(parentSessionId));
	}

	private runDir(parentSessionId: string, runId: string): string {
		return join(this.parentDir(parentSessionId), safeSegment(runId));
	}
}

export function createFileRunRepository(
	rootDir: string,
	onDiagnostic?: (message: string) => void,
	temporaryRoot?: string,
): RunRepository {
	return new FileRunRepository(rootDir, onDiagnostic, temporaryRoot);
}
