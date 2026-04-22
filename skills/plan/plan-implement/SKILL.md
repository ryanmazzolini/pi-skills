---
name: plan-implement
description: Execute a workflow plan adaptively — pick highest-value steps, test continuously, check in between milestones. Use after /skill:plan-create.
---

# Plan Implementation

## Rules

- **PLAN IS COMPASS, NOT RAILS**: Adapt as you learn — update `plan.md` when reality diverges
- **TEST-FIRST**: Write all milestone tests upfront before implementing. Tests are the executable spec.
- **RATCHET FORWARD**: Every step ends with the full suite green. A test that went green stays green — any regression is fixed immediately before proceeding.
- **TEACH AS YOU GO**: Explain what you're doing, why, and how it connects to the plan
- **TRACK DEVIATIONS**: Log off-script changes in the Deviations section
- **EVALUATE**: After each milestone's tests pass, run 4 parallel reviews (correctness, robustness, simplicity, security). Findings are informational context for the user, never a gate. Silent on failure.
- **CHECK IN**: Ask the user between milestones — don't assume they want to continue

## Process

### 1. Load Plan

Resolve the plan target in this order:
1. If the argument is a workflow directory under `{plans-root}/YYYY-MM-DD-[slug]/`, read `plan.md` inside it.
2. If the argument is a `plan.md` path, use it directly.
3. If the argument is a legacy flat plan file, use it directly.
4. If no argument is provided, prefer the most recently touched workflow `plan.md`, then fall back to the most recently touched legacy flat plan.

Read the plan doc. Extract: Status, Goal, Approach, Decisions, Done, Remaining Intent, Verification.
Update Status to `In Progress` if needed.

### 1.5. Write Test Suite

Before implementing, write one failing test per milestone in Remaining Intent.

- Derive assertions from each milestone's outcome bullets
- Use the project's existing test framework and conventions
- Milestones the user marks as not testable (UI, config, infra) get tagged `[manual]` and fall back to manual verification — exclude them from the ratchet count
- Run the full test suite to confirm the new tests fail (red). Report the baseline: `0/N green`.

### 2. Adaptive Implementation Loop

1. Pick the highest-value intent from Remaining Intent, respecting `_after:` dependencies.
2. Explain what will change, why this approach fits, and which files will change.
3. Implement the code.
4. Run the full test suite.
   - Confirm the target milestone's test now passes (green)
   - Confirm all previously-green tests still pass — any regression is fixed before proceeding
   - Report ratchet progress: `M/N green`
5. Spawn 4 parallel reviews (use whichever subagent or review mechanism the workspace provides). Each returns 1-3 focused bullets, or nothing if the dimension is clean. If a review fails or times out, omit its section silently — do not surface the error.
   - **Correctness** — does the code actually satisfy the milestone outcomes? (logic errors, off-by-one, unhandled edge cases, broken invariants, incorrect API usage)
   - **Robustness / Maintainability** — will this hold up under real-world conditions and future changes? (boundary error handling at trust boundaries, readable naming, coupling, testability — flag only plausible failures, not defensive code for impossible states)
   - **Simplicity** — is anything over-engineered? (unnecessary abstractions, dead code, missed reuse of existing utilities — three similar lines beat a premature abstraction)
   - **Security** — does this introduce vulnerabilities? (OWASP Top 10, secrets in code, unsafe input handling, path traversal, unsafe dynamic execution)
6. Update `plan.md` (Done, Remaining Intent, Deviations, Notes as needed).
7. Run:
   ```bash
   humanlayer thoughts sync
   ```
8. Check in with the user. Surface consolidated review findings (omit dimensions with nothing to report). If correctness or security flags a real issue, highlight it and recommend addressing it before continuing.

### 3. Verify

When Remaining Intent is addressed:
- confirm all milestone tests are green (N/N). If any remain red, list them as incomplete milestones.
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
