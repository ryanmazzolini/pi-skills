import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { run as runCli } from "../bin/scheduled-jobs.mjs";
import scheduledJobsExtension, {
  applicableActions,
  createSchedulerCommandHandler,
  discoverManifestPaths,
  globalManifestPath,
  jobOption,
  sanitizeDisplay,
} from "./scheduled-jobs.ts";

function commandResult(stdout = "", code = 0, stderr = "") {
  return { stdout, stderr, code, killed: false };
}

function cliSuccess(value) {
  return commandResult(JSON.stringify({ ok: true, ...value }));
}

function cliFailure(code, message) {
  return commandResult("", 7, JSON.stringify({ ok: false, error: { code, message, details: null } }));
}

function uiHarness(selectors = [], confirmations = []) {
  const selects = [];
  const confirms = [];
  const notices = [];
  return {
    selects,
    confirms,
    notices,
    ui: {
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

function inspection({ installed = false, enabled = false, drift = false, health = "ok", digest = "candidate-digest", revision = 1 } = {}) {
  const resolved = candidate(digest);
  return {
    candidate: resolved,
    installation: installed
      ? {
          installed: true,
          health,
          definitionDrift: drift,
          metadata: { enabled, digest: "installed-digest", revision },
          snapshot: { contract: candidate("installed-digest", drift ? "Old fixture" : "Fixture").contract },
          drift: { enabled: false, artifact: false, otherAdapters: false },
        }
      : { installed: false, health: "absent" },
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
      async exec(command, args) {
        calls.push({ command, args });
        if (command === "git") return commandResult("", 1);
        const cliArgs = args.slice(1);
        if (cliArgs[0] === "list") {
          return cliSuccess({ command: "list", jobs: [{ id: "global:test:job", key: "test:job" }] });
        }
        if (cliArgs[0] === "inspect") return cliSuccess({ command: "inspect", ...inspect });
        if (operation) return operation(cliArgs, calls);
        return cliSuccess({ command: cliArgs[0], result: {} });
      },
    },
  };
}

test("registers only the human scheduler command and no LLM-callable tool", () => {
  const commands = [];
  let tools = 0;
  scheduledJobsExtension({
    registerCommand: (name, options) => commands.push({ name, options }),
    registerTool: () => tools++,
    exec: async () => commandResult(),
  });

  assert.equal(tools, 0);
  assert.deepEqual(commands.map((entry) => entry.name), ["scheduler"]);
  assert.match(commands[0].options.description, /reviewed/);
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

test("sanitizes displayed values and groups global and project declarations", () => {
  assert.equal(sanitizeDisplay("bad\nlabel\u0000"), "bad�label�");
  assert.match(jobOption(declaredJob({ key: "bad\nlabel" })), /^Global jobs · bad�label · 30 17 \* \* 1-5/);
  assert.match(jobOption(declaredJob({ scope: "project" })), /^Project jobs ·/);
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

test("shows the exact reviewed contract and cancellation performs no mutation", async () => {
  const scripted = scriptedDependencies();
  const harness = uiHarness(["Global jobs", "Install disabled", null], [false]);
  const handler = createSchedulerCommandHandler(scripted.dependencies);

  await handler("", { cwd: "/work", hasUI: true, ui: harness.ui });

  assert.equal(scripted.calls.some((call) => call.args.includes("install")), false);
  assert.equal(harness.confirms.length, 1);
  assert.match(harness.confirms[0].message, /Scope: global:test:job/);
  assert.match(harness.confirms[0].message, /Argv: \["\/usr\/local\/bin\/node","\/tmp\/job\.mjs"\]/);
  assert.match(harness.confirms[0].message, /Adapter: launchd \(auto\)/);
  assert.match(harness.confirms[0].message, /Digest: candidate-digest/);
  assert.match(harness.confirms[0].message, /required node: \/usr\/local\/bin\/node/);
});

test("refuses mutation when the exact contract cannot fit in the bounded confirmation", async () => {
  const oversized = inspection();
  oversized.candidate.contract.argv = [
    "/usr/local/bin/node",
    ...Array.from({ length: 7 }, (_, index) => `${index}-${"x".repeat(4_000)}`),
  ];
  const scripted = scriptedDependencies({ inspect: oversized });
  const harness = uiHarness(["Global jobs", "Install disabled", null]);
  const handler = createSchedulerCommandHandler(scripted.dependencies);

  await handler("", { cwd: "/work", hasUI: true, ui: harness.ui });

  assert.equal(harness.confirms.length, 0);
  assert.equal(scripted.calls.some((call) => call.args.includes("install")), false);
  assert.equal(harness.notices.some((notice) => notice.level === "error" && /too large to display completely/.test(notice.message)), true);
});

test("update confirmation shows installed and candidate identities and their changed fields", async () => {
  const scripted = scriptedDependencies({ inspect: inspection({ installed: true, drift: true, revision: 4 }) });
  const harness = uiHarness(["Global jobs", "Update installed snapshot", null], [false]);
  const handler = createSchedulerCommandHandler(scripted.dependencies);

  await handler("", { cwd: "/work", hasUI: true, ui: harness.ui });

  assert.equal(harness.confirms.length, 1);
  assert.match(harness.confirms[0].message, /Lifecycle revision: 4/);
  assert.match(harness.confirms[0].message, /Installed digest: installed-digest/);
  assert.match(harness.confirms[0].message, /Candidate digest: candidate-digest/);
  assert.match(harness.confirms[0].message, /Changed fields: description/);
  assert.equal(scripted.calls.some((call) => call.args.includes("update")), false);
});

test("refuses the command without UI before discovery or CLI execution", async () => {
  let executions = 0;
  const handler = createSchedulerCommandHandler({
    env: {},
    exists: () => true,
    exec: async () => {
      executions++;
      return commandResult();
    },
  });

  await handler("", { cwd: "/work", hasUI: false, ui: uiHarness().ui });
  assert.equal(executions, 0);
});

test("a stale mutation refreshes and redisplays the changed state", async () => {
  let inspectCount = 0;
  const scripted = scriptedDependencies({
    operation: (args) => args[0] === "install"
      ? cliFailure("STALE_CANDIDATE", "Installation candidate changed; inspect again.")
      : cliSuccess({ command: args[0], result: {} }),
  });
  const originalExec = scripted.dependencies.exec;
  scripted.dependencies.exec = async (command, args) => {
    if (args[1] === "inspect") {
      inspectCount++;
      const current = inspection({ digest: inspectCount === 1 ? "old-digest" : "new-digest" });
      scripted.calls.push({ command, args });
      return cliSuccess({ command: "inspect", ...current });
    }
    return originalExec(command, args);
  };
  const harness = uiHarness(["Global jobs", "Install disabled", "Back", null], [true]);
  const handler = createSchedulerCommandHandler(scripted.dependencies);

  await handler("", { cwd: "/work", hasUI: true, ui: harness.ui });

  assert.equal(inspectCount, 2);
  assert.equal(harness.notices.some((notice) => notice.level === "warning" && /refreshed/.test(notice.message)), true);
  assert.equal(harness.selects.some((entry) => /refreshed details/.test(entry.title) && /new-digest/.test(entry.title)), true);
});

test("surfaces CLI failures without attempting a mutation", async () => {
  const scripted = scriptedDependencies({
    inspect: undefined,
  });
  scripted.dependencies.exec = async (command, args) => {
    scripted.calls.push({ command, args });
    if (command === "git") return commandResult("", 1);
    if (args[1] === "list") return cliFailure("ENVIRONMENT", "Adapter unavailable\nretry later");
    throw new Error("unexpected mutation");
  };
  const harness = uiHarness(["Global jobs", "Inspect", "Back", null]);
  const handler = createSchedulerCommandHandler(scripted.dependencies);

  await handler("", { cwd: "/work", hasUI: true, ui: harness.ui });

  assert.match(harness.selects.find((entry) => /Inspect global:invalid-manifest/.test(entry.title)).title, /Adapter unavailable�retry later/);
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
  return { env, manifestPath, runtime };
}

test("drives install, run, enable, disable, and remove through the real CLI contract", async (t) => {
  const value = lifecycleFixture(t);
  const cliCommands = [];
  const dependencies = {
    env: value.env,
    exists: fs.existsSync,
    async exec(command, args) {
      if (command === "git") return commandResult("", 128, "not a worktree");
      const cliArgs = args.slice(1);
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
  const harness = uiHarness([
    "Global jobs", "Install disabled",
    "Global jobs", "Run installed snapshot now",
    "Global jobs", "Enable schedule",
    "Global jobs", "Disable schedule",
    "Global jobs", "Remove installed schedule",
    null,
  ], [true, true, true, true, true]);
  const handler = createSchedulerCommandHandler(dependencies);

  await handler("", { cwd: value.env.HOME, hasUI: true, ui: harness.ui });

  for (const command of ["install", "run", "enable", "disable", "remove"]) {
    assert.equal(cliCommands.includes(command), true, `missing ${command}`);
  }
  assert.equal(harness.notices.filter((notice) => notice.level === "info" && /completed/i.test(notice.message)).length, 5);
  assert.equal(fs.existsSync(path.join(value.env.XDG_STATE_HOME, "pi-scheduler", "jobs")), true);
  const remaining = fs.readdirSync(path.join(value.env.XDG_STATE_HOME, "pi-scheduler", "jobs"));
  assert.deepEqual(remaining, []);
});
