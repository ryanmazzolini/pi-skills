---
name: "meta-review"
description: "Review recent personal Pi sessions for recurring collaboration problems and return a few small, testable improvements."
disable-model-invocation: true
---

# Meta Review

Review recent personal-profile sessions without changing them. Return a report in this conversation. Do not edit instructions, skills, notes, repositories, or source session files during the review.

This first release supports only the argument-free invocation `/skill:meta-review` and the configured `personal` workflow profile.

## Prepare isolated evidence

Take one read-only `intercom list` before reading session files. Require a complete inventory and a unique stable Pi session ID for every advertised Pi peer. Do not message or wake the peers. Retain every listed Pi session ID as an exclusion so an in-memory `/tree` position cannot differ from the persisted leaf under review. If Intercom or a complete stable inventory is unavailable, report the limitation and stop rather than reviewing a possibly live session.

Resolve `scripts/prepare-sessions.mjs` relative to this skill. Create a new OS temporary directory, then run:

```bash
node "<meta-review-skill-dir>/scripts/prepare-sessions.mjs" \
  --profile personal \
  --output "<temporary-directory>" \
  --exclude-session "<listed-pi-session-id>" # repeat for every listed Pi session
```

Use the helper's fixed production bounds. It selects recent sessions that have been quiet long enough for review, excludes the current and advertised live sessions, follows each remaining session's latest persisted branch, and writes a bounded projection. Projections contain user and assistant text with original session and entry IDs. They omit thinking, tool calls, tool results, images, extension state, and abandoned branches.

Do not inspect session JSONL files yourself or retry with broader paths, another profile, weaker quiescence, or larger bounds. If preparation fails, remove the temporary directory, report the exact bounded failure and one useful recovery, then stop. If the manifest contains no sessions, clean up and report that there is not enough quiescent personal-session evidence yet.

## Review one session at a time

Read `agent-coordination` and its routing policy. Treat each projection listed in `manifest.json` as one independent partition. Start one fresh lightweight delegated reviewer per projection in one homogeneous batch when the routing policy selects the same route. Give reviewers read-only tools and the exact projection path. They must not inspect the source session, repository, vault, other projections, or the web.

Ask each reviewer for at most three concrete observations about the interaction between Ryan and the agent. Useful observations include:

- Ryan correcting an avoidable misunderstanding, premature action, scope change, or poor checkpoint;
- the agent adding avoidable cognitive load or process;
- an instruction or skill failing to protect behavior it was meant to protect; or
- a collaboration pattern that clearly worked and should be preserved.

Each observation must state one claim and cite the projection's exact `sessionId`, one or more exact `entryId` values, and short matching excerpts. Reviewers should describe the observed behavior and consequence, not recommend a change or infer a general preference from one session.

Wait for every reviewer in this invocation. A missing or failed review reduces coverage; do not replace it by asking another reviewer to inspect several sessions.

## Verify recurrence

Combine semantically equivalent observations, then verify each cited excerpt against its projection. Keep a finding only when:

- the cited IDs exist and the text supports the claim;
- the same material pattern appears in at least two selected sessions; and
- the supporting entry IDs are distinct, so copied or forked conversation evidence is not counted twice.

Discard unsupported interpretations, one-off mistakes, generic advice, and preferences that Ryan did not express through observable interaction. Do not fill evidence gaps with excluded thinking or tool payloads. Keep recurring effective patterns as constraints on any proposal rather than manufacturing changes to them.

A shared label is not enough to establish one cause. Before keeping a theme, check that one candidate change could plausibly improve every cited occurrence. Split or discard a grouping when its evidence needs different remedies.

## Research only what changes a proposal

Inspect the exact current instruction, skill, hook, test, and relevant recent history behind each verified theme before proposing a change. Classify the gap as one of: a missing rule, a conflict between rules, a rule the agent failed to follow, a repeated correction that suggests the rule itself may be wrong, or behavior already addressed after the cited sessions.

Do not call required behavior an execution failure. If the agent followed the current rule but Ryan repeatedly corrected the result, name the instruction conflict and propose changing or testing that rule only when the evidence shows one consistent preference. If the agent repeatedly failed to follow a current rule and no focused check covers it, a replay proposal is valid; do not add duplicate wording.

Before returning a proposal, run a contradiction pass. Find the strongest current rule, history, effective counterexample, or alternate reading against its `Gap` and `Try`. If that evidence changes the cause or remedy, rewrite or discard the proposal. Treat behavior directly fixed after all cited sessions as resolved unless later evidence shows recurrence.

Use `research` and current primary web sources only when an external fact is necessary to choose or test a response to a verified theme. Do not run a general best-practices search, research unrelated themes, or let external advice override the session evidence.

## Challenge draft proposals

Before writing the report, give each draft proposal to one fresh lightweight challenger. Supply only that proposal, its cited projections, the exact current surfaces and tests inspected, the relevant history evidence, and the strongest counterexample found. The challenger must return `keep`, `revise`, or `drop` after checking:

- every complete evidence ID and excerpt;
- recurrence across distinct sessions;
- one shared cause and a change that would alter every cited sequence before Ryan's correction;
- current rules, tests, relevant history, and the strongest counterexample; and
- whether the replay starts from the original pre-correction request and could disprove the proposal rather than merely confirm it.

The challenger must give a short reason for `keep`, `revise`, or `drop`, citing the decisive evidence ID or current surface. It may correct the proposal but must not introduce a new theme. Apply one bounded factual correction when the evidence settles it. Drop the proposal when the parent and challenger still disagree about its cause or remedy; do not start an open-ended debate or another challenge round.

## Return small experiments

Read `clear-writing`, then apply it to every proposal and the coverage paragraph. Return one to three proposals when verified findings support them. For each proposal, state:

- **Observed:** the recurring behavior and its distinct, complete `sessionId` / `entryId` evidence; never abbreviate an evidence ID;
- **Gap:** the exact current file and section inspected, what it requires today, and whether the problem is missing, conflicting, unenforced, already addressed, or likely a wrong rule;
- **Try:** the smallest change worth testing;
- **Replay:** the smallest scenario starting from the original pre-correction request that tests the shared cause, plus another scenario when materially different evidence paths need separate coverage;
- **Signal:** the visible improvement expected in every cited occurrence without breaking an effective pattern; and
- **Trade-off:** the most likely downside or new failure mode.

Write for Ryan, not for an evaluation system. Use plain project language, short evidence excerpts, and one term for each concept. Prefer a narrow wording or routing change over new machinery. Do not implement a proposal in this invocation. If no recurring problem survives verification, say so and return no proposal rather than inventing one.

Lead with the proposals. Keep selection coverage and limitations to one short closing paragraph. Remove the temporary projections after the report is complete or if the run stops early. Then stop and let Ryan choose whether to act.
