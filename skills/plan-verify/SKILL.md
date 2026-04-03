---
name: plan-verify
description: Run automated tests and walk through manual verification against a plan. Use after implementation or to re-verify.
---

# Plan Verification

## Rules

- **AUTOMATED FIRST**: Run test commands before manual steps
- **STEP BY STEP**: Present manual tests one at a time, record results
- **DEVIATIONS REVIEWED**: Surface all off-script changes for decision
- **EXPLAIN FAILURES**: Diagnose what went wrong and suggest fixes

## Process

### 1. Load Plan

Find `thoughts/ryan/plans/YYYY-MM-DD-[slug].md`. Read Verification and Deviations sections.

### 2. Automated Tests

Run each command from **Verification > Automated**.

For each:
- **Pass**: report briefly
- **Fail**: explain what failed, likely cause, suggested fix

Summary: "N/M automated checks passing."

### 3. Manual Testing Guide

Present **Verification > Manual** steps one at a time.

For each step, describe the action and expected result, then ask if it passed, failed, or should be skipped.

For failures: ask what happened, diagnose, suggest fix.

Summary: "N/M manual checks passing, K skipped."

### 4. Deviation Review

If **Deviations** section has entries, present each and ask the user:
- **Keep** — accept and update plan to reflect it
- **Revert** — undo this change
- **Adapt plan** — rethink approach to account for this

For "adapt": update plan doc Approach/Decisions/Remaining Intent.

### 5. Report

Summary:
- Automated: pass/fail
- Manual: pass/fail/skip
- Deviations: kept/reverted/adapted
- Overall: ready to ship or needs work

Update plan doc **Status** if all verification passes.

```bash
humanlayer thoughts sync
```

Check if **Remaining Intent** still has unaddressed items.

**If remaining work exists:**
```
Verification complete. Remaining intents to address.

Next steps:
- Run /skill:commit-simple to commit verified work
- Run /skill:plan-implement [slug] to continue
```

**If all intents addressed:**
```
Verification complete — all intents addressed.

Next steps:
  Run /skill:commit-simple to commit your changes
```
