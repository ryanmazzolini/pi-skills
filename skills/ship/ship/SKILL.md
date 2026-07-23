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
- scope gains another independently deliverable outcome
- the work becomes multi-repo, multi-session, worktree, pull request, or deployment shaped

When starting a durable workflow at the outset or after work grows, read [references/durable-context.md](references/durable-context.md). Preserve existing edits, explain the change, and reconcile the workflow files with the live repository. Before more production editing, establish or update alignment and planning far enough to identify one human-confirmed current slice. Do not move the work to another workspace without confirmation.

## Choose the next checkpoint

The canonical work-item files and live repository decide current state. Conversation and notes outside the work item may help locate context but do not override that evidence.

If work is interrupted, follows context compaction, or has unclear state, read [references/recovery.md](references/recovery.md) and reconcile it before routing.

Then follow unresolved work in this order so delivery review and human approval happen before the actions they govern:

- A final code-bearing delivery lacks required independent review: apply [references/review-gate.md](references/review-gate.md).
- Completed work awaits human review or approval: present the checkpoint and wait.
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

Proceed without ceremony when these are clear. Ask only about a gap that could change the work. Keep only trivial bug fixes and chores on the default branch. Before other work, propose a feature branch; use `ticket-workspace` when the work is durable or the current workspace is shared or dirty. Respect an explicit user choice to remain on the default branch.

For an interface-facing slice, return to `align` if the primary UX/DX walkthrough is not explicit. During alignment, a user-approved [`prototype`](../prototype/SKILL.md) may answer one consequential experiential question that inspection and conversation cannot settle. Treat it as evidence gathering and resume alignment afterward; it does not satisfy planning or implementation gates.

Once the experience is settled, use `shape-first` when local interfaces, data rules, or code structure still need shaping. Before code, apply `simplest-sufficient-change`; it is an implementation lens, not another approval step. Return to `align` if implementation changes the settled experience, requirements, scope, or high-level solution direction.

Record material decisions, scope changes, implementation results, and review or validation evidence as they happen. Once a plan exists, keep slice-specific evidence with its slice.

When a cross-project blocker or missing context needs on-demand First Mate reconciliation, read [references/first-mate-escalation.md](references/first-mate-escalation.md). Do not report routine progress to First Mate.

## Confirm ready work

Dependencies in `plan.md`, not section order, determine what can start. Recommend what should run next and why, then get human confirmation before starting or dispatching the work.

Run one slice synchronously unless it contains independent work units whose parallelism is worth the coordination cost. For that case, read [references/implementation-wave.md](references/implementation-wave.md). The Ship coordinator owns concurrency and integration.

## Present the checkpoint

Before presenting a final code-bearing delivery for approval, apply [references/review-gate.md](references/review-gate.md). Apply independent review earlier only for the selective cases defined there; alignment, plans, and intermediate implementation checkpoints do not require it by default.

Keep the human update concise: identify the target, the result or decision, validation, remaining risk, applicable independent-review status, and the one response needed next. When plain Markdown cannot make a consequential decision clear, read [references/review-artifacts.md](references/review-artifacts.md) and create the smallest useful review aid.
