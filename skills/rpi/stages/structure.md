# Structure stage

Use after design to turn the selected approach into vertical slices, milestones, dependencies, and verification strategy.

## Rules

- Prefer tracer-bullet vertical slices over horizontal phases.
- Make dependencies explicit.
- Identify AFK/HITL boundaries when delegation or autonomy matters.
- Keep slices independently demonstrable where possible.

## Output

Write `{workflow-dir}/structure.md` with:

```md
---
source: {repo basename}
date: YYYY-MM-DD
type: structure
goal: [one sentence]
---

# [Feature/System]

## Slices

### [Slice]
- Outcome:
- Why:
- Dependencies:
- AFK/HITL:

## Milestones

## Verification Strategy

## Risks

## Suggested Next Step
```
