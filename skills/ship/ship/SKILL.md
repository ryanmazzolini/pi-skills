---
name: "ship"
description: Route coding work through the lightest useful path. Use for direct implementation, consequential alignment, upfront design review, dependency-aware delivery planning, milestone roadmaps, recovery, review, or delivery.
---

# Ship

Move work to its next useful human checkpoint. Use the least process that keeps the outcome clear and the work recoverable. First determine what is settled. Then decide whether design review is warranted and choose the delivery shape. Research, alignment, design review, and delivery planning answer different questions. None is a required stage, but the human explicitly approves the route before production implementation when any are skipped.

## Determine what is settled

Inspect the current request, live repository, authoritative project evidence, and any existing workflow.

- **Facts:** use the live system, code, tests, automation, and documentation to establish current behavior, constraints, and existing decisions. [`research`](../research/SKILL.md) helps when material uncertainty prevents a trustworthy route. Routine local inspection is usually enough otherwise.
- **Intent:** use the request and authoritative project evidence to establish the target value, observable behavior, and included or deferred outcomes. An exact bounded request authorizes the change it names. Keep that authority unless relevant evidence conflicts. Do not ask the user to restate the rationale without a material gap.

Pause direct implementation when sources of intent conflict or leave a consequential choice. A choice is consequential when plausible answers could change the goal, priority, value, experience, scope, risk, or high-level solution direction. `align` is the default way to resolve it. Prefer inspection or `research` for questions evidence can answer.

For example, a small retry button needs alignment when its placement, retry behavior, and feedback are unspecified. It can proceed directly when an authoritative UI specification and contract tests settle all three.

Small, local, or reversible work does not settle a missing choice. Reuse settled intent instead of repeating alignment.

## Decide whether to review the design

Before choosing a delivery shape or implementing, use [`design-doc`](../design-doc/SKILL.md) only when implementation would otherwise make an implicit choice about the intended experience, system fit, program shape, or build order and discovering a wrong choice after coding would cause expensive rework. Skip it when the relevant choices are already authoritative, obvious, trivial, or cheaply reversible.

Design review makes a proposed solution legible; it does not settle conflicting intent or replace dependency-aware delivery planning. After approval, return here to choose direct or planned delivery.

## Choose the delivery shape

After intent is settled, choose how to deliver it:

- **Direct delivery fits** one settled outcome or exact bounded request that needs one coherent change. No useful dependency graph exists.
- **Planned delivery helps** when one settled outcome needs several delivery changes. Reach for `delivery-plan` when explicit boundaries would improve execution or recovery. Signals include:
  - one delivery change depends on another
  - PRs or releases must land separately
  - a migration or rollout needs sequencing
  - parallel work is worthwhile
- **A roadmap helps** when several independently useful outcomes need durable coordination or recovery. See [references/roadmaps.md](references/roadmaps.md).

Choose the lightest delivery shape that preserves the settled intent and useful boundaries. Treat an MVP as a destination, not one delivery scope. Keep related work direct only when every part is required for the same narrow observable outcome. When another independently reviewable outcome or justified enabling change exists, use planned delivery or defer it. Size, elapsed time, a branch, a worktree, a pull request, or a session count does not decide the boundary by itself.

When existing workflow files, interruption, or context compaction make the state unclear, read [references/recovery.md](references/recovery.md) before choosing.

## Confirm the implementation route

Ship may start Research, Align, Design Doc, or Delivery Plan automatically when its trigger is met. Before production implementation, get explicit human approval for a compact route that names the delivery shape, steps used, and steps skipped:

```md
**Delivery:** [direct delivery, planned delivery, or selected roadmap milestone]

**Use:** [every selected conditional step, completed or still needed; `None` when all are skipped]

**Skip:**
- **[Unused step]:** [why its trigger is not met]

**Proceed on this route?**
```

Account for every one of Research, Align, Design Doc, and Delivery Plan exactly once under **Use** or **Skip**. Tie each skip to its trigger: evidence needs no Research beyond routine inspection; intent leaves no consequential choice for Align; wrong implicit experience, system, program, or order choices would not cause expensive rework requiring a Design Doc; or one coherent delivery needs no dependency plan. List Prototype only when an experiential uncertainty makes it plausible, and Roadmap only when several independently useful outcomes make it plausible. Do not manufacture a reason to mention either one on ordinary work.

One answer may approve every displayed skip. An exact instruction already approving the named route counts; a general request to implement does not. Fold this route summary into an existing plan or implementation confirmation when practical, but make the approval question cover both.

Reuse the approval while the target outcome, boundaries, material constraints, skipped-step reasons, and delivery shape remain unchanged. Present it again when new evidence makes a skipped step plausible or changes the route. When work needs durable continuation, record the approved route in the canonical `Current` document—for example an alignment, design, plan, milestone index, or handoff—instead of creating a separate state file.

## Complete a direct delivery

Continue from the settled outcome or exact bounded request and any approved design. Do not reopen them merely to repeat alignment, design, or planning. Do not make production edits until the current implementation route is approved. Before substantial edits, verify:

- the approved implementation route and its reasons for skipped steps
- the authoritative intent, observable completion, and outcome boundaries
- the next delivery change: one narrow observable outcome or justified enabler, plus the work deferred beyond it
- the current and intended UX/DX walkthrough when an interface changes, or the behavior that must remain unchanged
- the live repository, cwd, branch, and worktree
- allowed scope and existing work to preserve
- known sibling work
- validation that exercises the real behavior and an important failure path

A gap warrants a question when it could materially change the settled value, behavior, scope, or risk.

On the default branch, propose a feature branch. Commit to the default branch only with explicit user approval. Use `ticket-workspace` when the work is durable or the current workspace is shared or dirty.

Once intent is settled, make ordinary repo-native interface, data, and structure choices directly within it. Use the shaping branch of [`architecture`](../../architecture/architecture/SKILL.md) when the user asks for shaping or a consequential local design choice needs its checkpoints. Before every implementation, apply its simplest-sufficient-change lens. Defer cleanup, optimization, generalization, and machinery that the current delivery does not need.

Finish, validate, and present this delivery before starting another. Pause sooner if implementation exposes another independently reviewable delivery boundary, an unresolved consequential choice, or a conflict with authoritative intent. Use `delivery-plan` for the additional boundary and revisit `align` only when human judgment remains necessary.

Do not create workflow files merely because a direct delivery lasts longer than expected. When it must survive a fresh session or context reset, read [references/durable-context.md](references/durable-context.md). Create only a minimal continuation record. Keep direct delivery unless the settled intent or delivery coherence changes.

## Resume after alignment

Alignment helps settle a human choice that evidence cannot. Approval does not force design review or a delivery plan. Return here, decide whether design review is warranted, and then choose the delivery shape. Stay direct when one coherent change can deliver the result. Reach for `delivery-plan` when dependency or delivery boundaries make slicing useful.

For an experiential question that words cannot settle, Align may temporarily use [`prototype`](../prototype/SKILL.md). A prototype supplies evidence and returns to alignment. It does not authorize production implementation.

## Execute a delivery plan

Dependencies in `plan.md`, not section order, determine which delivery changes can start. Recommend the most useful ready change and why, then get human confirmation before starting or dispatching coordinated work. Include the implementation route in that confirmation when it is not already approved.

Run one delivery change synchronously unless it contains independent work units whose parallelism is worth the integration cost. For that case, read [references/implementation-wave.md](references/implementation-wave.md). The Ship coordinator owns concurrency and integration. After completing the delivery change, validate and present it before starting the next one.

## Navigate a roadmap

A roadmap coordinates human-centered milestones, not implementation tasks or PRs. Follow [references/roadmaps.md](references/roadmaps.md) to derive the ready milestones from their dependencies, recommend the next useful benefit, and preserve parent/child authority. Get confirmation before creating or materially changing a roadmap and before starting or dispatching a milestone.

Each selected milestone returns to this router and follows the direct, aligned, or planned route it actually needs.

## Choose the next checkpoint

The live project and canonical work-item files decide current state. Conversation and other notes may locate context but do not override that evidence. Handle unresolved work in this order:

- A final code-bearing delivery lacks required independent review: apply [references/review-gate.md](references/review-gate.md).
- Completed work has passed its required review gate and awaits approval: when the request is exact and may be routine enough for a discoverable First Mate, use [references/first-mate-escalation.md](references/first-mate-escalation.md); otherwise present the checkpoint and wait.
- A decision-linked investigation remains: use `research`, then resume the checkpoint its result informs.
- A consequential human decision remains: use `align`.
- Settled intent still has costly implicit solution choices: use `design-doc`.
- Production implementation is ready but its used and skipped steps lack current route approval: present the implementation route and wait.
- An approved outcome has a useful delivery plan: recommend a ready delivery change.
- An approved roadmap has an unfinished ready milestone: recommend that milestone.
- A direct continuation remains clear: resume it directly.
- The work is complete or deliberately closed: follow [references/graduation.md](references/graduation.md) when a durable work item exists; otherwise report the result normally.

If state is truly ambiguous, give your interpretation and ask one direct question. Do not add tracking fields merely to avoid understanding the evidence.

## Record and present results

Record material decisions, scope changes, approved implementation routes, implementation results, and validation evidence as they happen. Keep delivery-change evidence with its plan entry and milestone-specific evidence in the milestone work item. Do not report routine progress to First Mate; use [references/first-mate-escalation.md](references/first-mate-escalation.md) only for an exact approval request, cross-project blocker, or missing context.

Before presenting a final code-bearing delivery for approval, apply [references/review-gate.md](references/review-gate.md). Alignment, plans, and intermediate checkpoints do not require broad independent review by default.

Start a human update with the result or decision. Add required validation and review status. Mention remaining risk only when it affects what happens next. End with one short action or question when the user must respond. When Markdown cannot make a consequential decision clear, read [references/review-artifacts.md](references/review-artifacts.md) and create the smallest useful review aid.
