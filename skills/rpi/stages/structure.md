# Structure stage

Use after design to turn the selected approach into vertical slices, milestones, dependencies,
architectural boundaries, and verification strategy.

Load `references/architecture.md` when slices depend on domain boundaries, module interfaces,
service contracts, or non-trivial testing strategy.

## Rules

- Prefer tracer-bullet vertical slices over horizontal phases.
- Make dependencies explicit.
- Identify AFK/HITL boundaries when delegation or autonomy matters.
- Keep slices independently demonstrable where possible.
- Name anticipated architectural interfaces and which slice proves each boundary.
- Pause for user judgment before locking in slice order, interface shape, or shared contract changes
  when tradeoffs matter.

## HITL Checkpoint

Before writing the final structure when architecture or sequencing matters, give the user a compact
overview:

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
- Outcome:
- Why:
- Boundary proved:
- Dependencies:
- AFK/HITL:

## Milestones

## Verification Strategy

## Risks

## Suggested Next Step
```
