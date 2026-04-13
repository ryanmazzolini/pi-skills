---
name: plan-implement
description: Execute a workflow plan adaptively — pick highest-value steps, test continuously, check in between milestones. Use after /skill:plan-create.
---

# Plan Implementation

## Rules

- **PLAN IS COMPASS, NOT RAILS**: Adapt as you learn — update `plan.md` when reality diverges
- **RATCHET FORWARD**: Every step ends with tests passing. Never break what works.
- **TEACH AS YOU GO**: Explain what you're doing, why, and how it connects to the plan
- **TRACK DEVIATIONS**: Log off-script changes in the Deviations section
- **CHECK IN**: Ask the user between milestones — don't assume they want to continue

## Process

### 1. Load Plan

Resolve the plan target in this order:
1. If the argument is a workflow directory under `thoughts/ryan/plans/YYYY-MM-DD-[slug]/`, read `plan.md` inside it.
2. If the argument is a `plan.md` path, use it directly.
3. If the argument is a legacy flat plan file, use it directly.
4. If no argument is provided, prefer the most recently touched workflow `plan.md`, then fall back to the most recently touched legacy flat plan.

Read the plan doc. Extract: Status, Goal, Approach, Decisions, Done, Remaining Intent, Verification.
Update Status to `In Progress` if needed.

### 2. Adaptive Implementation Loop

1. Pick the highest-value intent from Remaining Intent, respecting `_after:` dependencies.
2. Explain what will change, why this approach fits, and which files will change.
3. Implement the code.
4. Run automated verification commands from the plan.
5. Update `plan.md` (Done, Remaining Intent, Deviations, Notes as needed).
6. Run:
   ```bash
   humanlayer thoughts sync
   ```
7. Check in with the user between milestones.

If a correctness or security bug is found, surface it prominently and recommend fixing it before continuing.

### 3. Verify

When Remaining Intent is addressed:
- confirm all milestone tests are green
- run all commands from `Verification > Automated`
- present `Verification > Manual` as a testing guide
- surface Deviations for review

Suggest `/skill:plan-verify [workflow dir or plan.md]` for a thorough pass.

### 4. Complete

Update plan Status. Present summary:
- what was built and why
- deviations and their reasoning
- test results

```text
Implementation complete.

Next steps:
- Run /skill:plan-verify [workflow dir or plan.md]
  — or —
- Run /skill:commit-simple to commit your changes
```
