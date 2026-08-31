import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { chmod, link, lstat, mkdir, readlink, readdir, realpath, rename, rm, rmdir, stat, symlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
	WorkspaceConflictError,
	type DiffSummary,
	type GitTemporaryWorkspace,
	type ScratchContentsSummary,
	type ScratchDirectoryIdentity,
	type ScratchTemporaryWorkspace,
	type TemporaryWorkspace,
	isGitTemporaryWorkspace,
	type WorkspaceDestinationInspection,
	type WorkspaceInspection,
	type WorkspaceManager,
	type WorkspacePreparationInput,
	type WorkspaceReview,
} from "./runtime.ts";

const MAX_GIT_OUTPUT_BYTES = 64 * 1024 * 1024;

interface CommandResult {
	stdout: string;
	stdoutBuffer: Buffer;
	stderr: string;
}

interface CommandOptions {
	cwd: string;
	env?: NodeJS.ProcessEnv;
	input?: string | Buffer;
	maxOutputBytes?: number;
}

function commandError(args: readonly string[], code: number | null, stderr: string): Error {
	const detail = stderr.trim();
	return new Error(`git ${args.join(" ")} failed${code === null ? "" : ` (${code})`}${detail ? `: ${detail}` : ""}`);
}

async function runGit(args: readonly string[], options: CommandOptions): Promise<CommandResult> {
	return new Promise<CommandResult>((resolve, reject) => {
		const child = spawn("git", args, {
			cwd: options.cwd,
			env: options.env ?? process.env,
			stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
		});
		if (options.input !== undefined) {
			child.stdin!.on("error", (error) => {
				if ((error as NodeJS.ErrnoException).code !== "EPIPE") reject(error);
			});
			child.stdin!.end(options.input);
		}
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		let bytes = 0;
		let exceeded = false;
		const append = (target: Buffer[], chunk: Buffer) => {
			bytes += chunk.length;
			if (bytes > (options.maxOutputBytes ?? MAX_GIT_OUTPUT_BYTES)) {
				exceeded = true;
				child.kill();
				return;
			}
			target.push(chunk);
		};
		child.stdout!.on("data", (chunk: Buffer) => append(stdout, chunk));
		child.stderr!.on("data", (chunk: Buffer) => append(stderr, chunk));
		child.once("error", reject);
		child.once("close", (code) => {
			if (exceeded) {
				reject(new Error(`git ${args.join(" ")} exceeded the ${options.maxOutputBytes ?? MAX_GIT_OUTPUT_BYTES} byte output limit`));
				return;
			}
			const output = Buffer.concat(stdout);
			const errors = Buffer.concat(stderr).toString("utf8");
			if (code !== 0) reject(commandError(args, code, errors));
			else resolve({ stdout: output.toString("utf8"), stdoutBuffer: output, stderr: errors });
		});
	});
}

async function refOid(repoRoot: string, ref: string): Promise<string | undefined> {
	try {
		return (await runGit(["rev-parse", "--verify", ref], { cwd: repoRoot })).stdout.trim();
	} catch {
		return undefined;
	}
}

async function zeroObjectId(repoRoot: string): Promise<string> {
	const format = (await runGit(["rev-parse", "--show-object-format"], { cwd: repoRoot })).stdout.trim();
	return "0".repeat(format === "sha256" ? 64 : 40);
}

async function writeGitOutput(args: readonly string[], cwd: string, destination: string): Promise<void> {
	await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
	const temporary = `${destination}.tmp-${randomUUID()}`;
	try {
		await new Promise<void>((resolve, reject) => {
			const child = spawn("git", args, { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
			const output = createWriteStream(temporary, { mode: 0o600 });
			const stderr: Buffer[] = [];
			let outputDone = false;
			let exitCode: number | null | undefined;
			let failed: Error | undefined;
			const finish = () => {
				if (!outputDone || exitCode === undefined) return;
				if (failed) reject(failed);
				else if (exitCode !== 0) reject(commandError(args, exitCode, Buffer.concat(stderr).toString("utf8")));
				else resolve();
			};
			child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
			child.once("error", (error) => {
				failed = error;
				exitCode = null;
				finish();
			});
			child.once("close", (code) => {
				exitCode = code;
				finish();
			});
			output.once("error", (error) => {
				failed = error;
				child.kill();
			});
			output.once("close", () => {
				outputDone = true;
				finish();
			});
			child.stdout.pipe(output);
		});
		await rename(temporary, destination);
	} finally {
		await rm(temporary, { force: true }).catch(() => {});
	}
}

function safeRefSegment(value: string): string {
	const segment = value
		.replace(/[^A-Za-z0-9._-]+/g, "-")
		.replace(/^[-.]+|[-.]+$/g, "")
		.slice(0, 64);
	if (!segment || segment === "." || segment === ".." || segment.endsWith(".lock")) {
		throw new Error(`Cannot derive a safe temporary branch name from ${value}`);
	}
	return segment;
}

export function temporaryWorkspaceBranch(runId: string, childId: string): string {
	return `pi-delegate/${safeRefSegment(runId)}/${safeRefSegment(childId)}`;
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await lstat(path);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
		throw error;
	}
}

interface PathIdentity {
	dev: bigint;
	ino: bigint;
}

async function pathIdentity(path: string): Promise<PathIdentity | undefined> {
	try {
		const info = await lstat(path, { bigint: true });
		return { dev: info.dev, ino: info.ino };
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw error;
	}
}

function samePathIdentity(left: PathIdentity | undefined, right: PathIdentity): boolean {
	return left?.dev === right.dev && left.ino === right.ino;
}

function persistedPathIdentity(identity: PathIdentity): ScratchDirectoryIdentity {
	return { dev: identity.dev.toString(), ino: identity.ino.toString() };
}

function hasPersistedPathIdentity(value: unknown): value is ScratchDirectoryIdentity {
	if (!value || typeof value !== "object") return false;
	const identity = value as Partial<ScratchDirectoryIdentity>;
	return typeof identity.dev === "string" && /^\d+$/.test(identity.dev)
		&& typeof identity.ino === "string" && /^\d+$/.test(identity.ino);
}

async function detectRepositoryRoot(cwd: string): Promise<string | undefined> {
	try {
		const root = (await runGit(["rev-parse", "--show-toplevel"], { cwd })).stdout.trim();
		return realpath(root);
	} catch (error) {
		if (/not a git repository/i.test(error instanceof Error ? error.message : String(error))) return undefined;
		throw error;
	}
}

async function repositoryRoot(cwd: string): Promise<string> {
	const root = await detectRepositoryRoot(cwd);
	if (!root) throw new Error(`Temporary workspace source is not inside a Git repository: ${cwd}`);
	return root;
}

function pathIsInside(root: string, candidate: string): boolean {
	const path = relative(root, candidate);
	return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

async function assertCleanRepository(repoRoot: string): Promise<void> {
	const status = (await runGit(["status", "--porcelain=v1", "--untracked-files=all"], { cwd: repoRoot })).stdout;
	if (status.trim()) throw new Error(`Temporary workspace source must be clean: ${repoRoot}`);
}

interface RegisteredWorktree {
	path: string;
	branch?: string;
}

async function registeredWorktrees(repoRoot: string): Promise<RegisteredWorktree[]> {
	const output = (await runGit(["worktree", "list", "--porcelain"], { cwd: repoRoot })).stdout;
	return output.trim().split("\n\n").flatMap((block) => {
		const fields = block.split("\n");
		const path = fields.find((line) => line.startsWith("worktree "))?.slice("worktree ".length);
		if (!path) return [];
		const branch = fields.find((line) => line.startsWith("branch "))?.slice("branch ".length);
		return [{ path, ...(branch ? { branch } : {}) }];
	});
}

async function findRegisteredWorktree(repoRoot: string, worktreePath: string): Promise<RegisteredWorktree | undefined> {
	const expected = await realpath(worktreePath).catch(() => worktreePath);
	for (const item of await registeredWorktrees(repoRoot)) {
		const actual = await realpath(item.path).catch(() => item.path);
		if (actual === expected) return item;
	}
	return undefined;
}

async function assertOwnedWorktree(workspace: GitTemporaryWorkspace): Promise<void> {
	if (!workspace.branch.startsWith("pi-delegate/")) throw new Error(`Refusing unsafe temporary branch: ${workspace.branch}`);
	const sourceRoot = await repositoryRoot(workspace.sourceCwd);
	if (sourceRoot !== workspace.repoRoot) throw new Error(`Temporary workspace repository changed: ${sourceRoot}`);
	const registration = await findRegisteredWorktree(workspace.repoRoot, workspace.worktreePath);
	if (!registration) throw new Error(`Temporary workspace is no longer registered: ${workspace.worktreePath}`);
	const expectedBranch = `refs/heads/${workspace.branch}`;
	if (registration.branch !== expectedBranch) {
		throw new Error(`Temporary workspace branch changed: expected ${expectedBranch}, found ${registration.branch ?? "detached HEAD"}`);
	}
	const tip = await refOid(workspace.repoRoot, expectedBranch);
	if (tip !== workspace.baseCommit) {
		throw new Error(`Temporary workspace branch tip changed: expected ${workspace.baseCommit}, found ${tip ?? "missing"}`);
	}
	if (!(await pathExists(workspace.worktreePath))) throw new Error(`Temporary workspace path is missing: ${workspace.worktreePath}`);
	const actualRoot = await realpath((await runGit(["rev-parse", "--show-toplevel"], { cwd: workspace.worktreePath })).stdout.trim());
	const expectedRoot = await realpath(workspace.worktreePath);
	if (actualRoot !== expectedRoot) throw new Error(`Temporary workspace Git root changed: ${actualRoot}`);
}

async function snapshotTree(cwd: string, baseCommit: string, indexPath: string): Promise<{ baseTree: string; revision: string }> {
	await mkdir(dirname(indexPath), { recursive: true, mode: 0o700 });
	await rm(indexPath, { force: true });
	const env = { ...process.env, GIT_INDEX_FILE: indexPath };
	try {
		const baseTree = (await runGit(["rev-parse", `${baseCommit}^{tree}`], { cwd, env })).stdout.trim();
		await runGit(["read-tree", baseTree], { cwd, env });
		await runGit(["add", "-A", "--", "."], { cwd, env });
		const revision = (await runGit(["write-tree"], { cwd, env })).stdout.trim();
		return { baseTree, revision };
	} finally {
		await rm(indexPath, { force: true }).catch(() => {});
	}
}

interface GitPathState {
	mode: string;
	type: string;
	oid: string;
}

function samePathState(left: GitPathState | undefined, right: GitPathState | undefined): boolean {
	return left?.mode === right?.mode && left?.type === right?.type && left?.oid === right?.oid;
}

async function treePathState(repoRoot: string, tree: string, path: string): Promise<GitPathState | undefined> {
	const output = (await runGit(["ls-tree", "-z", tree, "--", path], { cwd: repoRoot })).stdout;
	const record = output.split("\u0000").find(Boolean);
	if (!record) return undefined;
	const separator = record.indexOf("\t");
	if (separator < 0 || record.slice(separator + 1) !== path) return undefined;
	const [mode, type, oid] = record.slice(0, separator).split(" ");
	return mode && type && oid ? { mode, type, oid } : undefined;
}

async function pathState(repoRoot: string, path: string, absolute: string): Promise<GitPathState | undefined> {
	let info;
	try {
		info = await lstat(absolute);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw error;
	}
	if (info.isDirectory()) return { mode: "040000", type: "tree", oid: "<working-directory>" };
	if (info.isSymbolicLink()) {
		const target = await readlink(absolute, { encoding: "buffer" });
		const oid = (await runGit(["hash-object", "--stdin"], { cwd: repoRoot, input: target })).stdout.trim();
		return { mode: "120000", type: "blob", oid };
	}
	const mode = (info.mode & 0o111) !== 0 ? "100755" : "100644";
	const oid = (await runGit(["hash-object", `--path=${path}`, "--", absolute], { cwd: repoRoot })).stdout.trim();
	return { mode, type: "blob", oid };
}

function workingPathState(repoRoot: string, path: string): Promise<GitPathState | undefined> {
	return pathState(repoRoot, path, join(repoRoot, path));
}

async function changedPaths(repoRoot: string, baseTree: string, revision: string): Promise<string[]> {
	const output = (await runGit(["diff", "--name-status", "-z", "--find-renames", baseTree, revision, "--"], { cwd: repoRoot })).stdout;
	const fields = output.split("\u0000").filter((field) => field.length > 0);
	const paths = new Set<string>();
	for (let index = 0; index < fields.length;) {
		const status = fields[index++];
		if (!status) break;
		if (status.startsWith("R") || status.startsWith("C")) {
			const before = fields[index++];
			const after = fields[index++];
			if (before) paths.add(before);
			if (after) paths.add(after);
		} else {
			const path = fields[index++];
			if (path) paths.add(path);
		}
	}
	return [...paths];
}

function assertNoFileDirectoryTransitions(paths: readonly string[]): void {
	const changed = new Set(paths);
	for (const path of paths) {
		let parent = dirname(path);
		while (parent !== ".") {
			if (changed.has(parent)) throw new WorkspaceConflictError(`Cannot safely apply a file/directory transition at ${parent}`);
			parent = dirname(parent);
		}
	}
}

async function installCapturedNoReplace(source: string, destination: string): Promise<void> {
	await mkdir(dirname(destination), { recursive: true });
	const info = await lstat(source);
	if (info.isSymbolicLink()) {
		await symlink(await readlink(source, { encoding: "buffer" }), destination);
		return;
	}
	if (info.isFile()) {
		await link(source, destination);
		return;
	}
	if (await pathExists(destination)) throw new Error(`Concurrent path already exists: ${destination}`);
	await rename(source, destination);
}

async function installTreePathNoReplace(repoRoot: string, path: string, state: GitPathState): Promise<void> {
	if (state.type !== "blob") throw new Error(`Cannot automatically restore Git ${state.type} path: ${path}`);
	const destination = join(repoRoot, path);
	await mkdir(dirname(destination), { recursive: true });
	if (state.mode === "120000") {
		const target = (await runGit(["cat-file", "blob", state.oid], { cwd: repoRoot })).stdoutBuffer;
		await symlink(target, destination);
		return;
	}
	const temporary = join(dirname(destination), `.pi-delegate-restore-${randomUUID()}`);
	try {
		await writeGitOutput(["cat-file", "--filters", `--path=${path}`, state.oid], repoRoot, temporary);
		await chmod(temporary, state.mode === "100755" ? 0o755 : 0o644);
		await link(temporary, destination);
	} finally {
		await rm(temporary, { force: true }).catch(() => {});
	}
}

async function rollbackFailedApply(workspace: GitTemporaryWorkspace, review: WorkspaceReview, cause: unknown): Promise<string> {
	const paths = await changedPaths(workspace.repoRoot, review.baseTree, review.revision);
	const states = await Promise.all(paths.map(async (path) => ({
		path,
		before: await treePathState(workspace.repoRoot, review.baseTree, path),
		after: await treePathState(workspace.repoRoot, review.revision, path),
	})));
	const recoveryId = randomUUID();
	const recoveryDir = join(workspace.repoRoot, `.pi-delegate-rollback-${recoveryId}`);
	const reportDir = join(dirname(workspace.patchPath), `rollback-${recoveryId}`);
	await mkdir(recoveryDir, { recursive: true, mode: 0o700 });
	await mkdir(reportDir, { recursive: true, mode: 0o700 });
	const captured: Array<{ path: string; recoveryPath: string }> = [];
	const rollbackErrors: string[] = [];
	const concurrentChanges: string[] = [];

	const candidates = states
		.filter(({ before, after }) => !samePathState(before, after))
		.sort((left, right) => {
			if (left.before === undefined && right.before !== undefined) return -1;
			if (left.before !== undefined && right.before === undefined) return 1;
			return right.path.length - left.path.length;
		});
	for (const entry of candidates) {
		try {
			const destination = join(workspace.repoRoot, entry.path);
			const current = await workingPathState(workspace.repoRoot, entry.path);
			if (samePathState(current, entry.before)) continue;
			if (!samePathState(current, entry.after)) {
				concurrentChanges.push(entry.path);
				continue;
			}

			if (current !== undefined) {
				const recoveryPath = join(recoveryDir, randomUUID());
				await rename(destination, recoveryPath);
				captured.push({ path: entry.path, recoveryPath });
				const capturedState = await pathState(workspace.repoRoot, entry.path, recoveryPath);
				if (!samePathState(capturedState, entry.after)) {
					concurrentChanges.push(entry.path);
					await installCapturedNoReplace(recoveryPath, destination);
					continue;
				}
			}

			if (entry.before !== undefined) await installTreePathNoReplace(workspace.repoRoot, entry.path, entry.before);
		} catch (error) {
			rollbackErrors.push(`${entry.path}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	const addedParents = new Set<string>();
	for (const entry of states) {
		if (entry.before !== undefined || entry.after === undefined) continue;
		let parent = dirname(entry.path);
		while (parent !== ".") {
			if (await treePathState(workspace.repoRoot, review.baseTree, parent)) break;
			addedParents.add(parent);
			parent = dirname(parent);
		}
	}
	for (const parent of [...addedParents].sort((left, right) => right.length - left.length)) {
		try {
			await rmdir(join(workspace.repoRoot, parent));
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code === "ENOENT") continue;
			if (code === "ENOTEMPTY" || code === "EEXIST") {
				concurrentChanges.push(`${parent}/`);
				continue;
			}
			rollbackErrors.push(`${parent}/: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	const unresolved: string[] = [];
	for (const entry of states) {
		const current = await workingPathState(workspace.repoRoot, entry.path);
		if (!samePathState(current, entry.before) && !concurrentChanges.includes(entry.path)) unresolved.push(entry.path);
	}
	await writeFile(join(reportDir, "manifest.json"), `${JSON.stringify({
		cause: cause instanceof Error ? cause.message : String(cause),
		workingRecoveryDir: recoveryDir,
		captured,
		concurrentChanges,
		rollbackErrors,
		unresolved,
	}, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
	if (rollbackErrors.length === 0 && unresolved.length === 0) await rm(recoveryDir, { recursive: true, force: true });
	const original = cause instanceof Error ? cause.message : String(cause);
	const details = [
		concurrentChanges.length > 0 ? `preserved concurrent changes at ${concurrentChanges.join(", ")}` : "",
		rollbackErrors.length > 0 ? `rollback errors: ${rollbackErrors.join("; ")}` : "",
		unresolved.length > 0 ? `unresolved agent changes at ${unresolved.join(", ")}` : "",
	].filter(Boolean).join("; ");
	return `Apply failed${details ? `; ${details}` : " and destination was restored"}. Recovery: ${reportDir}. Cause: ${original}`;
}

function parseSummary(value: string): DiffSummary {
	const stat = value.trim() || "No textual diff statistics available";
	const filesChanged = Number(/(\d+) files? changed/.exec(value)?.[1] ?? 0);
	const additions = Number(/(\d+) insertions?\(\+\)/.exec(value)?.[1] ?? 0);
	const deletions = Number(/(\d+) deletions?\(-\)/.exec(value)?.[1] ?? 0);
	return { filesChanged, additions, deletions, stat };
}

async function writeReviewArtifacts(
	workspace: GitTemporaryWorkspace,
	baseTree: string,
	revision: string,
): Promise<DiffSummary> {
	const diffArgs = ["diff", "--binary", "--full-index", "--find-renames", "--no-ext-diff", baseTree, revision, "--"];
	await writeGitOutput(diffArgs, workspace.repoRoot, workspace.patchPath);
	const shortStat = (await runGit(["diff", "--shortstat", baseTree, revision, "--"], { cwd: workspace.repoRoot })).stdout;
	const nameStatus = (await runGit(["diff", "--name-status", "--find-renames", baseTree, revision, "--"], {
		cwd: workspace.repoRoot,
	})).stdout;
	const summary = parseSummary(shortStat);
	await mkdir(dirname(workspace.manifestPath), { recursive: true, mode: 0o700 });
	await writeFile(workspace.manifestPath, `${JSON.stringify({
		schemaVersion: 1,
		baseCommit: workspace.baseCommit,
		baseTree,
		revision,
		summary,
		changes: nameStatus.split("\n").filter(Boolean),
	}, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
	return summary;
}

async function cleanupTemporaryWorkspace(workspace: GitTemporaryWorkspace, expectedRevision?: string): Promise<void> {
	await rm(`${workspace.patchPath}.index`, { force: true }).catch(() => {});
	await rm(`${workspace.patchPath}.destination.index`, { force: true }).catch(() => {});
	if (!workspace.branch.startsWith("pi-delegate/")) throw new Error(`Refusing unsafe temporary branch: ${workspace.branch}`);
	const sourceRoot = await repositoryRoot(workspace.sourceCwd);
	if (sourceRoot !== workspace.repoRoot) throw new Error(`Temporary workspace repository changed: ${sourceRoot}`);
	const branchRef = `refs/heads/${workspace.branch}`;
	const registration = await findRegisteredWorktree(workspace.repoRoot, workspace.worktreePath);
	if (registration) {
		if (registration.branch !== branchRef) {
			throw new WorkspaceConflictError(`Refusing to remove a temporary workspace whose branch changed to ${registration.branch ?? "detached HEAD"}`);
		}
		const tip = await refOid(workspace.repoRoot, branchRef);
		if (tip !== workspace.baseCommit) {
			throw new WorkspaceConflictError(`Refusing cleanup because ${branchRef} changed from ${workspace.baseCommit} to ${tip ?? "missing"}`);
		}
		const current = await snapshotTree(workspace.worktreePath, workspace.baseCommit, `${workspace.patchPath}.index`);
		const expected = expectedRevision ?? current.baseTree;
		if (current.revision !== expected) {
			throw new WorkspaceConflictError(`Temporary workspace changed before cleanup: expected ${expected}, found ${current.revision}`);
		}
		await runGit(["worktree", "remove", "--force", workspace.worktreePath], { cwd: workspace.repoRoot });
	} else if (await pathExists(workspace.worktreePath)) {
		throw new WorkspaceConflictError(`Refusing to remove an unregistered temporary workspace: ${workspace.worktreePath}`);
	}
	const tip = await refOid(workspace.repoRoot, branchRef);
	if (tip !== undefined) {
		if (tip !== workspace.baseCommit) {
			throw new WorkspaceConflictError(`Refusing to delete repurposed branch ${branchRef}: expected ${workspace.baseCommit}, found ${tip}`);
		}
		await runGit(["update-ref", "-d", branchRef, workspace.baseCommit], { cwd: workspace.repoRoot });
	}
}

async function cleanupFailedPreparation(
	workspace: GitTemporaryWorkspace,
	setupIdentity: PathIdentity,
	branchOwned: boolean,
): Promise<void> {
	if (!workspace.branch.startsWith("pi-delegate/")) throw new Error(`Refusing unsafe temporary branch: ${workspace.branch}`);
	const sourceRoot = await repositoryRoot(workspace.sourceCwd);
	if (sourceRoot !== workspace.repoRoot) throw new Error(`Temporary workspace repository changed: ${sourceRoot}`);
	const branchRef = `refs/heads/${workspace.branch}`;
	const registration = await findRegisteredWorktree(workspace.repoRoot, workspace.worktreePath);
	const currentIdentity = await pathIdentity(workspace.worktreePath);
	const conflicts: string[] = [];

	if (!currentIdentity) {
		conflicts.push(`setup path was removed at ${workspace.worktreePath}`);
		if (registration) {
			await runGit(["worktree", "prune", "--expire", "now"], { cwd: workspace.repoRoot });
			if (await findRegisteredWorktree(workspace.repoRoot, workspace.worktreePath)) {
				conflicts.push(`could not clear missing worktree registration for ${workspace.worktreePath}`);
			}
		}
	} else if (!samePathIdentity(currentIdentity, setupIdentity)) {
		conflicts.push(`setup path ownership changed at ${workspace.worktreePath}`);
	} else if (registration) {
		if (registration.branch !== branchRef) {
			conflicts.push(`worktree branch changed to ${registration.branch ?? "detached HEAD"}`);
		} else if (!branchOwned) {
			conflicts.push("worktree registration exists without an owned temporary branch");
		} else {
			await runGit(["worktree", "remove", "--force", workspace.worktreePath], { cwd: workspace.repoRoot });
		}
	} else {
		await rm(workspace.worktreePath, { recursive: true, force: true });
	}

	if (branchOwned) {
		const tip = await refOid(workspace.repoRoot, branchRef);
		if (tip !== undefined) {
			if (tip !== workspace.baseCommit) {
				conflicts.push(`refusing to delete repurposed branch ${branchRef}: expected ${workspace.baseCommit}, found ${tip}`);
			} else {
				await runGit(["update-ref", "-d", branchRef, workspace.baseCommit], { cwd: workspace.repoRoot });
			}
		}
	}
	if (conflicts.length > 0) throw new WorkspaceConflictError(`Failed setup cleanup conflict: ${conflicts.join("; ")}`);
}

interface TemporaryRoot {
	configuredPath: string;
	canonicalPath: string;
	identity: PathIdentity;
}

async function createScratchWorkspace(
	input: WorkspacePreparationInput,
	sourceCwd: string,
	temporaryRoot: TemporaryRoot,
): Promise<ScratchTemporaryWorkspace> {
	const configuredRoot = temporaryRoot.configuredPath;
	const candidate = resolve(input.worktreePath);
	if (!pathIsInside(configuredRoot, candidate) || candidate === configuredRoot) {
		throw new Error(`Scratch workspace path is outside the delegate temporary root: ${input.worktreePath}`);
	}
	if (await pathExists(candidate)) throw new Error(`Temporary workspace path already exists: ${candidate}`);
	const canonicalRoot = temporaryRoot.canonicalPath;
	await mkdir(dirname(candidate), { recursive: true, mode: 0o700 });
	const canonicalParent = await realpath(dirname(candidate));
	const expectedParent = resolve(canonicalRoot, relative(configuredRoot, dirname(candidate)));
	if (canonicalParent !== expectedParent) {
		throw new Error(`Scratch workspace parent escapes the delegate temporary root: ${input.worktreePath}`);
	}
	await mkdir(candidate, { mode: 0o700 });
	const directoryIdentity = await pathIdentity(candidate);
	if (!directoryIdentity) throw new Error(`Scratch workspace disappeared during creation: ${input.worktreePath}`);
	return {
		kind: "temporary",
		sourceCwd,
		worktreePath: input.worktreePath,
		directoryIdentity: persistedPathIdentity(directoryIdentity),
		integration: { state: "working" },
	};
}

async function ownedScratchDirectory(
	workspace: ScratchTemporaryWorkspace,
	temporaryRoot: TemporaryRoot,
): Promise<string | undefined> {
	const configuredRoot = temporaryRoot.configuredPath;
	const candidate = resolve(workspace.worktreePath);
	if (!pathIsInside(configuredRoot, candidate) || candidate === configuredRoot) {
		throw new WorkspaceConflictError(`Scratch workspace is outside the delegate temporary root: ${workspace.worktreePath}`);
	}
	let info;
	try {
		info = await lstat(candidate, { bigint: true });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw error;
	}
	if (info.isSymbolicLink() || !info.isDirectory()) {
		throw new WorkspaceConflictError(`Scratch workspace was replaced: ${workspace.worktreePath}`);
	}
	const candidateRepository = await detectRepositoryRoot(candidate);
	if (candidateRepository) {
		const registration = await findRegisteredWorktree(candidateRepository, candidate);
		if (registration) {
			throw new WorkspaceConflictError(`Scratch path is a registered Git worktree: ${workspace.worktreePath}`);
		}
	}
	if (!hasPersistedPathIdentity(workspace.directoryIdentity)) {
		throw new WorkspaceConflictError(`Scratch workspace has no valid persisted identity: ${workspace.worktreePath}`);
	}
	const currentIdentity = await pathIdentity(candidate);
	if (!currentIdentity
		|| currentIdentity.dev.toString() !== workspace.directoryIdentity.dev
		|| currentIdentity.ino.toString() !== workspace.directoryIdentity.ino) {
		throw new WorkspaceConflictError(`Scratch workspace identity changed: ${workspace.worktreePath}`);
	}
	const canonicalCandidate = await realpath(candidate);
	const expectedCandidate = resolve(temporaryRoot.canonicalPath, relative(configuredRoot, candidate));
	if (canonicalCandidate !== expectedCandidate || canonicalCandidate === temporaryRoot.canonicalPath) {
		throw new WorkspaceConflictError(`Scratch workspace uses a replaced path: ${workspace.worktreePath}`);
	}
	return candidate;
}

async function inspectScratchWorkspace(
	workspace: ScratchTemporaryWorkspace,
	temporaryRoot: TemporaryRoot,
): Promise<ScratchContentsSummary> {
	const root = await ownedScratchDirectory(workspace, temporaryRoot);
	if (!root) return { entries: [], truncated: false, error: "Scratch workspace is missing" };
	const entries: string[] = [];
	const directories = [""];
	let bytes = 0;
	let truncated = false;
	while (directories.length > 0 && entries.length < 128 && bytes < 8 * 1024) {
		const directory = directories.shift()!;
		const children = await readdir(join(root, directory), { withFileTypes: true });
		children.sort((left, right) => left.name.localeCompare(right.name));
		for (const child of children) {
			const path = directory ? `${directory}/${child.name}` : child.name;
			const display = child.isDirectory() ? `${path}/` : child.isSymbolicLink() ? `${path}@` : path;
			const size = Buffer.byteLength(display, "utf8");
			if (entries.length >= 128 || bytes + size > 8 * 1024) {
				truncated = true;
				break;
			}
			entries.push(display);
			bytes += size;
			if (child.isDirectory()) directories.push(path);
		}
	}
	if (directories.length > 0) truncated = true;
	if (!await ownedScratchDirectory(workspace, temporaryRoot)) {
		throw new WorkspaceConflictError(`Scratch workspace changed during inspection: ${workspace.worktreePath}`);
	}
	return { entries, truncated };
}

function scratchQuarantineRoot(workspace: ScratchTemporaryWorkspace, candidate: string): string {
	if (!hasPersistedPathIdentity(workspace.directoryIdentity)) {
		throw new WorkspaceConflictError(`Scratch workspace has no valid persisted identity: ${workspace.worktreePath}`);
	}
	return `${candidate}.cleanup-${workspace.directoryIdentity.dev}-${workspace.directoryIdentity.ino}`;
}

async function cleanupQuarantinedScratch(
	workspace: ScratchTemporaryWorkspace,
	candidate: string,
	quarantineRoot: string,
): Promise<boolean> {
	let rootInfo;
	try {
		rootInfo = await lstat(quarantineRoot);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
		throw error;
	}
	if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) {
		throw new WorkspaceConflictError(`Scratch cleanup quarantine was replaced: ${quarantineRoot}`);
	}
	const quarantined = join(quarantineRoot, "workspace");
	if (!await pathExists(quarantined)) {
		const candidateExists = await pathExists(candidate);
		const entries = await readdir(quarantineRoot);
		if (!candidateExists) {
			if (entries.length === 0) await rmdir(quarantineRoot).catch(() => {});
			return true;
		}
		if (entries.length > 0) {
			throw new WorkspaceConflictError(`Scratch cleanup quarantine contains unrelated data: ${quarantineRoot}`);
		}
		try {
			await rmdir(quarantineRoot);
			return false;
		} catch {
			throw new WorkspaceConflictError(`Scratch cleanup quarantine changed concurrently: ${quarantineRoot}`);
		}
	}
	const repository = await detectRepositoryRoot(quarantined);
	if (repository) {
		const registration = await findRegisteredWorktree(repository, quarantined)
			?? await findRegisteredWorktree(repository, candidate);
		if (registration) throw new WorkspaceConflictError(`Scratch cleanup preserved a registered Git worktree at ${quarantined}`);
	}
	const identity = await pathIdentity(quarantined);
	if (!identity
		|| identity.dev.toString() !== workspace.directoryIdentity.dev
		|| identity.ino.toString() !== workspace.directoryIdentity.ino) {
		throw new WorkspaceConflictError(`Scratch cleanup preserved a replacement at ${quarantined}`);
	}
	await rm(quarantined, { recursive: true });
	try {
		await rmdir(quarantineRoot);
	} catch {
		throw new WorkspaceConflictError(`Scratch cleanup quarantine contains unrelated data: ${quarantineRoot}`);
	}
	return true;
}

async function cleanupScratchWorkspace(workspace: ScratchTemporaryWorkspace, temporaryRoot: TemporaryRoot): Promise<void> {
	const configuredRoot = temporaryRoot.configuredPath;
	const candidatePath = resolve(workspace.worktreePath);
	if (!pathIsInside(configuredRoot, candidatePath) || candidatePath === configuredRoot) {
		throw new WorkspaceConflictError(`Scratch workspace is outside the delegate temporary root: ${workspace.worktreePath}`);
	}
	if (!hasPersistedPathIdentity(workspace.directoryIdentity)) {
		await ownedScratchDirectory(workspace, temporaryRoot);
		throw new WorkspaceConflictError(`Scratch workspace has no valid persisted identity: ${workspace.worktreePath}`);
	}
	const quarantineRoot = scratchQuarantineRoot(workspace, candidatePath);
	if (await cleanupQuarantinedScratch(workspace, candidatePath, quarantineRoot)) return;
	const candidate = await ownedScratchDirectory(workspace, temporaryRoot);
	if (!candidate) return;
	try {
		await mkdir(quarantineRoot, { mode: 0o700 });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") {
			throw new WorkspaceConflictError(`Scratch cleanup quarantine appeared concurrently: ${quarantineRoot}`);
		}
		throw error;
	}
	try {
		await rename(candidate, join(quarantineRoot, "workspace"));
	} catch (error) {
		await rmdir(quarantineRoot).catch(() => {});
		throw error;
	}
	await cleanupQuarantinedScratch(workspace, candidate, quarantineRoot);
}

export class GitWorkspaceManager implements WorkspaceManager {
	private readonly temporaryRootPath: string | undefined;
	private temporaryRoot: TemporaryRoot | undefined;

	constructor(temporaryRoot?: string) {
		this.temporaryRootPath = temporaryRoot;
	}

	async prepare(input: WorkspacePreparationInput): Promise<TemporaryWorkspace> {
		const sourceCwd = await realpath(input.sourceCwd);
		const repoRoot = await detectRepositoryRoot(sourceCwd);
		if (!repoRoot) {
			return createScratchWorkspace(input, sourceCwd, await this.requireTemporaryRoot(true));
		}
		const relativeCwd = relative(repoRoot, sourceCwd);
		if (relativeCwd === ".." || relativeCwd.startsWith(`..${sep}`) || isAbsolute(relativeCwd)) {
			throw new Error(`Temporary workspace source is outside its repository: ${sourceCwd}`);
		}
		await assertCleanRepository(repoRoot);
		if (await pathExists(input.worktreePath)) throw new Error(`Temporary workspace path already exists: ${input.worktreePath}`);
		const baseCommit = (await runGit(["rev-parse", "HEAD^{commit}"], { cwd: repoRoot })).stdout.trim();
		const workspace: GitTemporaryWorkspace = {
			kind: "temporary",
			sourceCwd,
			repoRoot,
			relativeCwd,
			worktreePath: input.worktreePath,
			branch: temporaryWorkspaceBranch(input.runId, input.childId),
			baseCommit,
			patchPath: input.patchPath,
			manifestPath: input.manifestPath,
			integration: { state: "working" },
		};
		await mkdir(dirname(input.worktreePath), { recursive: true, mode: 0o700 });
		await mkdir(dirname(input.patchPath), { recursive: true, mode: 0o700 });
		const hooksPath = join(dirname(input.patchPath), "empty-hooks");
		await rm(hooksPath, { recursive: true, force: true });
		await mkdir(hooksPath, { recursive: true, mode: 0o700 });
		const branchRef = `refs/heads/${workspace.branch}`;
		if (await refOid(repoRoot, branchRef)) throw new Error(`Temporary workspace branch already exists: ${workspace.branch}`);
		await mkdir(workspace.worktreePath, { mode: 0o700 });
		const setupIdentity = await pathIdentity(workspace.worktreePath);
		if (!setupIdentity) throw new Error(`Could not reserve temporary workspace path: ${workspace.worktreePath}`);
		let branchOwned = false;
		try {
			await runGit(["update-ref", branchRef, baseCommit, await zeroObjectId(repoRoot)], { cwd: repoRoot });
			branchOwned = true;
			await runGit(["-c", `core.hooksPath=${hooksPath}`, "worktree", "add", workspace.worktreePath, workspace.branch], { cwd: repoRoot });
			if (!samePathIdentity(await pathIdentity(workspace.worktreePath), setupIdentity)) {
				throw new WorkspaceConflictError(`Temporary workspace path ownership changed during setup: ${workspace.worktreePath}`);
			}
			const childCwd = relativeCwd ? join(workspace.worktreePath, relativeCwd) : workspace.worktreePath;
			if (!(await stat(childCwd)).isDirectory()) throw new Error(`Temporary child working directory is unavailable: ${childCwd}`);
			return workspace;
		} catch (error) {
			try {
				await cleanupFailedPreparation(workspace, setupIdentity, branchOwned);
			} catch (cleanupError) {
				throw new AggregateError([error, cleanupError], "Temporary workspace creation and cleanup failed");
			}
			throw error;
		}
	}

	async inspect(workspace: GitTemporaryWorkspace): Promise<WorkspaceInspection> {
		await assertOwnedWorktree(workspace);
		const snapshot = await snapshotTree(workspace.worktreePath, workspace.baseCommit, `${workspace.patchPath}.index`);
		if (snapshot.revision === snapshot.baseTree) return { kind: "no_changes" };
		const summary = await writeReviewArtifacts(workspace, snapshot.baseTree, snapshot.revision);
		return {
			kind: "changes",
			review: {
				revision: snapshot.revision,
				baseTree: snapshot.baseTree,
				summary,
				patchPath: workspace.patchPath,
				manifestPath: workspace.manifestPath,
			},
		};
	}

	async inspectDestination(workspace: GitTemporaryWorkspace, review: WorkspaceReview): Promise<WorkspaceDestinationInspection> {
		const currentRoot = await repositoryRoot(workspace.sourceCwd);
		if (currentRoot !== workspace.repoRoot) {
			return { kind: "changed", message: `Destination repository changed: expected ${workspace.repoRoot}, found ${currentRoot}` };
		}
		const currentHead = (await runGit(["rev-parse", "HEAD^{commit}"], { cwd: workspace.repoRoot })).stdout.trim();
		if (currentHead !== workspace.baseCommit) {
			return { kind: "changed", message: `Destination HEAD changed: expected ${workspace.baseCommit}, found ${currentHead}` };
		}
		const current = await snapshotTree(workspace.repoRoot, workspace.baseCommit, `${workspace.patchPath}.destination.index`);
		if (current.revision === review.baseTree) return { kind: "base", revision: current.revision };
		if (current.revision === review.revision) return { kind: "reviewed", revision: current.revision };
		return {
			kind: "changed",
			revision: current.revision,
			message: `Destination tree ${current.revision} matches neither base ${review.baseTree} nor reviewed revision ${review.revision}`,
		};
	}

	async assertRevision(workspace: GitTemporaryWorkspace, revision: string): Promise<void> {
		await assertOwnedWorktree(workspace);
		const current = await snapshotTree(workspace.worktreePath, workspace.baseCommit, `${workspace.patchPath}.index`);
		if (current.revision !== revision) {
			throw new Error(`Temporary workspace changed after review: expected ${revision}, found ${current.revision}`);
		}
	}

	async apply(workspace: GitTemporaryWorkspace, review: WorkspaceReview): Promise<void> {
		await this.assertRevision(workspace, review.revision);
		const currentRoot = await repositoryRoot(workspace.sourceCwd);
		if (currentRoot !== workspace.repoRoot) {
			throw new WorkspaceConflictError(`Destination repository changed: expected ${workspace.repoRoot}, found ${currentRoot}`);
		}
		const currentHead = (await runGit(["rev-parse", "HEAD^{commit}"], { cwd: workspace.repoRoot })).stdout.trim();
		if (currentHead !== workspace.baseCommit) {
			throw new WorkspaceConflictError(`Destination HEAD changed: expected ${workspace.baseCommit}, found ${currentHead}`);
		}
		const status = (await runGit(["status", "--porcelain=v1", "--untracked-files=all"], { cwd: workspace.repoRoot })).stdout;
		if (status.trim()) throw new WorkspaceConflictError("Destination worktree changed after temporary workspace creation");
		assertNoFileDirectoryTransitions(await changedPaths(workspace.repoRoot, review.baseTree, review.revision));
		await writeGitOutput(
			["diff", "--binary", "--full-index", "--find-renames", "--no-ext-diff", review.baseTree, review.revision, "--"],
			workspace.repoRoot,
			workspace.patchPath,
		);
		try {
			await runGit(["apply", "--check", "--binary", workspace.patchPath], { cwd: workspace.repoRoot });
			await runGit(["apply", "--binary", workspace.patchPath], { cwd: workspace.repoRoot });
			const applied = await snapshotTree(workspace.repoRoot, workspace.baseCommit, `${workspace.patchPath}.destination.index`);
			if (applied.revision !== review.revision) {
				throw new Error(`Applied destination tree ${applied.revision} does not match reviewed revision ${review.revision}`);
			}
		} catch (error) {
			throw new WorkspaceConflictError(await rollbackFailedApply(workspace, review, error));
		}
	}

	async inspectScratch(workspace: ScratchTemporaryWorkspace): Promise<ScratchContentsSummary> {
		return inspectScratchWorkspace(workspace, await this.requireTemporaryRoot(false));
	}

	async cleanup(workspace: TemporaryWorkspace, expectedRevision?: string): Promise<void> {
		if (isGitTemporaryWorkspace(workspace)) return cleanupTemporaryWorkspace(workspace, expectedRevision);
		return cleanupScratchWorkspace(workspace, await this.requireTemporaryRoot(false));
	}

	private async requireTemporaryRoot(create: boolean): Promise<TemporaryRoot> {
		if (!this.temporaryRootPath) throw new Error("Scratch workspaces require a configured delegate temporary root");
		const configuredPath = resolve(this.temporaryRootPath);
		if (create) await mkdir(configuredPath, { recursive: true, mode: 0o700 });
		let info;
		try {
			info = await lstat(configuredPath, { bigint: true });
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				throw new WorkspaceConflictError("Delegate temporary root is missing");
			}
			throw error;
		}
		if (info.isSymbolicLink() || !info.isDirectory()) {
			throw new WorkspaceConflictError("Delegate temporary root was replaced");
		}
		const identity = { dev: info.dev, ino: info.ino };
		const canonicalPath = await realpath(configuredPath);
		if (this.temporaryRoot
			&& (!samePathIdentity(this.temporaryRoot.identity, identity)
				|| this.temporaryRoot.canonicalPath !== canonicalPath)) {
			throw new WorkspaceConflictError("Delegate temporary root identity changed");
		}
		this.temporaryRoot ??= { configuredPath, canonicalPath, identity };
		return this.temporaryRoot;
	}
}

export function createGitWorkspaceManager(temporaryRoot?: string): WorkspaceManager {
	return new GitWorkspaceManager(temporaryRoot);
}
