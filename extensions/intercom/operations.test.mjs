import assert from "node:assert/strict";
import test from "node:test";
import { IntercomOperations } from "./operations.ts";

test("operations return immutable queued receipts, notify terminal outcomes, and retain no payload", async () => {
	const terminal = [];
	let release;
	const operations = new IntercomOperations((snapshot, result) => terminal.push({ snapshot, result }), { maxActive: 1, maxRetained: 2, sendReplyDeadlineMs: 1_000, askDeadlineMs: 1_000, maxTargetBytes: 256, maxReasonBytes: 512 });
	const receipt = operations.start("send", "peer", async (_signal, update) => {
		update("routing");
		await new Promise((resolve) => { release = resolve; });
		return { target: "peer" };
	});
	assert.equal(receipt.state, "queued");
	assert.equal(operations.list()[0].state, "routing");
	assert.throws(() => operations.start("send", "other", async () => ({})), /Too many active/);
	release();
	await new Promise((resolve) => setImmediate(resolve));
	assert.equal(terminal[0].snapshot.state, "completed");
	assert.equal(terminal[0].result.target, "peer");
	assert.equal(JSON.stringify(operations.list()).includes("payload"), false);
});

test("state transitions advance from routing to waiting_reply", async () => {
	let release;
	const operations = new IntercomOperations(() => undefined, { maxActive: 1, maxRetained: 2, sendReplyDeadlineMs: 1_000, askDeadlineMs: 1_000, maxTargetBytes: 256, maxReasonBytes: 512 });
	const receipt = operations.start("ask", "peer", async (_signal, update) => {
		update("routing");
		update("waiting_reply");
		await new Promise((resolve) => { release = resolve; });
		return { target: "peer" };
	});
	assert.equal(operations.list(receipt.operationId)[0].state, "waiting_reply");
	release();
});

test("deadline aborts underlying work and records timed_out", async () => {
	const terminal = [];
	let aborted = false;
	const operations = new IntercomOperations((snapshot) => terminal.push(snapshot), { maxActive: 1, maxRetained: 2, sendReplyDeadlineMs: 10, askDeadlineMs: 50, maxTargetBytes: 256, maxReasonBytes: 64 });
	operations.start("send", "peer", async (signal, update) => new Promise((_, reject) => {
		update("routing");
		signal.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")); }, { once: true });
	}));
	await new Promise((resolve) => setTimeout(resolve, 30));
	assert.equal(aborted, true);
	assert.equal(terminal[0].state, "timed_out");
});

test("known-routed ask failures are not reported as uncertain and reasons stay UTF-8 bounded", async () => {
	const terminal = [];
	const operations = new IntercomOperations((snapshot) => terminal.push(snapshot), { maxActive: 1, maxRetained: 2, sendReplyDeadlineMs: 1_000, askDeadlineMs: 1_000, maxTargetBytes: 10, maxReasonBytes: 24 });
	const receipt = operations.start("ask", `peer-${"界".repeat(100)}`, async (_signal, update) => {
		update("routing");
		update("waiting_reply");
		throw new Error(`failure ${"界".repeat(100)}`);
	});
	await new Promise((resolve) => setImmediate(resolve));
	assert.equal(terminal[0].state, "failed");
	assert.equal(terminal[0].deliveryUncertain, false);
	assert.ok(Buffer.byteLength(receipt.target, "utf8") <= 10);
	assert.ok(Buffer.byteLength(terminal[0].reason, "utf8") <= 24);
	assert.match(terminal[0].reason, /\[truncated\]$/);
});

test("failures before routing and explicit broker rejections are definitive", async () => {
	const terminal = [];
	const operations = new IntercomOperations((snapshot) => terminal.push(snapshot), { maxActive: 2, maxRetained: 2, sendReplyDeadlineMs: 1_000, askDeadlineMs: 1_000, maxTargetBytes: 256, maxReasonBytes: 512 });
	operations.start("send", "offline-peer", async () => {
		throw new Error("registration rejected before routing");
	});
	operations.start("send", "departed-peer", async (_signal, update) => {
		update("routing");
		update("delivery_rejected");
		throw new Error("Session not found");
	});
	await new Promise((resolve) => setImmediate(resolve));
	assert.deepEqual(terminal.map((snapshot) => snapshot.state), ["failed", "failed"]);
	assert.deepEqual(terminal.map((snapshot) => snapshot.deliveryUncertain), [false, false]);
});

test("cancellation and shutdown terminate accepted operations without retries", async () => {
	const terminal = [];
	let observedAbort = false;
	const operations = new IntercomOperations((snapshot) => terminal.push(snapshot), { maxActive: 2, maxRetained: 2, sendReplyDeadlineMs: 1_000, askDeadlineMs: 1_000, maxTargetBytes: 256, maxReasonBytes: 512 });
	const first = operations.start("ask", "peer", async (signal) => new Promise((_, reject) => signal.addEventListener("abort", () => { observedAbort = true; reject(new Error("aborted")); }, { once: true })));
	const cancelled = operations.cancel(first.operationId);
	assert.equal(cancelled.state, "cancelled");
	assert.equal(cancelled.remoteMayProcess, false);
	assert.equal(observedAbort, true);
	const routing = operations.start("send", "peer", async (signal, update) => new Promise((_, reject) => {
		update("routing");
		signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
	}));
	const routingCancelled = operations.cancel(routing.operationId);
	assert.equal(routingCancelled.remoteMayProcess, true);
	const second = operations.start("reply", "peer", async (signal) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true })));
	operations.dispose();
	assert.equal(operations.list(second.operationId)[0].state, "interrupted");
	assert.deepEqual(terminal.map((item) => item.state).sort(), ["cancelled", "cancelled", "interrupted"]);
});
