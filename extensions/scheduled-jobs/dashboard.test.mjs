import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import {
  SchedulerActionComponent,
  SchedulerDashboardComponent,
  SchedulerJobDetailComponent,
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
    reason: null,
    digest: "digest",
    revision: 2,
    ...overrides,
  };
}

function job(overrides = {}) {
  return {
    id: "global:daily-report:work",
    key: "daily-report:work",
    scope: { kind: "global" },
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

function harness() {
  let renders = 0;
  return {
    tui: { terminal: { rows: 24 }, requestRender: () => renders++ },
    renders: () => renders,
  };
}

test("formats human schedules, local times, and textual task states", () => {
  const now = new Date(2026, 6, 25, 9, 0);
  const today = new Date(2026, 6, 25, 17, 30).toISOString();
  assert.equal(humanizeSchedule("30 17 * * 1-5"), "Weekdays at 17:30 local time");
  assert.equal(humanizeSchedule("*/10 * * * *"), "*/10 * * * * · local time");
  assert.equal(formatSchedulerTime(today, now), "Today 17:30");
  assert.equal(schedulerJobState(job()).label, "Active");
  assert.equal(schedulerJobState(job({ installation: { installed: false, health: "absent" } })).label, "Draft");
  assert.equal(schedulerJobState(job({ candidateError: { code: "ENVIRONMENT", message: "missing" } })).label, "Needs attention");
  assert.equal(schedulerJobState(job({ recentRuns: [run({ status: "running", finishedAt: null })] })).label, "Running");
  assert.equal(schedulerJobState(job({ recentRuns: [run({ status: "timed-out", reason: "timeout" })] })).label, "Needs attention");
});

test("renders a width-safe tasks dashboard with next run, history, and source errors", () => {
  const view = harness();
  const now = new Date(2026, 6, 25, 9, 0);
  const data = {
    jobs: [job({
      nextRun: new Date(2026, 6, 25, 17, 30).toISOString(),
      recentRuns: [run({ startedAt: new Date(2026, 6, 25, 8, 0).toISOString() })],
    })],
    sourceErrors: [{
      scope: "project",
      manifestPath: "/work/.pi/scheduler.json",
      error: { code: "SCHEDULER_ERROR", message: "jobs.bad contains unknown field: command" },
    }],
    generatedAt: now.toISOString(),
  };
  const component = new SchedulerDashboardComponent(data, view.tui, theme, () => {}, now);
  const wide = component.render(100);
  assert.match(wide.join("\n"), /Scheduler/);
  assert.match(wide.join("\n"), /daily-report:work · global · Active · Weekdays at 17:30 local time · next Today 17:30/);
  assert.match(wide.join("\n"), /! Project tasks · jobs\.bad contains unknown field/);
  assert.match(wide.join("\n"), /Active/);
  assert.equal(wide.length, 22);
  assert.equal(wide.every((line) => visibleWidth(line) <= 100), true);

  const narrow = component.render(54);
  assert.match(narrow.join("\n"), /daily-report:work/);
  assert.match(narrow.join("\n"), /global/);
  assert.equal(narrow.every((line) => visibleWidth(line) <= 54), true);
});

test("navigates tasks and runs without exposing run identifiers", () => {
  const view = harness();
  const outcomes = [];
  const secondRun = run({
    runId: "00000000-0000-4000-8000-000000000002",
    trigger: "manual",
    startedAt: "2026-07-24T10:00:00.000Z",
  });
  const data = { jobs: [job({ recentRuns: [run(), secondRun] })], sourceErrors: [], generatedAt: new Date().toISOString() };
  const component = new SchedulerDashboardComponent(data, view.tui, theme, (result) => outcomes.push(result));
  component.handleInput("\t");
  assert.match(component.render(100).join("\n"), /\[Runs\]/);
  assert.doesNotMatch(component.render(100).join("\n"), /00000000-0000/);
  component.handleInput("j");
  component.handleInput("\r");
  assert.deepEqual(outcomes, [{ kind: "run", id: "global:daily-report:work", runId: secondRun.runId }]);
  assert.equal(view.renders() >= 2, true);

  const closeOutcomes = [];
  const closing = new SchedulerDashboardComponent(data, view.tui, theme, (result) => closeOutcomes.push(result));
  closing.handleInput("q");
  assert.deepEqual(closeOutcomes, [{ kind: "close" }]);
});

test("refreshes task progress in place and stops polling when disposed", async () => {
  const view = harness();
  const initial = { jobs: [job({ recentRuns: [] })], sourceErrors: [], generatedAt: "2026-07-25T09:00:00.000Z" };
  const updated = {
    jobs: [job({ recentRuns: [run({ status: "running", finishedAt: null })] })],
    sourceErrors: [],
    generatedAt: "2026-07-25T09:00:01.000Z",
  };
  let reloads = 0;
  const component = new SchedulerDashboardComponent(initial, view.tui, theme, () => {}, new Date(initial.generatedAt), async () => {
    reloads++;
    return updated;
  });

  await component.refreshData();
  assert.match(component.render(100).join("\n"), /ACTIVE/);
  assert.match(component.render(100).join("\n"), /Running/);
  assert.equal(reloads, 1);
  component.dispose();
  await component.refreshData();
  assert.equal(reloads, 1);
});

test("refreshes running output until the receipt reaches a terminal state", async () => {
  const view = harness();
  const component = new SchedulerTextComponent(
    "task · running",
    "starting",
    view.tui,
    theme,
    () => {},
    async () => ({ title: "task · succeeded", text: "finished output", complete: true }),
  );

  await component.refreshText();
  assert.match(component.render(80).join("\n"), /task · succeeded/);
  assert.match(component.render(80).join("\n"), /finished output/);
  component.dispose();
});

test("action menu stays in the custom dashboard and supports keyboard review", () => {
  const view = harness();
  const outcomes = [];
  const component = new SchedulerActionComponent("daily-report:work", [
    { id: "run", label: "Run installed snapshot now", description: "Start and track its receipt" },
    { id: "remove", label: "Remove installed schedule", description: "Remove known artifacts", danger: true },
  ], view.tui, theme, (result) => outcomes.push(result));

  assert.match(component.render(80).join("\n"), /AVAILABLE ACTIONS/);
  component.handleInput("j");
  component.handleInput("\r");
  assert.deepEqual(outcomes, ["remove"]);
});

test("detail view gives concrete recovery routes for adapter drift and failed runs", () => {
  const view = harness();
  const current = job({
    installation: {
      installed: true,
      health: "ok",
      enabled: true,
      digest: "digest",
      revision: 2,
      definitionDrift: false,
      adapterDrift: true,
    },
    recentRuns: [run({ status: "timed-out", reason: "timed out after 30 seconds" })],
  });
  const component = new SchedulerJobDetailComponent(current, "Definition", view.tui, theme, () => {});
  const rendered = component.render(120).join("\n");
  assert.match(rendered, /review Pause or Resume/);
  assert.match(rendered, /open Runs.*retained output/);
});

test("detail view progressively discloses runs and definition while retaining actions", () => {
  const view = harness();
  const outcomes = [];
  const component = new SchedulerJobDetailComponent(
    job(),
    "Candidate\nScope: global:daily-report:work\nArgv: [\"node\"]",
    view.tui,
    theme,
    (result) => outcomes.push(result),
    new Date(2026, 6, 25, 9, 0),
  );
  assert.match(component.render(80).join("\n"), /\[Overview\]/);
  component.handleInput("\t");
  assert.match(component.render(80).join("\n"), /\[Runs\]/);
  component.handleInput("\t");
  assert.match(component.render(80).join("\n"), /Argv: \["node"\]/);
  component.handleInput("a");
  assert.deepEqual(outcomes, [{ kind: "actions" }]);
});
