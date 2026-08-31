import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadDeclarations, resolveCandidate, resolveExecutable } from "../lib/scheduled-jobs/index.mjs";
import { installJob } from "../lib/scheduled-jobs/lifecycle.mjs";
import { readRunHistory } from "../lib/scheduled-jobs/runtime.mjs";
import { run } from "./scheduled-jobs.mjs";

const DAILY_REPORT_CLI = fileURLToPath(new URL("../skills/notes/daily-report/scripts/daily-report.mjs", import.meta.url));
const SCHEDULED_JOBS_CLI = fileURLToPath(new URL("./scheduled-jobs.mjs", import.meta.url));

function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "scheduled-jobs-cli-test-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const home = path.join(base, "home");
  const bin = path.join(base, "bin");
  const configHome = path.join(base, "config");
  const stateHome = path.join(base, "state");
  const temporary = path.join(base, "tmp");
  for (const directory of [home, bin, temporary, path.join(configHome, "pi-scheduler")]) {
    fs.mkdirSync(directory, { recursive: true });
  }
  fs.symlinkSync(process.execPath, path.join(bin, "node"));
  fs.writeFileSync(path.join(bin, "launchctl"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const scriptPath = path.join(base, "job.mjs");
  fs.writeFileSync(scriptPath, "console.log('cli lifecycle output')\n");
  const manifestPath = path.join(configHome, "pi-scheduler", "jobs.json");
  fs.writeFileSync(manifestPath, JSON.stringify({
    version: 1,
    jobs: {
      "test:cli": {
        description: "CLI lifecycle fixture",
        schedule: "30 17 * * 1-5",
        argv: ["node", scriptPath],
        requiredCommands: [],
        optionalCommands: [],
      },
    },
  }));
  const env = {
    HOME: home,
    USER: "scheduler-test",
    TMPDIR: temporary,
    XDG_CONFIG_HOME: configHome,
    XDG_STATE_HOME: stateHome,
    PATH: bin,
    LANG: "C",
  };
  const launchd = { loaded: new Set(), disabled: new Set() };
  const commandRunner = (_executable, argv) => {
    const [command, first, second] = argv;
    if (command === "print" && (first === `gui/${process.getuid()}` || first === `user/${process.getuid()}`)) return "";
    if (command === "print") {
      if (launchd.loaded.has(first)) return "";
      throw new Error("not loaded");
    }
    if (command === "print-disabled") {
      return `disabled services = {\n${[...launchd.disabled].map((label) => `  "${label}" => true`).join("\n")}\n}\n`;
    }
    if (command === "disable") {
      launchd.disabled.add(first.slice(first.lastIndexOf("/") + 1));
      return "";
    }
    if (command === "enable") {
      launchd.disabled.delete(first.slice(first.lastIndexOf("/") + 1));
      return "";
    }
    if (command === "bootstrap") {
      const plist = fs.readFileSync(second, "utf8");
      const label = /<key>Label<\/key>\s*<string>([^<]+)<\/string>/.exec(plist)[1];
      launchd.loaded.add(`${first}/${label}`);
      return "";
    }
    if (command === "bootout") {
      launchd.loaded.delete(first);
      return "";
    }
    throw new Error(`unexpected launchctl argv: ${argv.join(" ")}`);
  };
  return {
    bin,
    env,
    manifestPath,
    scriptPath,
    runtime: {
      env,
      platform: "darwin",
      adapterOptions: { commandRunner, uid: process.getuid() },
    },
  };
}

function json(result) {
  return JSON.parse(result.stdout);
}

function installLegacyGlobalJob(value) {
  const declaration = loadDeclarations({ manifestPath: value.manifestPath, env: value.env })[0];
  const legacy = {
    ...declaration,
    id: `global:${declaration.key}`,
    scope: { kind: "global", identity: "global", root: declaration.scope.root },
  };
  const runnerPath = fs.realpathSync(SCHEDULED_JOBS_CLI);
  const candidateOptions = {
    adapter: "auto",
    env: value.env,
    platform: value.runtime.platform,
    runnerPath,
  };
  const candidate = resolveCandidate(legacy, candidateOptions);
  return installJob({
    id: legacy.id,
    loadDeclaration: () => legacy,
    expectedCandidateDigest: candidate.digest,
    candidateOptions,
    env: value.env,
    runnerPath,
    adapterOptions: value.runtime.adapterOptions,
  });
}

test("an installed snapshot reconciles daily-report under the fixed scheduler environment", async (t) => {
  const value = fixture(t);
  const git = resolveExecutable("git", process.env);
  assert.ok(git, "git is required for the daily-report fixture");
  fs.symlinkSync(git, path.join(value.bin, "git"));
  fs.writeFileSync(
    path.join(value.bin, "pi"),
    "#!/bin/sh\ncat >/dev/null\nprintf '# Work report — scheduled fixture\\n\\n## Summary\\n\\nGenerated through the installed snapshot.\\n'\n",
    { mode: 0o755 },
  );
  const vault = path.join(path.dirname(value.env.HOME), "vault");
  const repositories = path.join(path.dirname(value.env.HOME), "repos");
  fs.mkdirSync(vault);
  fs.mkdirSync(repositories);
  const configPath = path.join(path.dirname(value.env.HOME), "daily-report.json");
  fs.writeFileSync(configPath, JSON.stringify({
    version: 1,
    defaults: { timezone: "UTC", maxReconcileDays: 1 },
    profiles: {
      work: {
        vault,
        gitRoots: [repositories],
        reportDirectory: "daily-reports",
        github: { enabled: true },
        shortcut: { enabled: true },
      },
    },
  }));
  fs.writeFileSync(value.manifestPath, JSON.stringify({
    version: 1,
    jobs: {
      "daily-report:fixture": {
        description: "Daily-report installed snapshot fixture",
        schedule: "30 17 * * 1-5",
        argv: ["node", DAILY_REPORT_CLI, "reconcile", "work", "--config", configPath, "--max-days", "1"],
        requiredCommands: ["pi", "git"],
        optionalCommands: ["gh", "short"],
      },
    },
  }));

  const directDoctor = spawnSync(process.execPath, [DAILY_REPORT_CLI, "doctor", "work", "--config", configPath], {
    encoding: "utf8",
    env: value.env,
  });
  assert.equal(directDoctor.status, 0, directDoctor.stderr);
  assert.match(directDoctor.stdout, /GitHub: unavailable/);
  assert.match(directDoctor.stdout, /Shortcut: unavailable/);

  const id = "user:daily-report:fixture";
  const inspected = await run(["inspect", id, "--manifest", value.manifestPath, "--json"], value.runtime);
  const candidateDigest = json(inspected).candidate.digest;
  const installed = await run([
    "install", id,
    "--manifest", value.manifestPath,
    "--expected-candidate-digest", candidateDigest,
    "--json",
  ], value.runtime);
  const status = json(installed).result;
  const doctor = await run(["doctor", id, "--manifest", value.manifestPath, "--json"], value.runtime);
  assert.equal(json(doctor).diagnostics.installedCommands, "ok");
  assert.deepEqual(json(doctor).diagnostics.unavailableOptionalCommands, ["gh", "short"]);

  const ran = await run([
    "run", id,
    "--expected-installed-digest", status.metadata.digest,
    "--expected-revision", String(status.metadata.revision),
    "--json",
  ], value.runtime);
  assert.equal(json(ran).result.status, "ok");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "UTC" });
  const reportPath = path.join(vault, "daily-reports", today.slice(0, 4), `${today}.md`);
  assert.equal(fs.existsSync(reportPath), true);
  assert.match(fs.readFileSync(reportPath, "utf8"), /generation_status: partial/);
  assert.match(fs.readFileSync(reportPath, "utf8"), /Generated through the installed snapshot/);
});

test("doctor fails when an installed executable becomes unsafe outside the caller PATH", async (t) => {
  const value = fixture(t);
  const helper = path.join(value.bin, "helper");
  fs.writeFileSync(helper, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const manifest = JSON.parse(fs.readFileSync(value.manifestPath, "utf8"));
  manifest.jobs["test:cli"].optionalCommands = ["helper"];
  fs.writeFileSync(value.manifestPath, JSON.stringify(manifest));
  const id = "user:test:cli";
  const inspected = await run(["inspect", id, "--manifest", value.manifestPath, "--json"], value.runtime);
  await run([
    "install", id,
    "--manifest", value.manifestPath,
    "--expected-candidate-digest", json(inspected).candidate.digest,
    "--json",
  ], value.runtime);

  fs.chmodSync(helper, 0o777);
  const alternateBin = path.join(path.dirname(value.env.HOME), "alternate-bin");
  fs.mkdirSync(alternateBin);
  fs.symlinkSync(process.execPath, path.join(alternateBin, "node"));
  fs.writeFileSync(path.join(alternateBin, "launchctl"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const runtime = { ...value.runtime, env: { ...value.env, PATH: alternateBin } };

  await assert.rejects(
    run(["doctor", id, "--manifest", value.manifestPath, "--json"], runtime),
    (error) => error.code === "INSTALLED_UNHEALTHY" && /writable/.test(error.message),
  );
});

test("CLI completes the disabled install, run, enable, disable, logs, and remove flow", async (t) => {
  const value = fixture(t);
  const id = "user:test:cli";
  const inspected = await run(
    ["inspect", id, "--manifest", value.manifestPath, "--json"],
    value.runtime,
  );
  const candidateDigest = json(inspected).candidate.digest;

  const installed = await run(
    [
      "install",
      id,
      "--manifest",
      value.manifestPath,
      "--expected-candidate-digest",
      candidateDigest,
      "--json",
    ],
    value.runtime,
  );
  let status = json(installed).result;
  assert.equal(status.metadata.revision, 1);
  assert.equal(status.metadata.enabled, false);
  assert.equal(status.adapter.loaded, false);

  const plist = fs.readFileSync(status.adapter.plistPath, "utf8");
  const argumentsBody = /<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(plist)[1];
  const emittedArguments = [...argumentsBody.matchAll(/<string>([^<]*)<\/string>/g)]
    .map((match) => match[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
  const scheduled = spawnSync(emittedArguments[0], emittedArguments.slice(1), {
    encoding: "utf8",
    env: status.snapshot.environment,
  });
  assert.equal(scheduled.status, 0, scheduled.stderr);
  assert.equal(readRunHistory(id, { env: value.env })[0].trigger, "scheduled");

  const ran = await run(
    [
      "run",
      id,
      "--expected-installed-digest",
      status.metadata.digest,
      "--expected-revision",
      String(status.metadata.revision),
      "--json",
    ],
    value.runtime,
  );
  assert.equal(json(ran).result.status, "ok");
  assert.deepEqual(readRunHistory(id, { env: value.env }).map((record) => record.trigger), ["manual", "scheduled"]);
  const runs = json(await run(["runs", id, "--limit", "10", "--json"], value.runtime)).result.runs;
  assert.deepEqual(runs.map((record) => record.status), ["succeeded", "succeeded"]);
  const runLog = json(await run(["run-log", id, runs[0].runId, "--lines", "20", "--json"], value.runtime)).result;
  assert.match(runLog.content, /cli lifecycle output/);
  const disabledOverview = json(await run([
    "overview", "--manifest", value.manifestPath, "--history-limit", "10", "--json",
  ], value.runtime)).result;
  assert.equal(disabledOverview.jobs[0].nextRun, null);
  assert.equal(disabledOverview.jobs[0].recentRuns.length, 2);

  const enabled = await run(
    [
      "enable",
      id,
      "--expected-installed-digest",
      status.metadata.digest,
      "--expected-revision",
      String(status.metadata.revision),
      "--json",
    ],
    value.runtime,
  );
  status = json(enabled).result;
  assert.equal(status.metadata.revision, 2);
  assert.equal(status.metadata.enabled, true);
  assert.equal(status.adapter.loaded, true);
  const activeOverview = json(await run(["overview", "--manifest", value.manifestPath, "--json"], value.runtime)).result;
  assert.equal(typeof activeOverview.jobs[0].nextRun, "string");
  assert.equal(activeOverview.jobs[0].installation.enabled, true);

  const statusResult = await run(["status", id, "--json"], value.runtime);
  assert.equal(json(statusResult).result.drift.enabled, false);

  const logs = await run(["logs", id, "--lines", "50", "--json"], value.runtime);
  assert.match(json(logs).result.content, /cli lifecycle output/);

  const disabled = await run(
    [
      "disable",
      id,
      "--expected-installed-digest",
      status.metadata.digest,
      "--expected-revision",
      String(status.metadata.revision),
      "--json",
    ],
    value.runtime,
  );
  status = json(disabled).result;
  assert.equal(status.metadata.revision, 3);
  assert.equal(status.metadata.enabled, false);
  assert.equal(status.adapter.loaded, false);

  const removed = await run(
    [
      "remove",
      id,
      "--expected-installed-digest",
      status.metadata.digest,
      "--expected-revision",
      String(status.metadata.revision),
      "--json",
    ],
    value.runtime,
  );
  assert.equal(json(removed).result.removed, true);
  assert.equal(json(await run(["status", id, "--json"], value.runtime)).result.installed, false);
});

test("legacy global installations can run, roll back, and be removed", async (t) => {
  const value = fixture(t);
  const id = "global:test:cli";
  let status = installLegacyGlobalJob(value);
  assert.equal(status.metadata.enabled, false);
  assert.equal(json(await run(["status", id, "--json"], value.runtime)).result.installed, true);

  status = json(await run([
    "enable",
    id,
    "--expected-installed-digest", status.metadata.digest,
    "--expected-revision", String(status.metadata.revision),
    "--json",
  ], value.runtime)).result;
  assert.equal(status.metadata.enabled, true);

  const userId = "user:test:cli";
  const userCandidate = json(await run([
    "inspect", userId, "--manifest", value.manifestPath, "--json",
  ], value.runtime)).candidate;
  let userStatus = json(await run([
    "install",
    userId,
    "--manifest", value.manifestPath,
    "--expected-candidate-digest", userCandidate.digest,
    "--json",
  ], value.runtime)).result;
  await assert.rejects(
    run([
      "enable",
      userId,
      "--expected-installed-digest", userStatus.metadata.digest,
      "--expected-revision", String(userStatus.metadata.revision),
      "--json",
    ], value.runtime),
    (error) => error?.code === "SCOPE_CONFLICT" && /Disable global:test:cli/.test(error.message),
  );

  const scheduled = json(await run([
    "_run-installed",
    id,
    "--expected-installed-digest", status.metadata.digest,
    "--expected-revision", String(status.metadata.revision),
    "--json",
  ], value.runtime)).result;
  assert.equal(scheduled.status, "ok");
  const runs = json(await run(["runs", id, "--limit", "10", "--json"], value.runtime)).result.runs;
  assert.equal(runs[0].trigger, "scheduled");
  assert.match(json(await run(["run-log", id, runs[0].runId, "--lines", "20", "--json"], value.runtime)).result.content, /cli lifecycle output/);
  assert.match(json(await run(["logs", id, "--lines", "20", "--json"], value.runtime)).result.content, /cli lifecycle output/);

  status = json(await run([
    "disable",
    id,
    "--expected-installed-digest", status.metadata.digest,
    "--expected-revision", String(status.metadata.revision),
    "--json",
  ], value.runtime)).result;
  assert.equal(status.metadata.enabled, false);

  userStatus = json(await run([
    "enable",
    userId,
    "--expected-installed-digest", userStatus.metadata.digest,
    "--expected-revision", String(userStatus.metadata.revision),
    "--json",
  ], value.runtime)).result;
  assert.equal(userStatus.metadata.enabled, true);
  await assert.rejects(
    run([
      "enable",
      id,
      "--expected-installed-digest", status.metadata.digest,
      "--expected-revision", String(status.metadata.revision),
      "--json",
    ], value.runtime),
    (error) => error?.code === "SCOPE_CONFLICT" && /Disable user:test:cli/.test(error.message),
  );

  assert.equal(json(await run([
    "remove",
    id,
    "--expected-installed-digest", status.metadata.digest,
    "--expected-revision", String(status.metadata.revision),
    "--json",
  ], value.runtime)).result.removed, true);
});

test("legacy global IDs cannot create or change declarations", async (t) => {
  const value = fixture(t);
  for (const argv of [
    ["inspect", "global:test:cli", "--manifest", value.manifestPath],
    ["doctor", "global:test:cli", "--manifest", value.manifestPath],
    ["install", "global:test:cli", "--manifest", value.manifestPath],
    ["update", "global:test:cli", "--manifest", value.manifestPath],
    ["run", "global:test:cli"],
  ]) {
    await assert.rejects(
      run([...argv, "--json"], value.runtime),
      (error) => error?.code === "USAGE" && /existing installation/.test(error.message),
    );
  }
});
