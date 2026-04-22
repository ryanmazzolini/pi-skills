---
name: plan-structure
description: Turn an aligned design into slices, milestones, and dependencies before writing the final implementation plan.
---

# Structure Stage

## Rules

- Convert the agreed design into implementation shape
- Think in vertical slices and coherent milestones
- Keep dependencies explicit and minimal
- Stay outcome-oriented; do not write `plan.md` yet
- Produce durable `structure.md` for `/skill:plan-create`

## Process

### 1. Load Context

Treat the input as a workflow handoff. Use the workflow directory if provided.
Read `question.md`, `research.md`, and `design.md` when they exist.

Summarize the agreed design direction before proposing structure.

### 2. Shape the Work

Break the work into a small number of coherent milestones.
For each milestone, define:
- the user or system outcome it unlocks
- which components or concerns it touches
- what must happen before it can start

Prefer slices that can be verified independently.

### 3. Write the Durable Artifact

Write `structure.md` into the workflow directory:

`{plans-root}/YYYY-MM-DD-[slug]/structure.md`

```markdown
---
source: {repo basename}
date: YYYY-MM-DD
type: workflow-stage
stage: structure
goal: [one sentence goal]
---

# Structure

## Proposed Milestones

### [Concern area]
#### [Milestone]
- Outcome
- Outcome

#### [Milestone]
_after: [Dependency]_
- Outcome

## Sequencing Notes
- ...

## Verification Notes
- ...
```

### 4. Handoff

```text
Structure stage complete.

Artifact written:
- {plans-root}/YYYY-MM-DD-[slug]/structure.md

Next step:
- Run /plan-next to continue in a fresh /skill:plan-create session
  — or —
- Stay here and adjust the slices and dependencies first
```
