---
name: plan-progress
description: Check progress on a plan — what's done, what remains, and suggested next action. Use anytime to get bearings.
---

# Plan Progress

## Rules

- **READ-ONLY**: Never modify the plan doc
- **CONCISE**: Summary fits in one screen
- **HONEST**: Surface blockers and deviations, don't sugarcoat
- **ACTIONABLE**: Always end with a suggested next step

## Process

### 1. Load Plan

Resolve the plan target in this order:
1. If the argument is a workflow directory under `thoughts/ryan/plans/YYYY-MM-DD-[slug]/`, read `plan.md` inside it.
2. If the argument is a `plan.md` path, use it directly.
3. If the argument is a legacy flat plan file under `thoughts/ryan/plans/*.md`, use it directly.
4. If no argument is provided, prefer the most recently touched `plan.md` in a workflow directory; if none exist, fall back to the most recently touched legacy flat plan.

Read and extract: Status, Goal, Done, Remaining Intent, Deviations, Notes.

### 2. Assess Progress

Count and categorize at milestone level:
- **Done milestones**
- **In-progress milestones**
- **Blocked milestones**
- **Remaining milestones**
- **Deviations**
- **Blockers**

Estimate completion: done milestones / total milestones.

### 3. Report

```text
# [Plan Name] — Progress

**Status**: [from plan doc]
**Goal**: [one-liner from plan]
**Progress**: [N of M milestones complete]

## Done
### [Concern area]
- **[Milestone]**: [1-line summary]

## In Progress
### [Concern area]
- **[Milestone]**: [what's done, what remains]

## Blocked
- **[Milestone]** — waiting on: [dependency milestone]

## Remaining
### [Concern area]
- **[Milestone]**: [intent summary]

## Deviations
- [off-script changes, if any]
[or "None"]

## Suggested Next
- [Specific next command]
```
