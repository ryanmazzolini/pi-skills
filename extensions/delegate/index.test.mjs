import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import delegateExtension, { agentDeskTarget, currentDelegationRun, currentHeldRun, defaultDelegateTemporaryRoot, delegateLaunchText, existingDirectory, heldEntryData, heldEntryState, heldEntryTitle, normalizeTasks, persistedInputGeneration, supportsReasoning, toolText, validateControl, validateOutputSchema } from "./index.ts";

test("places new temporary delegate workspaces in a stable per-user OS temporary directory", async () => {
  const userKey = process.getuid?.()?.toString()
    ?? createHash("sha256").update(os.homedir()).digest("hex").slice(0, 16);
  const expected = path.join(fs.realpathSync(os.tmpdir()), `pi-delegate-${userKey}`);
  assert.equal(await defaultDelegateTemporaryRoot(), expected);
  assert.equal(await defaultDelegateTemporaryRoot(), expected);
});

test("separates users sharing the same OS temporary root", {
  skip: typeof process.getuid !== "function",
}, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delegate-shared-temp-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const uid = t.mock.method(process, "getuid", () => 1001);
  const first = await defaultDelegateTemporaryRoot(root);
  fs.mkdirSync(first, { mode: 0o700 });

  uid.mock.mockImplementation(() => 1002);
  const second = await defaultDelegateTemporaryRoot(root);
  fs.mkdirSync(second, { mode: 0o700 });

  assert.equal(path.dirname(first), fs.realpathSync(root));
  assert.equal(path.dirname(second), fs.realpathSync(root));
  assert.notEqual(first, second);
  assert.equal(fs.statSync(first).mode & 0o777, 0o700);
  assert.equal(fs.statSync(second).mode & 0o777, 0o700);
});

test("uses a stable home-directory hash when numeric user IDs are unavailable", {
  skip: typeof process.getuid !== "function",
}, async (t) => {
  t.mock.method(process, "getuid", () => undefined);
  const userKey = createHash("sha256").update(os.homedir()).digest("hex").slice(0, 16);
  assert.equal(await defaultDelegateTemporaryRoot(), path.join(fs.realpathSync(os.tmpdir()), `pi-delegate-${userKey}`));
});

test("canonicalizes a symlinked delegated working directory before resource and workspace resolution", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delegate-cwd-test-"));
  const source = path.join(root, "source");
  const alias = path.join(root, "alias");
  fs.mkdirSync(source);
  fs.symlinkSync(source, alias);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  assert.equal(await existingDirectory(root, "alias"), fs.realpathSync(source));
});

test("validates the one-or-batch task boundary", () => {
  assert.deepEqual(normalizeTasks({ task: " Read it " }), [{ task: "Read it", label: "Read it" }]);
  assert.deepEqual(normalizeTasks({ tasks: [{ task: "One", label: "First" }, { task: "Two" }] }), [
    { task: "One", label: "First" },
    { task: "Two", label: "Two" },
  ]);
  assert.throws(() => normalizeTasks({}), /exactly one/);
  assert.throws(() => normalizeTasks({ task: "one", tasks: [{ task: "two" }] }), /exactly one/);
  assert.throws(() => normalizeTasks({ tasks: [{ task: "one" }], label: "invalid" }), /only valid with task/);
});

test("validates reasoning support and restores persisted user-input generation", () => {
  const reasoningModel = { reasoning: true, thinkingLevelMap: { max: 100, xhigh: null } };
  assert.equal(supportsReasoning(reasoningModel, "high"), true);
  assert.equal(supportsReasoning(reasoningModel, "max"), true);
  assert.equal(supportsReasoning(reasoningModel, "xhigh"), false);
  assert.equal(supportsReasoning({ reasoning: false }, "low"), false);
  assert.equal(supportsReasoning({ reasoning: false }, "off"), true);

  const generation = persistedInputGeneration({
    sessionManager: {
      getBranch: () => [
        { type: "message", message: { role: "user" } },
        { type: "message", message: { role: "assistant" } },
        { type: "custom_message", content: "delegation" },
        { type: "message", message: { role: "user" } },
      ],
    },
  });
  assert.equal(generation, 2);
});

test("rejects malformed or unsupported structured-output schemas before launch", () => {
  assert.doesNotThrow(() => validateOutputSchema({
    type: "object",
    properties: {
      answer: { type: "string", minLength: 1 },
      details: { type: "array", items: { type: "integer", minimum: 0 } },
    },
    required: ["answer"],
    additionalProperties: false,
  }));
  assert.throws(() => validateOutputSchema({ type: "object", properties: "invalid" }), /properties must be an object/);
  assert.throws(() => validateOutputSchema({ type: "object", properties: {}, required: "invalid" }), /required must be an array/);
  assert.throws(() => validateOutputSchema({ type: "object", properties: { answer: { type: "mystery" } } }), /supported JSON Schema type/);
  assert.throws(() => validateOutputSchema({ type: "object", $ref: "#/$defs/result" }), /unsupported keyword/);
  assert.throws(() => validateOutputSchema({ type: "object", properties: { value: { type: "string", pattern: "[" } } }), /valid regular expression/);
  assert.throws(() => validateOutputSchema({ type: "object", properties: { value: { type: "number", multipleOf: 0 } } }), /greater than zero/);
  assert.throws(() => validateOutputSchema({ type: "object", properties: { value: { type: "string", format: "email" } } }), /unsupported keyword: format/);
});

test("requires exact reviewed revisions only for apply and discard", () => {
  assert.doesNotThrow(() => validateControl({ action: "review" }));
  assert.doesNotThrow(() => validateControl({ action: "cleanup" }));
  assert.doesNotThrow(() => validateControl({ action: "apply", revision: "tree-123" }));
  assert.doesNotThrow(() => validateControl({ action: "discard", revision: "tree-123" }));
  assert.throws(() => validateControl({ action: "apply" }), /requires revision/);
  assert.throws(() => validateControl({ action: "review", revision: "tree-123" }), /revision is not valid/);
  assert.throws(() => validateControl({ action: "status", message: "extra" }), /message is not valid/);
});

test("keeps launch identifiers in an explicit internal orchestration block", () => {
  const text = delegateLaunchText({
    runId: "run-secret",
    recordRef: "/tmp/run.json",
    children: [{ childId: "child-secret", label: "README audit", state: "starting" }],
  });
  assert.match(text, /^Started agent README audit\./);
  assert.match(text, /<internal_delegate_handle>{"runId":"run-secret"}<\/internal_delegate_handle>/);
  assert.match(text, /Never repeat the internal handle/);
  assert.doesNotMatch(text, /Run ID:|\. Run:/);
});

test("recommends temporary workspace review only after the child is finalized", () => {
  const view = {
    runId: "run-1",
    status: "running",
    delivery: "pending",
    truncated: false,
    recordRef: "/tmp/run.json",
    children: [{
      childId: "child-1",
      label: "Writer",
      state: "running",
      lastActivity: { kind: "tool", summary: "Editing", observedAt: new Date(0).toISOString() },
      workspace: { kind: "temporary", backing: "git", state: "working", pathRef: "/tmp/worktree" },
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, cost: 0 },
    }],
  };

  assert.doesNotMatch(toolText(view), /Next: review/);
  view.children[0].state = "completed";
  assert.match(toolText(view), /Next: review/);

  view.children[0].workspace = { kind: "temporary", backing: "scratch", state: "working", pathRef: "/tmp/scratch" };
  const scratch = toolText(view);
  assert.match(scratch, /Scratch: working/);
  assert.match(scratch, /Path: \/tmp\/scratch/);
  assert.match(scratch, /preserve useful artifacts, then clean/);
  assert.doesNotMatch(scratch, /Next: review/);
});

test("selects the newest manageable run for the no-argument agents command", () => {
  const base = {
    schemaVersion: 3,
    parent: { sessionId: "parent", leafId: null, inputGeneration: 0 },
    recordRef: "/tmp/run.json",
    updatedAt: new Date(0).toISOString(),
    children: [],
  };
  const delivered = { ...base, id: "delivered", createdAt: "2026-01-03T00:00:00.000Z", delivery: { state: "delivered", deliveredAt: "2026-01-03T00:00:01.000Z" } };
  const active = { ...base, id: "active", createdAt: "2026-01-02T00:00:00.000Z", delivery: { state: "pending" }, children: [{ state: "running" }] };
  const held = { ...base, id: "held", createdAt: "2026-01-01T00:00:00.000Z", delivery: { state: "held", reason: "user_intervened" } };

  assert.equal(currentDelegationRun([held, delivered, active]).id, "active");
  assert.equal(currentDelegationRun([delivered]).id, "delivered");
  assert.equal(currentDelegationRun([]), undefined);
  assert.equal(currentHeldRun([held, delivered, active]).id, "held");
  assert.equal(currentHeldRun([delivered]), undefined);
});

test("names agents in durable held-update messages", () => {
  const run = {
    id: "run-1",
    recordRef: "/tmp/run.json",
    children: [
      { id: "child-1", label: "README audit", state: "completed" },
      { id: "child-2", label: "Test review", state: "failed" },
    ],
  };
  const result = heldEntryData(run, "user_intervened", { kind: "result", eventId: "run-1:result" });
  assert.equal(result.agentCount, 2);
  assert.equal(result.status, "partial");
  assert.equal(result.outcome, "failed");
  assert.equal(heldEntryTitle(result), "2-agent run finished with mixed results: README audit, Test review");
  assert.equal(heldEntryState(result), "failed");

  const attention = heldEntryData({
    ...run,
    children: [run.children[0], { ...run.children[1], state: "needs_attention" }],
  }, "user_intervened", { kind: "attention", eventId: "attention-1", childId: "child-2" });
  assert.deepEqual(attention.agents, [
    { childId: "child-2", label: "Test review", state: "needs_attention" },
  ]);
  assert.equal(heldEntryTitle(attention), "Test review needs attention");
  assert.equal(heldEntryState(attention), "needs_attention");

  const completed = heldEntryData({
    ...run,
    children: [run.children[0]],
  }, "user_intervened", { kind: "result", eventId: "completed:result" });
  assert.equal(heldEntryTitle(completed), "README audit finished");
  assert.equal(heldEntryState(completed), "completed");
  assert.equal(heldEntryTitle({ ...completed, agentCount: undefined, agents: undefined, outcome: undefined }), "agent result ready");
  assert.equal(heldEntryState({ ...completed, agents: undefined, outcome: undefined }), undefined);
});

test("bounds labels and retained agents in durable held batches", () => {
  const children = [
    `One\nforged ${"x".repeat(100)}`,
    "Two",
    "Three",
    "Four",
  ].map((label, index) => ({ id: `child-${index}`, label, state: "completed" }));
  const entry = heldEntryData({
    id: "run-1",
    recordRef: "/tmp/run.json",
    children,
  }, "user_intervened", { kind: "result", eventId: "run-1:result" });

  assert.equal(entry.agentCount, 4);
  assert.equal(entry.agents.length, 3);
  assert.equal(entry.agents[0].label.includes("\n"), false);
  assert.ok(entry.agents[0].label.length <= 56);
  assert.match(heldEntryTitle(entry), /^4 agents finished: One forged x+…, Two, Three \+ 1 more$/);
});

test("builds bare, run-targeted, and child-targeted Agent Desk entry points", () => {
  assert.deepEqual(agentDeskTarget(), {});
  assert.deepEqual(agentDeskTarget("run-1"), { runId: "run-1" });
  assert.deepEqual(agentDeskTarget("missing-run", "child-2"), { runId: "missing-run", childId: "child-2" });
});

test("registers a small execution tool and separate control tool", async () => {
  const tools = [];
  const commands = [];
  const entryRenderers = [];
  const events = [];
  const pi = {
    registerTool: (tool) => tools.push(tool),
    registerCommand: (name, options) => commands.push({ name, options }),
    registerMessageRenderer() {},
    registerEntryRenderer: (name, renderer) => entryRenderers.push({ name, renderer }),
    on: (name, handler) => events.push({ name, handler }),
  };

  delegateExtension(pi);

  assert.deepEqual(tools.map((tool) => tool.name), ["delegate", "delegate_control"]);
  const delegate = tools[0];
  assert.equal(delegate.parameters.required, undefined);
  assert.deepEqual(Object.keys(delegate.parameters.properties), [
    "task", "label", "tasks", "cwd", "workspace", "context", "skills", "tools", "model", "reasoning", "outputSchema",
  ]);
  assert.deepEqual(delegate.parameters.properties.workspace.enum, ["existing", "temporary"]);
  assert.match(delegate.parameters.properties.workspace.description, /Git worktree.*scratch directory/);
  assert.match(delegate.description, /Git worktree.*scratch directory/);
  assert.match(delegate.promptGuidelines.join("\n"), /scratch research.*explicit cleanup/);
  assert.deepEqual(Object.keys(delegate.parameters.properties.tasks.items.properties), ["task", "label"]);
  assert.equal(delegate.renderShell, "self");
  assert.match(delegate.promptGuidelines.join("\n"), /Never repeat them in user-facing prose/);
  assert.deepEqual(delegate.prepareArguments({ task: "Inspect it", tools: ["read"] }), { task: "Inspect it", tools: ["read"] });
  assert.throws(
    () => delegate.prepareArguments({ task: "Inspect it", acceptance: "attested" }),
    /Unsupported delegate option: acceptance/,
  );
  assert.throws(
    () => delegate.prepareArguments({ task: "Inspect it", acceptance: "attested", timeoutMs: 1000 }),
    /Unsupported delegate options: acceptance, timeoutMs/,
  );
  const theme = { fg: (_color, text) => text, bold: (text) => text };
  const renderedCall = delegate.renderCall({ tasks: Array.from({ length: 4 }, (_, index) => ({ task: `task ${index}` })) }, theme).render(100).join("\n");
  assert.match(renderedCall, /agents 4 tasks/);
  assert.doesNotMatch(renderedCall, /delegate|children/);
  const control = tools[1];
  assert.deepEqual(control.parameters.properties.action.enum, ["status", "wait", "steer", "reply", "cancel", "resume", "review", "apply", "discard", "cleanup"]);
  assert.deepEqual(Object.keys(control.parameters.properties), ["action", "runId", "childId", "message", "revision", "timeoutMs"]);
  const waitArgs = { action: "wait", runId: "run-secret" };
  assert.deepEqual(control.renderCall(waitArgs, theme, { expanded: false }).render(100), []);
  assert.deepEqual(
    control.renderResult({ content: [{ type: "text", text: "done" }] }, { expanded: false }, theme, { args: waitArgs }).render(100),
    [],
  );
  assert.match(control.renderCall(waitArgs, theme, { expanded: true }).render(100).join("\n"), /run-secret/);
  assert.doesNotMatch(
    control.renderCall({ action: "status", runId: "run-secret" }, theme, { expanded: false }).render(100).join("\n"),
    /run-secret/,
  );
  assert.match(control.promptGuidelines.join("\n"), /Choose one result path/);
  assert.match(control.promptGuidelines.join("\n"), /Reserve status for one-time inspection/);
  assert.match(control.promptGuidelines.join("\n"), /Never repeat them in user-facing prose/);
  const heldRenderer = entryRenderers.find((renderer) => renderer.name === "delegate-held");
  assert.ok(heldRenderer);
  const heldTheme = {
    fg: (color, text) => `<${color}>${text}</${color}>`,
    bold: (text) => `<bold>${text}</bold>`,
  };
  const heldText = heldRenderer.renderer({
    data: {
      runId: "run-1",
      reason: "user_intervened",
      recordRef: "/tmp/run.json",
      kind: "result",
      agents: [{ childId: "child-1", label: "README audit", state: "completed" }],
    },
  }, { expanded: false }, heldTheme).render(100).join("\n");
  assert.match(heldText, /<success>✓<\/success> <bold>README audit finished<\/bold> <dim>· open <\/dim><accent>\/agents<\/accent>/);
  assert.doesNotMatch(heldText, /■|agent result ready|conversation moved on|agents use/);
  assert.deepEqual(commands.map((command) => command.name), ["agents"]);
  assert.equal(events.some((event) => event.name === "session_start"), true);
  const shutdown = events.find((event) => event.name === "session_shutdown");
  assert.ok(shutdown);
  const widgets = [];
  await shutdown.handler({}, {
    mode: "tui",
    ui: { setWidget: (...args) => widgets.push(args) },
  });
  assert.deepEqual(widgets, [["delegate-agent-status", undefined]]);
});
