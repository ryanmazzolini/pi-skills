---
name: "ship"
description: Route coding work through the lightest useful path. Use for direct implementation, consequential alignment, dependency-aware delivery planning, milestone roadmaps, recovery, review, or delivery.
---

# Ship

Move work to its next useful human checkpoint. Use the least process that keeps the outcome clear and the work recoverable. First determine what is settled. Then choose the delivery shape. Alignment and delivery planning answer different questions. Neither is a required stage.

## Determine what is settled

Inspect the current request, live repository, authoritative project evidence, and any existing workflow.

- **Facts:** use the live system, code, tests, automation, and documentation to establish current behavior, constraints, and existing decisions. [`research`](../research/SKILL.md) helps when material uncertainty prevents a trustworthy route. Routine local inspection is usually enough otherwise.
- **Intent:** use the request and authoritative project evidence to establish the target value, observable behavior, and included or deferred outcomes. An exact bounded request authorizes the change it names. Keep that authority unless relevant evidence conflicts. Do not ask the user to restate the rationale without a material gap.

Pause direct implementation when sources of intent conflict or leave a consequential choice. A choice is consequential when plausible answers could change the goal, priority, value, experience, scope, risk, or high-level solution direction. `align` is the default way to resolve it. Prefer inspection or `research` for questions evidence can answer.

For example, a small retry button needs alignment when its placement, retry behavior, and feedback are unspecified. It can proceed directly when an authoritative UI specification and contract tests settle all three.

Small, local, or reversible work does not settle a missing choice. Reuse settled intent instead of repeating alignment.

## Choose the delivery shape

After intent is settled, choose how to deliver it:

- **Direct delivery fits** one settled outcome or exact bounded request that needs one coherent change. No useful dependency graph exists.
- **Planned delivery helps** when one settled outcome needs several delivery changes. Reach for `delivery-plan` when explicit boundaries would improve execution or recovery. Signals include:
  - one delivery change depends on another
  - PRs or releases must land separately
  - a migration or rollout needs sequencing
  - parallel work is worthwhile
- **A roadmap helps** when several independently useful outcomes need durable coordination or recovery. See [references/roadmaps.md](references/roadmaps.md).

Choose the lightest delivery shape that preserves the settled intent and useful boundaries. Small work should pause when it exposes an unresolved consequential choice. Large work may remain direct when its intent is settled and delivery is coherent. Size and elapsed time do not decide the delivery shape. Neither do a branch, worktree, pull request, or session count.

When existing workflow files, interruption, or context compaction make the state unclear, read [references/recovery.md](references/recovery.md) before choosing.

## Complete a direct delivery

Continue from the settled outcome or exact bounded request. Do not reopen it merely to repeat alignment or planning. Before substantial edits, verify:

- the authoritative intent, observable completion, and outcome boundaries
- the current and intended UX/DX walkthrough when an interface changes, or the behavior that must remain unchanged
- the live repository, cwd, branch, and worktree
- allowed scope and existing work to preserve
- known sibling work
- validation that exercises the real behavior and an important failure path

A gap warrants a question when it could materially change the settled value, behavior, scope, or risk.

On the default branch, propose a feature branch. Commit to the default branch only with explicit user approval. Use `ticket-workspace` when the work is durable or the current workspace is shared or dirty.

Once intent is settled, make ordinary repo-native interface, data, and structure choices directly within it. Use `shape-first` when the user asks for shaping or a consequential local design choice needs its checkpoints. Apply `simplest-sufficient-change` before code.

Pause direct implementation if it exposes an unresolved consequential choice. Also pause if it would conflict with or reinterpret authoritative intent. Revisit `align` when human judgment remains necessary.

Do not create workflow files merely because a direct delivery lasts longer than expected. When it must survive a fresh session or context reset, read [references/durable-context.md](references/durable-context.md). Create only a minimal continuation record. Keep direct delivery unless the settled intent or delivery coherence changes.

## Resume after alignment

Alignment helps settle a human choice that evidence cannot. Approval does not force a delivery plan. Return here and choose the delivery shape. Stay direct when one coherent change can deliver the result. Reach for `delivery-plan` when dependency or delivery boundaries make slicing useful.

For an experiential question that words cannot settle, Align may temporarily use [`prototype`](../prototype/SKILL.md). A prototype supplies evidence and returns to alignment. It does not authorize production implementation.

## Execute a delivery plan

Dependencies in `plan.md`, not section order, determine which delivery changes can start. Recommend the most useful ready change and why, then get human confirmation before starting or dispatching coordinated work.

Run one delivery change synchronously unless it contains independent work units whose parallelism is worth the integration cost. For that case, read [references/implementation-wave.md](references/implementation-wave.md). The Ship coordinator owns concurrency and integration.

## Navigate a roadmap

A roadmap coordinates human-centered milestones, not implementation tasks or PRs. Follow [references/roadmaps.md](references/roadmaps.md) to derive the ready milestones from their dependencies, recommend the next useful benefit, and preserve parent/child authority. Get confirmation before creating or materially changing a roadmap and before starting or dispatching a milestone.

Each selected milestone returns to this router and follows the direct, aligned, or planned route it actually needs.

## Choose the next checkpoint

The live project and canonical work-item files decide current state. Conversation and other notes may locate context but do not override that evidence. Handle unresolved work in this order:

- A final code-bearing delivery lacks required independent review: apply [references/review-gate.md](references/review-gate.md).
- Completed work has passed its required review gate and awaits approval: when the request is exact and may be routine enough for a discoverable First Mate, use [references/first-mate-escalation.md](references/first-mate-escalation.md); otherwise present the checkpoint and wait.
- A decision-linked investigation remains: use `research`, then resume the checkpoint its result informs.
- A consequential human decision remains: use `align`.
- An approved outcome has a useful delivery plan: recommend a ready delivery change.
- An approved roadmap has an unfinished ready milestone: recommend that milestone.
- A direct continuation remains clear: resume it directly.
- The work is complete or deliberately closed: follow [references/graduation.md](references/graduation.md) when a durable work item exists; otherwise report the result normally.

If state is truly ambiguous, give your interpretation and ask one direct question. Do not add tracking fields merely to avoid understanding the evidence.

## Record and present results

Record material decisions, scope changes, implementation results, and validation evidence as they happen. Keep delivery-change evidence with its plan entry and milestone-specific evidence in the milestone work item. Do not report routine progress to First Mate; use [references/first-mate-escalation.md](references/first-mate-escalation.md) only for an exact approval request, cross-project blocker, or missing context.

Before presenting a final code-bearing delivery for approval, apply [references/review-gate.md](references/review-gate.md). Alignment, plans, and intermediate checkpoints do not require broad independent review by default.

Start a human update with the result or decision. Add required validation and review status. Mention remaining risk only when it affects what happens next. End with one short action or question when the user must respond. When Markdown cannot make a consequential decision clear, read [references/review-artifacts.md](references/review-artifacts.md) and create the smallest useful review aid.
