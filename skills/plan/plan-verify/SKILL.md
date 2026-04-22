---
name: plan-verify
description: Run automated tests and walk through manual verification against a workflow plan. Use after implementation or to re-verify.
---

# Plan Verification

## Rules

- **AUTOMATED FIRST**: Run test commands before manual steps
- **STEP BY STEP**: Present manual tests one at a time, record results
- **DEVIATIONS REVIEWED**: Surface all off-script changes for decision
- **EXPLAIN FAILURES**: Diagnose what went wrong and suggest fixes

## Process

### 1. Load Plan

Resolve the plan target in this order:
1. If the argument is a workflow directory under `{plans-root}/YYYY-MM-DD-[slug]/`, read `plan.md` inside it.
2. If the argument is a `plan.md` path, use it directly.
3. If the argument is a legacy flat plan file, use it directly.
4. If no argument is provided, prefer the most recently touched workflow `plan.md`, then fall back to the most recently touched legacy flat plan.

Read Verification and Deviations sections.

### 2. Automated Tests

Run each command from **Verification > Automated**.
For each:
- **Pass**: report briefly
- **Fail**: explain what failed, likely cause, suggested fix

Summary: `N/M automated checks passing.`

### 3. Manual Testing Guide

Present **Verification > Manual** steps one at a time.
For each step, describe the action and expected result, then ask if it passed, failed, or should be skipped.

### 4. Deviation Review

If the Deviations section has entries, present each and ask whether to keep, revert, or adapt the plan.

### 5. Report

Summarize:
- automated pass/fail
- manual pass/fail/skip
- deviations kept/reverted/adapted
- overall ready to ship or needs work

Update plan Status if all verification passes.

```bash
humanlayer thoughts sync
```

If remaining work exists:
```text
Verification complete. Remaining intents to address.

Next steps:
- Run /skill:commit-simple to commit verified work
- Run /skill:plan-implement [workflow dir or plan.md] to continue
```

If all intents are addressed:
```text
Verification complete — all intents addressed.

Next step:
- Run /skill:commit-simple to commit your changes
```
