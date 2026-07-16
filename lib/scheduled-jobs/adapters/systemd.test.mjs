import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  disableSystemd,
  enableSystemd,
  installSystemdDisabled,
  probeSystemd,
  removeSystemd,
  replaceSystemd,
  systemdDefinition,
  systemdIdentity,
  systemdStatus,
} from "./systemd.mjs";

function temporaryHome(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "scheduled-jobs-systemd-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const home = path.join(base, "home");
  fs.mkdirSync(home);
  return { base, home };
}

function writeExecutable(filePath, source) {
  fs.writeFileSync(filePath, source, { mode: 0o700 });
}

function fakeSystemctl(t, base, { failStartContaining, disableNoop = false } = {}) {
  const executable = path.join(base, "fake-systemctl");
  const statePath = path.join(base, "systemctl-state.json");
  const logPath = path.join(base, "systemctl-argv.jsonl");
  fs.writeFileSync(statePath, JSON.stringify({ enabled: [], active: [] }));
  writeExecutable(executable, `#!${process.execPath}
const fs = require("node:fs");
const path = require("node:path");
const statePath = ${JSON.stringify(statePath)};
const logPath = ${JSON.stringify(logPath)};
const failStartContaining = ${JSON.stringify(failStartContaining ?? null)};
const disableNoop = ${JSON.stringify(disableNoop)};
const argv = process.argv.slice(2);
fs.appendFileSync(logPath, JSON.stringify(argv) + "\\n");
if (argv[0] !== "--user") process.exit(64);
const command = argv[1];
const name = argv.at(-1);
const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
const save = () => fs.writeFileSync(statePath, JSON.stringify(state));
if (command === "show-environment" || command === "daemon-reload") process.exit(0);
if (command === "is-enabled") {
  process.stdout.write(state.enabled.includes(name) ? "enabled\\n" : "disabled\\n");
  process.exit(state.enabled.includes(name) ? 0 : 1);
}
if (command === "is-active") {
  process.stdout.write(state.active.includes(name) ? "active\\n" : "inactive\\n");
  process.exit(state.active.includes(name) ? 0 : 3);
}
if (command === "disable") {
  if (!disableNoop) {
    state.enabled = state.enabled.filter((item) => item !== name);
    if (argv.includes("--now")) state.active = state.active.filter((item) => item !== name);
    save();
  }
  process.exit(0);
}
if (command === "enable") {
  if (!state.enabled.includes(name)) state.enabled.push(name);
  save();
  process.exit(0);
}
if (command === "start") {
  const unitDirectory = path.join(${JSON.stringify(path.join(base, "config"))}, "systemd", "user");
  const timer = fs.readFileSync(path.join(unitDirectory, name), "utf8");
  const serviceName = /^Unit=(.+)$/m.exec(timer)[1];
  const service = fs.readFileSync(path.join(unitDirectory, serviceName), "utf8");
  if (failStartContaining && service.includes(failStartContaining)) {
    process.stderr.write("simulated start failure\\n");
    process.exit(5);
  }
  if (!state.active.includes(name)) state.active.push(name);
  save();
  process.exit(0);
}
process.exit(64);
`);
  return {
    executable,
    readState: () => JSON.parse(fs.readFileSync(statePath, "utf8")),
    writeState: (state) => fs.writeFileSync(statePath, JSON.stringify(state)),
    readLog: () => fs.existsSync(logPath)
      ? fs.readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse)
      : [],
  };
}

function runtime(fake, value) {
  return {
    systemctl: fake.executable,
    configHome: path.join(value.base, "config"),
    homeDirectory: value.home,
    env: { HOME: value.home },
  };
}

function definition(value, overrides = {}) {
  return systemdDefinition({
    jobId: "global:daily-report:work",
    schedule: "30 17 * * 1-5",
    nodePath: process.execPath,
    runnerPath: path.join(value.base, "bin", "scheduled-jobs.mjs"),
    stateRoot: path.join(value.base, "state", "pi-scheduler"),
    installedDigest: "old-digest",
    revision: 7,
    environment: {
      HOME: value.home,
      LANG: "en_US.UTF-8",
      PATH: path.join(value.base, "state", "shims"),
      TMPDIR: path.join(value.base, "tmp"),
      USER: "fixture-user",
    },
    workingDirectory: path.join(value.base, "work & reports"),
    logPath: path.join(value.base, "state", "scheduler output.log"),
    homeDirectory: value.home,
    configHome: path.join(value.base, "config"),
    ...overrides,
  });
}

test("definition is deterministic, persistent, and binds the exact installed runner", (t) => {
  const value = temporaryHome(t);
  const runnerPath = path.join(value.base, "bin", "scheduled-jobs.mjs");
  const invocationPath = path.join(value.base, "runner-invocation.json");
  fs.mkdirSync(path.dirname(runnerPath), { recursive: true });
  writeExecutable(runnerPath, `#!${process.execPath}\nimport fs from "node:fs";\nfs.writeFileSync(${JSON.stringify(invocationPath)}, JSON.stringify(process.argv.slice(2)));\n`);
  const first = definition(value, { runnerPath });
  const second = definition(value, { runnerPath });

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
    path.join(value.base, "state", "pi-scheduler"),
  ]);
  execFileSync(first.programArguments[0], first.programArguments.slice(1), { env: { PATH: "" } });
  assert.deepEqual(JSON.parse(fs.readFileSync(invocationPath, "utf8")), first.programArguments.slice(2));

  assert.equal(first.timerPath, path.join(value.base, "config", "systemd", "user", `${first.unitBase}.timer`));
  assert.match(first.timer, /OnCalendar=Mon,Tue,Wed,Thu,Fri \*-\*-\* 17:30:00/);
  assert.match(first.timer, /Persistent=true/);
  assert.match(first.timer, new RegExp(`Unit=${first.serviceName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.match(first.service, new RegExp(`ExecStart="${process.execPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  assert.match(first.service, /WorkingDirectory=".*work & reports"/);
  assert.match(first.service, /StandardOutput=append:.*scheduler output\.log/);
  assert.match(first.service, /StandardError=append:.*scheduler output\.log/);
  assert.doesNotMatch(first.service, /SHELL|credential|XDG_/i);
  const dollarPath = definition(value, { stateRoot: path.join(value.base, "${UNTRUSTED}") });
  assert.match(dollarPath.service, /\$\$\{UNTRUSTED\}/);
  assert.doesNotMatch(dollarPath.service, /[^$]\$\{UNTRUSTED\}/);
  const unusualLogPath = path.join(value.base, "logs", "back\\slash%output.log");
  const escapedLog = definition(value, { logPath: unusualLogPath });
  const expectedLogValue = unusualLogPath.replace(/%/g, "%%").replace(/\\/g, "\\\\");
  assert.ok(escapedLog.service.includes(`StandardOutput=append:${expectedLogValue}`));
  assert.ok(escapedLog.service.includes(`StandardError=append:${expectedLogValue}`));
  const environmentKeys = [...first.service.matchAll(/^Environment="([^=]+)=/gm)].map((match) => match[1]);
  assert.deepEqual(environmentKeys, ["HOME", "LANG", "PATH", "TMPDIR", "USER"]);
});

test("disabled install writes private units without enabling or starting the timer", (t) => {
  const value = temporaryHome(t);
  const fake = fakeSystemctl(t, value.base);
  const created = definition(value);
  assert.deepEqual(probeSystemd(runtime(fake, value)), { available: true });

  const status = installSystemdDisabled(created, runtime(fake, value));
  assert.equal(status.artifactExists, true);
  assert.equal(status.enabled, false);
  assert.equal(status.active, false);
  assert.equal(fs.statSync(created.servicePath).mode & 0o777, 0o600);
  assert.equal(fs.statSync(created.timerPath).mode & 0o777, 0o600);
  assert.equal(fs.readFileSync(created.servicePath, "utf8"), created.service);
  assert.equal(fs.readFileSync(created.timerPath, "utf8"), created.timer);
  assert.deepEqual(fake.readState(), { enabled: [], active: [] });
  assert.ok(fake.readLog().some((argv) => argv.join(" ") === "--user daemon-reload"));
  assert.ok(!fake.readLog().some((argv) => argv[1] === "start"));
});

test("probe and status are non-mutating, while enable and disable enforce their postconditions", (t) => {
  const value = temporaryHome(t);
  const fake = fakeSystemctl(t, value.base);
  const created = definition(value);
  installSystemdDisabled(created, runtime(fake, value));
  const beforeStatus = fake.readLog().length;
  assert.equal(systemdStatus(created, runtime(fake, value)).enabled, false);
  assert.ok(fake.readLog().slice(beforeStatus).every((argv) => new Set(["show-environment", "is-enabled", "is-active"]).has(argv[1])));

  const enabled = enableSystemd(created, runtime(fake, value));
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.active, true);
  assert.deepEqual(fake.readState(), { enabled: [created.timerName], active: [created.timerName] });

  const disabled = disableSystemd(created, runtime(fake, value));
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.active, false);
  assert.deepEqual(fake.readState(), { enabled: [], active: [] });
  assert.ok(fake.readLog().some((argv) => argv.join(" ") === `--user enable ${created.timerName}`));
  assert.ok(fake.readLog().some((argv) => argv.join(" ") === `--user start ${created.timerName}`));
  assert.ok(fake.readLog().some((argv) => argv.join(" ") === `--user disable --now ${created.timerName}`));
});

test("enablement rejects successful systemctl exits that do not change state", (t) => {
  const value = temporaryHome(t);
  const working = fakeSystemctl(t, value.base);
  const created = definition(value);
  installSystemdDisabled(created, runtime(working, value));
  const calls = [];
  const commandRunner = (_executable, argv) => {
    calls.push(argv);
    if (argv[1] === "show-environment" || argv[1] === "daemon-reload" || argv[1] === "disable" || argv[1] === "enable" || argv[1] === "start") return "";
    if (argv[1] === "is-enabled") {
      const error = new Error("disabled");
      error.stdout = "disabled\n";
      throw error;
    }
    if (argv[1] === "is-active") {
      const error = new Error("inactive");
      error.stdout = "inactive\n";
      throw error;
    }
    throw new Error("unexpected command");
  };
  assert.throws(
    () => enableSystemd(created, { ...runtime(working, value), commandRunner }),
    /did not reach its required systemd state/,
  );
  assert.ok(calls.every((argv) => Array.isArray(argv) && argv[0] === "--user"));
});

test("enabled replacement restores both prior artifacts and timer states when activation fails", (t) => {
  const value = temporaryHome(t);
  const fake = fakeSystemctl(t, value.base, { failStartContaining: "new-digest" });
  const previous = definition(value);
  const replacement = definition(value, { installedDigest: "new-digest", revision: 8 });
  installSystemdDisabled(previous, runtime(fake, value));
  enableSystemd(previous, runtime(fake, value));

  assert.throws(
    () => replaceSystemd(previous, replacement, {
      ...runtime(fake, value),
      wasEnabled: true,
      wasActive: true,
      enableReplacement: true,
      activateReplacement: true,
    }),
    /simulated start failure/,
  );
  assert.equal(fs.readFileSync(previous.servicePath, "utf8"), previous.service);
  assert.equal(fs.readFileSync(previous.timerPath, "utf8"), previous.timer);
  const restored = systemdStatus(previous, runtime(fake, value));
  assert.equal(restored.enabled, true);
  assert.equal(restored.active, true);
  assert.deepEqual(fake.readState(), { enabled: [previous.timerName], active: [previous.timerName] });
});

test("removal retains artifacts unless the timer is proven disabled and inactive", (t) => {
  const value = temporaryHome(t);
  const working = fakeSystemctl(t, value.base);
  const created = definition(value);
  installSystemdDisabled(created, runtime(working, value));
  enableSystemd(created, runtime(working, value));

  const noOpBase = path.join(value.base, "no-op");
  fs.mkdirSync(noOpBase);
  const noOp = fakeSystemctl(t, noOpBase, { disableNoop: true });
  noOp.writeState({ enabled: [created.timerName], active: [created.timerName] });
  assert.throws(
    () => removeSystemd(created, { ...runtime(noOp, value), configHome: path.join(value.base, "config") }),
    /required systemd state|still enabled or active/i,
  );
  assert.equal(fs.existsSync(created.servicePath), true);
  assert.equal(fs.existsSync(created.timerPath), true);

  assert.equal(removeSystemd(created, runtime(working, value)), true);
  assert.equal(fs.existsSync(created.servicePath), false);
  assert.equal(fs.existsSync(created.timerPath), false);
  assert.deepEqual(working.readState(), { enabled: [], active: [] });
});

test("identity is stable and isolates scoped IDs under an isolated config home", (t) => {
  const value = temporaryHome(t);
  const options = { homeDirectory: value.home, configHome: path.join(value.base, "config") };
  const globalIdentity = systemdIdentity("global:daily-report:work", options);
  assert.deepEqual(globalIdentity, systemdIdentity("global:daily-report:work", options));
  assert.notEqual(globalIdentity.unitBase, systemdIdentity("project:1234:daily-report:work", options).unitBase);
  assert.match(globalIdentity.unitBase, /^pi-scheduler-[a-f0-9]{24}$/);
});
