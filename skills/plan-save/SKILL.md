---
name: plan-save
description: Checkpoint current session progress to plan doc. Use before pausing or ending a session.
---

# Session Checkpoint

## Rules

- **PLAN DOC IS CHECKPOINT**: Write session state to the Notes section
- **CONCISE**: Summary, not transcript — enough to resume cold
- **PRESERVE SECTIONS**: Only update Notes, Done, Remaining Intent, Deviations
- **UPDATE ONLY**: Write to the plan doc, leave code and git untouched

## Process

### 1. Load Plan

Find `thoughts/ryan/plans/YYYY-MM-DD-[slug].md` by date pattern. List available if ambiguous.

### 2. Capture Session State

Assess and summarize:
- **Progress**: What was accomplished this session (update Done if not current)
- **Current work**: What was in progress when stopping
- **Findings**: Key things learned — patterns discovered, gotchas hit, decisions made
- **Blockers**: Open questions, things that need investigation
- **Next step**: What to tackle first next session and why

### 3. Write Checkpoint

Update the plan doc **Notes** section:

```markdown
## Notes
**Last session**: YYYY-MM-DD
**Status**: [milestone-level — e.g. "Token management done, Error handling in progress"]

**In progress**: [what was being worked on when paused]

**Findings this session**:
- [Key learning or discovery]
- [Pattern or gotcha worth remembering]

**Blockers**:
- [Open question or issue, if any]

**Suggested next step**: [What to pick up first and why]
```

Also update **Done** and **Remaining Intent** sections if stale.

Sync thoughts after writing:
```bash
humanlayer thoughts sync
```

```
Checkpoint saved to thoughts/ryan/plans/YYYY-MM-DD-[slug].md

To resume later:
- Run /skill:plan-implement [slug]
```
