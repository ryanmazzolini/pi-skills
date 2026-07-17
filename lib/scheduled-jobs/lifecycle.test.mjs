import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadDeclarations, resolveCandidate } from "./index.mjs";
import {
  disableJob,
  enableJob,
  installJob,
  installedStatus,
  removeJob,
  updateJob,
} from "./lifecycle.mjs";

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const RUNNER_PATH = path.resolve(TEST_DIRECTORY, "../../bin/scheduled-jobs.mjs");

function writeExecutable(filePath, source) {
  fs.writeFileSync(filePath, source, { mode: 0o755 });
}

function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "scheduler-lifecycle-test-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const home = path.join(base, "home");
  const bin = path.join(base, "bin");
  const temporary = path.join(base, "tmp");
  const configHome = path.join(base, "config");
  const stateHome = path.join(base, "state");
  fs.mkdirSync(home);
  fs.mkdirSync(bin);
  fs.mkdirSync(temporary);
  fs.mkdirSync(path.join(configHome, "pi-scheduler"), { recursive: true });
  fs.symlinkSync(process.execPath, path.join(bin, "node"));
  const jobScript = path.join(base, "job.mjs");
  fs.writeFileSync(jobScript, "console.log('fixture')\n");
  const launchctl = path.join(bin, "launchctl");
  const launchctlState = path.join(base, "launchctl.json");
  const failDigestPath = path.join(base, "fail-digest.txt");
  const catchupTrigger = path.join(base, "run-catchup");
  fs.writeFileSync(launchctlState, JSON.stringify({ loaded: [], disabled: [] }));
  writeExecutable(launchctl, `#!${process.execPath}
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const statePath = ${JSON.stringify(launchctlState)};
const failDigestPath = ${JSON.stringify(failDigestPath)};
const catchupTrigger = ${JSON.stringify(catchupTrigger)};
const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
const save = () => fs.writeFileSync(statePath, JSON.stringify(state));
const [command, first, second] = process.argv.slice(2);
if (command === "print" && (first === "gui/${process.getuid()}" || first === "user/${process.getuid()}")) process.exit(0);
if (command === "print") process.exit(state.loaded.includes(first) ? 0 : 113);
if (command === "print-disabled") {
  process.stdout.write("disabled services = {\\n" + state.disabled.map((label) => '  "' + label + '" => true').join("\\n") + "\\n}\\n");
  process.exit(0);
}
if (command === "disable") {
  const label = first.slice(first.lastIndexOf("/") + 1);
  if (!state.disabled.includes(label)) state.disabled.push(label);
  save();
  process.exit(0);
}
if (command === "enable") {
  const label = first.slice(first.lastIndexOf("/") + 1);
  state.disabled = state.disabled.filter((item) => item !== label);
  save();
  process.exit(0);
}
if (command === "bootstrap") {
  const plist = fs.readFileSync(second, "utf8");
  const failDigest = fs.existsSync(failDigestPath) ? fs.readFileSync(failDigestPath, "utf8").trim() : "";
  if (failDigest && plist.includes(failDigest)) process.exit(9);
  const label = /<key>Label<\\/key>\\s*<string>([^<]+)<\\/string>/.exec(plist)[1];
  const target = first + "/" + label;
  if (!state.loaded.includes(target)) state.loaded.push(target);
  save();
  if (fs.existsSync(catchupTrigger)) {
    const body = /<key>ProgramArguments<\\/key>\\s*<array>([\\s\\S]*?)<\\/array>/.exec(plist)[1];
    const decode = (value) => value.replace(/&amp;/g, "&").replace(/&quot;/g, '\"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    const args = [...body.matchAll(/<string>([^<]*)<\\/string>/g)].map((match) => decode(match[1]));
    const environmentBody = /<key>EnvironmentVariables<\\/key>\\s*<dict>([\\s\\S]*?)<\\/dict>/.exec(plist)[1];
    const environment = {};
    for (const match of environmentBody.matchAll(/<key>([^<]+)<\\/key>\\s*<string>([^<]*)<\\/string>/g)) environment[decode(match[1])] = decode(match[2]);
    spawn(args[0], args.slice(1), { detached: true, env: environment, stdio: "ignore" }).unref();
  }
  process.exit(0);
}
if (command === "bootout") {
  state.loaded = state.loaded.filter((item) => item !== first);
  save();
  process.exit(0);
}
process.exit(64);
`);
  const env = {
    HOME: home,
    USER: "scheduler-test",
    TMPDIR: temporary,
    XDG_CONFIG_HOME: configHome,
    XDG_STATE_HOME: stateHome,
    PATH: bin,
    LANG: "C",
  };
  const manifestPath = path.join(configHome, "pi-scheduler", "jobs.json");
  const writeManifest = (description = "Lifecycle fixture") => {
    fs.writeFileSync(manifestPath, JSON.stringify({
      version: 1,
      jobs: {
        "test:lifecycle": {
          description,
          schedule: "30 17 * * 1-5",
          argv: ["node", jobScript],
          requiredCommands: [],
          optionalCommands: [],
        },
      },
    }));
  };
  writeManifest();
  const id = "global:test:lifecycle";
  const loadDeclaration = () => loadDeclarations({ manifestPath, env }).find((item) => item.id === id);
  const candidateOptions = { env, platform: "darwin", runnerPath: RUNNER_PATH };
  const resolve = () => resolveCandidate(loadDeclaration(), candidateOptions);
  return {
    base,
    env,
    id,
    manifestPath,
    launchctl,
    launchctlState,
    failDigestPath,
    catchupTrigger,
    loadDeclaration,
    candidateOptions,
    resolve,
    writeManifest,
    adapterOptions: { launchctl },
  };
}

function installInput(value, expectedCandidateDigest) {
  return {
    id: value.id,
    loadDeclaration: value.loadDeclaration,
    expectedCandidateDigest,
    candidateOptions: value.candidateOptions,
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
    runnerPath: RUNNER_PATH,
    adapterOptions: value.adapterOptions,
  };
}

test("launchd lifecycle installs disabled, enables, updates, disables, and removes", async (t) => {
  const value = fixture(t);
  const firstCandidate = value.resolve();
  let status = installJob(installInput(value, firstCandidate.digest));
  assert.equal(status.metadata.revision, 1);
  assert.equal(status.metadata.enabled, false);
  assert.equal(status.adapter.loaded, false);
  assert.equal(status.adapter.disabled, true);
  assert.equal(status.drift.enabled, false);
  assert.match(fs.readFileSync(status.adapter.plistPath, "utf8"), /--expected-revision<\/string>\n    <string>1<\/string>/);

  fs.writeFileSync(value.catchupTrigger, "");
  status = enableJob(installedInput(value, status));
  assert.equal(status.metadata.revision, 2);
  assert.equal(status.metadata.enabled, true);
  assert.equal(status.adapter.loaded, true);
  assert.equal(status.drift.enabled, false);
  assert.match(status.warning, /missed schedule/);
  const logPath = status.snapshot.contract.scheduler.logPath;
  let catchupCompleted = false;
  for (let attempt = 0; attempt < 100 && !catchupCompleted; attempt += 1) {
    const content = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "";
    catchupCompleted = /finish global:test:lifecycle code=0/.test(content);
    if (!catchupCompleted) await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(catchupCompleted, true, "catch-up runner should wait for the committed revision and execute");
  fs.rmSync(value.catchupTrigger, { force: true });

  value.writeManifest("Updated lifecycle fixture");
  const secondCandidate = value.resolve();
  status = updateJob({
    ...installInput(value, secondCandidate.digest),
    expectedInstalledDigest: status.metadata.digest,
    expectedRevision: status.metadata.revision,
  });
  assert.equal(status.metadata.revision, 3);
  assert.equal(status.metadata.digest, secondCandidate.digest);
  assert.equal(status.metadata.enabled, true);
  assert.equal(status.adapter.loaded, true);

  const stale = { ...installedInput(value, status), expectedRevision: 2 };
  assert.throws(() => disableJob(stale), /digest or lifecycle revision changed/);

  status = disableJob(installedInput(value, status));
  assert.equal(status.metadata.revision, 4);
  assert.equal(status.metadata.enabled, false);
  assert.equal(status.adapter.loaded, false);
  assert.equal(status.adapter.disabled, true);

  assert.deepEqual(removeJob(installedInput(value, status)), { id: value.id, removed: true });
  assert.equal(installedStatus(value.id, { env: value.env, adapterOptions: value.adapterOptions }).installed, false);
  assert.equal(fs.existsSync(status.adapter.plistPath), false);
});

test("disable repairs adapter drift instead of treating matching metadata as a no-op", (t) => {
  const value = fixture(t);
  let status = installJob(installInput(value, value.resolve().digest));
  fs.writeFileSync(value.launchctlState, JSON.stringify({ loaded: [], disabled: [] }));
  status = disableJob(installedInput(value, status));
  assert.equal(status.metadata.revision, 2);
  assert.equal(status.metadata.enabled, false);
  assert.equal(status.adapter.disabled, true);
  assert.equal(status.drift.enabled, false);
});

test("updating a disabled job keeps the replacement disabled", (t) => {
  const value = fixture(t);
  let status = installJob(installInput(value, value.resolve().digest));
  value.writeManifest("Disabled replacement");
  const replacement = value.resolve();
  status = updateJob({
    ...installInput(value, replacement.digest),
    expectedInstalledDigest: status.metadata.digest,
    expectedRevision: status.metadata.revision,
  });
  assert.equal(status.metadata.revision, 2);
  assert.equal(status.metadata.enabled, false);
  assert.equal(status.adapter.loaded, false);
  assert.equal(status.adapter.disabled, true);
  assert.equal(status.drift.enabled, false);
});

test("a disabled snapshot with a missing command binding can update to a reviewed recovery candidate", (t) => {
  const value = fixture(t);
  const original = installJob(installInput(value, value.resolve().digest));
  const oldBin = path.dirname(value.launchctl);
  fs.rmSync(path.join(oldBin, "node"));
  let status = installedStatus(value.id, { env: value.env, adapterOptions: value.adapterOptions });
  assert.equal(status.health, "unhealthy");
  assert.match(status.healthReason, /command mapping is missing/i);
  assert.equal(status.metadata.enabled, false);
  assert.equal(status.adapter.loaded, false);
  assert.equal(status.adapter.disabled, true);

  const recoveryBin = path.join(value.base, "recovery-bin");
  fs.mkdirSync(recoveryBin);
  fs.symlinkSync(process.execPath, path.join(recoveryBin, "node"));
  value.env.PATH = `${recoveryBin}${path.delimiter}${oldBin}`;
  const replacement = value.resolve();
  status = updateJob({
    ...installInput(value, replacement.digest),
    expectedInstalledDigest: original.metadata.digest,
    expectedRevision: original.metadata.revision,
  });
  assert.equal(status.health, "ok");
  assert.equal(status.metadata.revision, 2);
  assert.equal(status.metadata.digest, replacement.digest);
  assert.equal(status.metadata.enabled, false);
  assert.equal(status.adapter.loaded, false);
  assert.equal(status.adapter.disabled, true);
  assert.equal(status.snapshot.contract.requiredCommands.node, path.join(recoveryBin, "node"));
});

test("command-binding recovery rejects a changed installed shim", (t) => {
  const value = fixture(t);
  const original = installJob(installInput(value, value.resolve().digest));
  const nodeShim = path.join(original.snapshot.contract.scheduler.shimsDirectory, "node");
  fs.rmSync(nodeShim);
  writeExecutable(nodeShim, "#!/bin/sh\nexit 0\n");
  let status = installedStatus(value.id, { env: value.env, adapterOptions: value.adapterOptions });
  assert.equal(status.health, "unhealthy");
  assert.match(status.healthReason, /shim changed/i);

  value.writeManifest("Must not recover changed shim");
  const replacement = value.resolve();
  assert.throws(
    () => updateJob({
      ...installInput(value, replacement.digest),
      expectedInstalledDigest: original.metadata.digest,
      expectedRevision: original.metadata.revision,
    }),
    /Installed job state is unhealthy/,
  );
  status = installedStatus(value.id, { env: value.env, adapterOptions: value.adapterOptions });
  assert.equal(status.metadata.revision, original.metadata.revision);
  assert.equal(status.metadata.enabled, false);
  assert.equal(status.adapter.loaded, false);
});

test("install re-digests under lock and leaves no artifact for a stale candidate", (t) => {
  const value = fixture(t);
  const reviewed = value.resolve();
  value.writeManifest("Changed after review");
  assert.throws(() => installJob(installInput(value, reviewed.digest)), /candidate changed/i);
  assert.equal(installedStatus(value.id, { env: value.env, adapterOptions: value.adapterOptions }).installed, false);
  assert.equal(fs.existsSync(path.join(value.env.HOME, "Library", "LaunchAgents")), false);
});

test("enabled update failure restores the prior state and loaded artifact", (t) => {
  const value = fixture(t);
  let status = installJob(installInput(value, value.resolve().digest));
  status = enableJob(installedInput(value, status));
  const previousDigest = status.metadata.digest;
  const previousRevision = status.metadata.revision;
  const previousPlist = fs.readFileSync(status.adapter.plistPath, "utf8");

  value.writeManifest("Replacement that must fail");
  const replacement = value.resolve();
  fs.writeFileSync(value.failDigestPath, replacement.digest);
  assert.throws(
    () => updateJob({
      ...installInput(value, replacement.digest),
      expectedInstalledDigest: previousDigest,
      expectedRevision: previousRevision,
    }),
    /Launchd replacement failed|Could not load/,
  );

  status = installedStatus(value.id, { env: value.env, adapterOptions: value.adapterOptions });
  assert.equal(status.metadata.digest, previousDigest);
  assert.equal(status.metadata.revision, previousRevision);
  assert.equal(status.metadata.enabled, true);
  assert.equal(status.adapter.loaded, true);
  assert.equal(fs.readFileSync(status.adapter.plistPath, "utf8"), previousPlist);
});
