---
name: plan-design
description: Align on current state, desired state, and key technical choices before structuring or planning the work.
---

# Design Stage

## Rules

- Align on the design before writing the full implementation plan
- Use the workflow directory artifacts as inputs, not the chat transcript alone
- Compare a small number of design directions with clear tradeoffs
- Keep the output compact and reviewable
- End with durable `design.md`, not a detailed task plan

## Process

### 1. Load Context

Treat the input as a workflow handoff. Use the workflow directory if provided.
Read `research.md` and `question.md` when they exist.

Summarize:
- the problem
- the important findings from research
- the current system or workflow shape
- the desired future state

### 2. Surface Key Design Choices

Identify 2-5 design decisions that materially change the implementation shape.
For each decision:
- explain the realistic options
- connect them to research evidence or codebase constraints
- call out the main tradeoffs

Ask the user to choose when the direction is not already clear.

### 3. Write the Durable Artifact

Write `design.md` into the workflow directory:

`{plans-root}/YYYY-MM-DD-[slug]/design.md`

```markdown
---
source: {repo basename}
date: YYYY-MM-DD
type: workflow-stage
stage: design
goal: [one sentence goal]
---

# Design

## Current State
- ...

## Target State
- ...

## Key Decisions
- [Decision]: [choice] — [why]

## Chosen Approach
[Short narrative]

## Risks / Open Questions
- ...
```

### 4. Handoff

```text
Design stage complete.

Artifact written:
- {plans-root}/YYYY-MM-DD-[slug]/design.md

Next step:
- Run /plan-next to continue in a fresh /skill:plan-structure session
  — or —
- Stay here and resolve the remaining design questions first
```
