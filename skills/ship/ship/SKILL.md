---
name: "ship"
description: Route work to its next human checkpoint. Use at the outset of potentially sizeable work to decide whether it needs a durable workflow, or when resuming work represented by local workflow artifacts.
---

# Ship

`ship` advances durable work to its next meaningful human checkpoint, then stops. It routes from the semantic state in local artifacts; it adds no workflow engine, separate state file, or stage flags.

When work can finish safely in one session, say so and proceed normally without creating workflow artifacts.

## Durable context

Conversation is optional context. Local workflow files are the operational authority; the notes vault holds only the high-level distillate future work should remember.

Resolve the plans root in this order:

1. `PI_SKILLS_PLANS_ROOT` when set
2. existing `.plans/` or `.plan/`
3. existing `docs/plans/`
4. `.plans/` for new durable work

A new workflow normally contains `alignment.md` and, after alignment, `plan.md`. Read a legacy `question.md` as the alignment artifact when present.

Map the repo to a vault: repos under `~/git/` use `~/work-notes`; repos under `~/personal/` use `~/personal/notes`; ask when neither fits. Before new alignment, read `projects/<repo-name>/` in that vault—`index.md` first when present, then only relevant recent notes. Say briefly what you found or that no project folder exists.

## Infer the next activity

Read the local artifacts and follow the unresolved work. Review and approval states take priority over execution and graduation:

- A completed artifact without current independent review → run the adaptive review gate.
- Reviewed work awaiting human review → present the review evidence and wait.
- An open human decision about requirements, UX/DX flow, scope, or high-level shape → use `align`.
- Settled alignment without a plan → use `slice-plan`.
- A plan with ready slices → recommend the next synchronous slice or safe asynchronous wave.
- Interrupted or ambiguous work → reconcile it before recommending continuation or retry.
- All planned work complete → graduate the durable summary.

If the state is genuinely ambiguous, state your interpretation and ask one direct question. Do not add tracking metadata merely to avoid reading the artifacts.

## Advance one checkpoint

Alignment asks one human-owned question at a time. Planning proposes the dependency shape and ready set. Implementation completes and verifies one confirmed ready slice. When that slice contains independent work units whose parallelism outweighs integration cost, load `references/implementation-wave.md`; otherwise implement synchronously or delegate one bounded task.

Before implementing an interface-facing slice, return to `align` if its primary UX/DX walkthrough is not explicit. Once the experience is settled, use `shape-first` when local interfaces or structure remain uncertain. Before code, apply `simplest-sufficient-change` to choose the first repo-native option that fully satisfies the slice; this is an implementation lens, not another human checkpoint. Return to `align` when implementation reveals a change to the settled experience, requirements, scope, or high-level solution shape.

Record implementation outcomes and verification with the relevant slice before stopping. Before presenting a completed alignment, plan, implementation, or delivery artifact for human approval, load `references/review-gate.md`; the coordinating thread chooses review lenses, reviewer count, model size, and reasoning depth. A blocking question or progress update is not a review checkpoint. Keep the conversational update brief; add orientation, recovery detail, or a question only when it helps the human act.

## Confirm ready work

`plan.md` dependencies—not section order—determine the ready set. Recommend what should run next and why. Confirm the recommendation with the user before dispatch. The Ship coordinating thread owns the concurrency policy.

## Recover safely

On resume, reconcile current work with the last approved goal and Now, then recommend the smallest path to the next useful checkpoint.

On cold resume, reconstruct the goal, open questions, completed work, and ready set from local files. For interrupted work, inspect the repository, branch or worktree, available run state, and recorded evidence before deciding what remains. Present uncertainty before any retry that could overwrite work or duplicate side effects.

For an old RPI workflow, preserve its files. Infer a proposed state and dependency graph from their content, then confirm ambiguous progress or dependencies before writing any migration. There is no `rpi` alias or bulk migration.

## Human review artifacts

Apply `references/review-gate.md` before each human review checkpoint. When markdown is insufficient for a consequential review, load `references/review-artifacts.md` and generate the smallest artifact whose shape fits the question.

## Graduate

When all planned work is complete—or the user explicitly closes it—draft one dated high-level note at `projects/<repo-name>/YYYY-MM-DD-slug.md` in the mapped vault:

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

Keep operational history in `.plans`; preserve only what future sessions need. Show the note and ask before committing any vault change.
