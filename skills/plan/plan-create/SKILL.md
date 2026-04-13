---
name: plan-create
description: Distill workflow artifacts into an implementation plan with options analysis and intent shaping. Use after research/design/structure or when you have enough context to plan.
---

# Plan Creation

## Rules

- **ARTIFACT-FIRST**: Build from workflow artifacts, not memory alone
- **OPTIONS-FIRST**: Present 2-4 approaches with detailed context, user picks
- **GOALS NOT TASKS**: Remaining Intent describes outcomes, not checkbox items
- **TEACH**: Explain WHY at every step — patterns, tradeoffs, reasoning
- **LEAN PLANS**: Keep `plan.md` concise and durable
- **ASK WHEN UNCLEAR**: Clarify before assuming

## Process

### 1. Load Context

Prefer a workflow directory input such as:

`thoughts/ryan/plans/YYYY-MM-DD-[slug]/`

When a workflow directory is available:
- read `question.md`, `research.md`, `design.md`, and `structure.md` if they exist
- treat them as the canonical inputs
- write the final plan to `plan.md` in the same directory

If the user gives only a legacy research file or plain text description, use that context but still prefer writing a workflow-local `plan.md` when feasible.

Summarize the findings and proposed structure before moving on.

### 2. Define the Feature Iteratively

Converge on WHAT before exploring HOW.

Ask 1-4 clarifying questions about:
- problem/solution fit
- scope boundaries
- success criteria
- technical constraints

### 3. Options Analysis

Identify the key decisions. Use the earlier workflow artifacts as the starting point.
For each decision:
- compare approaches
- explain tradeoffs
- ask the user to choose when needed

Record each choice for the Decisions section.

### 4. Shape Intent

Write outcome-oriented Remaining Intent, grouped by concern and milestone.
Keep dependencies minimal.
Also define Verification with automated and manual checks.

### 5. Write the Durable Plan

Write `plan.md` in the workflow directory:

`thoughts/ryan/plans/YYYY-MM-DD-[slug]/plan.md`

```markdown
---
source: {repo basename}
date: YYYY-MM-DD
type: plan
goal: [one sentence outcome]
---

# [Feature Name]

**Status**: Planning | **Goal**: [one sentence outcome]
**Workflow**: thoughts/ryan/plans/YYYY-MM-DD-[slug]/

## Artifacts
- Question: ./question.md
- Research: ./research.md
- Design: ./design.md
- Structure: ./structure.md

## Approach
[Selected strategy]
**Why**: [reasoning]

## Decisions
- [Decision]: [choice] — [why this fits]

## Done

## Remaining Intent

### [Concern area]
#### [Milestone]
- [Goal-oriented outcome]

## Deviations

## Verification

### Automated
- [test commands]

### Manual
1. [Verification steps]

## Notes
```

After writing, sync thoughts and suggest the next step:

```bash
humanlayer thoughts sync
```

```text
Plan stage complete.

Artifact written:
- thoughts/ryan/plans/YYYY-MM-DD-[slug]/plan.md

Next step:
- Run /plan-next to continue in a fresh /skill:plan-implement session
```
