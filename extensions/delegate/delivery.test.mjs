import assert from "node:assert/strict";
import test from "node:test";
import { createParentDelivery } from "./delivery.ts";

function run(inputGeneration = 1) {
  return {
    id: "run-1",
    parent: { sessionId: "parent-1", leafId: "leaf-1", inputGeneration },
    recordRef: "/tmp/run.json",
    children: [
      {
        id: "child-1",
        attention: {
          id: "attention-1",
          kind: "clarification",
          question: "Which API?",
          requestedAt: new Date(0).toISOString(),
          notification: { state: "pending" },
        },
      },
    ],
  };
}

const view = {
  runId: "run-1",
  status: "completed",
  delivery: "pending",
  children: [
    {
      childId: "child-1",
      label: "Reader",
      state: "completed",
      lastActivity: { kind: "message", summary: "Completed", observedAt: new Date(0).toISOString() },
      attention: { kind: "clarification", question: "Which API?", context: "v1 and v2 exist" },
      result: { kind: "text", value: "Evidence", truncated: false, fullResultRef: "/tmp/child.jsonl" },
      usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, total: 2, cost: 0 },
    },
  ],
  truncated: false,
  recordRef: "/tmp/run.json",
};

test("delivers an authorized aggregate completion with one persisted event identity", async () => {
  const sent = [];
  const delivery = createParentDelivery({
    current: () => ({ sessionId: "parent-1", inputGeneration: 1, branchIds: ["leaf-1"] }),
    send: (content, details, metadata) => sent.push({ content, details, metadata }),
  });

  assert.equal(await delivery.deliver(run(), view), "delivered");
  assert.equal(sent.length, 1);
  assert.match(sent[0].content, /Evidence/);
  assert.match(sent[0].content, /Full run: \/tmp\/run.json/);
  assert.deepEqual(sent[0].metadata, { kind: "result", eventId: "run-1:result" });
});

test("attention and final completion have distinct idempotency keys", async () => {
  const sent = [];
  const delivery = createParentDelivery({
    current: () => ({ sessionId: "parent-1", inputGeneration: 1, branchIds: ["leaf-1"] }),
    send: (content, details, metadata) => sent.push({ content, details, metadata }),
  });

  assert.equal(await delivery.deliverAttention(run(), view, "child-1"), "delivered");
  assert.equal(await delivery.deliver(run(), view), "delivered");
  assert.deepEqual(sent.map((item) => item.metadata.eventId), ["attention-1", "run-1:result"]);
  assert.match(sent[0].content, /Which API/);
});

test("does not inject an event already present in the parent session", async () => {
  const delivery = createParentDelivery({
    current: () => ({ sessionId: "parent-1", inputGeneration: 1, branchIds: ["leaf-1"] }),
    alreadyDelivered: (eventId) => eventId === "attention-1",
    send: () => assert.fail("must not send twice"),
  });

  assert.equal(await delivery.deliverAttention(run(), view, "child-1"), "delivered");
});

test("holds a late result after unrelated user input", async () => {
  const held = [];
  const delivery = createParentDelivery({
    current: () => ({ sessionId: "parent-1", inputGeneration: 2, branchIds: ["leaf-1"] }),
    send: () => assert.fail("must not send"),
    onHeld: (_run, reason, metadata) => held.push({ reason, metadata }),
  });

  assert.equal(await delivery.deliver(run(1), view), "held:user_intervened");
  assert.equal(held[0].reason, "user_intervened");
  assert.equal(held[0].metadata.eventId, "run-1:result");
});

test("holds delivery after navigation to an unrelated branch in the same session", async () => {
  const delivery = createParentDelivery({
    current: () => ({ sessionId: "parent-1", inputGeneration: 1, branchIds: ["ancestor-leaf", "different-leaf"] }),
    send: () => assert.fail("must not send"),
  });

  assert.equal(await delivery.deliver(run(), view), "held:user_intervened");
});

test("bounds the formatted aggregate delivery independently of its snapshot", async () => {
  let content = "";
  const delivery = createParentDelivery({
    current: () => ({ sessionId: "parent-1", inputGeneration: 1, branchIds: ["leaf-1"] }),
    send: (value) => { content = value; },
  });
  const largeView = structuredClone(view);
  largeView.children = Array.from({ length: 32 }, (_, index) => ({
    ...structuredClone(view.children[0]),
    childId: `child-${index}`,
    label: `Child ${index} ${"label ".repeat(500)}`,
    result: { ...structuredClone(view.children[0].result), value: "result ".repeat(2000) },
  }));

  assert.equal(await delivery.deliver(run(), largeView), "delivered");
  assert.ok(Buffer.byteLength(content, "utf8") <= 32 * 1024);
  assert.match(content, /Delivery truncated/);
});

test("holds attention when the parent session changed", async () => {
  const delivery = createParentDelivery({
    current: () => ({ sessionId: "parent-2", inputGeneration: 1, branchIds: [] }),
    send: () => assert.fail("must not send"),
  });

  assert.equal(await delivery.deliverAttention(run(), view, "child-1"), "held:session_changed");
});
