# Create plan stage

Use after structure or when enough context exists to write the durable implementation plan.

## Rules

- Build from workflow artifacts, not memory alone.
- Present key options before committing to a plan.
- Use HITL judgment before committing to a plan that changes shared contracts, architecture, rollout,
  or execution ownership.
- `Remaining Intent` describes outcomes, not mechanical tasks.
- Keep `plan.md` concise and durable.
- Choose an execution tracker: local board, no board for small work, or deferred/shared tracker.

## HITL Checkpoint

Before writing or materially changing `plan.md` when tradeoffs matter, summarize the intended plan in
chat:

- selected approach and why
- major interfaces or contracts the plan relies on
- key slices/milestones
- execution tracker recommendation
- user decisions still needed

Ask one focused question with a recommended answer, then write/update the plan after the user
responds.

## Output

Write `{workflow-dir}/plan.md`:

```md
---
source: {repo basename}
date: YYYY-MM-DD
type: plan
goal: [one sentence]
---

# [Feature Name]

**Status**: Planning | **Goal**: [one sentence outcome]
**Workflow**: {workflow-dir}/

## Artifacts
- Question: ./question.md
- Research: ./research.md
- Design: ./design.md
- Structure: ./structure.md

## Approach
[Selected strategy]
**Why**: [reasoning]

## Architecture / Interfaces

## Decisions
- [Decision]: [choice] — [why]
- Execution tracker: [local board | no board for small work | deferred/shared tracker] — [why]

## Done

## Remaining Intent

### [Concern area]
#### [Milestone]
- [Goal-oriented outcome]

## Deviations

## Verification

### Automated
- [commands]

### Manual
1. [steps]

## Notes
```

After writing, ask whether to continue in-session or hand off fresh for board/implementation.
