import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { createDelegateUi, describeLatestActivity, readChildHistory, RunOverlayComponent } from "./ui.ts";

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

test("reuses the live component without registering another invalidator", () => {
  let listener;
  const activeRun = run();
  const runtime = {
    subscribe(callback) { listener = callback; return () => {}; },
    get: () => structuredClone(activeRun),
  };
  const ui = createDelegateUi(runtime);
  let invalidations = 0;
  const invalidate = () => { invalidations++; };

  const first = ui.renderRun("run-1", false, theme, invalidate);
  const second = ui.renderRun("run-1", true, theme, invalidate, first);
  assert.equal(second, first);

  listener(activeRun);
  assert.equal(invalidations, 1);
  ui.dispose();
});

test("invalidates only the changed run, retains paused rows, and detaches settled rows", async () => {
  let listener;
  const firstRun = run();
  const secondRun = structuredClone(firstRun);
  secondRun.id = "run-2";
  secondRun.children[0].id = "child-2";
  const runs = new Map([[firstRun.id, firstRun], [secondRun.id, secondRun]]);
  const runtime = {
    subscribe(callback) { listener = callback; return () => {}; },
    get: (runId) => structuredClone(runs.get(runId)),
  };
  const ui = createDelegateUi(runtime);
  let firstInvalidations = 0;
  let secondInvalidations = 0;
  ui.renderRun("run-1", false, theme, () => { firstInvalidations++; });
  ui.renderRun("run-2", false, theme, () => { secondInvalidations++; });

  listener(firstRun);
  assert.deepEqual([firstInvalidations, secondInvalidations], [1, 0]);

  const attentionRun = structuredClone(firstRun);
  attentionRun.children[0].state = "needs_attention";
  runs.set(attentionRun.id, attentionRun);
  listener(attentionRun);
  await new Promise((resolve) => setTimeout(resolve, 250));
  const resumedRun = structuredClone(firstRun);
  runs.set(resumedRun.id, resumedRun);
  const secondBeforeResume = secondInvalidations;
  listener(resumedRun);
  assert.equal(firstInvalidations, 3);
  assert.equal(secondInvalidations, secondBeforeResume);

  const completedRun = structuredClone(firstRun);
  completedRun.children[0].state = "completed";
  runs.set(completedRun.id, completedRun);
  listener(completedRun);
  listener(secondRun);
  assert.equal(firstInvalidations, 4);
  assert.equal(secondInvalidations, secondBeforeResume + 1);
  ui.dispose();
});

test("quiet active work says it is still running and reports activity age", () => {
  const activeRun = run("running", new Date(0).toISOString());
  assert.equal(
    describeLatestActivity(activeRun, 15_000, 10_000),
    "Still running · last activity 15s ago (Thinking)",
  );
  assert.equal(
    describeLatestActivity(activeRun, 5_000, 10_000),
    "Thinking · 5s ago",
  );
});

test("collapsed cards make the no-argument agents view discoverable", () => {
  const activeRun = run("running", new Date().toISOString());
  const runtime = {
    subscribe() { return () => {}; },
    get: () => structuredClone(activeRun),
  };
  const ui = createDelegateUi(runtime);
  assert.match(ui.renderRun("run-1", false, theme, () => {}).render(100).join("\n"), /Open: \/agents/);
  ui.dispose();
});

test("temporary workspace state and exact review controls remain visible", async () => {
  const completedRun = run("completed", new Date().toISOString());
  completedRun.delivery = { state: "delivered", deliveredAt: new Date().toISOString() };
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
    integration: { state: "working" },
  };
  let listener;
  const runtime = {
    subscribe(callback) { listener = callback; return () => {}; },
    get: () => structuredClone(completedRun),
  };
  const ui = createDelegateUi(runtime);
  const component = ui.renderRun("run-1", false, theme, () => {});
  assert.match(component.render(100).join("\n"), /Workspace: review required/);

  completedRun.children[0].workspace.integration = {
    state: "review_pending",
    review: {
      revision: "tree-reviewed",
      baseTree: "tree-base",
      summary: { filesChanged: 1, additions: 2, deletions: 0, stat: "1 file changed, 2 insertions(+)" },
      patchPath: "/tmp/review.patch",
      manifestPath: "/tmp/review.json",
      reviewedAt: new Date().toISOString(),
    },
  };
  listener(completedRun);
  assert.match(component.render(140).join("\n"), /Workspace: review pending/);
  const expandedReview = ui.renderRun("run-1", true, theme, () => {}, component).render(180).join("\n");
  assert.match(expandedReview, /\/agents apply run-1 tree-reviewed child-1/);
  assert.match(expandedReview, /Manifest: \/tmp\/review\.json/);

  completedRun.children[0].workspace.integration = {
    state: "no_changes",
    reviewedAt: new Date().toISOString(),
    cleanupError: "worktree is busy",
  };
  listener(completedRun);
  const cleanup = component.render(180).join("\n");
  assert.match(cleanup, /Cleanup failed: worktree is busy/);
  assert.match(cleanup, /\/agents cleanup run-1 child-1/);
  ui.dispose();
});

test("collapsed multi-child cards cap their transcript footprint", () => {
  const activeRun = run("running", new Date().toISOString(), 32);
  const runtime = {
    subscribe() { return () => {}; },
    get: () => structuredClone(activeRun),
  };
  const ui = createDelegateUi(runtime);
  const component = ui.renderRun("run-1", false, theme, () => {});
  const lines = component.render(100);
  assert.ok(lines.length <= 8);
  assert.match(lines.join("\n"), /32 agents/);
  assert.doesNotMatch(lines.join("\n"), /delegated children/);
  assert.match(lines.join("\n"), /26 more/);
  ui.dispose();
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
  assert.match(focused, /▶.*Reader 32.*sol · max/);

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
