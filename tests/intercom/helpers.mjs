import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import net from "node:net";
import { join, resolve } from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { FrameDecoder, IntercomClient, encodeFrame } from "../../extensions/intercom/client.ts";
import { getIntercomPaths } from "../../extensions/intercom/broker/paths.ts";
import { isBrokerHealthy } from "../../extensions/intercom/broker/spawn.ts";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
export const ownedServerPath = join(root, "extensions", "intercom", "broker", "server.mjs");
export const legacyBrokerPath = join(root, "tests", "fixtures", "pi-intercom-0.6.0", "broker", "broker.ts");
export const legacyDriverPath = join(root, "tests", "fixtures", "pi-intercom-0.6.0", "client-driver.mjs");

export async function isolatedIntercom(t, prefix = "intercom-test-") {
	// Darwin limits Unix socket paths to roughly 104 bytes; keep isolated fixture paths deliberately short.
	const shortPrefix = prefix.replace(/[^a-z0-9-]/gi, "").slice(0, 12) || "pi-intercom-";
	const base = await mkdtemp(join("/tmp", shortPrefix));
	const home = join(base, "home");
	const runtimeDir = join(home, ".pi", "agent", "intercom");
	await mkdir(runtimeDir, { recursive: true });
	const paths = getIntercomPaths(runtimeDir);
	t?.after(async () => rm(base, { recursive: true, force: true }));
	return { base, home, paths };
}

export function registration(name, overrides = {}) {
	const now = Date.now();
	return {
		name,
		cwd: `/tmp/${name}`,
		model: "fixture-model",
		pid: process.pid,
		startedAt: now,
		lastActivity: now,
		status: "idle",
		...overrides,
	};
}

export async function waitFor(predicate, timeoutMs = 5_000, intervalMs = 20) {
	const deadline = Date.now() + timeoutMs;
	let lastError;
	while (Date.now() < deadline) {
		try {
			const value = await predicate();
			if (value) return value;
		} catch (error) {
			lastError = error;
		}
		await new Promise((resolvePromise) => setTimeout(resolvePromise, intervalMs));
	}
	throw lastError ?? new Error(`Condition not met within ${timeoutMs}ms`);
}

function spawnBroker(script, env) {
	const child = spawn(process.execPath, [script], {
		env: { ...process.env, NODE_NO_WARNINGS: "1", ...env },
		stdio: ["ignore", "pipe", "pipe"],
	});
	let output = "";
	child.stdout.on("data", (chunk) => { output += chunk; });
	child.stderr.on("data", (chunk) => { output += chunk; });
	child.output = () => output;
	return child;
}

export async function startOwnedBroker(paths, env = {}) {
	const child = spawnBroker(ownedServerPath, {
		PI_INTERCOM_RUNTIME_DIR: paths.runtimeDir,
		PI_INTERCOM_SOCKET_PATH: paths.socketPath,
		PI_INTERCOM_IDLE_TIMEOUT_MS: "60000",
		...env,
	});
	await waitFor(async () => {
		if (child.exitCode !== null) throw new Error(`Owned broker exited: ${child.output()}`);
		if (!await isBrokerHealthy(paths.socketPath, 100)) return false;
		try {
			return await readBrokerPid(paths) === child.pid;
		} catch {
			return false;
		}
	});
	return child;
}

export async function startLegacyBroker(home, socketPath) {
	const child = spawnBroker(legacyBrokerPath, { HOME: home });
	await waitFor(async () => {
		if (child.exitCode !== null) throw new Error(`Legacy broker exited: ${child.output()}`);
		return isBrokerHealthy(socketPath, 100);
	});
	return child;
}

export async function stopChild(child) {
	if (!child || child.exitCode !== null) return;
	await new Promise((resolvePromise) => {
		let settled = false;
		const finish = () => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolvePromise();
		};
		const timer = setTimeout(() => {
			if (child.exitCode === null) child.kill("SIGKILL");
			finish();
		}, 2_000);
		child.once("exit", finish);
		child.kill("SIGTERM");
	});
}

export async function connectNew(paths, name, options = {}) {
	const client = new IntercomClient({ socketPath: paths.socketPath, connectTimeoutMs: 1_000, listTimeoutMs: 1_000, sendTimeoutMs: 1_000, askTimeoutMs: 1_000, ...options });
	await client.connect(registration(name));
	return client;
}

export function waitEvent(emitter, event, predicate = () => true, timeoutMs = 2_000) {
	return new Promise((resolvePromise, reject) => {
		const timer = setTimeout(() => {
			emitter.off(event, listener);
			reject(new Error(`Timed out waiting for ${event}`));
		}, timeoutMs);
		const listener = (...args) => {
			if (!predicate(...args)) return;
			clearTimeout(timer);
			emitter.off(event, listener);
			resolvePromise(args);
		};
		emitter.on(event, listener);
	});
}

export class LegacyDriver {
	constructor(home) {
		this.child = spawn(process.execPath, [legacyDriverPath], {
			env: { ...process.env, HOME: home, NODE_NO_WARNINGS: "1" },
			stdio: ["pipe", "pipe", "pipe"],
		});
		this.nextId = 1;
		this.pending = new Map();
		this.events = [];
		this.waiters = [];
		this.stderr = "";
		this.closing = null;
		this.child.stderr.on("data", (chunk) => { this.stderr += chunk; });
		const lines = readline.createInterface({ input: this.child.stdout, crlfDelay: Infinity });
		lines.on("line", (line) => {
			const value = JSON.parse(line);
			if (value.response !== undefined) {
				const pending = this.pending.get(value.response);
				if (!pending) return;
				this.pending.delete(value.response);
				if (value.error) pending.reject(new Error(value.error));
				else pending.resolve(value.value);
				return;
			}
			this.events.push(value);
			for (const waiter of [...this.waiters]) {
				if (!waiter.predicate(value)) continue;
				this.waiters.splice(this.waiters.indexOf(waiter), 1);
				clearTimeout(waiter.timer);
				waiter.resolve(value);
			}
		});
		this.child.on("exit", (code) => {
			const error = new Error(`Legacy client driver exited with ${code}: ${this.stderr}`);
			for (const pending of this.pending.values()) pending.reject(error);
			this.pending.clear();
		});
	}

	command(action, fields = {}) {
		if (this.closing || this.child.stdin.destroyed) return Promise.reject(new Error("Legacy client driver is closing"));
		const id = this.nextId++;
		return new Promise((resolvePromise, reject) => {
			this.pending.set(id, { resolve: resolvePromise, reject });
			this.child.stdin.write(`${JSON.stringify({ id, action, ...fields })}\n`, (error) => {
				if (!error) return;
				this.pending.delete(id);
				reject(error);
			});
		});
	}

	waitEvent(predicate, timeoutMs = 2_000) {
		const existing = this.events.find(predicate);
		if (existing) return Promise.resolve(existing);
		return new Promise((resolvePromise, reject) => {
			const waiter = { predicate, resolve: resolvePromise, reject, timer: undefined };
			waiter.timer = setTimeout(() => {
				this.waiters.splice(this.waiters.indexOf(waiter), 1);
				reject(new Error(`Timed out waiting for legacy event; stderr: ${this.stderr}`));
			}, timeoutMs);
			this.waiters.push(waiter);
		});
	}

	async close() {
		if (this.closing) return this.closing;
		const closing = (async () => {
			try {
				const id = this.nextId++;
				await new Promise((resolvePromise) => {
					this.pending.set(id, { resolve: resolvePromise, reject: resolvePromise });
					this.child.stdin.write(`${JSON.stringify({ id, action: "disconnect" })}\n`, () => undefined);
					setTimeout(resolvePromise, 500).unref();
				});
			} catch {}
			this.child.stdin.end();
			await stopChild(this.child);
		})();
		this.closing = closing;
		return closing;
	}
}

export async function connectRaw(socketPath) {
	const socket = net.connect(socketPath);
	await new Promise((resolvePromise, reject) => {
		socket.once("connect", resolvePromise);
		socket.once("error", reject);
	});
	socket.on("error", () => undefined);
	const messages = [];
	const waiters = [];
	const decoder = new FrameDecoder((message) => {
		messages.push(message);
		for (const waiter of [...waiters]) {
			if (!waiter.predicate(message)) continue;
			waiters.splice(waiters.indexOf(waiter), 1);
			clearTimeout(waiter.timer);
			waiter.resolve(message);
		}
	}, () => undefined);
	socket.on("data", (chunk) => decoder.push(chunk));
	return {
		socket,
		messages,
		write(message) { socket.write(encodeFrame(message)); },
		wait(predicate, timeoutMs = 1_000) {
			const existing = messages.find(predicate);
			if (existing) return Promise.resolve(existing);
			return new Promise((resolvePromise, reject) => {
				const waiter = { predicate, resolve: resolvePromise, reject, timer: undefined };
				waiter.timer = setTimeout(() => reject(new Error("Timed out waiting for raw broker message")), timeoutMs);
				waiters.push(waiter);
			});
		},
	};
}

export async function readBrokerPid(paths) {
	return Number.parseInt((await readFile(paths.pidPath, "utf8")).trim(), 10);
}
