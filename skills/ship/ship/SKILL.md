---
name: "ship"
description: Route work to its next human checkpoint. Use at the outset of potentially sizeable work, when one-session work grows into multi-step implementation or delivery, after context compaction, or when resuming local workflow artifacts.
---

# Ship

Move durable work to its next useful human checkpoint, then stop. Use workflow files to track current state; do not add stage flags, a separate state file, or another workflow system.

## Decide whether the work needs a workflow

When the work can finish safely in one session, say so and continue normally without workflow files.

Reconsider that fast path when:

- investigation is about to become substantial production editing
- scope gains another independently reviewable outcome
- the work becomes multi-repo, multi-session, worktree, pull request, or deployment shaped

When starting a durable workflow at the outset or after work grows, read [references/durable-context.md](references/durable-context.md). Preserve existing edits, explain the change, and reconcile the workflow files with the live repository. Before more production editing, establish or update alignment and planning far enough to identify one human-confirmed current slice. Do not move the work to another workspace without confirmation.

## Choose the next checkpoint

The canonical work-item files and live repository decide current state. Conversation and notes outside the work item may help locate context but do not override that evidence.

If work is interrupted, follows context compaction, or has unclear state, read [references/recovery.md](references/recovery.md) and reconcile it before routing.

Then follow unresolved work in this order so review and approval happen before more execution:

- A completed artifact lacks an independent review of its current form: apply [references/review-gate.md](references/review-gate.md).
- Reviewed work awaits human review or approval: present the checkpoint and wait.
- A human decision remains about requirements, UX/DX, scope, or high-level shape: use `align`.
- Alignment is settled but no plan exists: use `slice-plan`.
- A plan has work that can start: recommend the next synchronous slice or safe parallel wave.
- All planned work is complete, or the user closes it: follow [references/graduation.md](references/graduation.md).

If the state is truly ambiguous, give your interpretation and ask one direct question. Do not add tracking fields merely to avoid understanding the files.

## Complete one checkpoint

Alignment settles one human-owned decision at a time. Planning defines dependencies and which slices can start. Implementation completes and verifies one confirmed slice that can start; it does not silently advance another slice.

Before substantial production edits, verify:

- the approved outcome and current slice
- the live repository, cwd, branch, and worktree
- the allowed scope and existing work that must be preserved
- known sibling work
- the validation that exercises the real behavior and its important failure path

Proceed without ceremony when these are clear. Ask only about a gap that could change the work. For durable work on a default branch or shared dirty branch, propose `ticket-workspace`. A safe, local one-session fix may continue in place.

For an interface-facing slice, return to `align` if the primary UX/DX walkthrough is not explicit. During alignment, a user-approved [`prototype`](../prototype/SKILL.md) may answer one consequential experiential question that inspection and conversation cannot settle. Treat it as evidence gathering and resume alignment afterward; it does not satisfy planning or implementation gates.

Once the experience is settled, use `shape-first` when local interfaces, data rules, or code structure still need shaping. Before code, apply `simplest-sufficient-change`; it is an implementation lens, not another approval step. Return to `align` if implementation changes the settled experience, requirements, scope, or high-level solution direction.

Record material decisions, scope changes, implementation results, and review or validation evidence as they happen. Once a plan exists, keep slice-specific evidence with its slice.

## Confirm ready work

Dependencies in `plan.md`, not section order, determine what can start. Recommend what should run next and why, then get human confirmation before starting or dispatching the work.

Run one slice synchronously unless it contains independent work units whose parallelism is worth the coordination cost. For that case, read [references/implementation-wave.md](references/implementation-wave.md). The Ship coordinator owns concurrency and integration.

## Present the checkpoint

Before presenting a completed alignment, plan, implementation, or delivery result for approval, apply [references/review-gate.md](references/review-gate.md). A blocking question or progress update is not a review checkpoint.

Keep the human update concise: identify the reviewed target, the result or decision, validation, remaining risk, and the one response needed next. When plain Markdown cannot make a consequential decision clear, read [references/review-artifacts.md](references/review-artifacts.md) and create the smallest useful review aid.
