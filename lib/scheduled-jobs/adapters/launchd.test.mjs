import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  disableLaunchd,
  enableLaunchd,
  installLaunchdDisabled,
  launchdDefinition,
  launchdIdentity,
  launchdStatus,
  probeLaunchd,
  removeLaunchd,
  replaceLaunchd,
} from "./launchd.mjs";

function temporaryHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "scheduled-jobs-launchd-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

function writeExecutable(filePath, source) {
  fs.writeFileSync(filePath, source, { mode: 0o700 });
}

function fakeLaunchctl(t, home, { failBootstrapContaining, failBootout = false } = {}) {
  fs.mkdirSync(home, { recursive: true });
  const executable = path.join(home, "fake-launchctl");
  const statePath = path.join(home, "launchctl-state.json");
  const logPath = path.join(home, "launchctl-argv.jsonl");
  fs.writeFileSync(statePath, JSON.stringify({ loaded: [], disabled: [] }));
  writeExecutable(executable, `#!${process.execPath}
const fs = require("node:fs");
const statePath = ${JSON.stringify(statePath)};
const logPath = ${JSON.stringify(logPath)};
const failBootstrapContaining = ${JSON.stringify(failBootstrapContaining ?? null)};
const failBootout = ${JSON.stringify(failBootout)};
const argv = process.argv.slice(2);
fs.appendFileSync(logPath, JSON.stringify(argv) + "\\n");
const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
const save = () => fs.writeFileSync(statePath, JSON.stringify(state));
const [command, first, second] = argv;
if (command === "print" && (first === "gui/501" || first === "user/501")) process.exit(0);
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
  if (failBootstrapContaining && plist.includes(failBootstrapContaining)) {
    process.stderr.write("simulated bootstrap failure\\n");
    process.exit(5);
  }
  const label = /<key>Label<\\/key>\\s*<string>([^<]+)<\\/string>/.exec(plist)[1];
  const target = first + "/" + label;
  if (!state.loaded.includes(target)) state.loaded.push(target);
  save();
  process.exit(0);
}
if (command === "bootout") {
  if (failBootout) {
    process.stderr.write("simulated still loaded\\n");
    process.exit(5);
  }
  state.loaded = state.loaded.filter((item) => item !== first);
  save();
  process.exit(0);
}
process.exit(64);
`);
  return {
    executable,
    readState: () => JSON.parse(fs.readFileSync(statePath, "utf8")),
    readLog: () => fs.existsSync(logPath)
      ? fs.readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse)
      : [],
  };
}

function runtime(launchctl, home) {
  return { launchctl, uid: 501, env: { HOME: home } };
}

function definition(home, overrides = {}) {
  return launchdDefinition({
    jobId: "global:daily-report:work",
    schedule: "30 17 * * 1-5",
    nodePath: process.execPath,
    runnerPath: path.join(home, "bin", "scheduled-jobs.mjs"),
    stateRoot: path.join(home, "state", "pi-scheduler"),
    installedDigest: "old-digest",
    revision: 7,
    environment: {
      HOME: home,
      LANG: "en_US.UTF-8",
      PATH: path.join(home, "state", "shims"),
      TMPDIR: path.join(home, "tmp"),
      USER: "fixture-user",
    },
    workingDirectory: path.join(home, "work & reports"),
    logPath: path.join(home, "state", "scheduler.log"),
    homeDirectory: home,
    ...overrides,
  });
}

test("definition is deterministic and binds the exact installed runner contract", (t) => {
  const home = temporaryHome(t);
  const runnerPath = path.join(home, "bin", "scheduled-jobs.mjs");
  const invocationPath = path.join(home, "runner-invocation.json");
  fs.mkdirSync(path.dirname(runnerPath), { recursive: true });
  writeExecutable(runnerPath, `#!${process.execPath}\nimport fs from "node:fs";\nfs.writeFileSync(${JSON.stringify(invocationPath)}, JSON.stringify(process.argv.slice(2)));\n`);
  const first = definition(home, { runnerPath });
  const second = definition(home, { runnerPath });

  assert.deepEqual(first, second);
  assert.deepEqual(first.programArguments, [
    process.execPath,
    runnerPath,
    "_run-installed",
    "global:daily-report:work",
    "--expected-installed-digest",
    "old-digest",
    "--expected-revision",
    "7",
    "--state-root",
    path.join(home, "state", "pi-scheduler"),
  ]);
  execFileSync(first.programArguments[0], first.programArguments.slice(1), {
    env: { PATH: "" },
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(invocationPath, "utf8")), first.programArguments.slice(2));

  assert.equal(first.plistPath, path.join(home, "Library", "LaunchAgents", `${first.label}.plist`));
  assert.match(first.plist, /<key>Weekday<\/key>\n        <integer>2<\/integer>/);
  assert.match(first.plist, /<key>Weekday<\/key>\n        <integer>6<\/integer>/);
  assert.doesNotMatch(first.plist, /<key>Weekday<\/key>\n        <integer>1<\/integer>/);
  assert.match(first.plist, /<key>WorkingDirectory<\/key>\n  <string>.*work &amp; reports<\/string>/);
  assert.match(first.plist, /<key>StandardOutPath<\/key>/);
  assert.match(first.plist, /<key>StandardErrorPath<\/key>/);
  assert.doesNotMatch(first.plist, /RunAtLoad|SHELL|credential/i);
  const expectedEnvironment = {
    HOME: home,
    LANG: "en_US.UTF-8",
    PATH: path.join(home, "state", "shims"),
    TMPDIR: path.join(home, "tmp"),
    USER: "fixture-user",
  };
  for (const [key, value] of Object.entries(expectedEnvironment)) {
    assert.match(first.plist, new RegExp(`<key>${key}</key>\\n    <string>${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</string>`));
  }
  const environmentBody = /<key>EnvironmentVariables<\/key>\n  <dict>\n([\s\S]*?)\n  <\/dict>/.exec(first.plist)[1];
  assert.deepEqual([...environmentBody.matchAll(/<key>([^<]+)<\/key>/g)].map((match) => match[1]), Object.keys(expectedEnvironment));
});

test("disabled install writes a private artifact without loading it", (t) => {
  const home = temporaryHome(t);
  const fake = fakeLaunchctl(t, home);
  const created = definition(home);
  assert.deepEqual(probeLaunchd(runtime(fake.executable, home)), { available: true, domain: "gui/501" });

  const status = installLaunchdDisabled(created, runtime(fake.executable, home));
  assert.equal(status.artifactExists, true);
  assert.equal(status.loaded, false);
  assert.equal(status.disabled, true);
  assert.equal(status.enabled, false);
  assert.equal(fs.statSync(created.plistPath).mode & 0o777, 0o600);
  assert.equal(fs.readFileSync(created.plistPath, "utf8"), created.plist);
  assert.deepEqual(fake.readState().loaded, []);
  assert.ok(fake.readLog().some((argv) => argv[0] === "disable"));
  assert.ok(!fake.readLog().some((argv) => argv[0] === "bootstrap"));
});

test("enable, status, and disable use launchctl argv without a shell", (t) => {
  const home = temporaryHome(t);
  const fake = fakeLaunchctl(t, home);
  const created = definition(home);
  installLaunchdDisabled(created, runtime(fake.executable, home));

  const enabled = enableLaunchd(created, runtime(fake.executable, home));
  assert.equal(enabled.loaded, true);
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.disabled, false);
  assert.deepEqual(fake.readState().loaded, [`gui/501/${created.label}`]);
  assert.equal(launchdStatus(created, runtime(fake.executable, home)).enabled, true);

  const disabled = disableLaunchd(created, runtime(fake.executable, home));
  assert.equal(disabled.loaded, false);
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.disabled, true);
  assert.deepEqual(fake.readState().loaded, []);
  assert.ok(fake.readLog().some((argv) => argv.join(" ") === `bootstrap gui/501 ${created.plistPath}`));
  assert.ok(fake.readLog().some((argv) => argv.join(" ") === `bootout gui/501/${created.label}`));
});

test("enablement rejects successful launchctl exits that do not reach the required state", (t) => {
  const home = temporaryHome(t);
  const created = definition(home);
  fs.mkdirSync(path.dirname(created.plistPath), { recursive: true });
  fs.writeFileSync(created.plistPath, created.plist, { mode: 0o600 });
  const commandRunner = (_executable, argv) => {
    if (argv[0] === "print" && argv[1] === "gui/501") return "";
    if (argv[0] === "print") throw new Error("not loaded");
    if (argv[0] === "print-disabled") return `disabled services = {\n  "${created.label}" => true\n}\n`;
    return "";
  };
  assert.throws(
    () => enableLaunchd(created, { ...runtime("/fake/launchctl", home), commandRunner }),
    /did not reach its required launchd state/,
  );
});

test("enabled replacement restores the prior loaded artifact when activation fails", (t) => {
  const home = temporaryHome(t);
  const fake = fakeLaunchctl(t, home, { failBootstrapContaining: "new-digest" });
  const previous = definition(home);
  const replacement = definition(home, { installedDigest: "new-digest", revision: 8 });
  installLaunchdDisabled(previous, runtime(fake.executable, home));
  enableLaunchd(previous, runtime(fake.executable, home));

  assert.throws(
    () => replaceLaunchd(previous, replacement, runtime(fake.executable, home)),
    /simulated bootstrap failure/,
  );
  assert.equal(fs.readFileSync(previous.plistPath, "utf8"), previous.plist);
  const status = launchdStatus(previous, runtime(fake.executable, home));
  assert.equal(status.loaded, true);
  assert.equal(status.enabled, true);
  assert.equal(status.disabled, false);
  assert.deepEqual(fake.readState().loaded, [`gui/501/${previous.label}`]);
  const bootstraps = fake.readLog().filter((argv) => argv[0] === "bootstrap");
  assert.equal(bootstraps.length, 3);
});

test("removal never deletes an artifact while launchd reports it loaded", (t) => {
  const home = temporaryHome(t);
  const workingFake = fakeLaunchctl(t, home);
  const created = definition(home);
  installLaunchdDisabled(created, runtime(workingFake.executable, home));
  enableLaunchd(created, runtime(workingFake.executable, home));

  const failingFake = fakeLaunchctl(t, path.join(home, "failure"), { failBootout: true });
  // Point the second fake at a preloaded equivalent target while retaining the real artifact.
  const failingStatePath = path.join(home, "failure", "launchctl-state.json");
  fs.writeFileSync(failingStatePath, JSON.stringify({ loaded: [`gui/501/${created.label}`], disabled: [] }));
  assert.throws(
    () => removeLaunchd(created, runtime(failingFake.executable, home)),
    /still loaded|remains loaded/i,
  );
  assert.equal(fs.existsSync(created.plistPath), true);

  assert.equal(removeLaunchd(created, runtime(workingFake.executable, home)), true);
  assert.equal(fs.existsSync(created.plistPath), false);
  assert.deepEqual(workingFake.readState().loaded, []);
});

test("identity is stable and isolates scoped job IDs", (t) => {
  const home = temporaryHome(t);
  const globalIdentity = launchdIdentity("global:daily-report:work", { homeDirectory: home });
  assert.deepEqual(globalIdentity, launchdIdentity("global:daily-report:work", { homeDirectory: home }));
  assert.notEqual(globalIdentity.label, launchdIdentity("project:1234:daily-report:work", { homeDirectory: home }).label);
  assert.match(globalIdentity.label, /^io\.pi\.scheduler\.[a-f0-9]{24}$/);
});
