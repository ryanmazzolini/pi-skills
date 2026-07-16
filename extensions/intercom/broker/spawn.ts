import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { chmod, link, lstat, mkdir, open, unlink } from "node:fs/promises";
import net from "node:net";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getIntercomPaths, type IntercomPaths } from "./paths.ts";

const DEFAULT_WAIT_MS = 5_000;
const DEFAULT_LOCK_STALE_MS = 30_000;
const MAX_OWNERSHIP_FILE_BYTES = 4_096;

export interface SpawnBrokerOptions {
	paths?: IntercomPaths;
	serverPath?: string;
	waitMs?: number;
	env?: NodeJS.ProcessEnv;
	lockStaleMs?: number;
}

export interface BrokerSpawnResult {
	reused: boolean;
	pid?: number;
}

function sleep(milliseconds: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function processIsAlive(pid: number): boolean {
	if (!Number.isSafeInteger(pid) || pid <= 0) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
}

type BrokerProbe = "healthy" | "absent" | "unknown";

function probeBroker(socketPath: string, timeoutMs: number): Promise<BrokerProbe> {
	// Deliberately acceptance-only: registering would create noisy legacy presence. An incompatible
	// accepting listener is surfaced by client registration/status and is safer than live-owner takeover.
	return new Promise((resolve) => {
		const socket = net.connect(socketPath);
		let settled = false;
		const finish = (result: BrokerProbe) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			socket.removeAllListeners();
			if (!socket.destroyed) socket.destroy();
			resolve(result);
		};
		const timeout = setTimeout(() => finish("unknown"), timeoutMs);
		socket.once("connect", () => finish("healthy"));
		socket.once("error", (error: NodeJS.ErrnoException) => {
			finish(error.code === "ENOENT" || error.code === "ECONNREFUSED" ? "absent" : "unknown");
		});
	});
}

export async function isBrokerHealthy(socketPath = getIntercomPaths().socketPath, timeoutMs = 500): Promise<boolean> {
	return await probeBroker(socketPath, timeoutMs) === "healthy";
}

interface FileIdentity {
	dev: number;
	ino: number;
}

interface CheckedOwnershipFile extends FileIdentity {
	contents: string;
	mtimeMs: number;
}

type OwnershipFileState =
	| { state: "missing" }
	| { state: "unsafe"; reason: string }
	| { state: "checked"; file: CheckedOwnershipFile };

type LockOwnership = FileIdentity;

async function removeIfSame(path: string, dev: number, ino: number): Promise<boolean> {
	try {
		const current = await lstat(path);
		if (current.dev !== dev || current.ino !== ino) return false;
		await unlink(path);
		return true;
	} catch {
		return false;
	}
}

async function readCheckedOwnershipFile(path: string): Promise<OwnershipFileState> {
	let handle;
	try {
		handle = await open(
			path,
			fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0) | (fsConstants.O_NONBLOCK ?? 0),
		);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return { state: "missing" };
		return { state: "unsafe", reason: `cannot safely open it: ${error instanceof Error ? error.message : String(error)}` };
	}
	try {
		const before = await handle.stat();
		const uid = process.getuid?.();
		if (!before.isFile()) return { state: "unsafe", reason: "it is not a regular file" };
		if (uid !== undefined && before.uid !== uid) return { state: "unsafe", reason: "it is not owned by the current user" };
		if (before.size < 0 || before.size > MAX_OWNERSHIP_FILE_BYTES) {
			return { state: "unsafe", reason: `it exceeds ${MAX_OWNERSHIP_FILE_BYTES} bytes` };
		}
		const buffer = Buffer.alloc(MAX_OWNERSHIP_FILE_BYTES + 1);
		const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
		const after = await handle.stat();
		if (bytesRead > MAX_OWNERSHIP_FILE_BYTES || after.size > MAX_OWNERSHIP_FILE_BYTES) {
			return { state: "unsafe", reason: `it exceeds ${MAX_OWNERSHIP_FILE_BYTES} bytes` };
		}
		if (!after.isFile() || after.dev !== before.dev || after.ino !== before.ino || (uid !== undefined && after.uid !== uid)) {
			return { state: "unsafe", reason: "its checked identity changed" };
		}
		return {
			state: "checked",
			file: {
				contents: buffer.subarray(0, bytesRead).toString("utf8"),
				mtimeMs: after.mtimeMs,
				dev: after.dev,
				ino: after.ino,
			},
		};
	} finally {
		await handle.close();
	}
}

async function pathHasIdentity(path: string, identity: FileIdentity): Promise<boolean> {
	try {
		const current = await lstat(path);
		return current.dev === identity.dev && current.ino === identity.ino;
	} catch {
		return false;
	}
}

async function inspectStaleLock(path: string, staleMs: number): Promise<{ state: "missing" } | { state: "held" } | { state: "stale"; identity: FileIdentity }> {
	const checked = await readCheckedOwnershipFile(path);
	if (checked.state === "missing") return { state: "missing" };
	if (checked.state === "unsafe") return { state: "held" };
	if (!await pathHasIdentity(path, checked.file)) return { state: "missing" };
	const oldEnough = Date.now() - checked.file.mtimeMs >= staleMs;
	const published = /^([1-9]\d*)\n(\d+)\n([0-9a-f-]+)\n$/.exec(checked.file.contents);
	if (!published) return oldEnough ? { state: "stale", identity: checked.file } : { state: "held" };
	const pid = Number(published[1]);
	if (!Number.isSafeInteger(pid) || !oldEnough || processIsAlive(pid)) return { state: "held" };
	return { state: "stale", identity: checked.file };
}

async function tryPublishLock(path: string): Promise<LockOwnership | null> {
	const token = randomUUID();
	const temporaryPath = join(dirname(path), `.${basename(path)}.${process.pid}.${token}.tmp`);
	let handle;
	let temporaryIdentity: FileIdentity | undefined;
	try {
		handle = await open(
			temporaryPath,
			fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | (fsConstants.O_NOFOLLOW ?? 0),
			0o600,
		);
		const info = await handle.stat();
		const uid = process.getuid?.();
		if (!info.isFile() || (uid !== undefined && info.uid !== uid)) throw new Error("Intercom spawn lock temporary file is unsafe");
		temporaryIdentity = { dev: info.dev, ino: info.ino };
		await handle.writeFile(`${process.pid}\n${Date.now()}\n${token}\n`, "utf8");
		await handle.sync();
		try {
			await link(temporaryPath, path);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "EEXIST") return null;
			throw error;
		}
		if (!await pathHasIdentity(path, temporaryIdentity)) throw new Error("Intercom spawn lock publication identity mismatch");
		return temporaryIdentity;
	} finally {
		await handle?.close();
		if (temporaryIdentity) await removeIfSame(temporaryPath, temporaryIdentity.dev, temporaryIdentity.ino);
	}
}

async function acquireLock(path: string, staleMs: number): Promise<LockOwnership | null> {
	for (let attempt = 0; attempt < 4; attempt++) {
		const ownership = await tryPublishLock(path);
		if (ownership) return ownership;
		const state = await inspectStaleLock(path, staleMs);
		if (state.state === "held") return null;
		if (state.state === "missing") continue;
		await removeIfSame(path, state.identity.dev, state.identity.ino);
	}
	return null;
}

async function releaseLock(path: string, ownership: LockOwnership): Promise<void> {
	await removeIfSame(path, ownership.dev, ownership.ino);
}

async function removeStalePidFile(path: string): Promise<void> {
	for (let attempt = 0; attempt < 3; attempt++) {
		const checked = await readCheckedOwnershipFile(path);
		if (checked.state === "missing") return;
		if (checked.state === "unsafe") throw new Error(`Refusing unsafe intercom PID path ${path}: ${checked.reason}`);
		if (!await pathHasIdentity(path, checked.file)) continue;
		const pidText = checked.file.contents.trim();
		if (!/^[1-9]\d*$/.test(pidText)) throw new Error(`Refusing malformed intercom PID file: ${path}`);
		const pid = Number(pidText);
		if (!Number.isSafeInteger(pid)) throw new Error(`Refusing malformed intercom PID file: ${path}`);
		if (processIsAlive(pid)) throw new Error(`Intercom PID file names a live process; refusing takeover: ${pid}`);
		if (await removeIfSame(path, checked.file.dev, checked.file.ino)) return;
	}
	throw new Error(`Intercom PID path changed during stale-file validation; refusing takeover: ${path}`);
}

async function removeStaleSocket(paths: IntercomPaths): Promise<void> {
	const initialProbe = await probeBroker(paths.socketPath, 500);
	if (initialProbe === "healthy") return;
	if (initialProbe === "unknown") throw new Error(`Intercom socket may still have a live owner; refusing to replace it: ${paths.socketPath}`);
	try {
		const info = await lstat(paths.socketPath);
		if (!info.isSocket()) throw new Error(`Refusing to replace non-socket intercom path: ${paths.socketPath}`);
		const finalProbe = await probeBroker(paths.socketPath, 500);
		if (finalProbe === "healthy") return;
		if (finalProbe === "unknown") throw new Error(`Intercom socket may still have a live owner; refusing to replace it: ${paths.socketPath}`);
		await removeIfSame(paths.socketPath, info.dev, info.ino);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
}

async function secureRuntimeDirectory(path: string): Promise<void> {
	await mkdir(path, { recursive: true, mode: 0o700 });
	const info = await lstat(path);
	if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`Intercom runtime path is not a real directory: ${path}`);
	const uid = process.getuid?.();
	if (uid !== undefined && info.uid !== uid) throw new Error(`Intercom runtime directory is not owned by the current user: ${path}`);
	await chmod(path, 0o700);
}

async function waitForBroker(socketPath: string, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (await isBrokerHealthy(socketPath, 250)) return;
		await sleep(50);
	}
	throw new Error(`Intercom broker failed to start within ${timeoutMs}ms`);
}

async function waitForOwnedBroker(paths: IntercomPaths, expectedPid: number | undefined, timeoutMs: number): Promise<void> {
	if (expectedPid === undefined) return waitForBroker(paths.socketPath, timeoutMs);
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const checked = await readCheckedOwnershipFile(paths.pidPath);
		if (
			checked.state === "checked"
			&& checked.file.contents.trim() === String(expectedPid)
			&& await isBrokerHealthy(paths.socketPath, 250)
		) return;
		await sleep(50);
	}
	throw new Error(`Intercom broker failed to publish startup ownership within ${timeoutMs}ms`);
}

export async function spawnBrokerIfNeeded(options: SpawnBrokerOptions = {}): Promise<BrokerSpawnResult> {
	if (process.platform === "win32") throw new Error("The owned intercom broker supports Unix sockets only");
	const paths = options.paths ?? getIntercomPaths();
	const waitMs = options.waitMs ?? DEFAULT_WAIT_MS;
	const lockStaleMs = options.lockStaleMs ?? DEFAULT_LOCK_STALE_MS;
	await secureRuntimeDirectory(paths.runtimeDir);
	if (await isBrokerHealthy(paths.socketPath)) return { reused: true };

	const ownership = await acquireLock(paths.spawnLockPath, lockStaleMs);
	if (!ownership) {
		await waitForBroker(paths.socketPath, waitMs);
		return { reused: true };
	}

	try {
		if (await isBrokerHealthy(paths.socketPath)) return { reused: true };
		await removeStaleSocket(paths);
		// A final probe narrows the only remaining takeover race before listen(). The server itself never unlinks a socket.
		if (await isBrokerHealthy(paths.socketPath)) return { reused: true };
		await removeStalePidFile(paths.pidPath);
		const serverPath = options.serverPath ?? fileURLToPath(new URL("./server.mjs", import.meta.url));
		// A packaged Pi process may report the Pi launcher as process.execPath. Invoke the
		// plain Node executable explicitly so server.mjs is never treated as a Pi prompt.
		const child = spawn("node", [serverPath], {
			detached: true,
			stdio: "ignore",
			cwd: dirname(serverPath),
			windowsHide: true,
			env: {
				...process.env,
				...options.env,
				PI_INTERCOM_RUNTIME_DIR: paths.runtimeDir,
				PI_INTERCOM_SOCKET_PATH: paths.socketPath,
			},
		});
		child.unref();
		try {
			await new Promise<void>((resolve, reject) => {
				let settled = false;
				const finish = (error?: Error) => {
					if (settled) return;
					settled = true;
					child.off("error", onError);
					child.off("exit", onExit);
					if (error) reject(error);
					else resolve();
				};
				const onError = (error: Error) => finish(new Error(`Failed to spawn intercom broker: ${error.message}`, { cause: error }));
				const onExit = (code: number | null, signal: NodeJS.Signals | null) => finish(new Error(
					signal ? `Intercom broker exited before startup with signal ${signal}` : `Intercom broker exited before startup with code ${code ?? "unknown"}`,
				));
				child.once("error", onError);
				child.once("exit", onExit);
				waitForOwnedBroker(paths, child.pid, waitMs).then(() => finish(), (error) => finish(error instanceof Error ? error : new Error(String(error))));
			});
		} catch (error) {
			if (child.exitCode === null) child.kill("SIGTERM");
			throw error;
		}
		return { reused: false, ...(child.pid === undefined ? {} : { pid: child.pid }) };
	} finally {
		await releaseLock(paths.spawnLockPath, ownership);
	}
}
