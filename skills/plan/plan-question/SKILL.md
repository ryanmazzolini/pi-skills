---
name: plan-question
description: Surface the highest-leverage unknowns and frame the workflow before broader research begins.
---

# Question Stage

## Rules

- Clarify the problem before researching solutions
- Treat the workflow directory as the durable source of truth
- Focus on unknowns, assumptions, scope, and success criteria
- Prefer 3-7 sharp questions over long questionnaires
- End with a durable `question.md`, not implementation advice

## Process

### 1. Load Context

Treat the input as a workflow handoff. If it includes a workflow directory such as
`thoughts/ryan/plans/YYYY-MM-DD-[slug]/`, use that directory.

Extract:
- the workflow directory
- the goal
- any existing artifact paths already present in the directory
- open assumptions or missing constraints

If the directory does not exist yet, create it before writing artifacts.

### 2. Run the Question Pass

Ask the smallest set of high-leverage questions needed to frame research well. Prioritize:
- problem statement and user value
- scope boundaries and explicit non-goals
- technical or product constraints
- success criteria
- known risks or areas of uncertainty

If the handoff already answers most questions, do not ask redundant ones. Instead, summarize the inferred context and ask for confirmation on the remaining gaps.

### 3. Write the Durable Artifact

Write `question.md` into the workflow directory:

`thoughts/ryan/plans/YYYY-MM-DD-[slug]/question.md`

Use this shape:

```markdown
---
source: {repo basename}
date: YYYY-MM-DD
type: workflow-stage
stage: question
goal: [one sentence goal]
---

# Question

## Problem
[1-2 sentence framing]

## Known Facts
- ...

## Unknowns
- ...

## Constraints
- ...

## Success Criteria
- ...

## Research Brief
- **Goal**: ...
- **Unknowns to research**: ...
- **Evidence to gather**: ...
```

### 4. Handoff

After writing `question.md`, explain what was captured and suggest the next fresh-session transition:

```text
Question stage complete.

Artifact written:
- thoughts/ryan/plans/YYYY-MM-DD-[slug]/question.md

Next step:
- Run /plan-next to continue in a fresh /skill:plan-research session
  — or —
- Stay here and refine question.md first
```
