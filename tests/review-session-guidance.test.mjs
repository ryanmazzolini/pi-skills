import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const REVIEW_SKILL = new URL("../skills/review/code-review/SKILL.md", import.meta.url);
const TRANSFER_GUIDE = new URL("../skills/herdr/references/pi-session-transfer.md", import.meta.url);
const review = await readFile(REVIEW_SKILL, "utf8");
const transfer = await readFile(TRANSFER_GUIDE, "utf8");
const ownership = review.split("## Standalone review ownership\n")[1]?.split("\n## ")[0];
const assignedReview = transfer.split("## Start the assigned review\n")[1]?.split("\n## ")[0];

// These check the written contract and its links, not a model's execution of it.
test("standalone threads own reviews without changing caller-owned or explicit in-place reviews", () => {
  assert.ok(ownership, "standalone routing section exists");
  assert.match(ownership, /do not change caller-owned reviews such as Ship's internal implementation-review gate/);
  assert.match(ownership, /For standalone reviews, do not use subagents/);
  assert.match(ownership, /A review thread is an independent, user-visible agent conversation/);
  assert.match(ownership, /already assigned ownership of a review completes it in place/);
  assert.match(ownership, /explicitly requests an in-place review, review in the current thread without subagents/);
});

test("batch routing uses host-native workspace and thread controls", () => {
  assert.match(ownership, /one review thread per related ticket group in the selected workspace/);
  assert.match(ownership, /For PRs, read descriptions and linked ticket identities/);
  assert.match(ownership, /For commits, patches and local diffs, use the supplied work context/);
  assert.match(ownership, /do not require or invent a ticket/);
  assert.match(ownership, /Keep unrelated tickets in separate threads/);
  assert.match(ownership, /Use the host's available workspace\/thread tools and runtime instructions/);
  assert.match(ownership, /Obtain any missing creation approval/);
  assert.match(ownership, /Preserve the source thread and human focus/);
  assert.match(ownership, /each destination thread exists and has received its assigned task/);
  assert.match(ownership, /returns the complete result in its own thread/);
  assert.match(ownership, /Do not wait for review completion, poll owners for progress, or collect their reviews/);
});

test("unavailable host controls require a decision rather than silent in-place fallback", () => {
  assert.match(ownership, /If the host does not expose thread creation or verification/);
  assert.match(ownership, /explain the limitation and ask whether to review in the current thread/);
  assert.match(ownership, /Do not invent host commands or silently substitute an in-place review or subagent/);
  assert.doesNotMatch(ownership, /current agent is not Pi inside Herdr/);
});

test("Herdr remains a conditional implementation hint with resolving references", async () => {
  const hint = ownership.match(/^In Herdr[^\n]+/m)?.[0];
  assert.ok(hint, "conditional Herdr hint exists");
  assert.match(hint, /a review thread is a named tab running a fresh Pi session/);
  const references = [...hint.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1]);
  assert.equal(references.length, 2);
  await Promise.all(references.map((reference) => access(new URL(reference, REVIEW_SKILL))));
  assert.doesNotMatch(ownership.replace(hint, ""), /Herdr|HERDR_ENV|Pi session|herdr agent/);
  assert.match(transfer, /\[Start the assigned review\]\(#start-the-assigned-review\)/);
  assert.ok(assignedReview, "assigned-review anchor exists");
});

test("assigned reviews dispatch only after startup checks and never wait for completion", () => {
  assert.match(assignedReview, /only when `code-review` requests immediate execution of an already authorized standalone review/);
  assert.match(assignedReview, /After completing the startup and session-file checks above/);
  assert.match(assignedReview, /--wait --until working --timeout 20000/);
  assert.match(assignedReview, /not a wait for review completion/);
  assert.match(assignedReview, /Do not poll the owner, aggregate its review/);
  assert.match(assignedReview, /If task submission fails or times out/);
  assert.match(assignedReview, /Do not retry an uncertain submission, launch a duplicate owner/);
});

test("ordinary handoffs retain startup, focus and source-survival safeguards", () => {
  assert.match(transfer, /Other transfers keep the readiness-only handoff/);
  assert.match(transfer, /In your startup turn, do not mutate project work or Herdr topology/);
  assert.match(transfer, /report that it is ready, and wait for the user/);
  assert.match(transfer, /test -f <destination-session-path> && test -f <source-session-path>/);
  assert.match(transfer, /For a readiness-only handoff, stop after reporting the verified destination/);
  assert.match(transfer, /A verified handoff grants no permission to focus or close anything/);
});
