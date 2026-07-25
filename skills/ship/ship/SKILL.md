---
name: "ship"
description: Route coding work through the lightest useful path. Use for direct implementation, consequential alignment, dependency-aware delivery planning, milestone roadmaps, recovery, review, or delivery.
---

# Ship

Move work to its next useful human checkpoint. Use the least process that keeps the outcome clear and the work recoverable. **Direct implementation is the default.** Alignment, delivery planning, and roadmaps are conditional tools, not required stages.

## Choose the lightest route

Inspect the request, relevant project evidence, live repository, and any existing workflow before choosing:

- **Direct change:** the requested benefit, completion signal, and implementation boundary are clear; no consequential human decision or coordination graph remains. Proceed without alignment or a plan.
- **Aligned change:** a requirements, UX/DX, scope, or solution-direction decision could materially change the outcome. Use `align`, then return here.
- **Planned delivery:** one approved benefit needs dependent delivery changes, several PRs, migration sequencing, or worthwhile parallel work. Use `delivery-plan`.
- **Roadmap:** several independently useful benefits need durable coordination or recovery under one shared destination. Read [references/roadmaps.md](references/roadmaps.md).

Size, production editing, session count, a feature branch, worktree, or pull request does not by itself move a direct change into another route. Several related improvements may stay direct when coordinating them separately would add no value. Reassess only when consequential uncertainty or coordination actually appears.

When existing workflow files, interruption, or context compaction make the state unclear, read [references/recovery.md](references/recovery.md) before choosing.

## Complete a direct change

Honor the user's original implementation request without asking for alignment or planning approval again. Before substantial edits, verify:

- the requested benefit and observable completion
- the live repository, cwd, branch, and worktree
- allowed scope and existing work to preserve
- known sibling work
- validation that exercises the real behavior and an important failure path

Ask only about a gap that could change the result. Keep only trivial fixes and chores on the default branch. Before other work, propose a feature branch; use `ticket-workspace` when the work is durable or the current workspace is shared or dirty. Respect an explicit choice to remain on the default branch.

Make ordinary repo-native interface, data, and structure choices directly. Use `shape-first` only when the user asks to shape the change or a consequential local design choice warrants its explicit checkpoints. Apply `simplest-sufficient-change` before code. Return to `align` only if implementation changes the approved benefit, experience, scope, or high-level solution direction.

Do not create workflow files merely because a direct change lasts longer than expected. When it needs to survive a fresh session or context reset, read [references/durable-context.md](references/durable-context.md) and create only a minimal continuation record. Keep the direct route unless the work itself becomes uncertain or coordination-heavy.

## Resume after alignment

Alignment settles one consequential human decision at a time. Approval defines the target benefit and boundaries; it does not force a delivery plan. Return to direct implementation when one coherent change can deliver the result. Use `delivery-plan` only when its dependency map or delivery boundaries would help a fresh session execute safely.

For an experiential question that words cannot settle, Align may temporarily use [`prototype`](../prototype/SKILL.md). A prototype supplies evidence and returns to alignment; it does not authorize production implementation.

## Execute a delivery plan

Dependencies in `plan.md`, not section order, determine which delivery changes can start. Recommend the most useful ready change and why, then get human confirmation before starting or dispatching coordinated work.

Run one delivery change synchronously unless it contains independent work units whose parallelism is worth the integration cost. For that case, read [references/implementation-wave.md](references/implementation-wave.md). The Ship coordinator owns concurrency and integration.

## Navigate a roadmap

A roadmap coordinates human-centered milestones, not implementation tasks or PRs. Follow [references/roadmaps.md](references/roadmaps.md) to derive the ready milestones from their dependencies, recommend the next useful benefit, and preserve parent/child authority. Get confirmation before creating or materially changing a roadmap and before starting or dispatching a milestone.

Each selected milestone returns to this router and follows the direct, aligned, or planned route it actually needs.

## Choose the next checkpoint

The live project and canonical work-item files decide current state. Conversation and other notes may locate context but do not override that evidence. Handle unresolved work in this order:

- A final code-bearing delivery lacks required independent review: apply [references/review-gate.md](references/review-gate.md).
- Completed work awaits human review or approval: present the checkpoint and wait.
- A consequential human decision remains: use `align`.
- An approved outcome has a useful delivery plan: recommend a ready delivery change.
- An approved roadmap has an unfinished ready milestone: recommend that milestone.
- A direct continuation remains clear: resume it directly.
- The work is complete or deliberately closed: follow [references/graduation.md](references/graduation.md) when a durable work item exists; otherwise report the result normally.

If state is truly ambiguous, give your interpretation and ask one direct question. Do not add tracking fields merely to avoid understanding the evidence.

## Record and present results

Record material decisions, scope changes, implementation results, and validation evidence as they happen. Keep delivery-change evidence with its plan entry and milestone-specific evidence in the milestone work item. Do not report routine progress to First Mate; use [references/first-mate-escalation.md](references/first-mate-escalation.md) only for an on-demand cross-project blocker or missing context.

Before presenting a final code-bearing delivery for approval, apply [references/review-gate.md](references/review-gate.md). Alignment, plans, and intermediate checkpoints do not require broad independent review by default.

Start a human update with the result or decision. Add required validation and review status. Mention remaining risk only when it affects what happens next. End with one short action or question when the user must respond. When Markdown cannot make a consequential decision clear, read [references/review-artifacts.md](references/review-artifacts.md) and create the smallest useful review aid.
