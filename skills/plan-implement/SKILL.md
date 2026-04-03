---
name: plan-implement
description: Execute an implementation plan adaptively — pick highest-value steps, test continuously, check in between milestones. Use after /skill:plan-create.
---

# Plan Implementation

## Rules

- **PLAN IS COMPASS, NOT RAILS**: Adapt as you learn — update the plan doc when reality diverges
- **RATCHET FORWARD**: Every step ends with tests passing. Never break what works.
- **TEACH AS YOU GO**: Explain what you're doing, why, and how it connects to the plan
- **TRACK DEVIATIONS**: Log off-script changes in the Deviations section
- **CHECK IN**: Ask the user between milestones — don't assume they want to continue

## Process

### 1. Load Plan

Find `thoughts/ryan/plans/YYYY-MM-DD-[slug].md` by date pattern or argument. List available if ambiguous.

Read plan doc. Extract: Status, Goal, Approach, Decisions, Done, Remaining Intent (with dependencies), Verification.

Update Status to "In Progress" if not already.

### 2. Adaptive Implementation Loop

**a) Pick next step** — Select the highest-value intent from Remaining Intent, respecting `_after:` dependencies. Skip blocked milestones.

**b) Explain** — Before coding, explain:
- What you're about to do and which intent it addresses
- Why this approach (connect to Decisions)
- What files will change

**c) Implement** — Write the code. Follow existing patterns in the codebase.

**d) Test** — Run automated verification commands from the plan. Report pass/fail with context.

**e) Update plan doc** — Move completed intents to Done. Update Remaining Intent. Log any deviations.

**f) Sync thoughts**:
```bash
humanlayer thoughts sync
```

**g) Check in** — Between milestones, report progress and ask the user what to do next:

- **Step complete.** Ratchet: M/N green.
- **Evaluator findings** (if any): correctness, robustness, simplicity, security observations
- Options: Continue to next step, Fix findings first, Verify this milestone, Commit current progress

If any evaluator flags a security vulnerability or correctness bug, surface it prominently and recommend addressing it before continuing.

If user wants to verify a milestone: update plan doc (Done + Notes), then suggest running `/skill:plan-verify [slug]`.

If user wants to save and pause: update plan doc Notes, then suggest running `/skill:plan-implement [slug]` when ready to resume.

**h) Loop** back to (a) until Remaining Intent is empty or user stops.

### 3. Verify

When Remaining Intent is addressed:

**Ratchet** — Confirm all milestone tests are green (N/N). If any remain red, list them as incomplete milestones.

**Automated** — Run all commands from Verification > Automated. Report pass/fail with explanations.

**Manual** — Present Verification > Manual steps as a testing guide.

**Deviations** — Surface all off-script changes for review.

Suggest running `/skill:plan-verify` for thorough pass/fail tracking.

### 4. Complete

Update plan doc Status. Present summary:
- What was built and why
- Deviations and their reasoning
- Test results

Prompt next steps:
```
Implementation complete.

Next steps:
- Run /skill:plan-verify [slug] to run verification checks
  — or —
- Run /skill:commit-simple to commit your changes
```
