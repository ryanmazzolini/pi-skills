import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  MAX_MANIFEST_BYTES,
  SchedulerEnvironmentError,
  SchedulerError,
  assertSafeCommandBinding,
  assertSafeExecutable,
  canonicalJson,
  loadDeclarations,
  projectScopeIdentity,
  projectScopeIdentityFromCanonicalPath,
  readManifest,
  resolveCandidate,
  schedulerStateRoot,
  supportsNativeSchedule,
  validateManifest,
} from "./index.mjs";

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(TEST_DIRECTORY, "../..");
const CLI_PATH = path.join(REPOSITORY_ROOT, "bin", "scheduled-jobs.mjs");
const REAL_GIT = spawnSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim();

function temporaryDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scheduled-jobs-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function writeExecutable(filePath, content = "#!/bin/sh\nexit 0\n") {
  fs.writeFileSync(filePath, content, { mode: 0o755 });
}

function commandEnvironment(t, commands = ["node", "systemctl", "crontab"]) {
  const base = temporaryDirectory(t);
  const bin = path.join(base, "bin");
  fs.mkdirSync(bin);
  for (const command of commands) {
    if (command === "node") fs.symlinkSync(process.execPath, path.join(bin, command));
    else if (command === "git") fs.symlinkSync(REAL_GIT, path.join(bin, command));
    else writeExecutable(path.join(bin, command));
  }
  return { base, bin, env: { HOME: base, PATH: bin, XDG_CONFIG_HOME: path.join(base, "config") } };
}

function job(overrides = {}) {
  return {
    description: "Generate a work report",
    schedule: "30 17 * * 1-5",
    argv: ["node", "/tmp/report.mjs", "reconcile", "work"],
    requiredCommands: ["node"],
    optionalCommands: ["gh", "short"],
    ...overrides,
  };
}

function manifest(jobs = { "daily-report:work": job() }) {
  return { version: 1, jobs };
}

function writeGlobalManifest(env, value = manifest()) {
  const directory = path.join(env.XDG_CONFIG_HOME, "pi-scheduler");
  fs.mkdirSync(directory, { recursive: true });
  const manifestPath = path.join(directory, "jobs.json");
  fs.writeFileSync(manifestPath, JSON.stringify(value));
  return manifestPath;
}

function initializeRepository(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const result = spawnSync(REAL_GIT, ["init", "-q", directory], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

function writeProjectManifest(root, value = manifest({ "project:check": job({ description: "Check this project" }) })) {
  const directory = path.join(root, ".pi");
  fs.mkdirSync(directory, { recursive: true });
  const manifestPath = path.join(directory, "scheduler.json");
  fs.writeFileSync(manifestPath, JSON.stringify(value));
  return manifestPath;
}

function declarationWithJob(value = job()) {
  return {
    id: "global:daily-report:work",
    scope: { kind: "global", identity: "global", root: "/tmp/config" },
    key: "daily-report:work",
    description: value.description,
    schedule: value.schedule,
    sourcePath: "/tmp/config/pi-scheduler/jobs.json",
    job: validateManifest(manifest({ "daily-report:work": value })).jobs["daily-report:work"],
  };
}

test("manifest validation is strict and normalizes the v1 contract", () => {
  const parsed = validateManifest(manifest());
  assert.equal(parsed.jobs["daily-report:work"].timeoutSeconds, 1800);
  assert.deepEqual(parsed.jobs["daily-report:work"].optionalCommands, ["gh", "short"]);

  assert.throws(
    () => validateManifest({ ...manifest(), environment: { TOKEN: "secret" } }),
    /unknown field: environment/,
  );
  assert.throws(
    () => validateManifest(manifest({ "bad key": job() })),
    /namespace:name/,
  );
  assert.throws(
    () => validateManifest(manifest({ "daily-report:work": job({ schedule: "@daily" }) })),
    /five-field/,
  );
  assert.throws(
    () => validateManifest(manifest({ "daily-report:work": job({ schedule: "* * * * *\nrm -rf /" }) })),
    /five-field|control characters/,
  );
  assert.throws(
    () => validateManifest(manifest({ "daily-report:work": job({ environment: { TOKEN: "secret" } }) })),
    /unknown field: environment/,
  );
  assert.throws(
    () => validateManifest(manifest({ "daily-report:work": job({ description: "unsafe\u001b[31m" }) })),
    /control characters/,
  );
  const implicitArgvCommand = validateManifest(
    manifest({ "daily-report:work": job({ argv: ["node", "x"], requiredCommands: [] }) }),
  );
  assert.deepEqual(implicitArgvCommand.jobs["daily-report:work"].requiredCommands, ["node"]);
});

test("canonical JSON is stable across object insertion order", () => {
  assert.equal(canonicalJson({ z: 1, a: { d: 2, b: 3 } }), canonicalJson({ a: { b: 3, d: 2 }, z: 1 }));
});

test("manifest reads reject symlinks, ownership mismatches, and oversized files", (t) => {
  const root = temporaryDirectory(t);
  const directory = path.join(root, "pi-scheduler");
  fs.mkdirSync(directory);
  const manifestPath = path.join(directory, "jobs.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest()));

  assert.equal(readManifest(root, ["pi-scheduler", "jobs.json"]).manifest.version, 1);
  if (typeof process.getuid === "function") {
    assert.throws(
      () => readManifest(root, ["pi-scheduler", "jobs.json"], { uid: process.getuid() + 1 }),
      /not owned by the current user/,
    );
  }

  fs.unlinkSync(manifestPath);
  const target = path.join(root, "target.json");
  fs.writeFileSync(target, JSON.stringify(manifest()));
  fs.symlinkSync(target, manifestPath);
  assert.throws(() => readManifest(root, ["pi-scheduler", "jobs.json"]), /symbolic link/);

  fs.unlinkSync(manifestPath);
  fs.writeFileSync(manifestPath, " ".repeat(MAX_MANIFEST_BYTES + 1));
  assert.throws(() => readManifest(root, ["pi-scheduler", "jobs.json"]), /exceeds/);

  fs.rmSync(directory, { recursive: true });
  fs.symlinkSync(root, directory);
  assert.throws(() => readManifest(root, ["pi-scheduler", "jobs.json"]), /symbolic link/);
});

test("scheduler state rejects writable non-sticky ancestors", (t) => {
  const base = temporaryDirectory(t);
  const safeParent = path.join(base, "safe");
  const unsafeParent = path.join(base, "unsafe");
  fs.mkdirSync(safeParent, { mode: 0o700 });
  fs.mkdirSync(unsafeParent, { mode: 0o700 });
  fs.chmodSync(unsafeParent, 0o777);

  assert.equal(
    schedulerStateRoot({ HOME: base, XDG_STATE_HOME: path.join(safeParent, "state") }),
    path.join(fs.realpathSync(safeParent), "state", "pi-scheduler"),
  );
  assert.throws(
    () => schedulerStateRoot({ HOME: base, XDG_STATE_HOME: path.join(unsafeParent, "state") }),
    /state ancestor is group- or world-writable/,
  );
});

test("declaration loading requires one explicit fixed manifest path", (t) => {
  const { base, env } = commandEnvironment(t, ["git"]);
  const globalManifestPath = writeGlobalManifest(env);
  const repository = path.join(base, "repo");
  initializeRepository(repository);
  const projectManifestPath = writeProjectManifest(repository);

  const globalDeclarations = loadDeclarations({ manifestPath: globalManifestPath, env });
  assert.deepEqual(globalDeclarations.map((item) => item.id), ["global:daily-report:work"]);

  const projectDeclarations = loadDeclarations({ manifestPath: projectManifestPath, env });
  assert.equal(projectDeclarations.length, 1);
  assert.match(projectDeclarations[0].id, /^project:[a-f0-9]{16}:project:check$/);
  assert.equal(
    projectDeclarations[0].sourcePath,
    path.join(fs.realpathSync(repository), ".pi", "scheduler.json"),
  );

  const arbitrary = path.join(repository, "scheduler.json");
  fs.writeFileSync(arbitrary, JSON.stringify(manifest({ "ignored:job": job() })));
  assert.throws(() => loadDeclarations({ manifestPath: arbitrary, env }), /Manifest must be/);
  assert.throws(() => loadDeclarations({ env }), /--manifest is required/);

  fs.writeFileSync(globalManifestPath, JSON.stringify({ version: 1, jobs: {}, forbidden: true }));
  assert.equal(loadDeclarations({ manifestPath: projectManifestPath, env }).length, 1);
});

test("project identities separate clones, worktrees, and moved roots", (t) => {
  const base = temporaryDirectory(t);
  const first = path.join(base, "first");
  const second = path.join(base, "second");
  initializeRepository(first);
  initializeRepository(second);
  const storedFirstScope = projectScopeIdentity(first);
  const secondIdentity = projectScopeIdentity(second).identity;
  assert.notEqual(storedFirstScope.identity, secondIdentity);

  const moved = path.join(base, "moved");
  fs.renameSync(first, moved);
  assert.notEqual(projectScopeIdentity(moved).identity, storedFirstScope.identity);
  assert.deepEqual(projectScopeIdentityFromCanonicalPath(storedFirstScope.root), storedFirstScope);
});

test("candidate resolution canonicalizes commands and paths while preserving optional absence", (t) => {
  const { base, env } = commandEnvironment(t, ["node", "systemctl"]);
  const script = path.join(base, "report.mjs");
  const config = path.join(base, "report.json");
  const workingDirectory = path.join(base, "work");
  fs.writeFileSync(script, "");
  fs.writeFileSync(config, "{}");
  fs.mkdirSync(workingDirectory);
  const declaration = declarationWithJob(job({
    argv: ["node", "./report.mjs", "reconcile", "work", "--config", "report.json"],
    workingDirectory: "./work",
  }));
  declaration.sourcePath = path.join(base, "scheduler.json");

  const first = resolveCandidate(declaration, { env, platform: "linux" });
  const second = resolveCandidate(declaration, { env, platform: "linux" });
  assert.equal(first.digest, second.digest);
  assert.equal(first.contract.argv[0], path.join(base, "bin", "node"));
  assert.equal(first.contract.schedulerNode, fs.realpathSync(process.execPath));
  assert.match(first.contract.scheduler.root, /pi-scheduler$/);
  assert.equal(first.contract.argv[1], fs.realpathSync(script));
  assert.equal(first.contract.argv.at(-1), fs.realpathSync(config));
  assert.equal(first.contract.workingDirectory, fs.realpathSync(workingDirectory));
  assert.deepEqual(first.contract.optionalCommands, { gh: null, short: null });
  assert.equal(first.contract.adapter.selected, "systemd");
  assert.equal(
    first.contract.adapter.configHome,
    path.join(fs.realpathSync(path.dirname(env.XDG_CONFIG_HOME)), path.basename(env.XDG_CONFIG_HOME)),
  );
  const replacementNode = path.join(base, "node-v2");
  writeExecutable(replacementNode);
  fs.unlinkSync(path.join(base, "bin", "node"));
  fs.symlinkSync(replacementNode, path.join(base, "bin", "node"));
  const retargeted = resolveCandidate(declaration, { env, platform: "linux" });
  assert.equal(retargeted.digest, first.digest);
  assert.equal(retargeted.contract.requiredCommands.node, path.join(base, "bin", "node"));

  const alternateConfig = resolveCandidate(declaration, {
    env: { ...env, XDG_CONFIG_HOME: path.join(base, "alternate-config") },
    platform: "linux",
  });
  assert.notEqual(alternateConfig.digest, first.digest);
  const alternateState = resolveCandidate(declaration, {
    env: { ...env, XDG_STATE_HOME: path.join(base, "alternate-state") },
    platform: "linux",
  });
  assert.notEqual(alternateState.digest, first.digest);

  const ambiguous = declarationWithJob(job({ argv: ["node", "report.mjs"] }));
  ambiguous.sourcePath = path.join(base, "scheduler.json");
  assert.throws(
    () => resolveCandidate(ambiguous, { env, platform: "linux" }),
    /Ambiguous relative path argument/,
  );
});

test("adapter choice is schedule-aware, probed, digest-bound, and warns on cron fallback", (t) => {
  const { base, bin, env } = commandEnvironment(t, ["node", "systemctl", "crontab"]);
  const systemctlTarget = path.join(base, "systemctl-target");
  fs.renameSync(path.join(bin, "systemctl"), systemctlTarget);
  fs.symlinkSync(systemctlTarget, path.join(bin, "systemctl"));
  const declaration = declarationWithJob();
  const automatic = resolveCandidate(declaration, { env, platform: "linux" });
  const forcedCron = resolveCandidate(declaration, { adapter: "cron", env, platform: "linux" });
  assert.equal(automatic.contract.adapter.selected, "systemd");
  assert.equal(automatic.contract.adapter.executable, fs.realpathSync(systemctlTarget));
  assert.equal(forcedCron.contract.adapter.selected, "cron");
  assert.match(forcedCron.contract.adapter.warning, /does not provide catch-up/);
  assert.notEqual(automatic.digest, forcedCron.digest);

  const unsupportedNative = declarationWithJob(job({ schedule: "*/10 * * * *" }));
  const scheduleFallback = resolveCandidate(unsupportedNative, { env, platform: "linux" });
  assert.equal(scheduleFallback.contract.adapter.selected, "cron");
  assert.match(scheduleFallback.contract.adapter.warning, /not supported by the native/);

  const failedProbe = resolveCandidate(declaration, {
    env,
    platform: "linux",
    probe: () => false,
  });
  assert.equal(failedProbe.contract.adapter.selected, "cron");
  assert.match(failedProbe.contract.adapter.warning, /systemd is unavailable/);

  assert.equal(supportsNativeSchedule("30 17 * * 1-5"), true);
  assert.equal(supportsNativeSchedule("*/10 * * * *"), false);
  assert.throws(() => validateManifest(manifest({ "bad:schedule": job({ schedule: "99 99 99 99 99" }) })), /valid five-field/);
  assert.throws(() => validateManifest(manifest({ "bad:schedule": job({ schedule: "foo bar baz qux quux" }) })), /valid five-field/);
});

test("missing required commands and scheduler adapters fail as environment errors", (t) => {
  const missingNode = commandEnvironment(t, ["systemctl"]);
  assert.throws(
    () => resolveCandidate(declarationWithJob(), { env: missingNode.env, platform: "linux" }),
    (error) => error instanceof SchedulerEnvironmentError && error.exitCode === 4 && /node/.test(error.message),
  );

  const missingAdapter = commandEnvironment(t, ["node"]);
  assert.throws(
    () => resolveCandidate(declarationWithJob(), { env: missingAdapter.env, platform: "linux" }),
    (error) => error instanceof SchedulerEnvironmentError && /No usable scheduler adapter/.test(error.message),
  );
});

test("candidate resolution rejects unsafe, shadowed, relative, and case-colliding command mappings", (t) => {
  const first = commandEnvironment(t, ["node", "systemctl"]);
  const shadowBin = path.join(first.base, "shadow-bin");
  fs.mkdirSync(shadowBin);
  writeExecutable(path.join(shadowBin, "node"));
  assert.throws(
    () => resolveCandidate(declarationWithJob(), {
      env: { ...first.env, PATH: `${first.bin}${path.delimiter}${shadowBin}` },
      platform: "linux",
    }),
    /shadowed by distinct PATH mappings/,
  );

  assert.throws(
    () => resolveCandidate(declarationWithJob(), {
      env: { ...first.env, PATH: `relative${path.delimiter}${first.bin}` },
      platform: "linux",
    }),
    /only explicit absolute directories/,
  );
  assert.throws(
    () => resolveCandidate(declarationWithJob(), {
      env: { ...first.env, PATH: `${first.bin}/../bin` },
      platform: "linux",
    }),
    /without dot components/,
  );

  assert.throws(
    () => resolveCandidate(
      declarationWithJob(job({ optionalCommands: ["Node"] })),
      { env: first.env, platform: "linux" },
    ),
    /collide on case-insensitive filesystems/,
  );

  const unsafe = commandEnvironment(t, ["node", "systemctl"]);
  fs.unlinkSync(path.join(unsafe.bin, "node"));
  writeExecutable(path.join(unsafe.bin, "node"));
  fs.chmodSync(path.join(unsafe.bin, "node"), 0o777);
  assert.throws(
    () => resolveCandidate(declarationWithJob(), { env: unsafe.env, platform: "linux" }),
    /group- or world-writable/,
  );

  const unsafeRunner = path.join(first.base, "unsafe-runner.mjs");
  writeExecutable(unsafeRunner);
  fs.chmodSync(unsafeRunner, 0o777);
  assert.throws(
    () => resolveCandidate(declarationWithJob(), {
      env: first.env,
      platform: "linux",
      runnerPath: unsafeRunner,
    }),
    /group- or world-writable/,
  );
  const unsafeSchedulerNode = path.join(first.base, "unsafe-scheduler-node");
  writeExecutable(unsafeSchedulerNode);
  fs.chmodSync(unsafeSchedulerNode, 0o777);
  assert.throws(
    () => resolveCandidate(declarationWithJob(), {
      env: first.env,
      platform: "linux",
      nodePath: unsafeSchedulerNode,
    }),
    /group- or world-writable/,
  );

  const writableAncestor = path.join(first.base, "writable-ancestor");
  const protectedChild = path.join(writableAncestor, "protected", "bin");
  fs.mkdirSync(protectedChild, { recursive: true, mode: 0o755 });
  const nonAdminGroup = typeof process.getgroups === "function"
    ? process.getgroups().find((group) => group !== 80)
    : undefined;
  if (typeof process.getuid === "function" && nonAdminGroup !== undefined) {
    fs.chownSync(writableAncestor, process.getuid(), nonAdminGroup);
  }
  fs.chmodSync(writableAncestor, 0o775);
  const nestedSchedulerNode = path.join(protectedChild, "node");
  writeExecutable(nestedSchedulerNode);
  assert.throws(
    () => resolveCandidate(declarationWithJob(), {
      env: first.env,
      platform: "linux",
      nodePath: nestedSchedulerNode,
    }),
    /Command directory ancestor is group- or world-writable/,
  );
});

test("command binding validation preserves symlink-sensitive parent traversal", (t) => {
  const base = temporaryDirectory(t);
  const stableDirectory = path.join(base, "stable");
  const unsafeDirectory = path.join(base, "unsafe");
  fs.mkdirSync(stableDirectory);
  fs.mkdirSync(path.join(unsafeDirectory, "channel-target"), { recursive: true });
  const safeDecoy = path.join(stableDirectory, "tool");
  const unsafeTarget = path.join(unsafeDirectory, "tool");
  writeExecutable(safeDecoy, "#!/bin/sh\nprintf safe\n");
  writeExecutable(unsafeTarget, "#!/bin/sh\nprintf unsafe\n");
  fs.chmodSync(unsafeTarget, 0o777);
  fs.symlinkSync(path.join(unsafeDirectory, "channel-target"), path.join(stableDirectory, "channel"));
  const binding = path.join(stableDirectory, "binding");
  fs.symlinkSync("channel/../tool", binding);

  assert.equal(execFileSync(binding, { encoding: "utf8" }), "unsafe");
  assert.throws(() => assertSafeCommandBinding(binding), /group- or world-writable/);
});

test("command validation accepts a current-user-owned macOS admin ancestor", {
  skip: process.platform !== "darwin"
    || typeof process.getuid !== "function"
    || !process.getgroups().includes(80),
}, (t) => {
  const base = temporaryDirectory(t);
  const adminDirectory = path.join(base, "homebrew-cellar");
  const binDirectory = path.join(adminDirectory, "tool", "bin");
  fs.mkdirSync(binDirectory, { recursive: true, mode: 0o755 });
  fs.chownSync(adminDirectory, process.getuid(), 80);
  fs.chmodSync(adminDirectory, 0o775);
  const executable = path.join(binDirectory, "tool");
  writeExecutable(executable);

  const canonicalExecutable = fs.realpathSync(executable);
  assert.doesNotThrow(() => assertSafeExecutable(canonicalExecutable));

  fs.chmodSync(adminDirectory, 0o777);
  assert.throws(
    () => assertSafeExecutable(canonicalExecutable),
    /Command directory ancestor is group- or world-writable/,
  );
});

test("CLI lists and inspects one explicit global or project manifest as JSON", (t) => {
  const nativeAdapterCommand = process.platform === "darwin" ? "launchctl" : "systemctl";
  const { base, env } = commandEnvironment(t, ["node", "git", nativeAdapterCommand]);
  const globalManifestPath = writeGlobalManifest(env);
  const repository = path.join(base, "repo");
  initializeRepository(repository);
  const projectManifestPath = writeProjectManifest(
    repository,
    manifest({ "project:check": job({ description: "Check this project", argv: ["node", "./check.mjs"] }) }),
  );
  fs.writeFileSync(path.join(repository, ".pi", "check.mjs"), "");

  const listed = spawnSync(process.execPath, [CLI_PATH, "list", "--manifest", projectManifestPath, "--json"], {
    encoding: "utf8",
    env,
  });
  assert.equal(listed.status, 0, listed.stderr);
  const listResult = JSON.parse(listed.stdout);
  assert.equal(listResult.ok, true);
  assert.equal(listResult.jobs.length, 1);
  const projectId = listResult.jobs[0].id;

  const inspected = spawnSync(
    process.execPath,
    [CLI_PATH, "inspect", projectId, "--manifest", projectManifestPath, "--json"],
    { encoding: "utf8", env },
  );
  assert.equal(inspected.status, 0, inspected.stderr);
  const inspectResult = JSON.parse(inspected.stdout);
  assert.equal(inspectResult.candidate.contract.id, projectId);
  assert.match(inspectResult.candidate.digest, /^[a-f0-9]{64}$/);
  assert.equal(inspectResult.candidate.contract.argv[1], fs.realpathSync(path.join(repository, ".pi", "check.mjs")));
  assert.equal(inspectResult.candidate.contract.workingDirectory, fs.realpathSync(base));

  const inspectedFromProject = spawnSync(
    process.execPath,
    [CLI_PATH, "inspect", projectId, "--manifest", projectManifestPath, "--json"],
    { cwd: repository, encoding: "utf8", env },
  );
  assert.equal(inspectedFromProject.status, 0, inspectedFromProject.stderr);
  assert.equal(JSON.parse(inspectedFromProject.stdout).candidate.digest, inspectResult.candidate.digest);

  const human = spawnSync(
    process.execPath,
    [CLI_PATH, "inspect", projectId, "--manifest", projectManifestPath],
    { encoding: "utf8", env },
  );
  assert.equal(human.status, 0, human.stderr);
  assert.match(human.stdout, /Argv: \["/);
  assert.match(human.stdout, new RegExp(`Working directory: ${fs.realpathSync(base).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));

  const doctor = spawnSync(
    process.execPath,
    [CLI_PATH, "doctor", "global:daily-report:work", "--manifest", globalManifestPath, "--json"],
    { encoding: "utf8", env },
  );
  assert.equal(doctor.status, 0, doctor.stderr);
  const doctorResult = JSON.parse(doctor.stdout);
  assert.equal(doctorResult.status, "ok");
  assert.deepEqual(doctorResult.diagnostics.unavailableOptionalCommands, ["gh", "short"]);
});

test("CLI uses stable nonzero exits and structured JSON errors", (t) => {
  const { env } = commandEnvironment(t, [process.platform === "darwin" ? "launchctl" : "systemctl"]);
  const globalManifestPath = writeGlobalManifest(env);

  const usage = spawnSync(process.execPath, [CLI_PATH, "inspect", "missing", "--json"], {
    encoding: "utf8",
    env,
  });
  assert.equal(usage.status, 2);
  assert.equal(JSON.parse(usage.stderr).error.code, "USAGE");

  const environment = spawnSync(
    process.execPath,
    [CLI_PATH, "inspect", "global:daily-report:work", "--manifest", globalManifestPath, "--json"],
    { encoding: "utf8", env },
  );
  assert.equal(environment.status, 4);
  assert.equal(JSON.parse(environment.stderr).error.code, "ENVIRONMENT");

  fs.writeFileSync(globalManifestPath, JSON.stringify({ version: 1, jobs: {}, forbidden: true }));
  const validation = spawnSync(
    process.execPath,
    [CLI_PATH, "list", "--manifest", globalManifestPath, "--json"],
    { encoding: "utf8", env },
  );
  assert.equal(validation.status, 3);
  assert.equal(JSON.parse(validation.stderr).error.code, "SCHEDULER_ERROR");
});

test("an explicit missing manifest fails without scanning other locations", (t) => {
  const { env } = commandEnvironment(t, []);
  const missing = path.join(env.XDG_CONFIG_HOME, "pi-scheduler", "jobs.json");
  const result = spawnSync(
    process.execPath,
    [CLI_PATH, "list", "--manifest", missing, "--json"],
    { encoding: "utf8", env },
  );
  assert.equal(result.status, 3);
  assert.match(JSON.parse(result.stderr).error.message, /does not exist/);
});
