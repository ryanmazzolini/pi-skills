import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { run as runCli } from "../../bin/scheduled-jobs.mjs";
import {
  readSchedulerStatusSnapshot,
  schedulerStatusSnapshotPath,
  writeSchedulerStatusSnapshot,
  writeUnavailableSchedulerStatusSnapshot,
} from "../../lib/scheduled-jobs/status-cache.mjs";
import scheduledJobsExtension, {
  actionReviewText,
  applicableActions,
  createSchedulerCommandHandler,
  createSchedulerStatusMonitor,
  discoverManifestPaths,
  loadDashboardData,
  globalManifestPath,
  resolveSchedulerCliPath,
  schedulerDoctorCommand,
  sanitizeDisplay,
} from "./index.ts";

initTheme("dark", false);

function commandResult(stdout = "", code = 0, stderr = "") {
  return { stdout, stderr, code, killed: false };
}

function cliSuccess(value) {
  return commandResult(JSON.stringify({ ok: true, ...value }));
}

function cliFailure(code, message) {
  return commandResult("", 7, JSON.stringify({ ok: false, error: { code, message, details: null } }));
}

function uiHarness(selectors = [], confirmations = [], customs = []) {
  const selects = [];
  const confirms = [];
  const customCalls = [];
  const customOptions = [];
  const notices = [];
  return {
    selects,
    confirms,
    customCalls,
    customOptions,
    notices,
    ui: {
      async custom(factory, options) {
        customCalls.push(factory);
        customOptions.push(options);
        return new Promise((resolve, reject) => {
          let component;
          const done = (value) => {
            component?.dispose?.();
            resolve(value);
          };
          component = factory(
            { terminal: { rows: 24 }, requestRender() {} },
            componentTheme,
            {},
            done,
          );
          if (component.constructor.name === "BorderedLoader") return;
          const interaction = customs.shift();
          if (typeof interaction !== "function") {
            reject(new Error(`Missing custom interaction for ${component.constructor.name}`));
            return;
          }
          Promise.resolve(interaction(component)).catch(reject);
        });
      },
      async select(title, options) {
        selects.push({ title, options });
        const selector = selectors.shift();
        if (selector === undefined || selector === null) return undefined;
        if (typeof selector === "function") return selector(options, title);
        return options.find((option) => option.includes(selector));
      },
      async confirm(title, message) {
        confirms.push({ title, message });
        return confirmations.shift() ?? false;
      },
      notify(message, level) {
        notices.push({ message, level });
      },
    },
  };
}

const componentTheme = { fg: (_color, text) => text, bg: (_color, text) => text, bold: (text) => text };

function candidate(digest = "candidate-digest", description = "Fixture") {
  return {
    digest,
    contract: {
      id: "global:test:job",
      sourcePath: "/tmp/config/pi-scheduler/jobs.json",
      description,
      schedule: "30 17 * * 1-5",
      adapter: { selected: "launchd", mode: "auto" },
      argv: ["/usr/local/bin/node", "/tmp/job.mjs"],
      workingDirectory: "/tmp",
      timeoutSeconds: 1800,
      requiredCommands: { node: "/usr/local/bin/node" },
      optionalCommands: { gh: null },
    },
  };
}

function inspection({ installed = false, enabled = false, drift = false, health = "ok", healthCategory = null, digest = "candidate-digest", revision = 1 } = {}) {
  const resolved = candidate(digest);
  return {
    candidate: resolved,
    installation: installed
      ? {
          installed: true,
          health,
          healthCategory,
          definitionDrift: drift,
          metadata: { enabled, digest: "installed-digest", revision },
          snapshot: { contract: candidate("installed-digest", drift ? "Old fixture" : "Fixture").contract },
          drift: { enabled: false, artifact: false, otherAdapters: false },
        }
      : { installed: false, health: "absent" },
  };
}

function overviewJob(inspect = inspection()) {
  const current = inspect.installation;
  return {
    id: "global:test:job",
    key: "test:job",
    scope: { kind: "global" },
    description: "Fixture",
    schedule: "30 17 * * 1-5",
    sourcePath: "/tmp/config/pi-scheduler/jobs.json",
    manifestPath: "/tmp/config/pi-scheduler/jobs.json",
    candidate: inspect.candidate
      ? {
          digest: inspect.candidate.digest,
          adapter: { ...inspect.candidate.contract.adapter, warning: null },
          workingDirectory: inspect.candidate.contract.workingDirectory,
          timeoutSeconds: inspect.candidate.contract.timeoutSeconds,
        }
      : null,
    candidateError: null,
    installation: current.installed
      ? {
          installed: true,
          health: current.health,
          healthReason: current.healthReason ?? null,
          healthCategory: current.healthCategory ?? null,
          enabled: current.metadata.enabled,
          digest: current.metadata.digest,
          revision: current.metadata.revision,
          definitionDrift: current.definitionDrift,
          adapterDrift: current.drift && Object.values(current.drift).some(Boolean),
        }
      : { installed: false, health: "absent" },
    installationError: null,
    nextRun: current.installed && current.metadata.enabled ? "2026-07-27T17:30:00.000Z" : null,
    nextRunError: null,
    recentRuns: [],
    historyError: null,
  };
}

function declaredJob(overrides = {}) {
  return {
    id: "global:test:job",
    key: "test:job",
    scope: "global",
    manifestPath: "/tmp/config/pi-scheduler/jobs.json",
    declaration: { schedule: "30 17 * * 1-5" },
    inspection: inspection(),
    ...overrides,
  };
}

function scriptedDependencies({ inspect = inspection(), operation } = {}) {
  const calls = [];
  return {
    calls,
    dependencies: {
      env: { HOME: "/tmp/home", XDG_CONFIG_HOME: "/tmp/config" },
      exists: (filePath) => filePath === "/tmp/config/pi-scheduler/jobs.json",
      async exec(command, args, options) {
        calls.push({ command, args });
        if (command === "git") return commandResult("", 1);
        const cliArgs = args;
        if (cliArgs[0] === "overview") {
          return cliSuccess({
            command: "overview",
            result: { generatedAt: "2026-07-25T09:00:00.000Z", jobs: [overviewJob(inspect)] },
          });
        }
        if (cliArgs[0] === "inspect") return cliSuccess({ command: "inspect", ...inspect });
        if (operation) return operation(cliArgs, calls, options);
        return cliSuccess({ command: cliArgs[0], result: {} });
      },
    },
  };
}

test("an explicitly loaded scheduler extension uses its matching worktree CLI", (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "scheduler-extension-path-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const extensionPath = path.join(base, "extensions", "scheduled-jobs", "index.ts");
  const cliPath = path.join(base, "bin", "scheduled-jobs.mjs");
  fs.mkdirSync(path.dirname(extensionPath), { recursive: true });
  fs.mkdirSync(path.dirname(cliPath), { recursive: true });
  fs.writeFileSync(extensionPath, "");
  fs.writeFileSync(cliPath, "");

  assert.equal(resolveSchedulerCliPath({
    argv: ["node", "pi", "--no-extensions", "--extension", "./extensions/scheduled-jobs/index.ts"],
    cwd: base,
    moduleCliPath: "/installed/pi-skills/bin/scheduled-jobs.mjs",
  }), cliPath);
});

test("invokes the scheduler CLI directly instead of Pi's packaged runtime", async () => {
  const scripted = scriptedDependencies();
  await loadDashboardData("/work", scripted.dependencies);
  const overview = scripted.calls.find((call) => call.args[0] === "overview");
  assert.match(overview.command, /scheduled-jobs\.mjs$/);
  assert.equal(overview.args.at(-1), "--json");
});

test("registers only the human scheduler command and session-local status events", () => {
  const commands = [];
  const events = [];
  let tools = 0;
  scheduledJobsExtension({
    on: (name, handler) => events.push({ name, handler }),
    registerCommand: (name, options) => commands.push({ name, options }),
    registerTool: () => tools++,
    exec: async () => commandResult(),
  });

  assert.equal(tools, 0);
  assert.deepEqual(commands.map((entry) => entry.name), ["scheduler"]);
  assert.deepEqual(events.map((entry) => entry.name), ["session_start", "input", "session_shutdown"]);
  assert.match(commands[0].options.description, /reviewed/);
});

function statusWatchHarness() {
  const watches = [];
  const timers = [];
  return {
    watches,
    timers,
    options: {
      watch(pathname, options, listener) {
        const entry = { pathname, options, listener, closed: false, error: undefined };
        const watcher = {
          close() { entry.closed = true; },
          on(event, callback) {
            if (event === "error") entry.error = callback;
            return watcher;
          },
        };
        watches.push(entry);
        return watcher;
      },
      setTimeout(callback, milliseconds) {
        const timer = { callback, milliseconds, cleared: false, unrefed: false, unref() { timer.unrefed = true; } };
        timers.push(timer);
        return timer;
      },
      clearTimeout(timer) { timer.cleared = true; },
    },
    emit(filename) {
      const current = watches.at(-1);
      if (current && !current.closed) current.listener("rename", filename);
    },
    flush() {
      for (const timer of timers.splice(0)) {
        if (!timer.cleared) timer.callback();
      }
    },
  };
}

test("ambient status loads once, follows shared cache events, and closes its watcher", async (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "scheduler-status-watch-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const manifestPath = path.join(base, "config", "pi-scheduler", "jobs.json");
  const env = { HOME: base, XDG_CONFIG_HOME: path.join(base, "config"), XDG_STATE_HOME: path.join(base, "state") };
  const current = overviewJob(inspection({ installed: false }));
  current.candidateError = { code: "ENVIRONMENT", message: "missing command" };
  let overviewCalls = 0;
  let manifestExists = true;
  const statuses = [];
  const watches = statusWatchHarness();
  const dependencies = {
    env,
    exists: (filePath) => manifestExists && filePath === manifestPath,
    async exec(command, args) {
      if (command === "git") return commandResult("", 1);
      if (args[0] === "overview") {
        overviewCalls++;
        assert.equal(watches.watches.length, 1);
        return cliSuccess({
          command: "overview",
          result: { generatedAt: "2026-07-25T09:00:00.000Z", jobs: [current] },
        });
      }
      throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
    },
  };
  const monitor = createSchedulerStatusMonitor(dependencies, watches.options);
  const ctx = {
    cwd: "/work",
    hasUI: true,
    mode: "tui",
    ui: {
      theme: { fg: (_color, text) => text },
      setStatus(id, value) { statuses.push({ id, value }); },
    },
  };

  await monitor.start(ctx);
  assert.equal(overviewCalls, 1);
  assert.equal(watches.watches[0].options.persistent, false);
  assert.deepEqual(statuses.at(-1), { id: "scheduled-jobs", value: "! Scheduler · 1 stuck" });

  writeUnavailableSchedulerStatusSnapshot(manifestPath, env);
  const snapshotName = path.basename(schedulerStatusSnapshotPath(manifestPath, env));
  watches.emit(`.${snapshotName}.123.atomic.tmp`);
  watches.emit(`.${snapshotName}.123.atomic.tmp`);
  assert.equal(watches.timers.length, 1);
  assert.equal(watches.timers[0].unrefed, true);
  watches.flush();
  assert.deepEqual(statuses.at(-1), { id: "scheduled-jobs", value: undefined });
  assert.equal(overviewCalls, 1);

  writeSchedulerStatusSnapshot(manifestPath, {
    generatedAt: new Date().toISOString(),
    jobs: [current, { ...current, id: "global:test:other", key: "test:other" }],
  }, env);
  watches.emit(path.basename(schedulerStatusSnapshotPath(manifestPath, env)));
  watches.flush();
  assert.deepEqual(statuses.at(-1), { id: "scheduled-jobs", value: "! Scheduler · 2 stuck" });

  writeUnavailableSchedulerStatusSnapshot(manifestPath, env);
  watches.watches[0].error(new Error("watch failed"));
  await monitor.updateContext(ctx);
  assert.equal(watches.watches.length, 2);
  assert.deepEqual(statuses.at(-1), { id: "scheduled-jobs", value: undefined });

  writeSchedulerStatusSnapshot(manifestPath, { generatedAt: new Date().toISOString(), jobs: [current] }, env);
  watches.emit(path.basename(schedulerStatusSnapshotPath(manifestPath, env)));
  watches.flush();
  assert.deepEqual(statuses.at(-1), { id: "scheduled-jobs", value: "! Scheduler · 1 stuck" });
  manifestExists = false;
  await monitor.reconcile(ctx);
  assert.deepEqual(statuses.at(-1), { id: "scheduled-jobs", value: undefined });

  await monitor.stop();
  assert.equal(watches.watches.every((entry) => entry.closed), true);
  assert.deepEqual(statuses.at(-1), { id: "scheduled-jobs", value: undefined });
});

test("ambient status discovers a manifest from an unknown shared snapshot event", async (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "scheduler-status-discovery-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const manifestPath = path.join(base, "config", "pi-scheduler", "jobs.json");
  const env = { HOME: base, XDG_CONFIG_HOME: path.join(base, "config"), XDG_STATE_HOME: path.join(base, "state") };
  let manifestExists = false;
  const statuses = [];
  const watches = statusWatchHarness();
  const dependencies = {
    env,
    exists: (filePath) => manifestExists && filePath === manifestPath,
    async exec(command, args) {
      if (command === "git") return commandResult("", 1);
      throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
    },
  };
  const monitor = createSchedulerStatusMonitor(dependencies, watches.options);
  const ctx = {
    cwd: "/work",
    hasUI: true,
    mode: "tui",
    ui: {
      theme: { fg: (_color, text) => text },
      setStatus(id, value) { statuses.push({ id, value }); },
    },
  };

  await monitor.start(ctx);
  assert.deepEqual(statuses.at(-1), { id: "scheduled-jobs", value: undefined });

  manifestExists = true;
  const blocked = overviewJob(inspection({ installed: true, enabled: true, health: "unhealthy" }));
  writeSchedulerStatusSnapshot(manifestPath, { generatedAt: new Date().toISOString(), jobs: [blocked] }, env);
  const snapshotName = path.basename(schedulerStatusSnapshotPath(manifestPath, env));
  watches.emit(`.${snapshotName}.123.atomic.tmp`);
  watches.flush();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(statuses.at(-1), { id: "scheduled-jobs", value: "! Scheduler · 1 stuck" });

  await monitor.stop();
});

test("ambient status closes the initial discovery event window", async (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "scheduler-status-initial-window-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const manifestPath = path.join(base, "config", "pi-scheduler", "jobs.json");
  const env = { HOME: base, XDG_CONFIG_HOME: path.join(base, "config"), XDG_STATE_HOME: path.join(base, "state") };
  const statuses = [];
  const watches = statusWatchHarness();
  let created = false;
  const blocked = overviewJob(inspection({ installed: true, enabled: true, health: "unhealthy" }));
  const dependencies = {
    env,
    exists(filePath) {
      if (filePath !== manifestPath) return false;
      if (created) return true;
      created = true;
      writeSchedulerStatusSnapshot(manifestPath, { generatedAt: new Date().toISOString(), jobs: [blocked] }, env);
      const snapshotName = path.basename(schedulerStatusSnapshotPath(manifestPath, env));
      watches.emit(`.${snapshotName}.123.atomic.tmp`);
      return false;
    },
    async exec(command, args) {
      if (command === "git") return commandResult("", 1);
      throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
    },
  };
  const monitor = createSchedulerStatusMonitor(dependencies, watches.options);
  const ctx = {
    cwd: "/work",
    hasUI: true,
    mode: "tui",
    ui: {
      theme: { fg: (_color, text) => text },
      setStatus(id, value) { statuses.push({ id, value }); },
    },
  };

  await monitor.start(ctx);
  assert.equal(watches.watches.length, 1);
  assert.equal(watches.timers.length, 1);
  watches.flush();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(statuses.at(-1), { id: "scheduled-jobs", value: "! Scheduler · 1 stuck" });
  await monitor.stop();
});

test("ambient status aggregates global and current-project snapshots", async (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "scheduler-status-scopes-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const globalManifest = path.join(base, "config", "pi-scheduler", "jobs.json");
  const projectManifest = "/work/.pi/scheduler.json";
  const env = { HOME: base, XDG_CONFIG_HOME: path.join(base, "config"), XDG_STATE_HOME: path.join(base, "state") };
  const blocked = overviewJob(inspection({ installed: true, enabled: true, health: "unhealthy" }));
  const draft = overviewJob(inspection({ installed: false }));
  const statuses = [];
  const watches = statusWatchHarness();
  const dependencies = {
    env,
    exists: (filePath) => new Set([globalManifest, projectManifest]).has(filePath),
    async exec(command, args) {
      if (command === "git") return commandResult("/work\n");
      if (args[0] === "overview") {
        return cliSuccess({
          command: "overview",
          result: { generatedAt: "2026-07-25T09:00:00.000Z", jobs: [blocked] },
        });
      }
      throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
    },
  };
  const monitor = createSchedulerStatusMonitor(dependencies, watches.options);
  const ctx = {
    cwd: "/work",
    hasUI: true,
    mode: "tui",
    ui: {
      theme: { fg: (_color, text) => text },
      setStatus(id, value) { statuses.push({ id, value }); },
    },
  };

  await monitor.start(ctx);
  assert.deepEqual(statuses.at(-1), { id: "scheduled-jobs", value: "! Scheduler · 2 stuck" });

  writeSchedulerStatusSnapshot(globalManifest, { generatedAt: new Date().toISOString(), jobs: [blocked] }, env);
  writeSchedulerStatusSnapshot(projectManifest, { generatedAt: new Date().toISOString(), jobs: [draft] }, env);
  watches.emit(null);
  watches.flush();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(statuses.at(-1), { id: "scheduled-jobs", value: "! Scheduler · 1 stuck" });

  writeUnavailableSchedulerStatusSnapshot(globalManifest, env);
  writeUnavailableSchedulerStatusSnapshot(projectManifest, env);
  watches.emit(null);
  watches.flush();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(statuses.at(-1), { id: "scheduled-jobs", value: undefined });
  await monitor.stop();
});

test("discovers the fixed global manifest and ignores project scope outside Git", async () => {
  const execCalls = [];
  const dependencies = {
    env: { HOME: "/home/test", XDG_CONFIG_HOME: "/config" },
    exists: (filePath) => filePath === "/config/pi-scheduler/jobs.json",
    exec: async (command, args) => {
      execCalls.push({ command, args });
      return commandResult("", 128, "not a worktree");
    },
  };

  assert.equal(globalManifestPath(dependencies.env), "/config/pi-scheduler/jobs.json");
  assert.deepEqual(await discoverManifestPaths("/work/notes", dependencies), [
    { scope: "global", manifestPath: "/config/pi-scheduler/jobs.json" },
  ]);
  assert.deepEqual(execCalls, [{ command: "git", args: ["-C", "/work/notes", "rev-parse", "--show-toplevel"] }]);
});

test("discovers only the exact current Git root project manifest", async () => {
  const dependencies = {
    env: { HOME: "/home/test", XDG_CONFIG_HOME: "/config" },
    exists: (filePath) => new Set([
      "/config/pi-scheduler/jobs.json",
      "/work/project/.pi/scheduler.json",
    ]).has(filePath),
    exec: async () => commandResult("/work/project\n"),
  };

  assert.deepEqual(await discoverManifestPaths("/work/project/nested", dependencies), [
    { scope: "global", manifestPath: "/config/pi-scheduler/jobs.json" },
    { scope: "project", manifestPath: "/work/project/.pi/scheduler.json" },
  ]);
});

test("sanitizes displayed values and builds an exact doctor command", () => {
  assert.equal(sanitizeDisplay("bad\nlabel\u0000"), "bad�label�");
  assert.equal(
    schedulerDoctorCommand(overviewJob(), "/opt/scheduled-jobs"),
    "'/opt/scheduled-jobs' doctor 'global:test:job' --manifest '/tmp/config/pi-scheduler/jobs.json' --json",
  );
});

test("maps only applicable actions from health, drift, and enablement", () => {
  assert.deepEqual(applicableActions(declaredJob()), ["inspect", "install"]);
  assert.deepEqual(
    applicableActions(declaredJob({ inspection: inspection({ installed: true, drift: true }) })),
    ["inspect", "logs", "update", "run", "enable", "remove"],
  );
  assert.deepEqual(
    applicableActions(declaredJob({ inspection: inspection({ installed: true, enabled: true }) })),
    ["inspect", "logs", "run", "disable", "remove"],
  );
  assert.deepEqual(
    applicableActions(declaredJob({ inspection: inspection({ installed: true, health: "unhealthy", healthCategory: "commands", drift: true }) })),
    ["inspect", "logs", "update"],
  );
  assert.deepEqual(
    applicableActions(declaredJob({ inspection: inspection({ installed: true, health: "unhealthy", drift: true }) })),
    ["inspect", "logs"],
  );
  assert.deepEqual(
    applicableActions(declaredJob({ inspection: inspection({ installed: true, health: "unavailable" }) })),
    ["inspect", "logs", "remove"],
  );
  assert.deepEqual(
    applicableActions(declaredJob({ inspection: inspection({ installed: true, health: "conflict" }) })),
    ["inspect", "logs", "remove"],
  );
  assert.deepEqual(
    applicableActions(declaredJob({ inspection: inspection({ installed: true, health: "partial" }) })),
    ["inspect", "logs"],
  );
});

test("shows the exact executable contract for install and run reviews", () => {
  for (const [job, action] of [
    [declaredJob(), "install"],
    [declaredJob({ inspection: inspection({ installed: true }) }), "run"],
  ]) {
    const review = actionReviewText(job, action);
    assert.match(review, /Scope: global:test:job/);
    assert.match(review, /Argv: \["\/usr\/local\/bin\/node","\/tmp\/job\.mjs"\]/);
    assert.match(review, /Adapter: launchd \(auto\)/);
    assert.match(review, /required node: \/usr\/local\/bin\/node/);
  }
});

test("refuses a mutation review when the exact contract exceeds its bound", () => {
  const oversized = inspection();
  oversized.candidate.contract.argv = [
    "/usr/local/bin/node",
    ...Array.from({ length: 7 }, (_, index) => `${index}-${"x".repeat(4_000)}`),
  ];
  assert.throws(
    () => actionReviewText(declaredJob({ inspection: oversized }), "install"),
    /too large to display completely/,
  );
});

test("update review shows installed and candidate identities and their changed fields", () => {
  const review = actionReviewText(
    declaredJob({ inspection: inspection({ installed: true, drift: true, revision: 4 }) }),
    "update",
  );
  assert.match(review, /Lifecycle revision: 4/);
  assert.match(review, /Installed digest: installed-digest/);
  assert.match(review, /Candidate digest: candidate-digest/);
  assert.match(review, /Changed fields: description/);
});

test("pause, resume, and removal use concise lifecycle reviews", () => {
  const current = declaredJob({ inspection: inspection({ installed: true, revision: 4 }) });
  for (const action of ["enable", "disable", "remove"]) {
    const review = actionReviewText(current, action);
    assert.equal(review.split("\n").length <= 3, true);
    assert.doesNotMatch(review, /Task:|Source:|Installed snapshot:|Argv:|Working directory:|Resolved commands:|Timeout:/);
  }
});

test("native action cancellation performs no mutation", async () => {
  const scripted = scriptedDependencies();
  const harness = uiHarness(["Install disabled"], [false], [
    (component) => component.handleInput("a"),
    (component) => component.handleInput("q"),
  ]);

  await createSchedulerCommandHandler(scripted.dependencies)("", { cwd: "/work", hasUI: true, mode: "tui", ui: harness.ui });

  assert.equal(harness.confirms.length, 1);
  assert.match(harness.confirms[0].message, /Scope: global:test:job/);
  assert.equal(scripted.calls.some(({ args }) => args[0] === "install"), false);
});

test("native actions preserve exact installed digest and revision fencing", async () => {
  const scripted = scriptedDependencies({ inspect: inspection({ installed: true, revision: 4 }) });
  const harness = uiHarness(["Run installed snapshot now"], [true], [
    (component) => component.handleInput("a"),
    (component) => component.handleInput("q"),
  ]);

  await createSchedulerCommandHandler(scripted.dependencies)("", { cwd: "/work", hasUI: true, mode: "tui", ui: harness.ui });

  const call = scripted.calls.find(({ args }) => args[0] === "run");
  assert.deepEqual(call.args.slice(0, 7), [
    "run",
    "global:test:job",
    "--expected-installed-digest",
    "installed-digest",
    "--expected-revision",
    "4",
    "--json",
  ]);
  assert.equal(harness.confirms.length, 1);
  assert.match(harness.confirms[0].message, /Lifecycle revision: 4/);
});

test("stale native mutations report a reload route", async () => {
  const scripted = scriptedDependencies({
    operation(args) {
      if (args[0] === "install") return cliFailure("STALE_CANDIDATE", "changed");
      return cliSuccess({ command: args[0], result: {} });
    },
  });
  const harness = uiHarness(["Install disabled"], [true], [
    (component) => component.handleInput("a"),
    (component) => component.handleInput("q"),
  ]);

  await createSchedulerCommandHandler(scripted.dependencies)("", { cwd: "/work", hasUI: true, mode: "tui", ui: harness.ui });

  assert.equal(harness.notices.some(({ message }) => /state changed.*Refresh and review/.test(message)), true);
});

test("detail refresh is owned by the linear command handler", async () => {
  let overviewCalls = 0;
  let inspectionCalls = 0;
  const scripted = scriptedDependencies();
  const originalExec = scripted.dependencies.exec;
  scripted.dependencies.exec = async (command, args, options) => {
    if (args[0] === "overview") overviewCalls++;
    if (args[0] === "inspect") inspectionCalls++;
    return originalExec(command, args, options);
  };
  const harness = uiHarness([], [], [
    (component) => component.handleInput("\r"),
    (component) => component.handleInput("r"),
    (component) => component.handleInput("q"),
    (component) => component.handleInput("q"),
  ]);

  await createSchedulerCommandHandler(scripted.dependencies)("", { cwd: "/work", hasUI: true, mode: "tui", ui: harness.ui });

  assert.equal(overviewCalls, 4);
  assert.equal(inspectionCalls, 2);
});

test("refuses the command without UI before discovery or CLI execution", async () => {
  const scripted = scriptedDependencies();
  const harness = uiHarness();
  await createSchedulerCommandHandler(scripted.dependencies)("", { cwd: "/work", hasUI: false, mode: "tui", ui: harness.ui });
  assert.deepEqual(scripted.calls, []);
});

test("surfaces manifest failures without inventing a job", async () => {
  const dependencies = {
    env: { HOME: "/tmp/home", XDG_CONFIG_HOME: "/tmp/config" },
    exists: () => true,
    async exec(command, args) {
      if (command === "git") return commandResult("", 1);
      return cliFailure("SCHEDULER_ERROR", "manifest is invalid");
    },
  };
  const data = await loadDashboardData("/work", dependencies);
  assert.deepEqual(data.jobs, []);
  assert.equal(data.sourceErrors.length, 1);
  assert.match(data.sourceErrors[0].error.message, /manifest is invalid/);
});

function lifecycleFixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "scheduler-extension-test-"));
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
  fs.writeFileSync(scriptPath, "console.log('extension lifecycle output')\n");
  const manifestPath = path.join(configHome, "pi-scheduler", "jobs.json");
  fs.writeFileSync(manifestPath, JSON.stringify({
    version: 1,
    jobs: {
      "test:job": {
        description: "Extension lifecycle fixture",
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
  const runtime = { env, platform: "darwin", adapterOptions: { commandRunner, uid: process.getuid() } };
  return { env, manifestPath, runtime, scriptPath };
}

test("drives install, run, enable, disable, and remove through the real CLI contract", async (t) => {
  const value = lifecycleFixture(t);
  const cliCommands = [];
  const dependencies = {
    env: value.env,
    exists: fs.existsSync,
    async exec(command, args) {
      if (command === "git") return commandResult("", 128, "not a worktree");
      const cliArgs = args;
      cliCommands.push(cliArgs[0]);
      try {
        const result = await runCli(cliArgs, value.runtime);
        return commandResult(result.stdout);
      } catch (error) {
        return commandResult("", error.exitCode ?? 1, JSON.stringify({
          ok: false,
          error: { code: error.code ?? "INTERNAL", message: error.message, details: error.details ?? null },
        }));
      }
    },
  };
  const harness = uiHarness(
    ["Install disabled", "Run installed snapshot now", "Resume schedule", "Pause schedule", "Remove installed schedule"],
    [true, true, true, true, true],
    [
      (component) => component.handleInput("a"),
      (component) => component.handleInput("a"),
      (component) => component.handleInput("a"),
      (component) => component.handleInput("a"),
      (component) => component.handleInput("a"),
      (component) => component.handleInput("q"),
    ],
  );
  const handler = createSchedulerCommandHandler(dependencies);

  await handler("", { cwd: value.env.HOME, hasUI: true, mode: "tui", ui: harness.ui });

  for (const command of ["install", "run", "enable", "disable", "remove"]) {
    assert.equal(cliCommands.includes(command), true, `missing ${command}`);
  }
  assert.equal(harness.confirms.length, 5);
  assert.equal(harness.notices.some(({ message }) => /Installed schedule removed/.test(message)), true);
  assert.equal(fs.existsSync(path.join(value.env.XDG_STATE_HOME, "pi-scheduler", "jobs")), true);
  const remaining = fs.readdirSync(path.join(value.env.XDG_STATE_HOME, "pi-scheduler", "jobs"));
  assert.deepEqual(remaining, []);
  assert.equal(readSchedulerStatusSnapshot(value.manifestPath, value.env).attentionCount, 0);
});

test("a terminal installed run publishes shared attention without an open Pi session", async (t) => {
  const value = lifecycleFixture(t);
  const initial = JSON.parse((await runCli([
    "overview",
    "--manifest", value.manifestPath,
    "--json",
  ], value.runtime)).stdout);
  const id = initial.result.jobs[0].id;
  const candidateDigest = initial.result.jobs[0].candidate.digest;

  await runCli([
    "install", id,
    "--manifest", value.manifestPath,
    "--expected-candidate-digest", candidateDigest,
    "--json",
  ], value.runtime);
  const installed = JSON.parse((await runCli([
    "overview",
    "--manifest", value.manifestPath,
    "--json",
  ], value.runtime)).stdout).result.jobs[0].installation;

  fs.writeFileSync(value.scriptPath, "process.exit(7)\n");
  const hiddenRuntime = {
    ...value.runtime,
    env: {
      HOME: value.env.HOME,
      USER: value.env.USER,
      PATH: value.env.PATH,
      LANG: "C",
    },
  };
  await assert.rejects(
    runCli([
      "_run-installed", id,
      "--state-root", fs.realpathSync(path.join(value.env.XDG_STATE_HOME, "pi-scheduler")),
      "--expected-installed-digest", installed.digest,
      "--expected-revision", String(installed.revision),
      "--json",
    ], hiddenRuntime),
    /exited with code 7/,
  );

  assert.equal(readSchedulerStatusSnapshot(value.manifestPath, value.env).attentionCount, 1);
});

test("an unreadable manifest clears its shared attention snapshot", async (t) => {
  const value = lifecycleFixture(t);
  writeSchedulerStatusSnapshot(value.manifestPath, {
    generatedAt: new Date().toISOString(),
    jobs: [{ id: "global:test:job", candidateError: { code: "ENVIRONMENT", message: "blocked" }, installation: { installed: false }, recentRuns: [] }],
  }, value.env);
  fs.writeFileSync(value.manifestPath, JSON.stringify({ version: 1, jobs: { bad: { command: "removed" } } }));

  await assert.rejects(
    runCli(["overview", "--manifest", value.manifestPath, "--json"], value.runtime),
    /invalid field|job key/i,
  );
  assert.equal(readSchedulerStatusSnapshot(value.manifestPath, value.env).attentionCount, 0);
});
