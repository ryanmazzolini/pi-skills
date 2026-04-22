---
name: plan-task
description: Focused planning and execution for single-concern tasks. Creates a slim `plan.md` in a workflow directory compatible with save/progress/verify.
---

# Focused Task

## Rules

- **SINGLE CONCERN**: One component, one problem — suggest `/skill:plan-create` for broader work
- **LIGHT RESEARCH**: Quick exploration + devil's advocate — not the full workflow
- **SLIM DOC**: Write a terse `plan.md` in the workflow directory
- **EXECUTE AFTER CONFIRM**: Implement directly after user confirms approach
- **TEACH**: Explain what will change, why, and how it connects to existing code

## Process

### 1. Clarify Task

Treat the input as a workflow handoff when possible. If a workflow directory path such as
`{plans-root}/YYYY-MM-DD-[slug]/` is provided, use it and write `plan.md` there.

If the directory does not exist yet, create it before writing the plan.

Ask 1-2 clarifying questions if the task is unclear. Do quick research when needed.

### 2. Present Options

Identify 1-3 key decisions. Present tradeoffs and ask the user to pick, or confirm the obvious approach.

### 3. Document Plan

Write `plan.md` to:

`{plans-root}/YYYY-MM-DD-[slug]/plan.md`

```markdown
---
source: {repo basename}
date: YYYY-MM-DD
type: plan
goal: [one sentence]
---

# [Task Name]

**Status**: In Progress | **Goal**: [one sentence]
**Workflow**: {plans-root}/YYYY-MM-DD-[slug]/

## Approach
[Selected approach in 1-2 sentences]

## Decisions
- [Any choices made during options step]

## Done

## Remaining Intent
- [Flat list of goal-oriented outcomes]

## Deviations

## Verification

### Automated
- [test commands]

### Manual
1. [Verification steps]

## Notes
```

Sync after writing:
```bash
humanlayer thoughts sync
```

### 4. Execute

Implement directly — same adaptive loop as `/skill:plan-implement`:
1. Pick highest-value intent
2. Explain what will change and why
3. Implement
4. Test
5. Update `plan.md`
6. Run `humanlayer thoughts sync`

### 5. Complete

Update `plan.md` Status. Report:
```text
Done: [Brief summary]
Changed: [Files affected]

Next steps:
- /skill:plan-verify [workflow dir or plan.md] — run verification
- /skill:commit-simple — commit changes
```
