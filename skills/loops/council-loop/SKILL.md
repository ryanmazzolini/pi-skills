---
name: "council-loop"
description: "Improve work in rounds until a council of model scorers rates it at a target score against a rubric and a baseline."
disable-model-invocation: true
---

# Council Loop

Run rounds of implement, score and record until a council of scorer models rates the work at the target score. Unlike a review loop, the bar is a score against a rubric and a baseline, not reviewer approval.

## 1. Set up the loop

Draft each item below from the user's request and the current system, and recommend anything the user did not state. Keep the work item at `projects/<project>/work/<work-item>/index.md` in the profile's vault: goal, council, fixtures, baseline, comparisons, target, rounds table and decisions. Link to the scorer brief; keep the rubric, task tests and pass rule only there. Keep each document readable in a couple of minutes (about 100 lines or fewer). Record decisions, not procedures already defined by this skill or the repo, such as validation commands or stop rules.

- **Goal and reader.** Say what outcome the work serves and who uses it, in what situation. Derive everything else from this. Leave out criteria the reader does not need, even when a general heuristic suggests them.
- **Council.** List the scorer models with their reasoning level, and say whether they score together or in sequence. In sequence, a later model joins once the earlier one reaches the target. Name the implementer separately. In Pi, route models with `agent-coordination`; elsewhere use the harness's subagent tool. If a named model is unavailable, report it instead of substituting.
- **Rubric.** Lead with task tests that check the goal directly. Each test needs a pass condition, such as "reach the worst finding in 2 actions or fewer". Add weighted criteria that explain why a task failed. Score each criterion 0–10 against anchors: 3 = gets in the way, 6 = usable but the reader does extra work, 9 = the reader barely notices it. Give each criterion a concrete description of a 9.
- **Fixtures.** Pick a small set of real inputs that cover the typical case and the hard case. When using comparisons, prefer fixtures they have already reviewed or produced output for. If the user wants comparisons and the chosen fixtures have none, propose additional fixtures that do, such as public inputs those tools already reviewed.
- **Baseline and comparisons.** The baseline is the current output, scored as round 0. Record the revision the baseline was produced from and list any uncommitted changes it includes. Comparisons are optional fixed references scored the same way, such as another tool's output or an earlier design. Use only real output for the same fixtures and record its source. Saved captures of real output count. Never simulate a comparison; if no real output exists, leave it out.
- **Target and pass rule.** State the overall score, the minimum for any single criterion, and which task tests must pass.

Write a scorer brief that every target and round shares, so scores stay comparable. It names the reader, what to score, how to run the task tests, the rubric, the pass rule, and the structured output to return.

Setup is done when the work item and linked scorer brief are complete and the user has approved them. Stop for that approval.

## 2. Score round 0

Each active council model scores the baseline and each comparison, per fixture, in its own fresh context. Fresh means no earlier scores or session history, so past results can't anchor the next score. A model that joins later also scores the baseline and comparisons once, in fresh contexts.

Start the rounds table with any comparison rows, then add one row per scorer per round below them:

| Round | Scorer | Change | Fixture A | Fixture B | Overall | Tasks | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Comparison X | Sol | Other tool's review | 6.1 | – | 6.1 | 3/4 | |
| 0 | Sol | Baseline, no changes | 4.5 | 3.0 | 3.8 | 1/8 | [r0](rounds/r0/round.md) |

Compute the weighted mean of the criteria per fixture, then average across fixtures for each model. The criterion floor and required task tests apply to every fixture. Record a missing score as `no score`, never an estimate; it cannot pass. Add per-criterion detail, with each round next to the matching comparison, in the round note.

Present the table and propose round 1. Stop for approval unless the user has authorized continuing until the target.

## 3. Run each round

1. Write the implementer brief to `rounds/rN/brief.md`. Give it the goal, the changes approved for this round, what must stay unchanged, and the checks to run.
2. Have the implementer make the changes, then run the checks yourself.
3. Produce the fixture outputs and score them with fresh scorers, as in round 0.
4. Add the scorer rows to the table, and write the scores, outputs and notable findings to `rounds/rN/round.md`. Log decisions with their dates in the work item.
5. Propose the next round from the scorers' highest-impact suggestions. Push back on suggestions that grow the scope beyond the goal.

A round is done when its scorer rows and round note are committed to the vault. Stop after each round for approval, unless the user has said to continue until the target.

## Stop

Stop and report when every council model passes on the same round.

Stop and ask the user when:

- a scorer's overall score has not improved for two rounds;
- scorers differ by more than 2 points on the same fixture;
- the rubric or a skill starts pulling the work away from the goal;
- reaching the target needs a change outside the agreed scope.

The final report gives the table, what changed, and what remains below 9.
