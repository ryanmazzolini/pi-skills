import assert from "node:assert/strict";
import test from "node:test";
import delegateExtension, { currentDelegationRun, currentHeldRun, normalizeTasks, persistedInputGeneration, supportsReasoning, toolText, validateControl, validateOutputSchema } from "./index.ts";

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
      workspace: { kind: "temporary", state: "working" },
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, cost: 0 },
    }],
  };

  assert.doesNotMatch(toolText(view), /Next: review/);
  view.children[0].state = "completed";
  assert.match(toolText(view), /Next: review/);
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

test("registers a small execution tool and separate control tool", () => {
  const tools = [];
  const commands = [];
  const events = [];
  const pi = {
    registerTool: (tool) => tools.push(tool),
    registerCommand: (name, options) => commands.push({ name, options }),
    registerMessageRenderer() {},
    registerEntryRenderer() {},
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
  assert.deepEqual(Object.keys(delegate.parameters.properties.tasks.items.properties), ["task", "label"]);
  assert.equal(delegate.renderShell, "self");
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
  assert.deepEqual(tools[1].parameters.properties.action.enum, ["status", "wait", "steer", "reply", "cancel", "resume", "review", "apply", "discard", "cleanup"]);
  assert.deepEqual(Object.keys(tools[1].parameters.properties), ["action", "runId", "childId", "message", "revision", "timeoutMs"]);
  assert.match(tools[1].promptGuidelines.join("\n"), /Choose one result path/);
  assert.match(tools[1].promptGuidelines.join("\n"), /Reserve status for one-time inspection/);
  assert.deepEqual(commands.map((command) => command.name), ["agents"]);
  assert.equal(events.some((event) => event.name === "session_start"), true);
  assert.equal(events.some((event) => event.name === "session_shutdown"), true);
});
