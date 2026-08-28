import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import {
  SchedulerActionComponent,
  SchedulerDashboardComponent,
  SchedulerJobDetailComponent,
  SchedulerTextComponent,
  SchedulerWorkspaceComponent,
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

function harness(rows = 24) {
  let renders = 0;
  return {
    tui: { terminal: { rows }, requestRender: () => renders++ },
    renders: () => renders,
  };
}

function overlayHarness(rows = 24) {
  let renders = 0;
  let current;
  const tui = {
    terminal: { rows },
    requestRender: () => renders++,
    showOverlay(component, options) {
      const entry = { component, options };
      current = entry;
      return {
        hide() {
          if (current === entry) current = undefined;
        },
      };
    },
  };
  return { tui, renders: () => renders, overlay: () => current };
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
  assert.equal(schedulerJobState(job({ recentRuns: [run({ status: "timed-out", reason: "timeout" })] })).label, "Needs attention");
  assert.equal(schedulerJobState(job({ recentRuns: [run({ status: "skipped", reason: "overlap" }), run({ status: "failed" })] })).label, "Needs attention");
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
  assert.match(wide.join("\n"), /daily-report:work · global · Active/);
  assert.match(wide.join("\n"), /Weekdays at 17:30 local time · next Today 17:30/);
  assert.match(wide.join("\n"), /! Project tasks · jobs\.bad contains unknown field/);
  assert.match(wide.join("\n"), /Active/);
  assert.equal(wide.length, 20);
  assert.equal(wide.every((line) => visibleWidth(line) <= 100), true);

  const narrow = component.render(54);
  assert.match(narrow.join("\n"), /Scheduler · \[Tasks\]  Runs/);
  assert.match(narrow.join("\n"), /1 task · 1 active · 1 needs attention/);
  assert.match(narrow.join("\n"), /daily-report:work/);
  assert.match(narrow.join("\n"), /global · Active/);
  assert.match(narrow.join("\n"), /Weekdays at 17:30 local time/);
  assert.equal(narrow.every((line) => visibleWidth(line) <= 54), true);
});

test("task selection follows the grouped visual order", () => {
  const view = harness();
  const draft = job({
    id: "global:smoke:dashboard",
    key: "smoke:dashboard",
    installation: { installed: false, health: "absent" },
    recentRuns: [],
  });
  const blocked = job({
    id: "global:smoke:diagnostic",
    key: "smoke:diagnostic",
    candidateError: { code: "ENVIRONMENT", message: "missing command" },
    recentRuns: [],
  });
  const data = { jobs: [draft, blocked], sourceErrors: [], generatedAt: new Date().toISOString() };
  const outcomes = [];
  const component = new SchedulerDashboardComponent(data, view.tui, theme, (result) => outcomes.push(result));

  assert.match(component.render(120).join("\n"), /› ! smoke:diagnostic/);
  component.handleInput("\r");
  assert.deepEqual(outcomes, [{ kind: "job", id: blocked.id }]);

  const nextOutcomes = [];
  const next = new SchedulerDashboardComponent(data, view.tui, theme, (result) => nextOutcomes.push(result));
  next.handleInput("j");
  assert.match(next.render(120).join("\n"), /› ◇ smoke:dashboard/);
  next.handleInput("\r");
  assert.deepEqual(nextOutcomes, [{ kind: "job", id: draft.id }]);
});

test("workspace switches views without closing, stale lists, or hidden polling", async () => {
  const view = harness();
  const outcomes = [];
  const current = job({ recentRuns: [run({ status: "running", finishedAt: null })] });
  const updated = job({ candidateError: { code: "ENVIRONMENT", message: "missing command" }, recentRuns: [] });
  const data = { jobs: [current], sourceErrors: [], generatedAt: "2026-07-25T09:00:00.000Z" };
  const updatedData = { jobs: [updated], sourceErrors: [], generatedAt: "2026-07-25T09:00:01.000Z" };
  let hiddenReloads = 0;
  const component = new SchedulerWorkspaceComponent(
    data,
    view.tui,
    theme,
    (result) => outcomes.push(result),
    {
      async reloadDashboard() {
        hiddenReloads++;
        return updatedData;
      },
      async loadDetail() {
        return { job: updated, definition: "Candidate definition", generatedAt: updatedData.generatedAt, dashboard: updatedData };
      },
      async prepareActions() { throw new Error("not used"); },
      async loadRunOutput() { throw new Error("not used"); },
    },
  );

  const listHeight = component.render(120).length;
  component.handleInput("\r");
  await new Promise((resolve) => setImmediate(resolve));
  const detailLines = component.render(120);
  assert.match(detailLines.join("\n"), /Scheduler \/ daily-report:work/);
  assert.equal(detailLines.length, listHeight);
  assert.equal(detailLines.length, Math.floor(view.tui.terminal.rows * 0.85));
  assert.deepEqual(outcomes, []);
  await new Promise((resolve) => setTimeout(resolve, 1_050));
  assert.equal(hiddenReloads, 0);

  component.handleInput("q");
  assert.match(component.render(120).join("\n"), /\[Tasks\]/);
  assert.match(component.render(120).join("\n"), /Needs attention/);
  assert.deepEqual(outcomes, []);

  component.handleInput("q");
  assert.deepEqual(outcomes, [{ kind: "close" }]);
  component.dispose();
});

test("workspace keeps action review and pending execution inside one overlay", async () => {
  const view = harness();
  const outcomes = [];
  const data = { jobs: [job()], sourceErrors: [], generatedAt: new Date().toISOString() };
  let finishAction;
  const component = new SchedulerWorkspaceComponent(
    data,
    view.tui,
    theme,
    (result) => outcomes.push(result),
    {
      async reloadDashboard() { return data; },
      async loadDetail() { throw new Error("not used"); },
      async prepareActions() {
        return {
          id: data.jobs[0].id,
          key: data.jobs[0].key,
          job: data.jobs[0],
          actions: [{
            id: "disable",
            label: "Pause schedule",
            description: "Stop future scheduled runs",
            open: async () => ({
              kind: "mutation",
              review: "Future scheduled runs will be paused.\n\nInstalled snapshot: digest · revision 2",
              presentation: {
                fromStatus: "Active",
                toStatus: "Paused",
                schedule: "30 17 * * 1-5",
                adapter: "launchd",
              },
              cancelled: { status: "error", message: "Cancellation requested.", dashboard: data },
              apply: async () => new Promise((resolve) => { finishAction = resolve; }),
            }),
          }],
        };
      },
      async loadRunOutput() { throw new Error("not used"); },
    },
  );

  component.handleInput("a");
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(component.render(120).join("\n"), /Actions for daily-report:work/);
  component.handleInput("\r");
  await new Promise((resolve) => setImmediate(resolve));
  const review = component.render(120).join("\n");
  assert.match(review, /Pause daily-report:work\?/);
  assert.match(review, /Active  →  Paused/);
  assert.match(review, /Weekdays at 17:30 local time/);
  assert.match(review, /\[ Pause schedule \].*\[ Cancel \]/);
  component.handleInput("\r");
  assert.match(component.render(120).join("\n"), /Pause schedule…/);
  assert.deepEqual(outcomes, []);

  finishAction({ status: "success", message: "Pause schedule completed.", dashboard: data });
  await new Promise((resolve) => setImmediate(resolve));
  const restored = component.render(120).join("\n");
  assert.match(restored, /\[Tasks\]/);
  assert.match(restored, /Pause schedule completed/);
  assert.deepEqual(outcomes, []);
  component.handleInput("q");
  assert.deepEqual(outcomes, [{ kind: "close" }]);
  component.dispose();
});

test("actions and lifecycle decisions stay compact over the selected task", async () => {
  const view = overlayHarness();
  const paused = job({
    key: "smoke:dashboard",
    schedule: "0 0 1 1 *",
    installation: {
      installed: true,
      health: "ok",
      enabled: false,
      schedule: "0 0 1 1 *",
      digest: "digest",
      revision: 2,
      definitionDrift: false,
      adapterDrift: false,
    },
    nextRun: null,
    recentRuns: [],
  });
  const data = { jobs: [paused], sourceErrors: [], generatedAt: "2026-07-30T12:00:00.000Z" };
  const component = new SchedulerWorkspaceComponent(data, view.tui, theme, () => {}, {
    async reloadDashboard() { return data; },
    async loadDetail() { throw new Error("not used"); },
    async prepareActions() {
      return {
        id: paused.id,
        key: paused.key,
        job: paused,
        actions: [{
          id: "enable",
          label: "Resume schedule",
          description: "Schedule future runs",
          open: async () => ({
            kind: "mutation",
            review: "Scheduled runs will resume.",
            presentation: {
              fromStatus: "Paused",
              toStatus: "Active",
              schedule: "0 0 1 1 *",
              adapter: "cron",
              nextRun: "2027-01-01T00:00:00.000Z",
              note: "Missed runs won’t run automatically after downtime.",
            },
            cancelled: { status: "error", message: "Cancelled", dashboard: data },
            apply: async () => ({ status: "success", message: "Resumed", dashboard: data }),
          }),
        }],
      };
    },
    async loadRunOutput() { throw new Error("not used"); },
  });

  component.handleInput("a");
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(component.render(120).join("\n"), /smoke:dashboard/);
  assert.match(view.overlay().component.render(64).join("\n"), /Actions for smoke:dashboard/);
  assert.equal(view.overlay().options.width, 64);
  assert.equal(view.overlay().options.maxHeight, "100%");
  assert.equal(view.overlay().options.margin, 0);

  view.overlay().component.handleInput("\r");
  await new Promise((resolve) => setImmediate(resolve));
  const review = view.overlay().component.render(68).join("\n");
  assert.match(review, /Resume smoke:dashboard\?/);
  assert.match(review, /Paused  →  Active/);
  assert.match(review, /Every Jan 1 at midnight local time/);
  assert.match(review, /0 0 1 1 \* · cron/);
  assert.match(review, /Next run     Jan 1, 2027 at midnight/);
  assert.match(review, /Missed runs won’t run automatically after downtime/);
  assert.match(review, /› \[ Resume schedule \].*\[ Cancel \]/);
  assert.equal(view.overlay().options.width, 68);
  assert.equal(view.overlay().options.maxHeight, "100%");
  assert.equal(view.overlay().options.margin, 0);
  assert.equal(view.overlay().component.render(68).length < component.render(120).length, true);
  view.tui.terminal.rows = 8;
  const shortReview = view.overlay().component.render(68);
  assert.equal(shortReview.length <= 8, true);
  assert.match(shortReview.join("\n"), /\[ Resume schedule \].*\[ Cancel \]/);
  assert.match(shortReview.join("\n"), /Enter Select.*Esc Cancel/);
  const narrowShortReview = view.overlay().component.render(20);
  assert.equal(narrowShortReview.length <= 8, true);
  assert.equal(narrowShortReview.every((line) => visibleWidth(line) <= 20), true);
  assert.match(narrowShortReview.join("\n"), /› \[ Resume \]/);
  assert.match(narrowShortReview.join("\n"), /\[ Cancel \]/);
  assert.match(narrowShortReview.join("\n"), /Enter\/Esc/);
  view.tui.terminal.rows = 5;
  const fiveRowReview = view.overlay().component.render(20);
  assert.equal(fiveRowReview.length <= 5, true);
  assert.match(fiveRowReview.join("\n"), /› \[ Resume \]/);
  assert.match(fiveRowReview.join("\n"), /\[ Cancel \]/);
  view.tui.terminal.rows = 4;
  const fourRowReview = view.overlay().component.render(20);
  assert.equal(fourRowReview.length <= 4, true);
  assert.match(fourRowReview.join("\n"), /› \[ Resume \]/);
  assert.match(fourRowReview.join("\n"), /\[ Cancel \]/);

  view.overlay().component.handleInput("\x1b[C");
  assert.match(view.overlay().component.render(20).join("\n"), /› \[ Cancel \]/);
  view.overlay().component.handleInput("\r");
  assert.match(view.overlay().component.render(64).join("\n"), /Actions for smoke:dashboard/);
  component.dispose();
});

test("workspace opens run output and returns without closing the overlay", async () => {
  const view = harness();
  const outcomes = [];
  const data = { jobs: [job()], sourceErrors: [], generatedAt: new Date().toISOString() };
  const component = new SchedulerWorkspaceComponent(
    data,
    view.tui,
    theme,
    (result) => outcomes.push(result),
    {
      async reloadDashboard() { return data; },
      async loadDetail() { throw new Error("not used"); },
      async prepareActions() { throw new Error("not used"); },
      async loadRunOutput() {
        return { title: "daily-report:work · succeeded", text: "retained output", complete: true };
      },
    },
  );

  component.handleInput("\t");
  component.handleInput("\r");
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(component.render(120).join("\n"), /retained output/);
  assert.deepEqual(outcomes, []);

  component.handleInput("q");
  assert.match(component.render(120).join("\n"), /\[Runs\]/);
  assert.deepEqual(outcomes, []);
  component.handleInput("q");
  assert.deepEqual(outcomes, [{ kind: "close" }]);
  component.dispose();
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

test("manual refresh clears a stale cancellation warning", async () => {
  const view = harness();
  const data = { jobs: [job()], sourceErrors: [], generatedAt: "2026-07-25T09:00:00.000Z" };
  const component = new SchedulerDashboardComponent(data, view.tui, theme, () => {}, new Date(data.generatedAt), async () => ({
    ...data,
    generatedAt: "2026-07-25T09:00:01.000Z",
  }));
  component.setStatus("Cancellation requested. Scheduler state may have changed; press r to refresh before another action.", "error", true);
  assert.match(component.render(100).join("\n"), /Scheduler state may have changed/);

  component.handleInput("r");
  await new Promise((resolve) => setImmediate(resolve));
  assert.doesNotMatch(component.render(100).join("\n"), /Scheduler state may have changed/);

  component.setStatus("Scheduled runs paused.", "success");
  component.handleInput("r");
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(component.render(100).join("\n"), /Scheduled runs paused/);
  component.dispose();
});

test("manual refresh clears cancellation uncertainty during an automatic refresh", async () => {
  const view = harness();
  const data = { jobs: [job()], sourceErrors: [], generatedAt: "2026-07-25T09:00:00.000Z" };
  let finishReload;
  const component = new SchedulerDashboardComponent(data, view.tui, theme, () => {}, new Date(data.generatedAt), () => new Promise((resolve) => {
    finishReload = resolve;
  }));
  component.setStatus("Cancellation requested. Scheduler state may have changed; press r to refresh before another action.", "error", true);
  const automaticRefresh = component.refreshData();
  component.handleInput("r");
  finishReload({ ...data, generatedAt: "2026-07-25T09:00:01.000Z" });
  await automaticRefresh;
  assert.doesNotMatch(component.render(100).join("\n"), /Scheduler state may have changed/);
  component.dispose();
});

test("disposing the dashboard aborts an in-flight observation command", async () => {
  const view = harness();
  const initial = {
    jobs: [job({ recentRuns: [run({ status: "running", finishedAt: null })] })],
    sourceErrors: [],
    generatedAt: "2026-07-25T09:00:00.000Z",
  };
  let aborted = false;
  const component = new SchedulerDashboardComponent(initial, view.tui, theme, () => {}, new Date(initial.generatedAt), (signal) => new Promise((_, reject) => {
    signal.addEventListener("abort", () => {
      aborted = true;
      reject(new Error("aborted"));
    }, { once: true });
  }));

  const refresh = component.refreshData();
  component.dispose();
  await refresh;
  assert.equal(aborted, true);
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
  const rendered = component.render(80);
  assert.match(rendered.join("\n"), /task · succeeded/);
  assert.match(rendered.join("\n"), /finished output/);
  assert.equal(rendered.length, Math.floor(view.tui.terminal.rows * 0.85));
  component.dispose();
});

test("action menu stays in the custom dashboard and supports keyboard review", () => {
  const view = harness();
  const outcomes = [];
  const component = new SchedulerActionComponent(job(), [
    { id: "run", label: "Run installed snapshot now", description: "Start and track its receipt" },
    { id: "remove", label: "Remove installed schedule", description: "Remove known artifacts", danger: true },
  ], view.tui, theme, (result) => outcomes.push(result));

  const rendered = component.render(80);
  assert.match(rendered.join("\n"), /Actions for daily-report:work/);
  assert.match(rendered.join("\n"), /Active · Weekdays at 17:30 local time/);
  assert.equal(rendered.length, 8);
  component.handleInput("j");
  component.handleInput("\r");
  assert.deepEqual(outcomes, ["remove"]);
});

test("scheduler surfaces share accent-styled hotkey chrome", () => {
  const view = harness();
  const styledTheme = {
    fg: (color, text) => color === "accent" ? `\x1b[36m${text}\x1b[39m` : color === "dim" ? `\x1b[2m${text}\x1b[22m` : text,
    bg: (_color, text) => text,
    bold: (text) => text,
  };
  const blocked = job({ candidateError: { code: "ENVIRONMENT", message: "missing command" } });
  const data = { jobs: [blocked], sourceErrors: [], generatedAt: new Date().toISOString() };
  const surfaces = [
    new SchedulerDashboardComponent(data, view.tui, styledTheme, () => {}),
    new SchedulerJobDetailComponent(blocked, "Definition", view.tui, styledTheme, () => {}),
    new SchedulerTextComponent("Recent output", "line one", view.tui, styledTheme, () => {}),
  ];
  const actions = new SchedulerActionComponent(blocked, [
    { id: "run", label: "Run installed snapshot now", description: "Start and track its receipt" },
  ], view.tui, styledTheme, () => {});

  for (const surface of surfaces) {
    assert.match(surface.render(160).join("\n"), /\x1b\[36mq\/Esc\x1b\[39m/);
    surface.dispose?.();
  }
  assert.match(actions.render(64).join("\n"), /\x1b\[36mEnter\x1b\[39m/);
  assert.match(actions.render(64).join("\n"), /\x1b\[36mEsc\x1b\[39m/);
});

test("scheduler surfaces retain navigation within very short overlay budgets", () => {
  const view = harness(8);
  const expectedHeight = Math.floor(view.tui.terminal.rows * 0.85);
  const blocked = job({ candidateError: { code: "ENVIRONMENT", message: "missing command" } });
  const sourceErrors = ["global", "project"].map((scope) => ({
    scope,
    manifestPath: `/${scope}/scheduler.json`,
    error: { code: "SOURCE", message: `${scope} source failed` },
  }));
  const data = { jobs: [blocked], sourceErrors, generatedAt: new Date().toISOString() };
  const surfaces = [
    new SchedulerDashboardComponent(data, view.tui, theme, () => {}),
    new SchedulerJobDetailComponent(blocked, "Definition", view.tui, theme, () => {}),
    new SchedulerTextComponent("Recent output", "line one\nline two", view.tui, theme, () => {}),
  ];
  const actions = new SchedulerActionComponent(blocked, [
    { id: "run", label: "Run installed snapshot now", description: "Start and track its receipt" },
  ], view.tui, theme, () => {});

  for (const surface of surfaces) {
    const rendered = surface.render(120);
    assert.equal(rendered.length, expectedHeight);
    assert.equal(rendered.every((line) => visibleWidth(line) <= 120), true);
    assert.match(rendered.join("\n"), /q\/Esc/);
  }
  assert.equal(actions.render(50).every((line) => visibleWidth(line) <= 50), true);
  assert.match(actions.render(50).join("\n"), /Esc Close/);
  assert.match(surfaces[1].render(120).join("\n"), /d diagnose/);
  for (const surface of surfaces) {
    const narrow = surface.render(50);
    assert.match(narrow.join("\n"), /q\/Esc/);
    assert.equal(narrow.every((line) => visibleWidth(line) <= 50), true);
  }
  for (const width of [1, 2]) {
    for (const surface of surfaces) {
      const rendered = surface.render(width);
      assert.equal(rendered.length, expectedHeight);
      assert.equal(rendered.every((line) => visibleWidth(line) <= width), true);
    }
  }
  for (const surface of surfaces) surface.dispose?.();
});

test("detail view refreshes in place without closing", async () => {
  const view = harness();
  const outcomes = [];
  const component = new SchedulerJobDetailComponent(
    job({ candidateError: { code: "ENVIRONMENT", message: "ambiguous node" } }),
    "Old definition",
    view.tui,
    theme,
    (result) => outcomes.push(result),
    new Date(2026, 6, 25, 9, 0),
    async () => ({
      job: job({ candidateError: null, description: "Recovered task" }),
      definition: "New definition",
      generatedAt: "2026-07-25T09:01:00.000Z",
    }),
  );

  assert.match(component.render(120).join("\n"), /diagnose with the open agent/);
  await component.refreshData();
  const rendered = component.render(120).join("\n");
  assert.match(rendered, /Updated/);
  assert.match(rendered, /Recovered task/);
  assert.deepEqual(outcomes, []);
  component.dispose();
});

test("detail refresh reports when the task is still blocked", async () => {
  const view = harness();
  const blocked = job({ candidateError: { code: "ENVIRONMENT", message: "ambiguous node" } });
  const component = new SchedulerJobDetailComponent(
    blocked,
    "Definition",
    view.tui,
    theme,
    () => {},
    new Date(2026, 6, 25, 9, 0),
    async () => ({ job: blocked, definition: "Definition", generatedAt: "2026-07-25T09:01:00.000Z" }),
  );

  await component.refreshData();
  assert.match(component.render(120).join("\n"), /Still blocked/);
  component.dispose();
});

test("detail view hands failures to the open agent", () => {
  const view = harness();
  const outcomes = [];
  const component = new SchedulerJobDetailComponent(
    job({ candidateError: { code: "ENVIRONMENT", message: "ambiguous node" } }),
    "Definition",
    view.tui,
    theme,
    (result) => outcomes.push(result),
  );

  assert.match(component.render(120).join("\n"), /d diagnose/);
  component.handleInput("d");
  assert.deepEqual(outcomes, [{ kind: "diagnose" }]);
});

test("detail view gives concrete recovery routes for adapter drift and failed runs", () => {
  const view = harness();
  const outcomes = [];
  const timedOut = run({ status: "timed-out", reason: "timed out after 30 seconds" });
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
    recentRuns: [
      run({ runId: "00000000-0000-4000-8000-000000000002", status: "skipped", reason: "overlap" }),
      timedOut,
    ],
  });
  const component = new SchedulerJobDetailComponent(current, "Definition", view.tui, theme, (result) => outcomes.push(result));
  const rendered = component.render(120).join("\n");
  assert.match(rendered, /review Pause or Resume/);
  assert.match(rendered, /open Runs.*retained output/);
  component.handleInput("\t");
  component.handleInput("j");
  component.handleInput("\r");
  assert.deepEqual(outcomes, [{ kind: "run", id: current.id, runId: timedOut.runId }]);
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
  assert.match(component.render(160).join("\n"), /\[Overview\]/);
  assert.doesNotMatch(component.render(160).join("\n"), /Enter output/);
  component.handleInput("\t");
  assert.match(component.render(160).join("\n"), /\[Runs\]/);
  assert.match(component.render(160).join("\n"), /Enter output/);
  component.handleInput("\t");
  assert.match(component.render(160).join("\n"), /Argv: \["node"\]/);
  assert.doesNotMatch(component.render(160).join("\n"), /Enter output/);
  component.handleInput("a");
  assert.deepEqual(outcomes, [{ kind: "actions" }]);
});
