import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import {
  SchedulerDashboardComponent,
  SchedulerJobDetailComponent,
  SchedulerPanelComponent,
  SchedulerTextComponent,
  formatSchedulerTime,
  humanizeSchedule,
  schedulerJobState,
} from "./dashboard.ts";

const theme = {
  fg: (_color, text) => text,
  bg: (_color, text) => text,
  bold: (text) => text,
};

function run(overrides = {}) {
  return {
    runId: "00000000-0000-4000-8000-000000000001",
    trigger: "scheduled",
    scheduledFor: "2026-07-25T08:00:00.000Z",
    startedAt: "2026-07-25T08:00:01.000Z",
    finishedAt: "2026-07-25T08:00:43.000Z",
    durationMilliseconds: 42_000,
    status: "succeeded",
    exitCode: 0,
    signal: null,
    timedOut: false,
    outputTruncated: false,
    reason: null,
    digest: "digest",
    revision: 2,
    ...overrides,
  };
}

function job(overrides = {}) {
  return {
    id: "user:daily-report:work",
    key: "daily-report:work",
    scope: { kind: "user" },
    description: "Reconcile the work report on weekday afternoons",
    schedule: "30 17 * * 1-5",
    sourcePath: "/config/pi-scheduler/jobs.json",
    manifestPath: "/config/pi-scheduler/jobs.json",
    candidate: {
      digest: "digest",
      adapter: { mode: "auto", selected: "launchd", warning: null },
      workingDirectory: "/work",
      timeoutSeconds: 1800,
    },
    candidateError: null,
    installation: {
      installed: true,
      health: "ok",
      enabled: true,
      digest: "digest",
      revision: 2,
      definitionDrift: false,
      adapterDrift: false,
    },
    installationError: null,
    nextRun: "2026-07-25T17:30:00.000Z",
    nextRunError: null,
    recentRuns: [run()],
    historyError: null,
    ...overrides,
  };
}

function harness(rows = 24) {
  let renders = 0;
  return {
    tui: { terminal: { rows }, requestRender: () => renders++ },
    renders: () => renders,
  };
}

test("formats human schedules, local times, and textual task states", () => {
  const now = new Date(2026, 6, 25, 9, 0);
  const today = new Date(2026, 6, 25, 17, 30).toISOString();
  assert.equal(humanizeSchedule("30 17 * * 1-5"), "Weekdays at 17:30 local time");
  assert.equal(humanizeSchedule("0 0 1 1 *"), "Every Jan 1 at midnight local time");
  assert.equal(humanizeSchedule("*/10 * * * *"), "Every 10 minutes");
  assert.equal(formatSchedulerTime(today, now), "Today 17:30");
  assert.equal(schedulerJobState(job()).label, "Active");
  assert.equal(schedulerJobState(job({ installation: { installed: false, health: "absent" } })).label, "Draft");
  assert.equal(schedulerJobState(job({ candidateError: { code: "ENVIRONMENT", message: "missing" } })).label, "Needs attention");
  assert.equal(schedulerJobState(job({ recentRuns: [run({ status: "running", finishedAt: null })] })).label, "Running");
  assert.equal(schedulerJobState(job({ recentRuns: [run({ status: "skipped", reason: "overlap" }), run({ status: "failed" })] })).label, "Needs attention");
});

test("attention rows explain why each task needs review", () => {
  const view = harness(40);
  const data = {
    jobs: [
      job({ id: "user:test:failed", key: "test:failed", recentRuns: [run({ status: "failed", exitCode: 7, reason: "exited with code 7" })] }),
      job({ id: "user:test:environment", key: "test:environment", candidateError: { code: "ENVIRONMENT", message: "missing command" }, recentRuns: [] }),
      job({
        id: "user:test:command",
        key: "test:command",
        installation: { installed: true, health: "unhealthy", healthCategory: "commands", enabled: false, definitionDrift: false, adapterDrift: false },
      }),
    ],
    sourceErrors: [],
    generatedAt: new Date().toISOString(),
  };
  const rendered = new SchedulerDashboardComponent(data, view.tui, theme, () => {}).render(100).join("\n");

  assert.match(rendered, /test:failed · User · Needs attention · Run failed/);
  assert.match(rendered, /exited with code 7/);
  assert.match(rendered, /test:environment · User · Needs attention · Environment blocked/);
  assert.match(rendered, /test:command · User · Needs attention · Command unavailable/);

  const selectedEnvironment = new SchedulerDashboardComponent(
    data,
    view.tui,
    theme,
    () => {},
    new Date(),
    "user:test:environment",
  ).render(54);
  assert.match(selectedEnvironment.join("\n"), /missing command/);
  assert.equal(selectedEnvironment.every((line) => visibleWidth(line) <= 54), true);
});

test("renders a width-safe tasks dashboard with next run, history, and source errors", () => {
  const view = harness();
  const now = new Date(2026, 6, 25, 9, 0);
  const data = {
    jobs: [job()],
    sourceErrors: [{
      scope: "project",
      manifestPath: "/work/.pi/scheduler.json",
      error: { code: "SCHEDULER_ERROR", message: "jobs.bad contains unknown field: command" },
    }],
    generatedAt: now.toISOString(),
  };
  const component = new SchedulerDashboardComponent(data, view.tui, theme, () => {}, now);
  const wide = component.render(100);
  assert.match(wide.join("\n"), /daily-report:work · User · Active/);
  assert.match(wide.join("\n"), /Weekdays at 17:30 local time · next Today/);
  assert.match(wide.join("\n"), /! Project tasks · jobs\.bad contains unknown field/);
  assert.match(wide.join("\n"), /Selected task/);
  assert.match(wide.join("\n"), /User settings · available in all your projects/);
  assert.ok(wide.length < 20, "the panel should fit its content instead of filling 85% of the terminal");
  assert.equal(wide.every((line) => visibleWidth(line) <= 100), true);

  const narrow = component.render(54);
  assert.match(narrow.join("\n"), /Scheduler · \[Tasks\]  Runs/);
  assert.match(narrow.join("\n"), /daily-report:work/);
  assert.match(narrow.join("\n"), /User · Active/);
  assert.equal(narrow.every((line) => visibleWidth(line) <= 54), true);
});

test("task rows stay fixed while the selected preview changes", () => {
  const view = harness(40);
  const data = {
    jobs: [
      job({ id: "user:test:first", key: "test:first", recentRuns: [run({ status: "failed", exitCode: 7, reason: "exited with code 7" })] }),
      job({ id: "user:test:second", key: "test:second", candidateError: { code: "ENVIRONMENT", message: "missing report command" }, recentRuns: [] }),
      job({ id: "user:test:third", key: "test:third" }),
    ],
    sourceErrors: [],
    generatedAt: new Date().toISOString(),
  };
  const component = new SchedulerDashboardComponent(data, view.tui, theme, () => {});
  const before = component.render(100);
  const positionsBefore = data.jobs.map(({ key }) => before.findIndex((line) => line.includes(key)));

  component.handleInput("j");
  const after = component.render(100);
  const positionsAfter = data.jobs.map(({ key }) => after.findIndex((line) => line.includes(key)));

  assert.deepEqual(positionsAfter, positionsBefore);
  assert.equal(after.length, before.length);
  assert.match(after.join("\n"), /missing report command/);
});

test("task selection follows grouped order and preserves an explicit task", () => {
  const view = harness();
  const draft = job({
    id: "user:smoke:dashboard",
    key: "smoke:dashboard",
    installation: { installed: false, health: "absent" },
    recentRuns: [],
  });
  const blocked = job({
    id: "user:smoke:diagnostic",
    key: "smoke:diagnostic",
    candidateError: { code: "ENVIRONMENT", message: "missing command" },
    recentRuns: [],
  });
  const data = { jobs: [draft, blocked], sourceErrors: [], generatedAt: new Date().toISOString() };
  const outcomes = [];
  const component = new SchedulerDashboardComponent(data, view.tui, theme, (result) => outcomes.push(result), new Date(), draft.id);
  assert.match(component.render(120).join("\n"), /› ◇ smoke:dashboard/);
  component.handleInput("\r");
  assert.deepEqual(outcomes, [{ kind: "job", id: draft.id }]);
});

test("dashboard emits plain navigation and refresh intents", () => {
  const view = harness();
  const data = { jobs: [job()], sourceErrors: [], generatedAt: new Date().toISOString() };
  const outcomes = [];
  const refresh = new SchedulerDashboardComponent(data, view.tui, theme, (result) => outcomes.push(result));
  refresh.handleInput("r");
  assert.deepEqual(outcomes, [{ kind: "refresh" }]);

  const actions = [];
  const actionView = new SchedulerDashboardComponent(data, view.tui, theme, (result) => actions.push(result));
  actionView.handleInput("a");
  assert.deepEqual(actions, [{ kind: "actions", id: data.jobs[0].id }]);

  const runs = [];
  const runView = new SchedulerDashboardComponent(data, view.tui, theme, (result) => runs.push(result));
  runView.handleInput("\t");
  assert.match(runView.render(100).join("\n"), /\[Runs\]/);
  runView.handleInput("\r");
  assert.deepEqual(runs, [{ kind: "run", id: data.jobs[0].id, runId: data.jobs[0].recentRuns[0].runId }]);
});

test("detail emits refresh, action, run, and back intents", () => {
  const view = harness(40);
  const timedOut = run({ runId: "00000000-0000-4000-8000-000000000002", status: "timed-out", reason: "timed out" });
  const current = job({
    candidateError: { code: "ENVIRONMENT", message: "missing command" },
    recentRuns: [run({ status: "skipped", reason: "overlap" }), timedOut],
  });
  const doctor = "'/opt/scheduled-jobs' doctor 'user:daily-report:work' --manifest '/config/pi-scheduler/jobs.json' --json";
  const rendered = new SchedulerJobDetailComponent(current, "Definition", view.tui, theme, () => {}, new Date(), doctor).render(120).join("\n");
  assert.match(rendered, /Recovery: run .*scheduled-jobs.* doctor/);
  assert.match(rendered, /Latest execution timed out/);
  assert.match(rendered, /affected execution is selected/);
  assert.doesNotMatch(rendered, /repair|private state/);

  const refresh = [];
  new SchedulerJobDetailComponent(current, "Definition", view.tui, theme, (result) => refresh.push(result)).handleInput("r");
  assert.deepEqual(refresh, [{ kind: "refresh" }]);

  const actions = [];
  new SchedulerJobDetailComponent(current, "Definition", view.tui, theme, (result) => actions.push(result)).handleInput("a");
  assert.deepEqual(actions, [{ kind: "actions" }]);

  const runs = [];
  const runView = new SchedulerJobDetailComponent(current, "Definition", view.tui, theme, (result) => runs.push(result));
  runView.handleInput("\t");
  runView.handleInput("\r");
  assert.deepEqual(runs, [{ kind: "run", id: current.id, runId: timedOut.runId }]);

  const back = [];
  new SchedulerJobDetailComponent(current, "Definition", view.tui, theme, (result) => back.push(result)).handleInput("q");
  assert.deepEqual(back, [{ kind: "back" }]);
});

test("detail run selection stays visible inside the capped viewport", () => {
  const view = harness(40);
  const recentRuns = Array.from({ length: 20 }, (_, index) => run({
    runId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    reason: `receipt-${String(index + 1).padStart(2, "0")}`,
  }));
  const current = job({ recentRuns });
  const outcomes = [];
  const component = new SchedulerJobDetailComponent(current, "Definition", view.tui, theme, (result) => outcomes.push(result));
  component.handleInput("\t");
  for (let index = 1; index < recentRuns.length; index++) component.handleInput("j");

  const rendered = component.render(120).join("\n");
  assert.match(rendered, /›.*receipt-20/);
  assert.doesNotMatch(rendered, /receipt-01/);
  component.handleInput("\r");
  assert.deepEqual(outcomes, [{ kind: "run", id: current.id, runId: recentRuns.at(-1).runId }]);
});

test("detail scroll keys follow content direction and End reaches the bottom", () => {
  const view = harness(12);
  const definition = Array.from({ length: 20 }, (_, index) => `definition line ${String(index + 1).padStart(2, "0")}`).join("\n");
  const component = new SchedulerJobDetailComponent(job(), definition, view.tui, theme, () => {});
  component.handleInput("\t");
  component.handleInput("\t");

  assert.match(component.render(60).join("\n"), /definition line 01/);
  component.handleInput("j");
  assert.doesNotMatch(component.render(60).join("\n"), /definition line 01/);
  component.handleInput("k");
  assert.match(component.render(60).join("\n"), /definition line 01/);
  component.handleInput("\u001b[F");
  assert.match(component.render(60).join("\n"), /definition line 20/);
});

test("unhealthy installed state directs recovery through doctor and reviewed actions", () => {
  const view = harness();
  const unhealthy = job({
    installation: {
      installed: true,
      health: "unhealthy",
      healthReason: "installed runtime changed",
      healthCategory: "runtime",
      enabled: false,
      digest: "digest",
      revision: 2,
      definitionDrift: false,
      adapterDrift: false,
    },
  });
  const doctor = "scheduled-jobs doctor user:daily-report:work --manifest /config/pi-scheduler/jobs.json --json";
  const rendered = new SchedulerJobDetailComponent(unhealthy, "Definition", view.tui, theme, () => {}, new Date(), doctor).render(120).join("\n");

  assert.match(rendered, /Recovery: run scheduled-jobs doctor/);
  assert.match(rendered, /then use/);
  assert.match(rendered, /only reviewed lifecycle actions/);
  assert.doesNotMatch(rendered, /repair the private installed state/);
});

test("text output is synchronous and emits explicit refresh", () => {
  const view = harness();
  const outcomes = [];
  const component = new SchedulerTextComponent("Run output", "one\ntwo\nthree", view.tui, theme, (result) => outcomes.push(result));
  assert.match(component.render(40).join("\n"), /Run output/);
  assert.match(component.render(40).join("\n"), /r refresh/);
  component.handleInput("r");
  assert.deepEqual(outcomes, ["refresh"]);

  const back = [];
  new SchedulerTextComponent("Run output", "one", view.tui, theme, (result) => back.push(result)).handleInput("q");
  assert.deepEqual(back, ["back"]);
});

test("the persistent panel owns its initial loading state", () => {
  const view = harness();
  let loadSignal;
  const results = [];
  const panel = new SchedulerPanelComponent(
    undefined,
    view.tui,
    theme,
    {
      loadDashboard: (signal) => {
        loadSignal = signal;
        return new Promise(() => {});
      },
      loadDetail: async () => undefined,
      loadOutput: async () => ({ title: "Output", text: "" }),
      runAction: async () => {},
      investigationPrompt: () => "diagnose only",
    },
    (result) => results.push(result),
  );

  assert.match(panel.render(80).join("\n"), /Loading scheduler/);
  panel.handleInput("q");
  assert.equal(loadSignal.aborted, true);
  assert.deepEqual(results, [{ kind: "close" }]);
});

test("initial load errors can retry without closing the panel", async () => {
  const view = harness();
  const data = { jobs: [job()], sourceErrors: [], generatedAt: new Date().toISOString() };
  let attempts = 0;
  const results = [];
  const panel = new SchedulerPanelComponent(
    undefined,
    view.tui,
    theme,
    {
      loadDashboard: async () => {
        attempts++;
        if (attempts === 1) throw new Error("overview unavailable");
        return data;
      },
      loadDetail: async () => undefined,
      loadOutput: async () => ({ title: "Output", text: "" }),
      runAction: async () => {},
      investigationPrompt: () => "diagnose only",
    },
    (result) => results.push(result),
  );

  await new Promise((resolve) => setImmediate(resolve));
  assert.match(panel.render(80).join("\n"), /overview unavailable/);
  panel.handleInput("r");
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(panel.render(80).join("\n"), /Scheduler · \[Tasks\]/);
  assert.equal(attempts, 2);
  assert.deepEqual(results, []);
});

test("internal load errors distinguish back from retry", async () => {
  const view = harness();
  const data = { jobs: [job()], sourceErrors: [], generatedAt: new Date().toISOString() };
  let attempts = 0;
  const detail = { dashboard: data, overview: data.jobs[0], definition: "Definition", doctorCommand: "doctor" };
  const panel = new SchedulerPanelComponent(
    data,
    view.tui,
    theme,
    {
      loadDashboard: async () => data,
      loadDetail: async () => {
        attempts++;
        if (attempts < 3) throw new Error("detail unavailable");
        return detail;
      },
      loadOutput: async () => ({ title: "Output", text: "" }),
      runAction: async () => {},
      investigationPrompt: () => "diagnose only",
    },
    () => {},
  );

  panel.handleInput("\r");
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(panel.render(80).join("\n"), /detail unavailable/);
  panel.handleInput("q");
  assert.match(panel.render(80).join("\n"), /Scheduler · \[Tasks\]/);

  panel.handleInput("\r");
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(panel.render(80).join("\n"), /detail unavailable/);
  panel.handleInput("r");
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(panel.render(80).join("\n"), /Scheduler \/ daily-report:work/);
  assert.equal(attempts, 3);
});

test("details and output transition inside one mounted panel", async () => {
  const view = harness(30);
  const data = { jobs: [job()], sourceErrors: [], generatedAt: new Date().toISOString() };
  let resolveDetail;
  let resolveOutput;
  const results = [];
  const panel = new SchedulerPanelComponent(
    data,
    view.tui,
    theme,
    {
      loadDashboard: async () => data,
      loadDetail: () => new Promise((resolve) => { resolveDetail = resolve; }),
      loadOutput: () => new Promise((resolve) => { resolveOutput = resolve; }),
      runAction: async () => {},
      investigationPrompt: () => "diagnose only",
    },
    (result) => results.push(result),
  );

  panel.handleInput("\r");
  assert.match(panel.render(80).join("\n"), /Loading task details/);
  resolveDetail({ dashboard: data, overview: data.jobs[0], definition: "Definition", doctorCommand: "doctor" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(panel.render(80).join("\n"), /Scheduler \/ daily-report:work/);

  panel.handleInput("q");
  assert.match(panel.render(80).join("\n"), /Scheduler · \[Tasks\]/);
  panel.handleInput("\t");
  assert.match(panel.render(80).join("\n"), /Scheduler · Tasks  \[Runs\]/);
  panel.handleInput("\r");
  assert.match(panel.render(80).join("\n"), /Loading run output/);
  resolveOutput({ title: "Run output", text: "finished cleanly" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(panel.render(80).join("\n"), /finished cleanly/);
  panel.handleInput("q");
  assert.match(panel.render(80).join("\n"), /Scheduler · Tasks  \[Runs\]/);
  assert.deepEqual(results, []);
});

test("Ask Pi keeps its safety instruction visible and lets narrow terminals review all evidence", () => {
  const view = harness();
  const blocked = job({ recentRuns: [run({ status: "failed", reason: "exited with code 7", exitCode: 7 })] });
  const data = { jobs: [blocked], sourceErrors: [], generatedAt: new Date().toISOString() };
  const panel = new SchedulerPanelComponent(
    data,
    view.tui,
    theme,
    {
      loadDashboard: async () => data,
      loadDetail: async () => undefined,
      loadOutput: async () => ({ title: "Output", text: "" }),
      runAction: async () => {},
      investigationPrompt: () => `SAFETY FIRST\n${Array.from({ length: 30 }, (_, index) => `evidence ${index}`).join("\n")}\nTAIL EVIDENCE`,
    },
    () => {},
  );

  panel.handleInput("i");
  assert.match(panel.render(20).join("\n"), /SAFETY FIRST/);
  assert.doesNotMatch(panel.render(20).join("\n"), /TAIL EVIDENCE/);
  panel.handleInput("\u001b[F");
  assert.match(panel.render(20).join("\n"), /TAIL EVIDENCE/);
});

test("cancelling an internal load returns to the previous panel state", () => {
  const view = harness();
  const data = { jobs: [job()], sourceErrors: [], generatedAt: new Date().toISOString() };
  let detailSignal;
  const panel = new SchedulerPanelComponent(
    data,
    view.tui,
    theme,
    {
      loadDashboard: async () => data,
      loadDetail: (_id, signal) => {
        detailSignal = signal;
        return new Promise(() => {});
      },
      loadOutput: async () => ({ title: "Output", text: "" }),
      runAction: async () => {},
      investigationPrompt: () => "diagnose only",
    },
    () => {},
  );

  panel.handleInput("\r");
  assert.match(panel.render(80).join("\n"), /Loading task details/);
  panel.handleInput("q");
  assert.equal(detailSignal.aborted, true);
  assert.match(panel.render(80).join("\n"), /Scheduler · \[Tasks\]/);
});

test("scheduler surfaces remain width-safe with short terminal budgets", () => {
  const data = { jobs: [job()], sourceErrors: [], generatedAt: new Date().toISOString() };
  for (const rows of [1, 2, 4, 24]) {
    const view = harness(rows);
    const components = [
      new SchedulerDashboardComponent(data, view.tui, theme, () => {}),
      new SchedulerJobDetailComponent(data.jobs[0], "Definition", view.tui, theme, () => {}),
      new SchedulerTextComponent("Output", "line one\nline two", view.tui, theme, () => {}),
    ];
    for (const component of components) {
      const lines = component.render(20);
      assert.ok(lines.length <= Math.max(1, Math.floor(rows * 0.85)));
      assert.equal(lines.every((line) => visibleWidth(line) <= 20), true);
    }
  }
});
