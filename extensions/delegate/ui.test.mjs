import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { AgentDeskOverlayComponent, createDelegateUi, describeLatestActivity, listDeskAssignments, readChildHistory, RunOverlayComponent } from "./ui.ts";

const theme = {
  fg: (_color, text) => text,
  bg: (_color, text) => text,
  bold: (text) => text,
};

function run(state = "running", observedAt = new Date(0).toISOString(), count = 1) {
  return {
    schemaVersion: 3,
    id: "run-1",
    parent: { sessionId: "parent-1", leafId: null, inputGeneration: 0 },
    recordRef: "/tmp/run.json",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    delivery: { state: "pending" },
    children: Array.from({ length: count }, (_, index) => ({
      id: `child-${index + 1}`,
      label: `Reader ${index + 1}`,
      task: `Read module ${index + 1}`,
      state,
      resolved: {
        model: { provider: "openai", id: "sol" },
        reasoning: "max",
        context: "fresh",
        skills: [],
        tools: ["read"],
        output: "text",
      },
      sessionDir: `/tmp/child-${index + 1}`,
      workspace: { kind: "existing", cwd: "/tmp", owner: "external" },
      latestActivity: { kind: "thinking", summary: "Thinking", observedAt },
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, cost: 0 },
    })),
  };
}

function runtimeFor(...initialRuns) {
  const runs = new Map(initialRuns.map((value) => [value.id, structuredClone(value)]));
  const listeners = new Set();
  let unsubscribed = false;
  return {
    runtime: {
      subscribe(callback) {
        listeners.add(callback);
        return () => { listeners.delete(callback); unsubscribed = true; };
      },
      get(runId) { return structuredClone(runs.get(runId)); },
      list() { return [...runs.values()].map((value) => structuredClone(value)); },
    },
    emit(next) {
      runs.set(next.id, structuredClone(next));
      for (const listener of listeners) listener(structuredClone(next));
    },
    get unsubscribed() { return unsubscribed; },
  };
}

test("pinned status is label-first, UUID-free, and reports elapsed time", () => {
  const now = 19_000;
  const activeRun = run("running", new Date(17_000).toISOString(), 2);
  const harness = runtimeFor(activeRun);
  const ui = createDelegateUi(harness.runtime);
  const component = ui.createStatus({ requestRender() {} }, theme, { now: () => now });
  const rendered = component.render(120).join("\n");

  assert.match(rendered, /Agents · 2 running · 19s/);
  assert.match(rendered, /Reader 1 · Thinking · 19s/);
  assert.match(rendered, /Reader 2 · Thinking · 19s/);
  assert.match(rendered, /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] Reader 1/);
  assert.doesNotMatch(rendered, /run-1|child-1/);
  component.dispose();
});

test("pinned spinner and elapsed display redraw independently of runtime activity", async () => {
  let now = 1_000;
  const activeRun = run("running", new Date(900).toISOString());
  const harness = runtimeFor(activeRun);
  const ui = createDelegateUi(harness.runtime);
  let renders = 0;
  const component = ui.createStatus(
    { requestRender() { renders++; } },
    theme,
    { now: () => now, spinnerFrameMs: 20 },
  );
  const before = component.render(100);
  assert.notEqual(component.animationTimer, undefined);
  now += 60;
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.ok(renders > 0);
  assert.notDeepEqual(component.render(100), before);
  component.dispose();
});

test("quiet active work reports activity age only after the stale threshold", () => {
  const activeRun = run("running", new Date(0).toISOString());
  assert.equal(
    describeLatestActivity(activeRun, 15_000, 10_000),
    "Still running · last activity 15s ago (Thinking)",
  );
  assert.equal(
    describeLatestActivity(activeRun, 5_000, 10_000),
    "Thinking · 5s ago",
  );

  const harness = runtimeFor(activeRun);
  const component = createDelegateUi(harness.runtime).createStatus(
    { requestRender() {} },
    theme,
    { now: () => 15_000 },
  );
  assert.match(component.render(120).join("\n"), /Still running · Thinking · quiet 15s · 15s/);
  component.dispose();
});

test("pinned status prioritizes attention, caps rows, and collapses on narrow terminals", () => {
  const activeRun = run("running", new Date(19_000).toISOString(), 9);
  activeRun.children[7].state = "needs_attention";
  activeRun.children[7].attention = {
    id: "attention-1",
    kind: "decision",
    question: "Choose the cache policy",
    requestedAt: new Date(19_500).toISOString(),
    notification: { state: "pending" },
  };
  activeRun.children[8].state = "interrupted";
  const harness = runtimeFor(activeRun);
  const component = createDelegateUi(harness.runtime).createStatus(
    { requestRender() {} },
    theme,
    { now: () => 20_000 },
  );
  const wide = component.render(140);
  const rendered = wide.join("\n");

  assert.equal(wide.length, 8);
  assert.match(rendered, /Reader 8 · Needs decision: Choose the cache policy/);
  assert.match(rendered, /Reader 9 · Interrupted · resume in \/agents/);
  assert.match(rendered, /… 3 more · \/agents/);
  assert.deepEqual(component.render(140), wide);
  const narrow = component.render(60);
  assert.equal(narrow.length, 1);
  assert.match(narrow[0], /^Agents ·/);
  assert.match(narrow[0], /\/agents$/);
  assert.ok(visibleWidth(narrow[0]) <= 60);
  component.dispose();
});

test("extreme narrow status remains width-safe with ANSI styling", () => {
  const ansiTheme = {
    fg: (_color, text) => `\u001b[31m${text}\u001b[0m`,
    bg: (_color, text) => text,
    bold: (text) => `\u001b[1m${text}\u001b[0m`,
  };
  const component = createDelegateUi(runtimeFor(run("running", new Date().toISOString())).runtime).createStatus(
    { requestRender() {} },
    ansiTheme,
  );
  for (const width of [1, 5, 10]) {
    const lines = component.render(width);
    assert.equal(lines.length, 1);
    assert.ok(visibleWidth(lines[0]) <= width);
  }
  assert.match(component.render(10)[0], /\/agents/);
  component.dispose();
});

test("every lifecycle state has explicit text and a non-color icon", () => {
  const lifecycleRun = run("running", new Date(19_000).toISOString(), 8);
  const states = ["queued", "starting", "running", "needs_attention", "completed", "failed", "cancelled", "interrupted"];
  lifecycleRun.children.forEach((child, index) => { child.state = states[index]; });
  lifecycleRun.children[3].attention = {
    id: "attention-1",
    kind: "approval",
    question: "Apply the patch?",
    requestedAt: new Date(20_000).toISOString(),
    notification: { state: "pending" },
  };
  lifecycleRun.children[4].result = { kind: "text", value: "Done", completedAt: new Date(20_000).toISOString() };
  lifecycleRun.children[5].failure = {
    message: "Tests failed",
    lastActivity: lifecycleRun.children[5].latestActivity,
    failedAt: new Date(20_000).toISOString(),
  };
  for (const child of lifecycleRun.children.slice(4)) {
    child.latestActivity.observedAt = new Date(20_000).toISOString();
  }
  const component = createDelegateUi(runtimeFor(lifecycleRun).runtime).createStatus(
    { requestRender() {} },
    theme,
    { now: () => 20_000, maxRows: 8 },
  );
  const rendered = component.render(160).join("\n");

  assert.match(rendered, /Reader 1 · Queued/);
  assert.match(rendered, /Reader 2 · Starting/);
  assert.match(rendered, /Reader 3 · Thinking/);
  assert.match(rendered, /\? Reader 4 · Needs approval/);
  assert.match(rendered, /✓ Reader 5 · Completed/);
  assert.match(rendered, /✗ Reader 6 · Failed: Tests failed/);
  assert.match(rendered, /○ Reader 7 · Cancelled/);
  assert.match(rendered, /■ Reader 8 · Interrupted/);
  component.dispose();
});

test("pinned status never emits embedded terminal lines from multiline failures", () => {
  const failedRun = run("failed", new Date().toISOString());
  failedRun.children[0].failure = {
    message: "No API key found for openai-codex.\n\nUse /login to log in.\n  /opt/pi/docs/providers.md",
    lastActivity: failedRun.children[0].latestActivity,
    failedAt: new Date().toISOString(),
  };
  const component = createDelegateUi(runtimeFor(failedRun).runtime).createStatus(
    { requestRender() {} },
    theme,
  );
  const lines = component.render(120);

  assert.equal(component.animationTimer, undefined);
  assert.equal(lines.every((line) => !/[\r\n]/.test(line)), true);
  assert.match(lines.join("\n"), /Failed: No API key found for openai-codex\./);
  assert.doesNotMatch(lines.join("\n"), /Use \/login/);
  component.dispose();
});

test("terminal outcomes remain briefly and then clear", () => {
  let now = 10_000;
  const activeRun = run("running", new Date(9_000).toISOString());
  const harness = runtimeFor(activeRun);
  const component = createDelegateUi(harness.runtime).createStatus(
    { requestRender() {} },
    theme,
    { now: () => now, terminalRetentionMs: 30_000 },
  );
  const completedRun = structuredClone(activeRun);
  completedRun.children[0].state = "completed";
  completedRun.children[0].result = { kind: "text", value: "Done", completedAt: new Date(now).toISOString() };
  completedRun.children[0].latestActivity = { kind: "message", summary: "Completed", observedAt: new Date(now).toISOString() };
  harness.emit(completedRun);

  assert.match(component.render(100).join("\n"), /✓ Reader 1 · Completed · 10s/);
  now = 39_999;
  assert.notDeepEqual(component.render(100), []);
  now = 40_001;
  assert.deepEqual(component.render(100), []);
  component.dispose();
});

test("terminal outcomes request one expiry redraw without polling active work", async () => {
  const completedAt = Date.now();
  const activeRun = run("running", new Date(completedAt).toISOString());
  const harness = runtimeFor(activeRun);
  let renders = 0;
  const component = createDelegateUi(harness.runtime).createStatus(
    { requestRender() { renders++; } },
    theme,
    { terminalRetentionMs: 20 },
  );
  const completedRun = structuredClone(activeRun);
  completedRun.children[0].state = "completed";
  completedRun.children[0].result = { kind: "text", value: "Done", completedAt: new Date(completedAt).toISOString() };
  completedRun.children[0].latestActivity = { kind: "message", summary: "Completed", observedAt: new Date(completedAt).toISOString() };
  harness.emit(completedRun);
  const rendersAfterCompletion = renders;
  assert.equal(component.animationTimer, undefined);

  await new Promise((resolve) => setTimeout(resolve, 40));

  assert.equal(renders, rendersAfterCompletion + 1);
  assert.deepEqual(component.render(100), []);
  component.dispose();
});

test("a new user turn dismisses retained outcomes without hiding active work", () => {
  const mixedRun = run("running", new Date(9_000).toISOString(), 2);
  mixedRun.children[1].state = "completed";
  mixedRun.children[1].result = { kind: "text", value: "Done", completedAt: new Date(10_000).toISOString() };
  mixedRun.children[1].latestActivity = { kind: "message", summary: "Completed", observedAt: new Date(10_000).toISOString() };
  const harness = runtimeFor(mixedRun);
  let renders = 0;
  const component = createDelegateUi(harness.runtime).createStatus(
    { requestRender() { renders++; } },
    theme,
    { now: () => 10_000 },
  );
  assert.match(component.render(120).join("\n"), /Reader 2 · Completed/);

  component.dismissTerminal();

  let rendered = component.render(120).join("\n");
  assert.match(rendered, /Reader 1 · Thinking/);
  assert.doesNotMatch(rendered, /Reader 2|completed/);
  assert.equal(renders, 1);

  harness.emit(mixedRun);
  rendered = component.render(120).join("\n");
  assert.match(rendered, /Reader 1 · Thinking/);
  assert.doesNotMatch(rendered, /Reader 2|completed/);
  component.dispose();
});

test("pinned status disposes its animation timer and runtime subscription", async () => {
  const harness = runtimeFor(run("running", new Date().toISOString()));
  let renders = 0;
  const component = createDelegateUi(harness.runtime).createStatus(
    { requestRender() { renders++; } },
    theme,
    { spinnerFrameMs: 10 },
  );
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.ok(renders > 0);
  component.dispose();
  assert.equal(component.animationTimer, undefined);
  const afterDispose = renders;
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(renders, afterDispose);
  assert.equal(harness.unsubscribed, true);
});

test("inline launch records stay static and hide identifiers until expanded", () => {
  const ui = createDelegateUi(runtimeFor().runtime);
  const handle = {
    runId: "run-secret",
    recordRef: "/tmp/run-secret.json",
    children: [{ childId: "child-secret", label: "Continuity audit", state: "starting" }],
  };
  const normal = ui.renderLaunch(handle, false, theme).render(100).join("\n");
  assert.match(normal, /Continuity audit started/);
  assert.doesNotMatch(normal, /run-secret|child-secret/);
  const expanded = ui.renderLaunch(handle, true, theme).render(100).join("\n");
  assert.match(expanded, /Run: run-secret/);
  assert.match(expanded, /Record: \/tmp\/run-secret\.json/);
});

test("agent desk groups assignments once with deterministic lifecycle precedence", () => {
  const newer = run("running", new Date(2_000).toISOString(), 4);
  newer.id = "run-newer";
  newer.createdAt = new Date(2_000).toISOString();
  newer.children.forEach((child, index) => { child.id = `new-${index + 1}`; });
  newer.children[0].state = "interrupted";
  newer.children[1].state = "running";
  newer.children[2].state = "needs_attention";
  newer.children[2].attention = {
    id: "attention-live",
    kind: "decision",
    question: "Choose policy",
    requestedAt: new Date(2_000).toISOString(),
    notification: { state: "delivered", deliveredAt: new Date(2_100).toISOString() },
  };
  newer.children[3].state = "completed";
  newer.children[3].attention = {
    id: "attention-stale",
    kind: "decision",
    question: "Stale question",
    requestedAt: new Date(2_000).toISOString(),
    notification: { state: "held", reason: "session_changed" },
  };
  newer.children[3].result = { kind: "text", value: "Done", completedAt: new Date(3_000).toISOString() };

  const older = run("running", new Date(1_000).toISOString(), 2);
  older.id = "run-older";
  older.createdAt = new Date(1_000).toISOString();
  older.children.forEach((child, index) => { child.id = `old-${index + 1}`; });
  older.children[0].state = "interrupted";
  older.children[1].state = "failed";
  older.children[1].failure = {
    message: "Failed",
    lastActivity: older.children[1].latestActivity,
    failedAt: new Date(3_000).toISOString(),
  };

  const assignments = listDeskAssignments([older, newer]);
  assert.deepEqual(assignments.map(({ child, section }) => `${section}:${child.id}`), [
    "recovery:new-1",
    "recovery:old-1",
    "managed:new-2",
    "managed:new-3",
    "recent:new-4",
    "recent:old-2",
  ]);
});

test("agent desk tie-breaks equal run times and keeps terminal stale attention recent", () => {
  const makeTerminal = (id, notification) => {
    const value = run("completed", new Date(2_000).toISOString());
    value.id = id;
    value.createdAt = new Date(2_000).toISOString();
    value.children[0].id = `${id}-child`;
    value.children[0].state = "completed";
    value.children[0].result = { kind: "text", value: "Done", completedAt: new Date(3_000).toISOString() };
    value.children[0].attention = {
      id: `${id}-attention`,
      kind: "decision",
      question: "Stale",
      requestedAt: new Date(2_000).toISOString(),
      notification,
    };
    return value;
  };
  const runB = makeTerminal("run-b", { state: "pending" });
  const runA = makeTerminal("run-a", { state: "delivered", deliveredAt: new Date(2_100).toISOString() });
  const runC = makeTerminal("run-c", { state: "held", reason: "session_changed" });

  const assignments = listDeskAssignments([runC, runB, runA]);
  assert.deepEqual(assignments.map(({ run: value, section }) => `${section}:${value.id}`), [
    "recent:run-a",
    "recent:run-b",
    "recent:run-c",
  ]);
});

test("agent desk names conductor ownership and truthful attention delivery states", () => {
  const mixed = run("running", new Date().toISOString(), 7);
  mixed.id = "hidden-run-id";
  mixed.delivery = { state: "held", reason: "user_intervened" };
  mixed.children[0].state = "interrupted";
  for (const [index, notification] of [
    { state: "pending" },
    { state: "delivered", deliveredAt: new Date().toISOString() },
    { state: "held", reason: "session_changed" },
  ].entries()) {
    const child = mixed.children[index + 1];
    child.state = "needs_attention";
    child.attention = {
      id: `attention-${index}`,
      kind: "decision",
      question: `Question ${index}`,
      requestedAt: new Date().toISOString(),
      notification,
    };
  }
  mixed.children[4].state = "completed";
  mixed.children[4].result = { kind: "text", value: "Done", completedAt: new Date().toISOString() };
  mixed.children[5].state = "failed";
  mixed.children[5].failure = { message: "Tests failed", lastActivity: mixed.children[5].latestActivity, failedAt: new Date().toISOString() };
  mixed.children[6].state = "cancelled";

  const component = new AgentDeskOverlayComponent(
    runtimeFor(mixed).runtime,
    {},
    { requestRender() {}, terminal: { rows: 40 } },
    theme,
    () => {},
    { async resume() {} },
  );
  const rendered = component.render(140).join("\n");

  assert.match(rendered, /conductor manages subagents/);
  assert.match(rendered, /NEEDS RECOVERY/);
  assert.match(rendered, /Reader 1 · sol · Interrupted/);
  assert.match(rendered, /MANAGED BY CONDUCTOR/);
  assert.match(rendered, /RECENT/);
  assert.match(rendered, /Notifying conductor/);
  assert.match(rendered, /Waiting on conductor/);
  assert.match(rendered, /Update held · \/agents use/);
  assert.match(rendered, /Completed · update held · \/agents use/);
  assert.match(rendered, /Failed · Tests failed · update held · \/agents use/);
  assert.match(rendered, /Cancelled · update held · \/agents use/);
  assert.doesNotMatch(rendered, /hidden-run-id/);
  component.dispose();

  const failedDetail = new AgentDeskOverlayComponent(
    runtimeFor(mixed).runtime,
    { childId: "child-6" },
    { requestRender() {}, terminal: { rows: 24 } },
    theme,
    () => {},
    { async resume() {} },
  );
  failedDetail.handleInput("\r");
  assert.match(failedDetail.render(120).join("\n"), /Run update not added to this branch · \/agents use/);
  failedDetail.dispose();
});

test("agent desk honors bare, run, and child initial targets", () => {
  const newer = run("running", new Date().toISOString(), 2);
  newer.id = "newer";
  newer.createdAt = new Date(2_000).toISOString();
  newer.children[0].id = "newer-running";
  newer.children[0].label = "Newer running";
  newer.children[1].id = "newer-interrupted";
  newer.children[1].label = "Newer interrupted";
  newer.children[1].state = "interrupted";
  const older = run("running", new Date().toISOString(), 1);
  older.id = "older";
  older.createdAt = new Date(1_000).toISOString();
  older.children[0].id = "older-running";
  older.children[0].label = "Older running";
  const harness = runtimeFor(older, newer);
  const makeDesk = (target) => new AgentDeskOverlayComponent(
    harness.runtime,
    target,
    { requestRender() {}, terminal: { rows: 30 } },
    theme,
    () => {},
    { async resume() {} },
  );

  const bare = makeDesk({});
  assert.match(bare.render(120).join("\n"), /› .*Newer interrupted/);
  bare.dispose();
  const runTarget = makeDesk({ runId: "older" });
  assert.match(runTarget.render(120).join("\n"), /› .*Older running/);
  runTarget.dispose();
  const childTarget = makeDesk({ childId: "newer-running" });
  assert.match(childTarget.render(120).join("\n"), /› .*Newer running/);
  childTarget.dispose();
  const mismatchedTarget = makeDesk({ runId: "older", childId: "newer-running" });
  assert.match(mismatchedTarget.render(120).join("\n"), /› .*Newer interrupted/);
  mismatchedTarget.dispose();
  const missingTarget = makeDesk({ childId: "missing" });
  assert.match(missingTarget.render(120).join("\n"), /› .*Newer interrupted/);
  missingTarget.dispose();
});

test("agent desk preserves identity selection across reclassification and opens live detail", () => {
  const activeRun = run("running", new Date().toISOString(), 2);
  activeRun.children[0].label = "First assignment";
  activeRun.children[1].label = "Selected assignment";
  const harness = runtimeFor(activeRun);
  const component = new AgentDeskOverlayComponent(
    harness.runtime,
    {},
    { requestRender() {}, terminal: { rows: 24 } },
    theme,
    () => {},
    { async resume() {} },
  );

  component.handleInput("j");
  component.handleInput("\r");
  assert.match(component.render(120).join("\n"), /Agents \/ Selected assignment/);

  const completed = structuredClone(activeRun);
  completed.children[1].state = "completed";
  completed.children[1].result = { kind: "text", value: "Selected result", completedAt: new Date().toISOString() };
  harness.emit(completed);
  const detail = component.render(120).join("\n");
  assert.match(detail, /Agents \/ Selected assignment/);
  assert.match(detail, /Selected result/);
  assert.doesNotMatch(detail, /First assignment/);

  component.handleInput("\x1b");
  assert.match(component.render(120).join("\n"), /› .*Selected assignment/);
  component.dispose();
});

test("agent desk falls back to the nearest assignment and then an empty state", () => {
  const activeRun = run("running", new Date().toISOString(), 3);
  activeRun.children[0].label = "First";
  activeRun.children[1].label = "Second";
  activeRun.children[2].label = "Third";
  const harness = runtimeFor(activeRun);
  const component = new AgentDeskOverlayComponent(
    harness.runtime,
    { childId: "child-2" },
    { requestRender() {}, terminal: { rows: 24 } },
    theme,
    () => {},
    { async resume() {} },
  );
  assert.match(component.render(100).join("\n"), /› .*Second/);

  const removed = structuredClone(activeRun);
  removed.children.splice(1, 1);
  harness.emit(removed);
  assert.match(component.render(100).join("\n"), /› .*Third/);

  const empty = structuredClone(activeRun);
  empty.children = [];
  harness.emit(empty);
  assert.match(component.render(100).join("\n"), /No agent assignments in this session/);
  component.dispose();
});

test("agent desk resume locks per child and reports launch errors", async () => {
  const interrupted = run("interrupted", new Date().toISOString(), 2);
  interrupted.children[0].label = "First interrupted";
  interrupted.children[1].label = "Second interrupted";
  const harness = runtimeFor(interrupted);
  const calls = [];
  let resolveFirst;
  const firstPending = new Promise((resolve) => { resolveFirst = resolve; });
  const component = new AgentDeskOverlayComponent(
    harness.runtime,
    {},
    { requestRender() {}, terminal: { rows: 24 } },
    theme,
    () => {},
    {
      resume(_runId, childId) {
        calls.push(childId);
        return childId === "child-1" ? firstPending : Promise.reject(new Error("Model unavailable"));
      },
    },
  );

  assert.match(component.render(120).join("\n"), /r\/R resume/);
  component.handleInput("R");
  component.handleInput("r");
  assert.deepEqual(calls, ["child-1"]);
  assert.match(component.render(120).join("\n"), /First interrupted · sol · Resume requested/);
  component.handleInput("j");
  component.handleInput("r");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ["child-1", "child-2"]);
  assert.match(component.render(120).join("\n"), /Second interrupted · sol · Interrupted · Model unavailable/);
  resolveFirst();
  await new Promise((resolve) => setImmediate(resolve));
  component.dispose();
});

test("agent desk shows queued, starting, running, and re-interrupted resume states", async () => {
  const interrupted = run("interrupted", new Date().toISOString());
  const harness = runtimeFor(interrupted);
  let resolveResume;
  const resumeGate = new Promise((resolve) => { resolveResume = resolve; });
  const component = new AgentDeskOverlayComponent(
    harness.runtime,
    {},
    { requestRender() {}, terminal: { rows: 24 } },
    theme,
    () => {},
    { resume: () => resumeGate },
  );

  component.handleInput("r");
  assert.match(component.render(100).join("\n"), /Resume requested/);
  const queued = structuredClone(interrupted);
  queued.children[0].state = "queued";
  queued.children[0].latestActivity = { kind: "waiting", summary: "Resume queued for an inference slot", observedAt: new Date().toISOString() };
  harness.emit(queued);
  assert.match(component.render(100).join("\n"), /Queued · Resume queued/);
  resolveResume();
  await new Promise((resolve) => setImmediate(resolve));
  for (const [state, summary, expected] of [
    ["starting", "Restoring the child session", /Starting · Restoring/],
    ["running", "Running tests", /Running tests/],
    ["interrupted", "Interrupted again", /Interrupted/],
  ]) {
    const update = structuredClone(interrupted);
    update.children[0].state = state;
    update.children[0].latestActivity = { kind: "waiting", summary, observedAt: new Date().toISOString() };
    harness.emit(update);
    assert.match(component.render(100).join("\n"), expected);
  }
  component.dispose();
});

test("agent desk stays ANSI-safe on narrow and short terminals", () => {
  const many = run("running", new Date().toISOString(), 12);
  const ansiTheme = {
    fg: (_color, text) => `\u001b[31m${text}\u001b[0m`,
    bg: (_color, text) => `\u001b[40m${text}\u001b[0m`,
    bold: (text) => `\u001b[1m${text}\u001b[0m`,
  };
  const component = new AgentDeskOverlayComponent(
    runtimeFor(many).runtime,
    {},
    { requestRender() {}, terminal: { rows: 6 } },
    ansiTheme,
    () => {},
    { async resume() {} },
  );
  for (const width of [10, 40, 79]) {
    const lines = component.render(width);
    assert.ok(lines.length <= 6);
    assert.ok(lines.every((line) => visibleWidth(line) <= width));
    if (width >= 40) assert.match(lines.join("\n"), /Reader 1/);
  }
  component.handleInput("\r");
  const detail = component.render(40);
  assert.ok(detail.length <= 6);
  assert.ok(detail.every((line) => visibleWidth(line) <= 40));
  assert.match(detail.join("\n"), /Agents \/ Reader 1/);
  component.dispose();
});

test("compact Agent Desk detail keeps transcript scrolling truthful", async () => {
  const activeRun = run("running", new Date().toISOString());
  activeRun.children[0].sessionFile = "/tmp/child-1/session.jsonl";
  const runtime = {
    subscribe() { return () => {}; },
    get: () => structuredClone(activeRun),
  };
  const overlay = new RunOverlayComponent(
    runtime,
    "run-1",
    { requestRender() {}, terminal: { rows: 8 } },
    theme,
    () => {},
    async () => [
      { kind: "assistant", text: "message 1" },
      { kind: "assistant", text: "message 2" },
      { kind: "assistant", text: "message 3" },
    ],
    { detailOnly: true },
  );
  await new Promise((resolve) => setImmediate(resolve));

  const live = overlay.render(60);
  assert.ok(live.length <= 6);
  assert.match(live.join("\n"), /Thinking/);
  assert.match(live.join("\n"), /scroll/);
  overlay.handleInput("\x1b[A");
  overlay.handleInput("\x1b[A");
  assert.match(overlay.render(60).join("\n"), /message 3/);
  overlay.handleInput("\x1b[A");
  overlay.handleInput("\x1b[A");
  const earlier = overlay.render(60).join("\n");
  assert.match(earlier, /message 2/);
  assert.doesNotMatch(earlier, /All transcript lines visible/);
  overlay.handleInput("\x1b[F");
  assert.match(overlay.render(60).join("\n"), /Thinking/);
  overlay.dispose();
});

test("delegate UI closes its Desk and fences an in-flight Resume render", async () => {
  const harness = runtimeFor(run("interrupted", new Date().toISOString()));
  const ui = createDelegateUi(harness.runtime);
  let component;
  let renders = 0;
  let resolveResume;
  const resumeGate = new Promise((resolve) => { resolveResume = resolve; });
  const opened = ui.openDesk(
    {},
    {
      mode: "tui",
      ui: {
        custom(factory) {
          return new Promise((resolve) => {
            component = factory({ requestRender() { renders++; }, terminal: { rows: 24 } }, theme, {}, resolve);
          });
        },
      },
    },
    { resume: () => resumeGate },
  );
  assert.ok(component);
  component.handleInput("r");
  ui.dispose();
  await opened;
  const afterDispose = renders;
  resolveResume();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(renders, afterDispose);
  assert.equal(harness.unsubscribed, true);
});

test("temporary workspace review controls remain in the detailed overlay", () => {
  const completedRun = run("completed", new Date().toISOString());
  completedRun.children[0].workspace = {
    kind: "temporary",
    sourceCwd: "/tmp/source",
    repoRoot: "/tmp/source",
    relativeCwd: "",
    worktreePath: "/tmp/worktree",
    branch: "pi-delegate/run-1/child-1",
    baseCommit: "base",
    patchPath: "/tmp/review.patch",
    manifestPath: "/tmp/review.json",
    integration: {
      state: "review_pending",
      review: {
        revision: "tree-reviewed",
        baseTree: "tree-base",
        summary: { filesChanged: 1, additions: 2, deletions: 0, stat: "1 file changed, 2 insertions(+)" },
        patchPath: "/tmp/review.patch",
        manifestPath: "/tmp/review.json",
        reviewedAt: new Date().toISOString(),
      },
    },
  };
  const overlay = new RunOverlayComponent(
    runtimeFor(completedRun).runtime,
    "run-1",
    { requestRender() {}, terminal: { rows: 30 } },
    theme,
    () => {},
    async () => [],
  );
  const rendered = overlay.render(160).join("\n");
  assert.match(rendered, /\/agents apply run-1 tree-reviewed child-1/);
  assert.match(rendered, /Manifest: \/tmp\/review\.json/);
  overlay.dispose();

  const desk = new AgentDeskOverlayComponent(
    runtimeFor(completedRun).runtime,
    {},
    { requestRender() {}, terminal: { rows: 30 } },
    theme,
    () => {},
    { async resume() {} },
  );
  desk.handleInput("\r");
  const deskDetail = desk.render(160).join("\n");
  assert.match(deskDetail, /The conductor can apply or discard this reviewed revision/);
  assert.match(deskDetail, /Manifest: \/tmp\/review\.json/);
  assert.doesNotMatch(deskDetail, /\/agents apply|\/agents discard/);
  desk.dispose();
});

test("child history keeps structured Pi-like events and hides runtime terminal tools", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "delegate-history-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const sessionFile = path.join(directory, "session.jsonl");
  const entries = [
    { type: "session_info", name: "delegate:child-1 Reader" },
    { type: "message", message: { role: "user", content: [{ type: "text", text: "Inspect the cache" }] } },
    { type: "message", message: { role: "assistant", content: [{ type: "thinking", thinking: "hidden" }, { type: "toolCall", id: "read-1", name: "read", arguments: { path: "src/cache.ts" } }] } },
    { type: "message", message: { role: "toolResult", toolCallId: "read-1", toolName: "read", content: [{ type: "text", text: "cache source" }], isError: false } },
    { type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "final-1", name: "delegate_final", arguments: { result: { answer: true } } }] } },
    { type: "message", message: { role: "toolResult", toolCallId: "final-1", toolName: "delegate_final", content: [{ type: "text", text: "captured" }], isError: false } },
  ];
  fs.writeFileSync(sessionFile, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);

  assert.deepEqual(await readChildHistory(sessionFile), [
    { kind: "user", text: "Inspect the cache" },
    { kind: "tool_call", toolName: "read", arguments: { path: "src/cache.ts" } },
    { kind: "tool_result", toolName: "read", text: "cache source", isError: false },
  ]);

  fs.writeFileSync(sessionFile, `${"x".repeat(600_000)}\n${JSON.stringify(entries[1])}\n`);
  assert.deepEqual(await readChildHistory(sessionFile), [{ kind: "user", text: "Inspect the cache" }]);
});

test("overlay is framed and opens a bounded transcript at its live tail", async () => {
  const activeRun = run("running", new Date().toISOString());
  activeRun.children[0].sessionFile = "/tmp/child-1/session.jsonl";
  const runtime = {
    subscribe() { return () => {}; },
    get: () => structuredClone(activeRun),
  };
  const history = Array.from({ length: 100 }, (_, index) => ({ kind: "assistant", text: `message ${index + 1}` }));
  const overlay = new RunOverlayComponent(
    runtime,
    "run-1",
    { requestRender() {}, terminal: { rows: 20 } },
    theme,
    () => {},
    async () => history,
  );
  await new Promise((resolve) => setImmediate(resolve));

  const tail = overlay.render(100);
  assert.match(tail[0], /^╭/);
  assert.match(tail.at(-1), /^╰/);
  assert.match(tail.join("\n"), /message 100/);
  assert.doesNotMatch(tail.join("\n"), /Assistant:/);
  overlay.handleInput("\r");
  assert.match(overlay.render(100).join("\n"), /↑\/↓ j\/k scroll/);
  overlay.handleInput("\x1b[A");
  overlay.handleInput("\x1b[A");
  assert.match(overlay.render(100).join("\n"), /message 95/);
  overlay.handleInput("\x1b[B");
  overlay.handleInput("\x1b[B");
  const liveAgain = overlay.render(100).join("\n");
  assert.match(liveAgain, /message 100/);
  assert.doesNotMatch(liveAgain, /message 95/);
  overlay.handleInput("\x1b[5~");
  assert.doesNotMatch(overlay.render(100).join("\n"), /message 100/);
  overlay.handleInput("\x1b[F");
  assert.match(overlay.render(100).join("\n"), /message 100/);
  overlay.dispose();
});

test("completed overlays do not keep rereading immutable transcript files", async () => {
  const completedRun = run("completed", new Date().toISOString());
  completedRun.children[0].sessionFile = "/tmp/child-1/session.jsonl";
  const runtime = {
    subscribe() { return () => {}; },
    get: () => structuredClone(completedRun),
  };
  let loads = 0;
  const overlay = new RunOverlayComponent(
    runtime,
    "run-1",
    { requestRender() {}, terminal: { rows: 20 } },
    theme,
    () => {},
    async () => { loads++; return []; },
  );
  await new Promise((resolve) => setTimeout(resolve, 1_100));
  assert.equal(loads, 1);
  overlay.dispose();
});

test("multi-child overlay supports keyboard navigation, scrolling, narrow widths, and height bounds", async () => {
  const activeRun = run("running", new Date().toISOString(), 32);
  const runtime = {
    subscribe() { return () => {}; },
    get: () => structuredClone(activeRun),
  };
  let renders = 0;
  let closed = false;
  let unsubscribed = false;
  runtime.subscribe = () => () => { unsubscribed = true; };
  const overlay = new RunOverlayComponent(
    runtime,
    "run-1",
    { requestRender() { renders++; }, terminal: { rows: 20 } },
    theme,
    () => { closed = true; },
    async () => [],
  );

  const initial = overlay.render(100);
  assert.match(initial[0], /^╭/);
  assert.match(initial.join("\n"), /1\/32/);
  assert.ok(initial.length <= 17);
  for (let index = 0; index < 31; index++) overlay.handleInput("j");
  const last = overlay.render(100);
  assert.match(last.join("\n"), /32\/32/);
  assert.match(last.join("\n"), /Reader 32/);
  assert.ok(last.length <= 17);
  overlay.handleInput("\r");
  const focused = overlay.render(100).join("\n");
  assert.match(focused, /Read module 32/);
  assert.match(focused, /▶.*Reader 32.*openai\/sol · max/);

  const narrowLines = overlay.render(60);
  const narrow = narrowLines.join("\n");
  assert.equal(narrowLines.length, last.length);
  assert.match(narrow, /32\/32/);
  assert.match(narrow, /All transcript lines visible/);
  overlay.handleInput("k");
  assert.match(overlay.render(60).join("\n"), /32\/32/);
  overlay.handleInput("\x1b");
  assert.equal(closed, false);
  overlay.handleInput("k");
  assert.match(overlay.render(60).join("\n"), /31\/32/);
  for (const width of [10, 23]) {
    const lines = overlay.render(width);
    assert.ok(lines.every((line) => visibleWidth(line) <= width));
  }
  overlay.handleInput("\x1b");
  assert.equal(closed, true);
  assert.ok(renders >= 3);
  overlay.dispose();
  assert.equal(unsubscribed, true);
});
