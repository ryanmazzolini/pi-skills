---
name: plan-save
description: Checkpoint current session progress to `plan.md`. Use before pausing or ending a session.
---

# Session Checkpoint

## Rules

- **PLAN DOC IS CHECKPOINT**: Write session state to the Notes section
- **CONCISE**: Summary, not transcript — enough to resume cold
- **PRESERVE SECTIONS**: Only update Notes, Done, Remaining Intent, Deviations
- **UPDATE ONLY**: Write to the plan doc, leave code and git untouched

## Process

### 1. Load Plan

Resolve the plan target in this order:
1. If the argument is a workflow directory under `{plans-root}/YYYY-MM-DD-[slug]/`, update `plan.md` inside it.
2. If the argument is a `plan.md` path, use it directly.
3. If the argument is a legacy flat plan file, use it directly.
4. If no argument is provided, prefer the most recently touched workflow `plan.md`, then fall back to the most recently touched legacy flat plan.

### 2. Capture Session State

Assess and summarize:
- **Progress**
- **Current work**
- **Findings**
- **Blockers**
- **Next step**

### 3. Write Checkpoint

Update the plan doc **Notes** section:

```markdown
## Notes
**Last session**: YYYY-MM-DD
**Status**: [milestone-level summary]

**In progress**: [what was being worked on]

**Findings this session**:
- ...

**Blockers**:
- ...

**Suggested next step**: ...
```

Also update **Done** and **Remaining Intent** if stale.

Sync thoughts after writing:
```bash
humanlayer thoughts sync
```

```text
Checkpoint saved to plan.md

To resume later:
- Run /skill:plan-implement [workflow dir or plan.md]
```
