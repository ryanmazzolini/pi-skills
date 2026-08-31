import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  DelegateRuntime,
  WorkspaceConflictError,
  deriveRunStatus,
  projectRun,
  runNeedsControl,
} from "./runtime.ts";
import { GitWorkspaceManager } from "./workspace.ts";

const tick = () => new Promise((resolve) => setImmediate(resolve));
const settle = async () => { await tick(); await tick(); await tick(); };

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function memoryRepository(initial = [], storageRoot = "/tmp/delegate") {
  const records = new Map(initial.map((run) => [run.id, structuredClone(run)]));
  return {
    records,
    paths(parentSessionId, runId, childId) {
      const root = `${storageRoot}/${parentSessionId}/${runId}`;
      return {
        runFile: `${root}/run.json`,
        childSessionDir: `${root}/children/${childId}`,
        worktreeDir: `${root}/worktrees/${childId}`,
        patchFile: `${root}/patches/${childId}.patch`,
        manifestFile: `${root}/patches/${childId}.manifest.json`,
      };
    },
    async save(run) {
      records.set(run.id, structuredClone(run));
    },
    async list(parentSessionId) {
      return [...records.values()]
        .filter((run) => run.parent.sessionId === parentSessionId)
        .map((run) => structuredClone(run));
    },
  };
}

function fakeChildren() {
  const launches = [];
  const makeController = (input, sink, resumed, continuation) => {
    const done = deferred();
    const launch = {
      input,
      sink,
      resumed,
      continuation,
      done,
      continuations: [],
      steers: [],
      cancelled: false,
      disposed: false,
    };
    const controller = {
      sessionId: input.child.sessionId ?? `session-${input.child.id}`,
      sessionFile: input.child.sessionFile ?? `${input.child.sessionDir}/session.jsonl`,
      completion: done.promise,
      continue(message) {
        const next = deferred();
        launch.continuations.push({ message, done: next });
        return next.promise;
      },
      async steer(message) { launch.steers.push(message); },
      async cancel() { launch.cancelled = true; },
      dispose() { launch.disposed = true; },
    };
    launch.controller = controller;
    launches.push(launch);
    return controller;
  };
  return {
    launches,
    adapter: {
      async start(input, sink) { return makeController(input, sink, false); },
      async resume(input, continuation, sink) { return makeController(input, sink, true, continuation); },
    },
  };
}

function startInput(overrides = {}) {
  return {
    tasks: [{ task: "Inspect the cache path", label: "Cache path" }],
    cwd: "/tmp/project",
    parent: { sessionId: "parent-1", leafId: "leaf-1", inputGeneration: 2 },
    parentSessionFile: "/tmp/parent.jsonl",
    model: { provider: "openai", id: "sol" },
    modelRegistry: {},
    resolved: {
      model: { provider: "openai", id: "sol" },
      reasoning: "max",
      context: "fresh",
      skills: [],
      tools: ["read", "bash", "edit", "write"],
      output: "text",
    },
    ...overrides,
  };
}

function runtimeFixture(options = {}) {
  const repository = options.repository ?? memoryRepository();
  const children = options.children ?? fakeChildren();
  const deliveries = [];
  const attentions = [];
  let id = 0;
  const runtime = new DelegateRuntime({
    repository,
    children: children.adapter,
    delivery: {
      async deliver(run, view) {
        deliveries.push({ run, view });
        return options.deliver?.(run, view) ?? "delivered";
      },
      async deliverAttention(run, view, childId) {
        attentions.push({ run, view, childId });
        return options.deliverAttention?.(run, view, childId) ?? "delivered";
      },
      shutdown() {},
    },
    workspaces: options.workspaces,
    maxActiveChildren: options.maxActiveChildren,
    createId: (kind) => `${kind}-${++id}`,
    now: options.now ?? (() => {
      let time = 0;
      return () => new Date(Date.UTC(2026, 0, 1, 0, 0, time++));
    })(),
  });
  return { runtime, repository, children, deliveries, attentions };
}

const success = (value) => ({
  kind: "success",
  result: { kind: "text", value },
  usage: { input: 10, output: 4, cacheRead: 2, cacheWrite: 0, total: 16, cost: 0.01 },
});

const failure = (message = "provider error") => ({
  kind: "failure",
  message,
  usage: { input: 1, output: 0, cacheRead: 0, cacheWrite: 0, total: 1, cost: 0 },
});

test("starts a child without waiting and delivers its final answer once", async () => {
  const { runtime, children, deliveries } = runtimeFixture();

  const handle = await runtime.start(startInput());
  assert.equal(handle.runId, "run-1");
  assert.equal(handle.children[0].childId, "child-2");

  await settle();
  assert.equal(children.launches.length, 1);
  assert.equal(runtime.get(handle.runId).children[0].state, "running");

  children.launches[0].sink.activity({ kind: "tool", summary: "read: src/cache.ts" });
  await settle();
  assert.equal(runtime.get(handle.runId).children[0].latestActivity.summary, "read: src/cache.ts");

  children.launches[0].done.resolve(success("The cache key is stale."));
  await settle();

  const run = runtime.get(handle.runId);
  assert.equal(run.children[0].state, "completed");
  assert.equal(run.children[0].result.value, "The cache key is stale.");
  assert.equal(run.delivery.state, "delivered");
  assert.equal(deliveries.length, 1);
});

test("coalesces duplicate streaming activity while preserving a liveness heartbeat", async () => {
  let now = Date.UTC(2026, 0, 1);
  const repository = memoryRepository();
  let saves = 0;
  const save = repository.save.bind(repository);
  repository.save = async (run) => {
    saves++;
    await save(run);
  };
  const { runtime, children } = runtimeFixture({ repository, now: () => new Date(now) });
  const handle = await runtime.start(startInput());
  await settle();
  const baselineSaves = saves;
  let emissions = 0;
  const unsubscribe = runtime.subscribe(() => { emissions++; });

  for (let index = 0; index < 100; index++) {
    children.launches[0].sink.activity({ kind: "thinking", summary: "Thinking" });
  }
  await settle();
  assert.equal(saves, baselineSaves + 1);
  assert.equal(emissions, 1);

  now += 4_999;
  children.launches[0].sink.activity({ kind: "thinking", summary: "Thinking" });
  await settle();
  assert.equal(saves, baselineSaves + 1);
  assert.equal(emissions, 1);

  now += 1;
  children.launches[0].sink.activity({ kind: "thinking", summary: "Thinking" });
  await settle();
  assert.equal(saves, baselineSaves + 2);
  assert.equal(emissions, 2);
  assert.equal(runtime.get(handle.runId).children[0].latestActivity.observedAt, new Date(now).toISOString());
  unsubscribe();
});

test("an eleven-child batch runs ten children and starts the eleventh in FIFO order", async () => {
  const { runtime, children } = runtimeFixture();
  const labels = Array.from({ length: 11 }, (_, index) => `task-${index + 1}`);
  const handle = await runtime.start(startInput({
    tasks: labels.map((task) => ({ task, label: task })),
  }));
  await settle();

  assert.deepEqual(children.launches.map((launch) => launch.input.child.label), labels.slice(0, 10));
  assert.deepEqual(runtime.get(handle.runId).children.map((child) => child.state), [
    ...Array.from({ length: 10 }, () => "running"),
    "queued",
  ]);

  children.launches[1].done.resolve(success("task done"));
  await settle();
  assert.deepEqual(children.launches.map((launch) => launch.input.child.label), labels);
  assert.equal(runtime.get(handle.runId).children[10].state, "running");
});

test("the inference queue is FIFO across separate runs", async () => {
  const { runtime, children } = runtimeFixture({ maxActiveChildren: 1 });
  const first = await runtime.start(startInput({ tasks: [
    { task: "first-a", label: "first-a" },
    { task: "first-b", label: "first-b" },
  ] }));
  const second = await runtime.start(startInput({ tasks: [{ task: "second", label: "second" }] }));
  await settle();
  assert.deepEqual(children.launches.map((launch) => launch.input.child.label), ["first-a"]);

  children.launches[0].done.resolve(success("done"));
  await settle();
  assert.deepEqual(children.launches.map((launch) => launch.input.child.label), ["first-a", "first-b"]);
  children.launches[1].done.resolve(success("done"));
  await settle();
  assert.deepEqual(children.launches.map((launch) => launch.input.child.label), ["first-a", "first-b", "second"]);
  assert.equal(runtime.get(first.runId).children[1].state, "completed");
  assert.equal(runtime.get(second.runId).children[0].state, "running");
});

test("attention releases a slot and reply resumes the same child through FIFO", async () => {
  const { runtime, children, deliveries, attentions } = runtimeFixture({ maxActiveChildren: 2 });
  const handle = await runtime.start(startInput({ tasks: [
    { task: "reader", label: "reader" },
    { task: "reviewer", label: "reviewer" },
    { task: "queued", label: "queued" },
  ] }));
  await settle();
  const reader = children.launches[0];
  const reviewer = children.launches[1];

  reader.done.resolve(success("useful evidence"));
  reviewer.done.resolve({
    kind: "attention",
    request: { kind: "clarification", question: "Which API version?", context: "Both v1 and v2 exist." },
    usage: { input: 3, output: 2, cacheRead: 0, cacheWrite: 0, total: 5, cost: 0 },
  });
  await settle();

  let run = runtime.get(handle.runId);
  assert.equal(deriveRunStatus(run), "needs_attention");
  assert.equal(run.children[0].result.value, "useful evidence");
  assert.equal(run.children[1].attention.question, "Which API version?");
  assert.equal(attentions.length, 1);
  assert.equal(deliveries.length, 0);
  assert.equal(children.launches[2].input.child.label, "queued");

  await runtime.reply(
    handle.runId,
    run.children[1].id,
    "Use v2",
    { model: {}, modelRegistry: {} },
    { inputGeneration: 9, leafId: "reply-leaf" },
  );
  await settle();
  assert.equal(reviewer.continuations.length, 1);
  assert.equal(reviewer.continuations[0].message, "Use v2");
  assert.equal(runtime.get(handle.runId).children[1].state, "running");

  reviewer.continuations[0].done.resolve(failure("v2 unavailable"));
  children.launches[2].done.resolve(success("queued done"));
  await settle();
  run = runtime.get(handle.runId);
  assert.equal(deriveRunStatus(run), "partial");
  assert.equal(run.children[0].result.value, "useful evidence");
  assert.equal(run.children[1].state, "failed");
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].run.parent.inputGeneration, 9);
  assert.equal(deliveries[0].run.parent.leafId, "reply-leaf");
});

test("steer targets one running child without creating a new session", async () => {
  const { runtime, children } = runtimeFixture();
  const handle = await runtime.start(startInput({ tasks: [
    { task: "one", label: "one" },
    { task: "two", label: "two" },
  ] }));
  await settle();
  const childId = runtime.get(handle.runId).children[1].id;

  await runtime.steer(handle.runId, childId, "Focus on the tests");
  assert.deepEqual(children.launches[0].steers, []);
  assert.deepEqual(children.launches[1].steers, ["Focus on the tests"]);
  await assert.rejects(() => runtime.steer(handle.runId, undefined, "ambiguous"), /requires childId/);
});

test("rejected adaptive controls do not mutate the causal origin", async () => {
  const { runtime } = runtimeFixture({ maxActiveChildren: 1 });
  const handle = await runtime.start(startInput({ tasks: [
    { task: "running", label: "running" },
    { task: "queued", label: "queued" },
  ] }));
  await settle();
  const before = runtime.get(handle.runId);
  const queuedId = before.children[1].id;
  const origin = { inputGeneration: 99, leafId: "unrelated" };

  await assert.rejects(() => runtime.steer(handle.runId, queuedId, "wrong state", origin), /requires running/);
  await assert.rejects(() => runtime.reply(handle.runId, queuedId, "wrong state", { model: {}, modelRegistry: {} }, origin), /requires needs_attention/);
  await assert.rejects(() => runtime.resume(handle.runId, queuedId, { model: {}, modelRegistry: {} }, origin), /only interrupted/);
  assert.deepEqual(runtime.get(handle.runId), before);
});

test("explicitly uses a held result on the current parent branch", async () => {
  let outcome = "held:user_intervened";
  const { runtime, children, deliveries } = runtimeFixture({ deliver: () => outcome });
  const handle = await runtime.start(startInput());
  await settle();
  children.launches[0].done.resolve(success("Recovered result"));
  await settle();
  assert.equal(runtime.get(handle.runId).delivery.state, "held");

  outcome = "delivered";
  const recovered = await runtime.useHeld(handle.runId, { inputGeneration: 7, leafId: "current-leaf" });
  assert.equal(recovered.delivery.state, "delivered");
  assert.equal(recovered.parent.inputGeneration, 7);
  assert.equal(recovered.parent.leafId, "current-leaf");
  assert.equal(deliveries.length, 2);
  assert.equal(deliveries[1].view.children[0].result.value, "Recovered result");
  await assert.rejects(
    () => runtime.useHeld(handle.runId, { inputGeneration: 8, leafId: "later-leaf" }),
    /no held update/,
  );
});

test("explicitly uses a held attention request on the current parent branch", async () => {
  let outcome = "held:user_intervened";
  const { runtime, children, attentions } = runtimeFixture({ deliverAttention: () => outcome });
  const handle = await runtime.start(startInput());
  await settle();
  children.launches[0].done.resolve({
    kind: "attention",
    request: { kind: "clarification", question: "Which branch?" },
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, total: 2, cost: 0 },
  });
  await settle();
  assert.equal(runtime.get(handle.runId).children[0].attention.notification.state, "held");

  outcome = "delivered";
  const recovered = await runtime.useHeld(handle.runId, { inputGeneration: 7, leafId: "current-leaf" });
  assert.equal(recovered.children[0].attention.notification.state, "delivered");
  assert.equal(attentions.length, 2);
});

test("accepting a held attention reply removes the obsolete recoverable request while queued", async () => {
  const { runtime, children, attentions } = runtimeFixture({
    maxActiveChildren: 1,
    deliverAttention: () => "held:user_intervened",
  });
  const handle = await runtime.start(startInput({ tasks: [
    { task: "ask", label: "asker" },
    { task: "occupy", label: "occupier" },
  ] }));
  await settle();
  children.launches[0].done.resolve({
    kind: "attention",
    request: { kind: "clarification", question: "Which branch?" },
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, total: 2, cost: 0 },
  });
  await settle();
  const askerId = runtime.get(handle.runId).children[0].id;
  assert.equal(attentions.length, 1);
  assert.equal(children.launches[1].input.child.label, "occupier");

  await runtime.reply(
    handle.runId,
    askerId,
    "Use main",
    { model: {}, modelRegistry: {} },
    { inputGeneration: 7, leafId: "current-leaf" },
  );
  const queued = runtime.get(handle.runId).children[0];
  assert.equal(queued.state, "queued");
  assert.equal(queued.attention, undefined);
  await assert.rejects(
    () => runtime.useHeld(handle.runId, { inputGeneration: 8, leafId: "later-leaf" }),
    /no held update/,
  );
  assert.equal(attentions.length, 1);
});

test("cancellation holds its inference slot until the child abort settles", async () => {
  const { runtime, children } = runtimeFixture({ maxActiveChildren: 3 });
  const handle = await runtime.start(startInput({
    tasks: ["one", "two", "three", "four", "five"].map((task) => ({ task, label: task })),
  }));
  await settle();
  assert.equal(children.launches.length, 3);
  const cancelGate = deferred();
  children.launches[0].controller.cancel = () => cancelGate.promise;
  const cancelling = runtime.cancel(handle.runId, runtime.get(handle.runId).children[0].id);
  await tick();

  children.launches[1].done.resolve(success("two done"));
  await settle();
  assert.deepEqual(children.launches.map((launch) => launch.input.child.label), ["one", "two", "three", "four"]);

  cancelGate.resolve();
  await cancelling;
  await settle();
  assert.deepEqual(children.launches.map((launch) => launch.input.child.label), ["one", "two", "three", "four", "five"]);
});

test("cancelling a running child preserves cancellation as terminal", async () => {
  const { runtime, children, deliveries } = runtimeFixture();
  const handle = await runtime.start(startInput());
  await settle();

  await runtime.cancel(handle.runId);
  assert.equal(children.launches[0].cancelled, true);
  assert.equal(runtime.get(handle.runId).children[0].state, "cancelled");

  children.launches[0].done.resolve(failure("aborted"));
  await settle();
  assert.equal(runtime.get(handle.runId).children[0].state, "cancelled");
  assert.equal(deliveries.length, 1);
});

test("cancelling a starting child aborts setup before a running handle exists", async () => {
  const repository = memoryRepository();
  const setupGate = deferred();
  let startSignal;
  const deliveries = [];
  let id = 0;
  const runtime = new DelegateRuntime({
    repository,
    children: {
      async start(input) {
        startSignal = input.signal;
        await setupGate.promise;
        if (input.signal.aborted) throw new Error("Child start cancelled");
        assert.fail("cancelled setup must not start inference");
      },
      async resume() { assert.fail("must not resume"); },
    },
    delivery: {
      async deliver(run, view) { deliveries.push({ run, view }); return "delivered"; },
      async deliverAttention() { return "delivered"; },
      shutdown() {},
    },
    createId: (kind) => `${kind}-${++id}`,
  });

  const handle = await runtime.start(startInput());
  await tick();
  assert.ok(startSignal);
  await runtime.cancel(handle.runId);
  assert.equal(startSignal.aborted, true);
  assert.equal(runtime.get(handle.runId).children[0].state, "cancelled");
  setupGate.resolve();
  await settle();
  assert.equal(runtime.get(handle.runId).children[0].state, "cancelled");
  assert.equal(deliveries.length, 1);
});

test("wait returns on timeout or attention without cancelling work", async () => {
  const { runtime, children } = runtimeFixture();
  const handle = await runtime.start(startInput());
  await settle();

  const timed = await runtime.wait(handle.runId, undefined, undefined, 5);
  assert.equal(timed.children[0].state, "running");
  assert.equal(children.launches[0].cancelled, false);

  const waiting = runtime.wait(handle.runId);
  children.launches[0].done.resolve({
    kind: "attention",
    request: { kind: "decision", question: "Continue?" },
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, total: 2, cost: 0 },
  });
  const attentionRun = await waiting;
  assert.equal(attentionRun.children[0].state, "needs_attention");
});

test("interrupt and resume preserve child identity and ignore stale completion", async () => {
  const { runtime, children } = runtimeFixture();
  const handle = await runtime.start(startInput());
  await settle();
  const before = runtime.get(handle.runId).children[0];

  await runtime.interruptAll();
  assert.equal(children.launches[0].cancelled, true);
  assert.equal(runtime.get(handle.runId).children[0].state, "interrupted");

  await runtime.resume(handle.runId, before.id, { model: {}, modelRegistry: {} });
  await settle();
  assert.equal(children.launches.length, 2);
  assert.equal(children.launches[1].resumed, true);
  assert.equal(children.launches[1].input.child.id, before.id);
  assert.equal(children.launches[1].input.child.sessionFile, before.sessionFile);

  children.launches[0].done.resolve(success("stale"));
  await settle();
  assert.equal(runtime.get(handle.runId).children[0].state, "running");
  children.launches[1].done.resolve(success("resumed"));
  await settle();
  assert.equal(runtime.get(handle.runId).children[0].result.value, "resumed");
});

test("resume persistence failure restores an interrupted child and permits retry", async () => {
  const repository = memoryRepository();
  const originalSave = repository.save.bind(repository);
  let failNextSave = false;
  repository.save = async (run) => {
    if (failNextSave) {
      failNextSave = false;
      throw new Error("disk unavailable");
    }
    await originalSave(run);
  };
  const { runtime, children } = runtimeFixture({ repository });
  const handle = await runtime.start(startInput());
  await settle();
  await runtime.interruptAll();
  const childId = handle.children[0].childId;

  failNextSave = true;
  await assert.rejects(
    () => runtime.resume(handle.runId, childId, { model: {}, modelRegistry: {} }),
    /disk unavailable/,
  );
  const restored = runtime.get(handle.runId).children[0];
  assert.equal(restored.state, "interrupted");
  assert.equal(restored.pending, undefined);
  assert.equal(repository.records.get(handle.runId).children[0].state, "interrupted");
  assert.equal(children.launches.length, 1);

  await runtime.resume(handle.runId, childId, { model: {}, modelRegistry: {} });
  await settle();
  assert.equal(children.launches.length, 2);
  assert.equal(runtime.get(handle.runId).children[0].state, "running");
});

test("runtime disposal fences a resume waiting on persistence", async () => {
  const repository = memoryRepository();
  const originalSave = repository.save.bind(repository);
  const saveStarted = deferred();
  const saveGate = deferred();
  let blockQueuedSave = false;
  repository.save = async (run) => {
    if (blockQueuedSave && run.children.some((child) => child.state === "queued")) {
      blockQueuedSave = false;
      saveStarted.resolve();
      await saveGate.promise;
    }
    await originalSave(run);
  };
  const { runtime, children } = runtimeFixture({ repository });
  const handle = await runtime.start(startInput());
  await settle();
  await runtime.interruptAll();
  const childId = handle.children[0].childId;

  blockQueuedSave = true;
  const resuming = runtime.resume(handle.runId, childId, { model: {}, modelRegistry: {} });
  await saveStarted.promise;
  const disposing = runtime.dispose();
  saveGate.resolve();

  await assert.rejects(() => resuming, /not active/);
  await disposing;
  assert.equal(runtime.get(handle.runId).children[0].state, "interrupted");
  assert.equal(repository.records.get(handle.runId).children[0].state, "interrupted");
  assert.equal(children.launches.length, 1);
});

test("restore converts unfinished work to interrupted without relaunching", async () => {
  const { runtime, repository } = runtimeFixture();
  const handle = await runtime.start(startInput());
  await settle();
  const persisted = structuredClone(repository.records.get(handle.runId));
  persisted.children[0].state = "running";
  repository.records.set(handle.runId, persisted);

  const restored = runtimeFixture({ repository });
  await restored.runtime.restore("parent-1");
  const run = restored.runtime.get(handle.runId);
  assert.equal(run.children[0].state, "interrupted");
  assert.equal(run.children[0].id, persisted.children[0].id);
  assert.equal(restored.children.launches.length, 0);
  assert.equal(restored.deliveries.length, 0);
});

test("restore reconciles interrupted apply, discard, and cleanup windows", async () => {
  const originalWorkspaces = fakeWorkspaceManager();
  const original = runtimeFixture({ workspaces: originalWorkspaces.manager });
  const handle = await original.runtime.start(startInput({ workspace: "temporary" }));
  await settle();
  original.children.launches[0].done.resolve(success("done"));
  await settle();
  await original.runtime.review(handle.runId);
  const reviewed = structuredClone(original.repository.records.get(handle.runId));
  const review = reviewed.children[0].workspace.integration.review;

  const applying = structuredClone(reviewed);
  applying.children[0].workspace.integration = { state: "applying", review };

  const baseWorkspaces = fakeWorkspaceManager({ destinationKind: "base" });
  const baseRestore = runtimeFixture({ repository: memoryRepository([applying]), workspaces: baseWorkspaces.manager });
  await baseRestore.runtime.restore("parent-1");
  assert.equal(baseRestore.runtime.get(handle.runId).children[0].workspace.integration.state, "review_pending");
  assert.equal(baseWorkspaces.cleaned.length, 0);

  const appliedWorkspaces = fakeWorkspaceManager({ destinationKind: "reviewed" });
  const appliedRestore = runtimeFixture({ repository: memoryRepository([applying]), workspaces: appliedWorkspaces.manager });
  await appliedRestore.runtime.restore("parent-1");
  assert.equal(appliedRestore.runtime.get(handle.runId).children[0].workspace.integration.state, "applied");
  assert.equal(appliedWorkspaces.cleaned[0].expectedRevision, review.revision);

  const changedWorkspaces = fakeWorkspaceManager({ destinationKind: "changed" });
  const changedRestore = runtimeFixture({ repository: memoryRepository([applying]), workspaces: changedWorkspaces.manager });
  await changedRestore.runtime.restore("parent-1");
  const changed = changedRestore.runtime.get(handle.runId).children[0].workspace.integration;
  assert.equal(changed.state, "conflict");
  assert.match(changed.message, /other changes/);

  const discarding = structuredClone(reviewed);
  discarding.children[0].workspace.integration = { state: "discarding", review };
  const discardWorkspaces = fakeWorkspaceManager();
  const discardRestore = runtimeFixture({ repository: memoryRepository([discarding]), workspaces: discardWorkspaces.manager });
  await discardRestore.runtime.restore("parent-1");
  assert.equal(discardRestore.runtime.get(handle.runId).children[0].workspace.integration.state, "discarded");
  assert.equal(discardWorkspaces.cleaned[0].expectedRevision, review.revision);

  const cleanupPending = structuredClone(reviewed);
  cleanupPending.children[0].workspace.integration = {
    state: "applied",
    revision: review.revision,
    appliedAt: new Date(0).toISOString(),
  };
  const cleanupWorkspaces = fakeWorkspaceManager();
  const cleanupRestore = runtimeFixture({ repository: memoryRepository([cleanupPending]), workspaces: cleanupWorkspaces.manager });
  await cleanupRestore.runtime.restore("parent-1");
  assert.equal(cleanupWorkspaces.cleaned[0].expectedRevision, review.revision);
});

test("restore reconciles a finalized run whose completion delivery was pending", async () => {
  const original = runtimeFixture();
  const handle = await original.runtime.start(startInput());
  await settle();
  const persisted = structuredClone(original.repository.records.get(handle.runId));
  persisted.children[0].state = "completed";
  persisted.children[0].result = {
    kind: "text",
    value: "Recovered result",
    completedAt: new Date(0).toISOString(),
  };
  persisted.delivery = { state: "pending" };
  original.repository.records.set(handle.runId, persisted);

  const restored = runtimeFixture({ repository: original.repository });
  await restored.runtime.restore("parent-1");
  assert.equal(restored.deliveries.length, 1);
  assert.equal(restored.runtime.get(handle.runId).delivery.state, "delivered");
});

test("bounded projections preserve text and structured truncation", () => {
  const run = {
    schemaVersion: 3,
    id: "run-1",
    parent: { sessionId: "parent-1", leafId: null, inputGeneration: 0 },
    recordRef: "/tmp/run.json",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    delivery: { state: "pending" },
    children: [
      {
        id: "child-1",
        label: "Large text",
        task: "report",
        state: "completed",
        resolved: { model: { provider: "openai", id: "sol" }, reasoning: "max", context: "fresh", skills: [], tools: ["read"], output: "text" },
        sessionDir: "/tmp/child-1",
        sessionFile: "/tmp/child-1/session.jsonl",
        workspace: { kind: "existing", cwd: "/tmp", owner: "external" },
        latestActivity: { kind: "message", summary: "Completed", observedAt: new Date(0).toISOString() },
        result: { kind: "text", value: "x".repeat(10_000), completedAt: new Date(0).toISOString() },
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, total: 2, cost: 0 },
      },
      {
        id: "child-2",
        label: "Large structured",
        task: "report",
        state: "completed",
        resolved: { model: { provider: "openai", id: "sol" }, reasoning: "max", context: "fresh", skills: [], tools: [], output: { schema: { type: "object" } } },
        sessionDir: "/tmp/child-2",
        sessionFile: "/tmp/child-2/session.jsonl",
        workspace: { kind: "existing", cwd: "/tmp", owner: "external" },
        latestActivity: { kind: "message", summary: "Completed", observedAt: new Date(0).toISOString() },
        result: { kind: "structured", value: { report: "y".repeat(10_000) }, completedAt: new Date(0).toISOString() },
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, total: 2, cost: 0 },
      },
    ],
  };

  assert.equal(deriveRunStatus(run), "completed");
  const view = projectRun(run, 2_000);
  assert.equal(view.truncated, true);
  assert.equal(view.children[0].result.truncated, true);
  assert.match(view.children[0].result.value, /Output truncated/);
  assert.equal(view.children[1].result.kind, "structured");
  assert.equal(view.children[1].result.truncated, true);
  assert.ok(Buffer.byteLength(JSON.stringify(view), "utf8") <= 2_000);
});

test("the maximum batch projection stays within its aggregate byte limit", () => {
  const timestamp = new Date(0).toISOString();
  const children = Array.from({ length: 32 }, (_, index) => ({
    id: `child-${index}-${"i".repeat(300)}`,
    label: `Child ${index} ${"l".repeat(500)}`,
    task: "report",
    state: "failed",
    resolved: { model: { provider: "openai", id: "sol" }, reasoning: "max", context: "fresh", skills: [], tools: ["read"], output: "text" },
    sessionDir: `/tmp/child-${index}`,
    sessionFile: `/tmp/child-${index}/${"s".repeat(1000)}.jsonl`,
    workspace: {
      kind: "temporary",
      sourceCwd: "/tmp/repo",
      repoRoot: "/tmp/repo",
      relativeCwd: "",
      worktreePath: `/tmp/worktree-${index}`,
      branch: `pi-delegate/run-max/child-${index}`,
      baseCommit: "base-commit",
      patchPath: `/tmp/${"p".repeat(1000)}-${index}.patch`,
      manifestPath: `/tmp/${"m".repeat(1000)}-${index}.json`,
      integration: {
        state: "review_pending",
        review: {
          revision: `tree-${index}`,
          baseTree: "tree-base",
          summary: { filesChanged: 1, additions: 1, deletions: 0, stat: "1 file changed, 1 insertion(+)" },
          patchPath: `/tmp/${"p".repeat(1000)}-${index}.patch`,
          manifestPath: `/tmp/${"m".repeat(1000)}-${index}.json`,
          reviewedAt: timestamp,
        },
      },
    },
    latestActivity: { kind: "waiting", summary: "activity ".repeat(500), observedAt: timestamp },
    failure: {
      message: "provider failure ".repeat(1000),
      partialOutput: "partial ".repeat(1000),
      lastActivity: { kind: "waiting", summary: "failed", observedAt: timestamp },
      failedAt: timestamp,
    },
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, total: 2, cost: 0 },
  }));
  const run = {
    schemaVersion: 3,
    id: "run-max",
    parent: { sessionId: "parent-1", leafId: null, inputGeneration: 0 },
    recordRef: `/tmp/${"r".repeat(3000)}/run.json`,
    createdAt: timestamp,
    updatedAt: timestamp,
    delivery: { state: "pending" },
    children,
  };

  const view = projectRun(run);
  assert.ok(Buffer.byteLength(JSON.stringify(view), "utf8") <= 32 * 1024);
  assert.equal(view.children.length + (view.omittedChildren ?? 0), 32);
  assert.equal(view.truncated, true);
  assert.equal(view.children.length, 32);
  assert.equal(view.children.every((child) => child.workspace?.state === "review_pending"), true);
  assert.equal(view.children.every((child) => child.workspace?.revision?.startsWith("tree-")), true);
  assert.equal(view.children.every((child) => child.workspace?.patchRef && child.workspace?.manifestRef), true);
});

function fakeWorkspaceManager(options = {}) {
  const prepared = [];
  const inspected = [];
  const asserted = [];
  const applied = [];
  const cleaned = [];
  let currentRevision = options.revision ?? "tree-reviewed";
  let prepareCount = 0;
  let cleanupFailures = options.cleanupFailures ?? 0;
  const manager = {
    async prepare(input) {
      prepareCount++;
      if (options.failPrepareAt === prepareCount) throw new Error("worktree creation failed");
      const workspace = options.scratch
        ? {
          kind: "temporary",
          sourceCwd: input.sourceCwd,
          worktreePath: input.worktreePath,
          integration: { state: "working" },
        }
        : {
          kind: "temporary",
          sourceCwd: input.sourceCwd,
          repoRoot: input.sourceCwd,
          relativeCwd: "",
          worktreePath: input.worktreePath,
          branch: `pi-delegate/${input.runId}/${input.childId}`,
          baseCommit: "base-commit",
          patchPath: input.patchPath,
          manifestPath: input.manifestPath,
          integration: { state: "working" },
        };
      prepared.push(workspace);
      return structuredClone(workspace);
    },
    async inspect(workspace) {
      inspected.push(workspace);
      if (options.inspectGate) await options.inspectGate.promise;
      if (options.noChanges) return { kind: "no_changes" };
      return {
        kind: "changes",
        review: {
          revision: currentRevision,
          baseTree: "tree-base",
          summary: { filesChanged: 2, additions: 3, deletions: 1, stat: "2 files changed, 3 insertions(+), 1 deletion(-)" },
          patchPath: workspace.patchPath,
          manifestPath: workspace.manifestPath,
        },
      };
    },
    async inspectDestination(_workspace, review) {
      const kind = options.destinationKind ?? "changed";
      if (kind === "base") return { kind, revision: review.baseTree };
      if (kind === "reviewed") return { kind, revision: review.revision };
      return { kind, revision: "tree-other", message: "destination contains other changes" };
    },
    async assertRevision(_workspace, revision) {
      asserted.push(revision);
      if (revision !== currentRevision) throw new Error(`Temporary workspace changed after review: ${currentRevision}`);
    },
    async apply(workspace, review) {
      applied.push({ workspace, review });
      if (options.applyError) throw options.applyError;
    },
    async inspectScratch() {
      if (options.scratchInspectStarted) options.scratchInspectStarted.resolve();
      if (options.scratchInspectGate) await options.scratchInspectGate.promise;
      return options.scratchContents ?? { entries: [], truncated: false };
    },
    async cleanup(workspace, expectedRevision) {
      cleaned.push({ workspace, expectedRevision });
      if (options.cleanupConflict) throw new WorkspaceConflictError("temporary workspace changed before cleanup");
      if (cleanupFailures > 0) {
        cleanupFailures--;
        throw new Error("cleanup is temporarily blocked");
      }
    },
  };
  return {
    manager,
    prepared,
    inspected,
    asserted,
    applied,
    cleaned,
    setRevision(value) { currentRevision = value; },
  };
}

test("delivers a bounded inventory from a real scratch workspace", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delegate-runtime-scratch-test-"));
  const source = path.join(root, "source");
  const store = path.join(root, "delegate-runs");
  fs.mkdirSync(source);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repository = memoryRepository([], store);
  const delivered = deferred();
  const { runtime, children, deliveries } = runtimeFixture({
    repository,
    workspaces: new GitWorkspaceManager(store),
    deliver: () => {
      delivered.resolve();
      return "delivered";
    },
  });

  const handle = await runtime.start(startInput({ cwd: source, workspace: "temporary" }));
  await settle();
  const scratch = children.launches[0].input.child.workspace.worktreePath;
  fs.writeFileSync(path.join(scratch, "evidence.log"), "evidence\n");
  fs.mkdirSync(path.join(scratch, "raw"));
  fs.writeFileSync(path.join(scratch, "raw", "output.txt"), "output\n");
  children.launches[0].done.resolve(success("research complete"));
  await delivered.promise;

  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].view.children[0].workspace.backing, "scratch");
  assert.deepEqual(deliveries[0].view.children[0].workspace.contents, ["evidence.log", "raw/", "raw/output.txt"]);
  assert.equal(fs.existsSync(scratch), true);
  await runtime.cleanup(handle.runId);
  assert.equal(fs.existsSync(scratch), false);
});

test("preserves finalized scratch work until explicit cleanup", async () => {
  const workspaces = fakeWorkspaceManager({
    scratch: true,
    scratchContents: { entries: ["evidence.log", "raw/", "raw/output.txt"], truncated: false },
  });
  const { runtime, children } = runtimeFixture({ workspaces: workspaces.manager });
  const handle = await runtime.start(startInput({ workspace: "temporary" }));
  await settle();

  await assert.rejects(runtime.cleanup(handle.runId), /scratch cleanup requires finalized work/);
  children.launches[0].done.resolve(success("evidence ready"));
  await settle();

  const completed = runtime.get(handle.runId);
  const view = projectRun(completed);
  assert.equal(view.children[0].workspace.backing, "scratch");
  assert.equal(view.children[0].workspace.pathRef, "/tmp/delegate/parent-1/run-1/worktrees/child-2");
  assert.equal(view.children[0].workspace.state, "working");
  assert.deepEqual(view.children[0].workspace.contents, ["evidence.log", "raw/", "raw/output.txt"]);
  assert.equal(view.children[0].workspace.contentsTruncated, false);
  assert.equal(workspaces.cleaned.length, 0);
  assert.equal(runNeedsControl(completed), true);
  await assert.rejects(runtime.review(handle.runId), /scratch workspace/);

  const cleaned = await runtime.cleanup(handle.runId);
  assert.equal(cleaned.children[0].workspace.integration.state, "cleaned");
  assert.equal(cleaned.children[0].workspace.contents, undefined);
  assert.equal(projectRun(cleaned).children[0].workspace.contents, undefined);
  assert.equal(workspaces.cleaned.length, 1);
  assert.equal(runNeedsControl(cleaned), false);
  await assert.rejects(runtime.cleanup(handle.runId), /already cleaned/);
});

test("does not restore a stale scratch inventory when cleanup finishes during inspection", async () => {
  const inspectStarted = deferred();
  const inspectGate = deferred();
  const workspaces = fakeWorkspaceManager({
    scratch: true,
    scratchContents: { entries: ["stale.txt"], truncated: false },
    scratchInspectStarted: inspectStarted,
    scratchInspectGate: inspectGate,
  });
  const { runtime, children } = runtimeFixture({ workspaces: workspaces.manager });
  const handle = await runtime.start(startInput({ workspace: "temporary" }));
  await settle();

  children.launches[0].done.resolve(success("evidence ready"));
  await inspectStarted.promise;
  const cleaned = await runtime.cleanup(handle.runId);
  assert.equal(cleaned.children[0].workspace.integration.state, "cleaned");
  inspectGate.resolve();
  await settle();

  const final = runtime.get(handle.runId);
  assert.equal(final.children[0].workspace.contents, undefined);
  assert.equal(projectRun(final).children[0].workspace.contents, undefined);
});

test("reviews and applies an exact temporary workspace revision", async () => {
  const workspaces = fakeWorkspaceManager();
  const { runtime, children } = runtimeFixture({ workspaces: workspaces.manager });
  const handle = await runtime.start(startInput({ workspace: "temporary" }));
  await settle();
  assert.equal(workspaces.prepared.length, 1);
  assert.equal(children.launches[0].input.child.workspace.kind, "temporary");
  assert.equal(children.launches[0].input.child.workspace.worktreePath, "/tmp/delegate/parent-1/run-1/worktrees/child-2");

  children.launches[0].done.resolve(success("implementation complete"));
  await settle();
  assert.equal(runNeedsControl(runtime.get(handle.runId)), true);

  const reviewed = await runtime.review(handle.runId);
  const integration = reviewed.children[0].workspace.integration;
  assert.equal(integration.state, "review_pending");
  assert.equal(integration.review.revision, "tree-reviewed");
  const view = projectRun(reviewed);
  assert.equal(view.children[0].workspace.state, "review_pending");
  assert.equal(view.children[0].workspace.revision, "tree-reviewed");

  const applied = await runtime.apply(handle.runId, undefined, "tree-reviewed");
  assert.equal(applied.children[0].workspace.integration.state, "applied");
  assert.deepEqual(workspaces.asserted, ["tree-reviewed"]);
  assert.equal(workspaces.applied.length, 1);
  assert.equal(workspaces.cleaned.length, 1);
  assert.equal(runNeedsControl(applied), false);
});

test("serializes concurrent workspace actions for one child", async () => {
  const inspectGate = deferred();
  const workspaces = fakeWorkspaceManager({ inspectGate });
  const { runtime, children } = runtimeFixture({ workspaces: workspaces.manager });
  const handle = await runtime.start(startInput({ workspace: "temporary" }));
  await settle();
  children.launches[0].done.resolve(success("done"));
  await settle();

  const reviewing = runtime.review(handle.runId);
  const applying = runtime.apply(handle.runId, undefined, "tree-reviewed");
  await tick();
  assert.equal(workspaces.inspected.length, 1);
  assert.equal(workspaces.applied.length, 0);
  inspectGate.resolve();
  await Promise.all([reviewing, applying]);
  assert.equal(runtime.get(handle.runId).children[0].workspace.integration.state, "applied");
  assert.equal(workspaces.applied.length, 1);
});

test("preserves later temporary edits during apply and discard cleanup", async () => {
  const applyWorkspaces = fakeWorkspaceManager({ cleanupConflict: true });
  const applyFixture = runtimeFixture({ workspaces: applyWorkspaces.manager });
  const applyHandle = await applyFixture.runtime.start(startInput({ workspace: "temporary" }));
  await settle();
  applyFixture.children.launches[0].done.resolve(success("done"));
  await settle();
  await applyFixture.runtime.review(applyHandle.runId);
  const applied = await applyFixture.runtime.apply(applyHandle.runId, undefined, "tree-reviewed");
  assert.equal(applied.children[0].workspace.integration.state, "applied");
  assert.match(applied.children[0].workspace.integration.cleanupError, /changed before cleanup/);

  const discardWorkspaces = fakeWorkspaceManager({ cleanupConflict: true });
  const discardFixture = runtimeFixture({ workspaces: discardWorkspaces.manager });
  const discardHandle = await discardFixture.runtime.start(startInput({ workspace: "temporary" }));
  await settle();
  discardFixture.children.launches[0].done.resolve(success("done"));
  await settle();
  await discardFixture.runtime.review(discardHandle.runId);
  const discarded = await discardFixture.runtime.discard(discardHandle.runId, undefined, "tree-reviewed");
  assert.equal(discarded.children[0].workspace.integration.state, "conflict");
  assert.match(discarded.children[0].workspace.integration.message, /changed before cleanup/);
});

test("returns a no-change workspace to review when it changes before cleanup", async () => {
  const workspaces = fakeWorkspaceManager({ noChanges: true, cleanupConflict: true });
  const { runtime, children } = runtimeFixture({ workspaces: workspaces.manager });
  const handle = await runtime.start(startInput({ workspace: "temporary" }));
  await settle();
  children.launches[0].done.resolve(success("done"));
  await settle();

  const reviewed = await runtime.review(handle.runId);
  assert.equal(reviewed.children[0].workspace.integration.state, "working");
  assert.match(reviewed.children[0].workspace.integration.message, /changed before cleanup/);
  assert.equal(runNeedsControl(reviewed), true);
});

test("preserves a reviewed workspace after stale revision and destination conflict", async () => {
  const workspaces = fakeWorkspaceManager({ applyError: new WorkspaceConflictError("destination changed") });
  const { runtime, children } = runtimeFixture({ workspaces: workspaces.manager });
  const handle = await runtime.start(startInput({ workspace: "temporary" }));
  await settle();
  children.launches[0].done.resolve(success("done"));
  await settle();
  await runtime.review(handle.runId);

  workspaces.setRevision("tree-newer");
  await assert.rejects(runtime.apply(handle.runId, undefined, "tree-reviewed"), /changed after review/);
  assert.equal(runtime.get(handle.runId).children[0].workspace.integration.state, "review_pending");
  assert.equal(workspaces.cleaned.length, 0);

  workspaces.setRevision("tree-reviewed");
  const conflicted = await runtime.apply(handle.runId, undefined, "tree-reviewed");
  assert.equal(conflicted.children[0].workspace.integration.state, "conflict");
  assert.match(conflicted.children[0].workspace.integration.message, /destination changed/);
  assert.equal(workspaces.cleaned.length, 0);

  const discarded = await runtime.discard(handle.runId, undefined, "tree-reviewed");
  assert.equal(discarded.children[0].workspace.integration.state, "discarded");
  assert.equal(workspaces.cleaned.length, 1);
});

test("keeps failed and cancelled temporary workspaces available for review", async () => {
  const workspaces = fakeWorkspaceManager();
  const { runtime, children } = runtimeFixture({ workspaces: workspaces.manager });
  const handle = await runtime.start(startInput({
    workspace: "temporary",
    tasks: [{ task: "fails", label: "fails" }, { task: "cancelled", label: "cancelled" }],
  }));
  await settle();
  children.launches[0].done.resolve(failure("implementation failed"));
  await settle();
  const secondId = runtime.get(handle.runId).children[1].id;
  await runtime.cancel(handle.runId, secondId);
  assert.equal(workspaces.cleaned.length, 0);

  await runtime.review(handle.runId, runtime.get(handle.runId).children[0].id);
  await runtime.review(handle.runId, secondId);
  assert.deepEqual(runtime.get(handle.runId).children.map((child) => child.workspace.integration.state), ["review_pending", "review_pending"]);
  assert.equal(workspaces.cleaned.length, 0);
});

test("cleans an unchanged temporary workspace after review", async () => {
  const workspaces = fakeWorkspaceManager({ noChanges: true });
  const { runtime, children } = runtimeFixture({ workspaces: workspaces.manager });
  const handle = await runtime.start(startInput({ workspace: "temporary" }));
  await settle();
  children.launches[0].done.resolve(success("no changes"));
  await settle();

  const reviewed = await runtime.review(handle.runId);
  assert.equal(reviewed.children[0].workspace.integration.state, "no_changes");
  assert.equal(workspaces.cleaned.length, 1);
});

test("keeps cleanup failures manageable until an explicit retry succeeds", async () => {
  const workspaces = fakeWorkspaceManager({ noChanges: true, cleanupFailures: 1 });
  const { runtime, children } = runtimeFixture({ workspaces: workspaces.manager });
  const handle = await runtime.start(startInput({ workspace: "temporary" }));
  await settle();
  children.launches[0].done.resolve(success("no changes"));
  await settle();

  const reviewed = await runtime.review(handle.runId);
  assert.equal(reviewed.children[0].workspace.integration.state, "no_changes");
  assert.match(reviewed.children[0].workspace.integration.cleanupError, /temporarily blocked/);
  assert.equal(runNeedsControl(reviewed), true);

  const cleaned = await runtime.cleanup(handle.runId);
  assert.equal(cleaned.children[0].workspace.integration.cleanupError, undefined);
  assert.equal(runNeedsControl(cleaned), false);
  await assert.rejects(runtime.cleanup(handle.runId), /no failed cleanup/);
});

test("rolls back prepared worktrees when a temporary batch cannot be created", async () => {
  const workspaces = fakeWorkspaceManager({ failPrepareAt: 2 });
  const { runtime } = runtimeFixture({ workspaces: workspaces.manager });
  await assert.rejects(runtime.start(startInput({
    workspace: "temporary",
    tasks: [{ task: "one", label: "one" }, { task: "two", label: "two" }],
  })), /worktree creation failed/);
  assert.equal(workspaces.prepared.length, 1);
  assert.equal(workspaces.cleaned.length, 1);
  assert.deepEqual(runtime.list(), []);
});
