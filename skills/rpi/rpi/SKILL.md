---
name: "rpi"
description: Durable multi-session work. Use when the user wants to plan a feature or sizeable change, continue or pick up earlier planned work, or wrap up work whose summary belongs in their notes vault. Not for one-shot tasks.
---

# RPI

Route durable work through one loop: read the project's vault folder, align with `align`, plan with `slice-plan`, implement slice by slice with a review pause between slices, and finish by graduating a summary note into the vault. Work happens in `.plans/`; only the distillate reaches the vault.

## Vault (the LLM wiki)

Map the repo to a vault: repos under `~/git/` use `~/work-notes`, repos under `~/personal/` use `~/personal/notes`; ask when neither fits.

Before planning, read `projects/<repo-name>/` in that vault — `index.md` first when present, then recent dated notes. Say in one line what you found or that no folder exists, and continue. Vault rules: never commit, move, or rename vault files without explicit approval.

## Plans root

Workflow artifacts live in `{plans-root}/YYYY-MM-DD-slug/` (`alignment.md`, `plan.md`, optional `qa.md`). Resolve the plans root:

1. `PI_SKILLS_PLANS_ROOT` if set
2. existing `.plans/` or `.plan/`
3. existing `docs/plans/`
4. `.plans/` for new artifacts unless the user chooses a tracked location

## The loop

1. **Align** — run `align`. It writes `alignment.md` with requirements, assumptions, open questions, and any high-level solution shape.
2. **Plan** — run `slice-plan`. It writes `plan.md` as dependency-shaped vertical slices. Each slice must be complete enough to pick up cold: what/why, tasks, verification, what it ships. Present plans in plain language. When markdown is not enough for human review, load `references/review-artifacts.md` and generate the smallest artifact whose shape fits the review question.
3. **Walk the slices.** Confirm a ready slice with the user, implement it, verify it, then stop: report what shipped and how it was verified, and wait for the user's review before the next slice. A slice may ship as one or more PRs — stacked in one repo or across repos; work in the ticket workspace (`ticket-workspace`), one worktree per PR, and verify at the slice, not per PR. The pause is also the session boundary — the user may compact or start fresh; any new session resumes from the workflow directory (see Resume). Use `handoff` only when leaving pi for another agent or machine.

If the user says "just do it", skip ceremony and do the smallest safe implement-and-verify loop.

## Resume

For "continue the X work": find the workflow directory under the plans root, read `alignment.md` (or legacy `question.md`) and `plan.md`, state which slices are done and which are ready, and carry on. Do not re-ask answered questions.

## Graduate

When the work finishes (all slices verified, or the user closes it out), draft one dated note in the vault project folder — `projects/<repo-name>/YYYY-MM-DD-slug.md`:

```md
---
type: work-summary
title: [what shipped]
description: [one line]
tags: []
date: YYYY-MM-DD
---

## What shipped
## Key decisions
## Where things live
```

Keep it a distillate: what future sessions need, not a transcript. Show the note, then ask before committing to the vault. Quick work that never earned a plan graduates nothing.
