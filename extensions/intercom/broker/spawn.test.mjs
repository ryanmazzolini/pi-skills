import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, chmod, lstat, mkdir, readFile, rename, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { spawnBrokerIfNeeded } from "./spawn.ts";
import { isolatedIntercom, readBrokerPid, startLegacyBroker, startOwnedBroker, stopChild, waitFor } from "../../../tests/intercom/helpers.mjs";

const execFileAsync = promisify(execFile);

async function stopPid(pid) {
	try { process.kill(pid, "SIGTERM"); } catch { return; }
	await waitFor(() => {
		try { process.kill(pid, 0); return false; } catch { return true; }
	}, 3_000).catch(() => {
		try { process.kill(pid, "SIGKILL"); } catch {}
	});
}

test("concurrent startup calls atomically publish complete ownership and spawn one plain-Node broker", async (t) => {
	const { paths } = await isolatedIntercom(t);
	let finished = false;
	const observedLocks = [];
	const starting = Promise.all(Array.from({ length: 8 }, () => spawnBrokerIfNeeded({ paths, waitMs: 3_000 })));
	void starting.finally(() => { finished = true; });
	while (!finished) {
		try { observedLocks.push(await readFile(paths.spawnLockPath, "utf8")); } catch {}
		await new Promise((resolve) => setTimeout(resolve, 1));
	}
	const results = await starting;
	const pid = await readBrokerPid(paths);
	t.after(() => stopPid(pid));
	assert.equal(results.filter((result) => result.reused === false).length, 1);
	assert.equal(results.filter((result) => result.pid === pid).length, 1);
	assert.equal((await stat(paths.runtimeDir)).mode & 0o777, 0o700);
	assert.equal((await stat(paths.socketPath)).mode & 0o777, 0o600);
	assert.equal((await stat(paths.pidPath)).mode & 0o777, 0o600);
	assert.ok(observedLocks.length > 0);
	assert.equal(observedLocks.every((contents) => /^\d+\n\d+\n[0-9a-f-]+\n$/.test(contents)), true);
	await assert.rejects(access(paths.spawnLockPath));
});

test("broker startup reports a bounded child stderr diagnostic", async (t) => {
	const { base, paths } = await isolatedIntercom(t, "stderr-start-");
	const serverPath = join(base, "failing-server.mjs");
	await writeFile(serverPath, `process.stderr.write("discarded-prefix-${"x".repeat(5_000)}-distinctive broker startup failure\\n");\nprocess.exit(1);\n`);
	await assert.rejects(spawnBrokerIfNeeded({ paths, serverPath, waitMs: 1_000 }), (error) => {
		assert.match(error.message, /Intercom broker exited before startup with code 1:/);
		assert.match(error.message, /distinctive broker startup failure$/);
		assert.doesNotMatch(error.message, /discarded-prefix/);
		assert.ok(Buffer.byteLength(error.message, "utf8") <= 4_200);
		return true;
	});
});

test("broker startup resolves the plain node executable from PATH", async (t) => {
	const { base, paths } = await isolatedIntercom(t, "node-path-");
	const bin = join(base, "bin");
	const wrapper = join(bin, "node");
	const invocationLog = join(base, "node-invocation.log");
	await mkdir(bin);
	await writeFile(wrapper, `#!/bin/sh\nprintf '%s\\n' "$0" > "$PI_INTERCOM_NODE_INVOCATION_LOG"\nexec ${JSON.stringify(process.execPath)} "$@"\n`);
	await chmod(wrapper, 0o755);
	const result = await spawnBrokerIfNeeded({
		paths,
		waitMs: 3_000,
		env: {
			PATH: `${bin}:${process.env.PATH ?? ""}`,
			PI_INTERCOM_NODE_INVOCATION_LOG: invocationLog,
		},
	});
	const pid = await readBrokerPid(paths);
	t.after(() => stopPid(pid));
	assert.equal(result.pid, pid);
	assert.equal((await readFile(invocationLog, "utf8")).trim(), wrapper);
});

test("startup refuses a symlinked runtime directory", async (t) => {
	const { base, paths } = await isolatedIntercom(t);
	const target = `${base}/target`;
	await mkdir(target, { mode: 0o755 });
	await rm(paths.runtimeDir, { recursive: true });
	await symlink(target, paths.runtimeDir);
	await assert.rejects(spawnBrokerIfNeeded({ paths, waitMs: 100 }), /not a real directory/);
	assert.equal((await stat(target)).mode & 0o777, 0o755);
});

test("fresh malformed locks remain held while aged checked malformed locks are inode-qualified and recoverable", async (t) => {
	{
		const { paths } = await isolatedIntercom(t, "fresh-lock-");
		await writeFile(paths.spawnLockPath, "", { mode: 0o600 });
		const before = await lstat(paths.spawnLockPath);
		await assert.rejects(spawnBrokerIfNeeded({ paths, waitMs: 100, lockStaleMs: 10_000 }), /failed to start/);
		const after = await lstat(paths.spawnLockPath);
		assert.equal(after.ino, before.ino);
		assert.equal((await readFile(paths.spawnLockPath)).length, 0);
	}
	for (const [prefix, contents] of [["aged-empty-", ""], ["aged-bad-", "not-a-pid\npartial"], ["aged-part-", `${process.pid}\n`]]) {
		const { paths } = await isolatedIntercom(t, prefix);
		await writeFile(paths.spawnLockPath, contents, { mode: 0o600 });
		await utimes(paths.spawnLockPath, new Date(0), new Date(0));
		const result = await spawnBrokerIfNeeded({ paths, waitMs: 3_000, lockStaleMs: 10 });
		const pid = await readBrokerPid(paths);
		t.after(() => stopPid(pid));
		assert.equal(result.reused, false);
		await assert.rejects(access(paths.spawnLockPath));
	}
	{
		const { paths } = await isolatedIntercom(t, "stale-lock-");
		await writeFile(paths.spawnLockPath, `99999999\n1\nstale-token\n`, { mode: 0o600 });
		await utimes(paths.spawnLockPath, new Date(0), new Date(0));
		const result = await spawnBrokerIfNeeded({ paths, waitMs: 3_000, lockStaleMs: 10 });
		const pid = await readBrokerPid(paths);
		t.after(() => stopPid(pid));
		assert.equal(result.reused, false);
	}
});

test("SIGTERM overlapping asynchronous PID publication leaves no owned PID file", async (t) => {
	const { paths } = await isolatedIntercom(t, "pid-race-");
	const broker = await startOwnedBroker(paths, { PI_INTERCOM_TEST_PID_PUBLICATION_DELAY_MS: "500" });
	t.after(() => stopChild(broker));
	await waitFor(async () => {
		try { await access(paths.pidPath); return true; } catch { return false; }
	}, 1_000);
	const exited = new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error("broker did not exit after startup SIGTERM")), 2_000);
		broker.once("exit", () => { clearTimeout(timer); resolve(); });
	});
	broker.kill("SIGTERM");
	await exited;
	await assert.rejects(access(paths.pidPath));
});

test("hostile lock and PID paths are never followed, blocked on, or overwritten", async (t) => {
	for (const kind of ["symlink", "fifo", "oversized"]) {
		const { base, paths } = await isolatedIntercom(t, `lock-${kind}-`);
		if (kind === "symlink") {
			const target = `${base}/lock-target`;
			await writeFile(target, "target-must-remain", { mode: 0o600 });
			await symlink(target, paths.spawnLockPath);
		} else if (kind === "fifo") {
			await execFileAsync("mkfifo", [paths.spawnLockPath]);
		} else {
			await writeFile(paths.spawnLockPath, "x".repeat(5_000), { mode: 0o600 });
		}
		const started = Date.now();
		await assert.rejects(spawnBrokerIfNeeded({ paths, waitMs: 100 }), /failed to start/);
		assert.ok(Date.now() - started < 2_000);
		assert.equal((await lstat(paths.spawnLockPath)).isSymbolicLink(), kind === "symlink");
	}

	for (const kind of ["symlink", "fifo", "oversized"]) {
		const { base, paths } = await isolatedIntercom(t, `pid-${kind}-`);
		let target;
		if (kind === "symlink") {
			target = `${base}/pid-target`;
			await writeFile(target, "do-not-read-or-replace", { mode: 0o600 });
			await symlink(target, paths.pidPath);
		} else if (kind === "fifo") {
			await execFileAsync("mkfifo", [paths.pidPath]);
		} else {
			await writeFile(paths.pidPath, "9".repeat(5_000), { mode: 0o600 });
		}
		const started = Date.now();
		await assert.rejects(spawnBrokerIfNeeded({ paths, waitMs: 500 }), /unsafe intercom PID path/);
		assert.ok(Date.now() - started < 2_000);
		if (target) assert.equal(await readFile(target, "utf8"), "do-not-read-or-replace");
	}
});

test("owned broker removes its PID file by retained identity without reading a replacement", async (t) => {
	const { base, paths } = await isolatedIntercom(t, "pid-identity-");
	const broker = await startOwnedBroker(paths);
	const original = await lstat(paths.pidPath);
	const moved = `${base}/owned-pid`;
	const target = `${base}/replacement-target`;
	await rename(paths.pidPath, moved);
	await writeFile(target, "replacement-content", { mode: 0o600 });
	await symlink(target, paths.pidPath);
	await stopChild(broker);
	assert.equal((await lstat(moved)).ino, original.ino);
	assert.equal((await lstat(paths.pidPath)).isSymbolicLink(), true);
	assert.equal(await readFile(target, "utf8"), "replacement-content");
});

test("startup reuses a healthy legacy broker and never replaces its live owner", async (t) => {
	const { home, paths } = await isolatedIntercom(t);
	const legacy = await startLegacyBroker(home, paths.socketPath);
	t.after(() => stopChild(legacy));
	const originalPid = await readBrokerPid(paths);
	const result = await spawnBrokerIfNeeded({ paths, waitMs: 1_000 });
	assert.equal(result.reused, true);
	assert.equal(await readBrokerPid(paths), originalPid);
	assert.equal(originalPid, legacy.pid);
	assert.equal(legacy.exitCode, null);
});
