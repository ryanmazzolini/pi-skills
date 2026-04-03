---
name: plan-task
description: Focused planning and execution for single-concern tasks. Creates a slim plan doc compatible with save/progress/verify.
---

# Focused Task

## Rules

- **SINGLE CONCERN**: One component, one problem — suggest /skill:plan-create for multi-component or architectural work
- **LIGHT RESEARCH**: Quick exploration + devil's advocate — not the full research workflow
- **SLIM DOC**: Same plan template but terser — flat intent list, no research summary
- **EXECUTE AFTER CONFIRM**: Implement directly after user confirms approach
- **TEACH**: Explain what will change, why, and how it connects to existing code

## Process

### 1. Clarify Task

```bash
DATE=$(date +%Y-%m-%d)
```

Parse task description. Ask 1-2 clarifying questions if unclear:
- What needs to be done?
- Any constraints or preferences?

Do quick research: explore the relevant codebase area and consider what could go wrong (devil's advocate). Skip research if the task is trivial (renaming, config tweak).

Present findings and concerns before moving to options.

### 2. Present Options

Identify 1-3 key decisions (if task has choices).

For each, present the approaches with tradeoffs and ask the user to pick.

If one obvious approach: present it and confirm.

### 3. Document Plan

Write plan doc to `thoughts/ryan/plans/YYYY-MM-DD-[slug].md`:

```markdown
---
source: {repo basename}
date: YYYY-MM-DD
type: plan
---

# [Task Name] - YYYY-MM-DD

**Status**: In Progress | **Goal**: [one sentence]
**External**: [Link if applicable]

## Approach
[Selected approach in 1-2 sentences]

## Decisions
- [Any choices made during options step]

## Done
[Empty]

## Remaining Intent
- [Flat list of goal-oriented outcomes]

## Deviations
[Empty]

## Verification

### Automated
- [test commands]

### Manual
1. [Verification steps]

## Notes
[Empty]
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
4. Test (run automated verification)
5. Update plan doc (move to Done, update Remaining Intent, log Deviations)
6. Run `humanlayer thoughts sync`

For multi-step tasks, check in between intents: Continue, Commit, or Save & pause.

For single-intent tasks, complete and report.

### 5. Complete

Update plan doc Status. Report:
```
Done: [Brief summary]
Changed: [Files affected]

Next steps:
- /skill:plan-verify [slug] — run verification
- /skill:commit-simple — commit changes
```

## When to Use

**Good for /skill:plan-task** — single-concern work: bug fixes, small features, single component changes, adding tests, config changes.

**Use /skill:plan-research → /skill:plan-create instead** — broader scope: multi-component features, architecture changes, multiple major decisions.
