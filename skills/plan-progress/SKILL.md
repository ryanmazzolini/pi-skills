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

If no argument is provided, default to the most recently touched plan, not the newest filename-dated plan. If those differ, mention both briefly and use the touched plan unless context clearly points elsewhere.

Read and extract: Status, Goal, Done, Remaining Intent, Deviations, Notes.

### 2. Assess Progress

Count and categorize at milestone level:
- **Done milestones**: Milestones fully completed
- **In-progress milestones**: Milestones with some intents done
- **Blocked milestones**: Milestones with unmet `_after:` dependencies
- **Remaining milestones**: Not yet started
- **Deviations**: Off-script changes tracked
- **Blockers**: Any blockers mentioned in Notes

Estimate completion: done milestones / total milestones.

### 3. Report

```
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
[One of:]
- "Continue implementing — next milestone is [X]. Run `/skill:plan-implement [slug]`."
- "All milestones addressed — verify with `/skill:plan-verify [slug]`."
- "[Milestone] is blocked by [dependency] — resolve that first."
- "Save progress first — run `/skill:plan-save [slug]`."
```
