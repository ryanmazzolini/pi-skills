import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { acquireLock } from "../runtime.mjs";
import {
  CronAdapterError,
  cronDefinition,
  cronStatus,
  disableCron,
  enableCron,
  installCronDisabled,
  removeCron,
  replaceCron,
} from "./cron.mjs";

function temporaryDirectory(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "scheduler-cron-test-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  return base;
}

function definition(base, overrides = {}) {
  return cronDefinition({
    jobId: "global:test:cron",
    schedule: "30 17 * * 1-5",
    nodePath: process.execPath,
    runnerPath: path.join(base, "bin", "scheduled-jobs.mjs"),
    stateRoot: path.join(base, "state", "pi-scheduler"),
    installedDigest: "a".repeat(64),
    revision: 3,
    logPath: path.join(base, "state", "pi-scheduler", "logs", "job.log"),
    ...overrides,
  });
}

function fakeCrontab(base, initial = "") {
  const executable = path.join(base, "crontab");
  fs.writeFileSync(executable, "", { mode: 0o755 });
  let content = initial;
  let failWrite = false;
  let failAfterWriteOnce = false;
  let writes = 0;
  return {
    executable,
    commandRunner(_executable, argv, options) {
      if (argv[0] === "-l") return { ok: true, stdout: content };
      if (argv[0] === "-") {
        writes += 1;
        if (failWrite) return { ok: false, stderr: "simulated write failure", detail: "simulated write failure" };
        content = options.input;
        if (failAfterWriteOnce) {
          failAfterWriteOnce = false;
          return { ok: false, stderr: "simulated partial write", detail: "simulated partial write" };
        }
        return { ok: true, stdout: "" };
      }
      throw new Error(`unexpected crontab argv: ${argv.join(" ")}`);
    },
    get content() { return content; },
    get writes() { return writes; },
    setFailWrite(value) { failWrite = value; },
    setContent(value) { content = value; },
    failAfterNextWrite() { failAfterWriteOnce = true; },
  };
}

function options(base, fake, overrides = {}) {
  return {
    crontab: fake.executable,
    commandRunner: fake.commandRunner.bind(fake),
    lockPath: path.join(base, "state", "pi-scheduler", "locks", "cron.lock"),
    ...overrides,
  };
}

test("definition binds the exact installed runner without shell interpolation", (t) => {
  const base = temporaryDirectory(t);
  const runnerPath = path.join(base, "bin", "scheduled job's runner.mjs");
  const invocationPath = path.join(base, "invocation.json");
  const logPath = path.join(base, "logs", "100% job's.log");
  fs.mkdirSync(path.dirname(runnerPath), { recursive: true });
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(
    runnerPath,
    `import fs from "node:fs"; fs.writeFileSync(${JSON.stringify(invocationPath)}, JSON.stringify(process.argv.slice(2)));\n`,
  );
  const created = definition(base, { runnerPath, logPath });
  assert.deepEqual(created.programArguments, [
    process.execPath,
    runnerPath,
    "_run-installed",
    "global:test:cron",
    "--expected-installed-digest",
    "a".repeat(64),
    "--expected-revision",
    "3",
    "--state-root",
    path.join(base, "state", "pi-scheduler"),
  ]);
  assert.match(created.block, /^# BEGIN pi-scheduler:[a-f0-9]{24}$/m);
  assert.match(created.block, /100\\% job/);
  assert.match(created.block, /job'"'"'s\.log/);
  assert.doesNotMatch(created.block, /\beval\b/);
  const commandLine = created.block.split("\n")[1].slice(`${created.schedule} `.length).replace(/\\%/g, "%");
  execFileSync("/bin/sh", ["-c", commandLine], { env: { PATH: "" } });
  assert.deepEqual(JSON.parse(fs.readFileSync(invocationPath, "utf8")), created.programArguments.slice(2));
});

test("disabled installation is inert and enable-disable preserves unrelated crontab", (t) => {
  const base = temporaryDirectory(t);
  const prior = "\n\n15 3 * * * /usr/bin/unrelated  \n\n\n# trailing whitespace  \n";
  const fake = fakeCrontab(base, prior);
  const created = definition(base);
  const runtime = options(base, fake);

  const installed = installCronDisabled(created, runtime);
  assert.equal(installed.enabled, false);
  assert.equal(fake.writes, 0);

  const enabled = enableCron(created, runtime);
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.artifactMatches, true);
  assert.match(fake.content, /unrelated/);
  assert.match(fake.content, new RegExp(created.marker));
  assert.equal(cronStatus(created, runtime).enabled, true);

  const disabled = disableCron(created, runtime);
  assert.equal(disabled.enabled, false);
  assert.equal(fake.content, prior);
  assert.equal(removeCron(created, runtime), true);
});

test("cron mutation refuses to invent a newline in unrelated content", (t) => {
  const base = temporaryDirectory(t);
  const prior = "15 3 * * * /usr/bin/unrelated";
  const fake = fakeCrontab(base, prior);
  assert.throws(
    () => enableCron(definition(base), options(base, fake)),
    /must end with a newline/,
  );
  assert.equal(fake.content, prior);
});

test("replacement changes one owned block and restores the complete prior crontab on failure", (t) => {
  const base = temporaryDirectory(t);
  const fake = fakeCrontab(base, "# retained header\n");
  const previous = definition(base);
  const next = definition(base, { installedDigest: "b".repeat(64), revision: 4 });
  const runtime = options(base, fake);
  enableCron(previous, runtime);
  const prior = fake.content;

  const replaced = replaceCron(previous, next, { ...runtime, wasEnabled: true, enableReplacement: true });
  assert.equal(replaced.enabled, true);
  assert.match(fake.content, new RegExp("b".repeat(64)));
  assert.doesNotMatch(fake.content, new RegExp("a".repeat(64)));
  assert.match(fake.content, /retained header/);

  const failing = definition(base, { installedDigest: "c".repeat(64), revision: 5 });
  fake.setFailWrite(true);
  assert.throws(
    () => replaceCron(next, failing, { ...runtime, wasEnabled: true, enableReplacement: true }),
    /rollback incomplete/,
  );
  fake.setFailWrite(false);
  assert.notEqual(fake.content, prior);
  assert.match(fake.content, new RegExp("b".repeat(64)));
});

test("replacement refuses a changed owned block under the cron lock", (t) => {
  const base = temporaryDirectory(t);
  const fake = fakeCrontab(base);
  const previous = definition(base);
  const next = definition(base, { installedDigest: "b".repeat(64), revision: 4 });
  const runtime = options(base, fake);
  enableCron(previous, runtime);
  fake.setContent(fake.content.replace("a".repeat(64), "tampered-digest"));
  const tampered = fake.content;
  assert.throws(
    () => replaceCron(previous, next, { ...runtime, wasEnabled: true, enableReplacement: true }),
    /changed before replacement/,
  );
  assert.equal(fake.content, tampered);
});

test("a failed write that changed crontab restores the complete prior value", (t) => {
  const base = temporaryDirectory(t);
  const prior = "# prior exact value\n15 3 * * * /usr/bin/unrelated\n";
  const fake = fakeCrontab(base, prior);
  fake.failAfterNextWrite();
  assert.throws(() => enableCron(definition(base), options(base, fake)), /simulated partial write/);
  assert.equal(fake.content, prior);
});

test("malformed or duplicated owned markers fail closed", (t) => {
  const base = temporaryDirectory(t);
  const created = definition(base);
  const fake = fakeCrontab(base, `${created.begin}\nline without end\n`);
  assert.throws(() => cronStatus(created, options(base, fake)), CronAdapterError);
});

test("scheduler-wide cron lock prevents concurrent read-modify-write", (t) => {
  const base = temporaryDirectory(t);
  const fake = fakeCrontab(base);
  const created = definition(base);
  const runtime = options(base, fake, { waitMilliseconds: 0 });
  const release = acquireLock(runtime.lockPath);
  try {
    assert.throws(() => enableCron(created, runtime), /already in progress/);
    assert.equal(fake.writes, 0);
  } finally {
    release();
  }
});
