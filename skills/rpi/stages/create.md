# Create plan stage

Use after structure or when enough context exists to write the durable implementation plan.

## Rules

- Build from workflow artifacts, not memory alone.
- Present key options before committing to a plan.
- `Remaining Intent` describes outcomes, not mechanical tasks.
- Keep `plan.md` concise and durable.
- Choose an execution tracker: local board, no board for small work, or deferred/shared tracker.

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
