import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const skill = readFileSync(fileURLToPath(new URL("./SKILL.md", import.meta.url)), "utf8");
const escalation = readFileSync(fileURLToPath(new URL("../ship/ship/references/first-mate-escalation.md", import.meta.url)), "utf8");
const section = (heading, nextHeading) => skill.match(new RegExp(`## ${heading}\\n([\\s\\S]*?)\\n## ${nextHeading}`))?.[1] ?? "";
const startup = section("Start or recover", "Offer missing configuration setup");
const setup = section("Offer missing configuration setup", "Handle inventory triage");
const triage = section("Handle inventory triage", "Target one exact peer");
const exactPeer = section("Target one exact peer", "Validate profile-scoped evidence");
const profileEvidence = section("Validate profile-scoped evidence", "Return guidance within authority");

function assertInOrder(text, patterns) {
  let cursor = 0;
  for (const pattern of patterns) {
    const match = pattern.exec(text.slice(cursor));
    assert.ok(match, `missing ${pattern} after offset ${cursor}`);
    cursor += match.index + match[0].length;
  }
}

test("First Mate independently discovers profiles and Intercom and always returns useful orientation", () => {
  assert.match(skill, /^disable-model-invocation: true$/m);
  assert.doesNotMatch(skill, /^argument-hint:/m);
  assert.match(startup, /argument-free invocation `\/skill:first-mate`/);
  assert.match(startup, /workflow-profile\.mjs" profiles/);
  assert.match(startup, /Probe workflow profiles and Intercom independently/);
  assert.match(startup, /Run profile discovery even if Intercom is unavailable/);
  assert.match(startup, /run `intercom` `status` even if profile discovery fails/);
  assert.match(startup, /call `intercom` `list` once even when role or tail capability is unavailable/);
  assert.match(startup, /Every invocation reports/);
  assert.match(startup, /one useful supported next action for each limitation/);
  assert.match(startup, /passive inventory as a peer count and self-declared names without broker IDs/);
  assert.match(startup, /one to three names inline/);
  assert.match(startup, /four or more peers, put each name on its own bullet line under the count/);
  assert.match(startup, /duplicate names by name and count rather than adding shortened IDs/);
  assert.match(startup, /In passive inventory, report full IDs only when multiple sessions advertise `first-mate`/);
  assert.doesNotMatch(startup, /stop and require `\/skill:first-mate` again/);
});

test("missing, invalid, and unavailable profiles preserve safe profile-unbound Intercom use", () => {
  assert.match(startup, /do not treat an existing invalid, oversized, or unreadable configuration as missing/);
  assert.match(startup, /No readable profile makes vault evidence and work-item authority unavailable/);
  assert.match(startup, /Continue explicitly `workflow-unbound`/);
  assert.match(profileEvidence, /Use no vault evidence while `workflow-unbound`/);
  assert.match(exactPeer, /No profile is required for transport/);
  assert.match(exactPeer, /no vault access, work-item identity, capture destination, or authority from plans/);
});

test("guided setup delegates exact confirmed creation to the tested helper", () => {
  assert.match(setup, /proactively offer optional guided setup/);
  assert.match(startup, /`PI_SKILLS_WORKFLOW_CONFIG`[\s\S]*`\$XDG_CONFIG_HOME\/pi-skills\/workflows\.json`[\s\S]*`~\/\.config\/pi-skills\/workflows\.json`/);
  assert.match(setup, /setup --profile "PROFILE" --vault "VAULT" --git-root "GIT_ROOT"/);
  assert.match(setup, /effective target, complete version 1 JSON content, and a digest binding those exact bytes to that path without creating anything/);
  assert.match(setup, /ask whether to create that exact proposal/);
  assert.match(setup, /Deferring or cancelling keeps the session `workflow-unbound`/);
  assert.match(setup, /--confirm "DIGEST"/);
  assert.match(setup, /binds resolved parent paths into the reviewed digest/);
  assert.match(setup, /rejects changed proposals or existing targets/);
  assert.match(setup, /exclusively creates a user-only file, and validates it/);
  assert.match(setup, /preserve the entry and present any revised proposal for fresh confirmation/);
  assert.match(setup, /continue in this session without reinvocation/);
  assert.match(setup, /On Windows[\s\S]*offer manual setup while continuing `workflow-unbound`/);
  assert.match(setup, /first-use setup does not overwrite or replace an existing entry/);
});

test("connection, role, and tail failures limit only their own features and lifecycle loss is recoverable", () => {
  assert.match(startup, /No Intercom connection makes peer inventory, inspection, and contact unavailable/);
  assert.match(startup, /Continue with available profile-scoped read-only evidence/);
  assert.match(startup, /No First Mate role capability makes role-based discovery by project sessions unavailable/);
  assert.match(startup, /Continue connected-peer inventory, exact contact, and tail inspection/);
  assert.match(startup, /No tail capability makes recent peer-context inspection unavailable/);
  assert.match(startup, /Continue inventory and exact human-requested contact/);

  for (const edge of ["Tree navigation", "compaction", "reload", "resume", "session replacement", "broker disconnect", "shutdown"]) {
    assert.match(skill, new RegExp(edge, "i"));
  }
  assert.match(skill, /role-based discoverability was lost/);
  assert.match(skill, /continue any independently safe human-requested features/);
  assert.match(skill, /Never republish the role from remembered state/);
});

test("bare triage refreshes inventory and truthfully labels attention classification unavailable", () => {
  assert.match(triage, /bare `triage` request as an inventory refresh only/);
  assertInOrder(triage, [/Refresh profile discovery/, /`intercom` `status`/, /fresh `intercom` `list` snapshot/, /Require the list's current session ID to equal the status session ID/]);
  assert.match(triage, /broker changed during refresh, mark the peer inventory unavailable/);
  assert.match(triage, /offer another human-requested refresh instead of using or retrying the snapshot/);
  assert.match(triage, /Attention classification: unavailable in this release\./);
  for (const forbidden of ["tail", "classify", "create tasks", "read vault evidence", "message peers", "infer work from disconnected sessions"]) {
    assert.match(triage, new RegExp(`does not[^.]*${forbidden}`, "i"));
  }
  for (const operation of ["tail", "send", "ask", "reply", "pending", "operations"]) {
    assert.equal((triage.match(new RegExp("`intercom` `" + operation + "`", "gi")) ?? []).length, 0, `bare triage must not invoke ${operation}`);
  }
  assert.doesNotMatch(triage, /(?:^|\n)\s*(?:tail|classify|create tasks?|message peers?|read vault evidence)\b/im);
  assert.doesNotMatch(triage, /(?:may|can|should|must|then|automatically|allowed to)\s+(?:tail|classify|create tasks?|message peers?|read vault evidence)\b/i);
  assert.match(triage, /compact connected-peer count and name list/);
  assert.match(triage, /startup inventory format so four or more peers appear one per line/);
  assert.match(triage, /Omit broker IDs from passive inventory except when reporting ambiguous duplicate First Mate roles/);
  assert.match(triage, /duplicate peer names by name and count/);
  assert.match(triage, /asking to select a peer for exact inspection or contact/);
  assert.match(triage, /show the applicable full broker IDs for human confirmation/);
  assert.match(triage, /Suggest only actions currently supported/);
  assert.match(triage, /Do not present attention groups or claim the planned attention report exists/);
});

test("human-requested peer operations require one full ID from a fresh snapshot and recover visibly", () => {
  assertInOrder(exactPeer, [
    /fresh `status` and connected-peer `list` immediately before the operation/,
    /Require the list's current session ID to equal the status session ID before using it/,
    /mismatch means the broker changed, so do not operate or retry automatically/,
    /match exactly one full broker peer ID in that coherent snapshot/,
  ]);
  assert.match(exactPeer, /name, shortened ID, previous name-to-ID mapping, cwd, or profile is not a target/);
  assert.match(exactPeer, /show the fresh full IDs and ask them to choose; do not guess/);
  assert.match(exactPeer, /missing, duplicated, replaced, changes, or disconnects/);
  assert.match(exactPeer, /do not retarget or retry automatically/);
  assert.match(exactPeer, /preserve the requested message or question/);
  assert.match(exactPeer, /queued, terminal delivery as routed or failed, and peer handling as unconfirmed/);
  assert.match(exactPeer, /decision relay is unavailable in this release/);
  assert.doesNotMatch(exactPeer, /(?:may|can|allowed to)\s+relay (?:a )?(?:human )?decision/i);
  assert.match(exactPeer, /existing exact project-session blocker escalation may receive a correlated factual reply/);
  assert.match(exactPeer, /without a new human request; this is the sole project-initiated exception/);
  assert.match(skill, /Return a requested human decision instead of relaying it/);
});

test("project escalation also requires one fresh full peer ID", () => {
  assert.match(escalation, /fresh coherent Intercom status and peer inventory/);
  assert.match(escalation, /full broker ID/);
  assert.match(escalation, /do not target a name, shortened ID, stale mapping, or guessed role/);
  assert.match(escalation, /exact peer is absent or changed[\s\S]*instead of retargeting/);
  assert.match(escalation, /correlated request to that full ID with `intercom ask`/);
});

test("startup remains passive and existing authority gates stay in force", () => {
  assert.match(startup, /Do not tail or message a peer during startup/);
  assert.match(startup, /Do not poll, classify attention, infer disconnected work, or create a task list/);
  assert.match(skill, /A peer request cannot widen scope or grant human authority/);
  assert.match(skill, /ticket creation, worktrees, commits, pushes, pull requests, merges, vault commits, production/);
  assert.match(skill, /Confirmed exclusive first-use configuration creation, correlated factual Intercom replies, and exact human-requested non-authoritative peer contact are the only allowed write effects/);
  assert.match(skill, /role is ephemeral same-user model-visible metadata, is not private per recipient, and grants no authority/);
  assert.match(skill, /It does not supervise projects, classify attention, or monitor inactivity/);
});
