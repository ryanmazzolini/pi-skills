# Structure stage

Optional playbook. Use when sequencing is too complex for the PRP plus `board/index.md`, or when the team needs to reason about dependencies before creating execution slices.

Load `references/architecture.md` when slices depend on domain boundaries, module interfaces, service contracts, or non-trivial testing strategy.

## Rules

- Prefer vertical slices over horizontal layers.
- Make dependencies explicit without implying a total order where none exists.
- Identify AFK/HITL boundaries when delegation or autonomy matters.
- Keep slices independently demonstrable where possible.
- Name anticipated architectural interfaces and which slice proves each boundary.
- Pause for user judgment before locking in slice order, interface shape, or shared contract changes when tradeoffs matter.
- Feed the result back into `plan.md` and `board/index.md`; do not create a parallel execution tracker.

## HITL Checkpoint

Before writing the final structure when architecture or sequencing matters, give the user a compact overview:

- proposed vertical slices and why this order
- interfaces/boundaries the plan will introduce or change
- what each slice proves
- AFK/HITL checkpoints and likely review moments

Then ask one focused question with a recommended answer. Example:

```text
Question: Should we prove the new boundary with a small tracer slice before migrating all callers?

Recommended answer: Yes — it reduces contract risk and gives us a boundary test before broader migration.
```

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

## Plan Overview

## Architectural Interfaces

## Slices

### [Slice]

- End state:
- Why:
- Boundary proved:
- Dependencies:
- AFK/HITL:
- Verification:

## Dependency Notes

## Verification Strategy

## Risks

## PRP / Board Impact

## Suggested Next Step
```
