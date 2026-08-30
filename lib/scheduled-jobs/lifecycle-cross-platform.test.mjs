import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { run as runCli } from "../../bin/scheduled-jobs.mjs";
import { loadDeclarations, resolveCandidate } from "./index.mjs";
import { enableJob, installJob, installedStatus, removeJob, updateJob } from "./lifecycle.mjs";

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const RUNNER_PATH = path.resolve(TEST_DIRECTORY, "../../bin/scheduled-jobs.mjs");

function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "scheduler-cross-platform-test-"));
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
  for (const name of ["systemctl", "crontab"]) {
    fs.writeFileSync(path.join(bin, name), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  }
  const scriptPath = path.join(base, "job.mjs");
  fs.writeFileSync(scriptPath, "console.log('cross-platform')\n");
  const manifestPath = path.join(configHome, "pi-scheduler", "jobs.json");
  const writeSchedule = (schedule) => fs.writeFileSync(manifestPath, JSON.stringify({
    version: 1,
    jobs: {
      "test:cross-platform": {
        description: "Cross-platform lifecycle",
        schedule,
        argv: ["node", scriptPath],
        requiredCommands: [],
        optionalCommands: [],
      },
    },
  }));
  writeSchedule("30 17 * * 1-5");
  const env = {
    HOME: home,
    USER: "scheduler-test",
    TMPDIR: temporary,
    XDG_CONFIG_HOME: configHome,
    XDG_STATE_HOME: stateHome,
    PATH: bin,
    LANG: "C",
  };
  const systemd = { enabled: new Set(), active: new Set() };
  const systemdRunner = (_executable, argv) => {
    assert.equal(argv[0], "--user");
    const command = argv[1];
    const name = argv.at(-1);
    if (command === "show-environment" || command === "daemon-reload") return { ok: true, stdout: "" };
    if (command === "is-enabled") return { ok: systemd.enabled.has(name), stdout: systemd.enabled.has(name) ? "enabled\n" : "disabled\n" };
    if (command === "is-active") return { ok: systemd.active.has(name), stdout: systemd.active.has(name) ? "active\n" : "inactive\n" };
    if (command === "disable") {
      systemd.enabled.delete(name);
      if (argv.includes("--now")) systemd.active.delete(name);
      return { ok: true, stdout: "" };
    }
    if (command === "enable") {
      systemd.enabled.add(name);
      return { ok: true, stdout: "" };
    }
    if (command === "start") {
      systemd.active.add(name);
      return { ok: true, stdout: "" };
    }
    throw new Error(`unexpected systemctl argv: ${argv.join(" ")}`);
  };
  const cron = { content: "# unrelated\n", failWrite: false };
  const cronRunner = (_executable, argv, options) => {
    if (argv[0] === "-l") return { ok: true, stdout: cron.content };
    if (argv[0] === "-") {
      if (cron.failWrite) return { ok: false, detail: "simulated cron write failure" };
      cron.content = options.input;
      return { ok: true, stdout: "" };
    }
    throw new Error(`unexpected crontab argv: ${argv.join(" ")}`);
  };
  const id = "user:test:cross-platform";
  const loadDeclaration = () => loadDeclarations({ manifestPath, env }).find((item) => item.id === id);
  const adapterOptions = {
    systemd: {
      systemctl: path.join(bin, "systemctl"),
      commandRunner: systemdRunner,
    },
    cron: {
      crontab: path.join(bin, "crontab"),
      commandRunner: cronRunner,
    },
  };
  const candidateOptions = (adapter) => ({
    adapter,
    env,
    platform: "linux",
    runnerPath: RUNNER_PATH,
  });
  const candidate = (adapter) => resolveCandidate(loadDeclaration(), candidateOptions(adapter));
  return { base, env, id, loadDeclaration, adapterOptions, candidateOptions, candidate, systemd, cron, writeSchedule };
}

function installInput(value, adapter, expectedCandidateDigest) {
  return {
    id: value.id,
    loadDeclaration: value.loadDeclaration,
    expectedCandidateDigest,
    candidateOptions: value.candidateOptions(adapter),
    env: value.env,
    runnerPath: RUNNER_PATH,
    adapterOptions: value.adapterOptions,
  };
}

function installedInput(value, status) {
  return {
    id: value.id,
    expectedInstalledDigest: status.metadata.digest,
    expectedRevision: status.metadata.revision,
    env: value.env,
    adapterOptions: value.adapterOptions,
  };
}

function updateInput(value, adapter, candidate, status) {
  return {
    ...installInput(value, adapter, candidate.digest),
    expectedInstalledDigest: status.metadata.digest,
    expectedRevision: status.metadata.revision,
  };
}

test("systemd lifecycle is disabled-first and preserves persistent enabled state", async (t) => {
  const value = fixture(t);
  const candidate = value.candidate("auto");
  assert.equal(candidate.contract.adapter.selected, "systemd");
  let status = installJob(installInput(value, "auto", candidate.digest));
  assert.equal(status.adapter.name, "systemd");
  assert.equal(status.metadata.enabled, false);
  assert.equal(status.adapter.enabled, false);
  assert.equal(status.adapter.loaded, false);

  const unavailableOptions = {
    systemd: {
      systemctl: value.adapterOptions.systemd.systemctl,
      commandRunner: () => ({ ok: false, stdout: "", detail: "no user manager" }),
    },
  };
  const unavailable = installedStatus(value.id, { env: value.env, adapterOptions: unavailableOptions });
  assert.equal(unavailable.health, "unavailable");
  await assert.rejects(
    runCli(["status", value.id, "--json"], { env: value.env, platform: "linux", adapterOptions: unavailableOptions }),
    (error) => error.code === "ADAPTER_UNAVAILABLE" && error.exitCode === 4,
  );

  status = enableJob(installedInput(value, status));
  assert.equal(status.metadata.enabled, true);
  assert.equal(status.adapter.enabled, true);
  assert.equal(status.adapter.loaded, true);
  assert.match(status.warning, /systemd may immediately run/);

  assert.deepEqual(removeJob(installedInput(value, status)), { id: value.id, removed: true });
  assert.equal(value.systemd.enabled.size, 0);
  assert.equal(value.systemd.active.size, 0);
});

test("systemd artifact path changes use staged remove-install instead of same-path replacement", (t) => {
  const value = fixture(t);
  let status = installJob(installInput(value, "auto", value.candidate("auto").digest));
  const oldServicePath = status.adapter.servicePath;
  const alternateEnv = { ...value.env, XDG_CONFIG_HOME: path.join(value.base, "alternate-config") };
  fs.mkdirSync(alternateEnv.XDG_CONFIG_HOME);
  const candidateOptions = {
    adapter: "auto",
    env: alternateEnv,
    platform: "linux",
    runnerPath: RUNNER_PATH,
  };
  const candidate = resolveCandidate(value.loadDeclaration(), candidateOptions);
  status = updateJob({
    id: value.id,
    loadDeclaration: value.loadDeclaration,
    expectedCandidateDigest: candidate.digest,
    expectedInstalledDigest: status.metadata.digest,
    expectedRevision: status.metadata.revision,
    candidateOptions,
    env: value.env,
    runnerPath: RUNNER_PATH,
    adapterOptions: value.adapterOptions,
  });
  assert.notEqual(status.adapter.servicePath, oldServicePath);
  assert.equal(fs.existsSync(oldServicePath), false);
  assert.equal(fs.existsSync(status.adapter.servicePath), true);
  assert.equal(status.metadata.enabled, false);
});

test("automatic selection uses warned cron fallback for a valid non-native schedule", (t) => {
  const value = fixture(t);
  value.writeSchedule("*/10 * * * *");
  const candidate = value.candidate("auto");
  assert.equal(candidate.contract.adapter.selected, "cron");
  assert.match(candidate.contract.adapter.warning, /does not provide catch-up/);
  const status = installJob(installInput(value, "auto", candidate.digest));
  assert.equal(status.adapter.name, "cron");
  assert.equal(status.metadata.enabled, false);
  assert.deepEqual(status.drift, { enabled: false, artifact: false, otherAdapters: false });
});

test("forced cron replaces enabled systemd without coexisting, and automatic systemd can replace it back", (t) => {
  const value = fixture(t);
  let status = installJob(installInput(value, "auto", value.candidate("auto").digest));
  status = enableJob(installedInput(value, status));

  const cronCandidate = value.candidate("cron");
  status = updateJob(updateInput(value, "cron", cronCandidate, status));
  assert.equal(status.adapter.name, "cron");
  assert.equal(status.metadata.enabled, true);
  assert.equal(value.systemd.enabled.size, 0);
  assert.equal(value.systemd.active.size, 0);
  assert.match(value.cron.content, /# BEGIN pi-scheduler:/);

  const systemdCandidate = value.candidate("auto");
  status = updateJob(updateInput(value, "auto", systemdCandidate, status));
  assert.equal(status.adapter.name, "systemd");
  assert.equal(status.metadata.enabled, true);
  assert.equal(value.systemd.enabled.size, 1);
  assert.equal(value.systemd.active.size, 1);
  assert.doesNotMatch(value.cron.content, /# BEGIN pi-scheduler:/);
});

test("updates fail closed when a historical adapter cannot be verified", (t) => {
  const value = fixture(t);
  let status = installJob(installInput(value, "auto", value.candidate("auto").digest));
  status = enableJob(installedInput(value, status));
  const cronCandidate = value.candidate("cron");
  status = updateJob(updateInput(value, "cron", cronCandidate, status));
  const unavailableOptions = {
    ...value.adapterOptions,
    systemd: {
      systemctl: value.adapterOptions.systemd.systemctl,
      commandRunner: () => ({ ok: false, stdout: "", detail: "no user manager" }),
    },
  };
  assert.throws(
    () => updateJob({
      ...updateInput(value, "cron", cronCandidate, status),
      adapterOptions: unavailableOptions,
    }),
    /another adapter is enabled or unverifiable/,
  );
});

test("enablement detects an old enabled adapter and removal cleans every adapter history entry", (t) => {
  const value = fixture(t);
  let status = installJob(installInput(value, "auto", value.candidate("auto").digest));
  status = enableJob(installedInput(value, status));
  status = updateJob(updateInput(value, "cron", value.candidate("cron"), status));
  const oldSystemd = status.otherAdapters.find((entry) => entry.name === "systemd");
  value.systemd.enabled.add(oldSystemd.status.timerName);
  value.systemd.active.add(oldSystemd.status.timerName);

  assert.throws(
    () => enableJob(installedInput(value, status)),
    /another adapter is enabled or unverifiable/,
  );
  assert.deepEqual(removeJob(installedInput(value, status)), { id: value.id, removed: true });
  assert.equal(value.systemd.enabled.size, 0);
  assert.equal(value.systemd.active.size, 0);
  assert.doesNotMatch(value.cron.content, /# BEGIN pi-scheduler:/);
  assert.equal(installedStatus(value.id, { env: value.env, adapterOptions: value.adapterOptions }).installed, false);
});

test("failed forced-cron activation restores enabled systemd and prior installed state", (t) => {
  const value = fixture(t);
  let status = installJob(installInput(value, "auto", value.candidate("auto").digest));
  status = enableJob(installedInput(value, status));
  const priorDigest = status.metadata.digest;
  const priorRevision = status.metadata.revision;
  value.cron.failWrite = true;

  const cronCandidate = value.candidate("cron");
  assert.throws(
    () => updateJob(updateInput(value, "cron", cronCandidate, status)),
    /Cross-adapter transition failed/,
  );
  value.cron.failWrite = false;

  status = installedStatus(value.id, { env: value.env, adapterOptions: value.adapterOptions });
  assert.equal(status.adapter.name, "systemd");
  assert.equal(status.metadata.digest, priorDigest);
  assert.equal(status.metadata.revision, priorRevision);
  assert.equal(status.metadata.enabled, true);
  assert.equal(status.adapter.enabled, true);
  assert.equal(status.adapter.loaded, true);
  assert.doesNotMatch(value.cron.content, /# BEGIN pi-scheduler:/);
});
