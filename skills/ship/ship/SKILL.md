---
name: "ship"
description: Route coding work through the lightest useful path. Use for direct implementation, consequential alignment, upfront design review, dependency-aware delivery planning, milestone roadmaps, recovery, review, or delivery.
---

# Ship

Establish the expected experience or behavior and the boundaries of the current work before choosing a solution or delivery approach. This applies to every change, large or small. Use the broader goal to understand the request, not to expand its scope. Move work to its next useful human checkpoint with the least process that keeps the outcome clear and the work recoverable.

Research, alignment, design review, and delivery planning answer different questions. None is a required stage, but the human explicitly approves the route before production implementation when any are skipped.

## Settle expectations and scope

Inspect the current request, live repository, authoritative project evidence, and any existing workflow. Before recommending a solution structure or delivery chunks, establish:

- **Expected result:** who the work helps, what they should be able to do or understand, and what counts as complete for this request.
- **Expected behavior:** one concrete user or caller path to that result, including failure or recovery behavior when it could change the solution. Reuse an existing walkthrough or state which behavior must remain unchanged.
- **Scope:** what this change includes, what it excludes or defers, and which existing behavior, interfaces, and UI it must preserve.

Reuse settled decisions and exact bounded requests. Do not ask the user to restate the rationale, repeat approval, or create an alignment document when those expectations and boundaries are already clear. Size changes the depth of this check, not whether it happens.

Use the live system, code, tests, automation, and documentation to establish facts. Use [`research`](../research/SKILL.md) when material uncertainty prevents a trustworthy decision; routine inspection is usually enough otherwise. Distinguish current behavior from requested behavior and from your proposed changes.

Pause solution selection or implementation when sources of intent conflict or completing the expected behavior would require inventing a consequential choice. A choice is consequential when plausible answers could change the goal, priority, value, experience, scope, risk, or high-level solution direction. Use [`align`](../align/SKILL.md) to settle choices that need human judgment, not questions inspection or research can answer.

For example, a small preference toggle can change existing users' behavior. If its default is unspecified and plausible defaults have different effects, settle that choice before implementation. If its behavior and preservation boundaries are already authoritative, reuse those decisions and proceed within the existing approval.

Finish this check when the expected result, behavior, and scope are clear without inventing a consequential choice. Keep routine accounting internal. If the result requires changing something the user asked to preserve, explain the conflict and ask before proceeding. Suggest related improvements separately; they are not part of the approved work.

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

Ship may start Research, Align, Design Doc, or Delivery Plan automatically when its trigger is met. Ask for route approval only after intent is settled. Do not combine an unresolved product, safety, scope, or experience decision with route approval.

Before production implementation, account for each of Research, Align, Design Doc, and Delivery Plan exactly once as needed or not needed, with a reason. Keep this accounting internal while the work is safely session-local; record it in the canonical `Current` document when the work needs durable continuation. List Prototype only when an experiential uncertainty makes it plausible, and Roadmap only when several independently useful outcomes make it plausible. Do not manufacture a reason to mention either one on ordinary work.

Ask for explicit approval in ordinary project language. Lead with the concrete change and how you will deliver it. Mention investigation, a decision, upfront design, or sequencing only when it will actually happen before implementation. Do not list routine activities you will omit. When an omission materially changes approval, say what will not be done and state the concrete project boundary or risk instead of naming the skipped process. Do not show a routing checklist, `Use`/`Skip` sections, workflow names, or delivery-shape labels unless the user asks or needs an exact artifact name to continue.

For example:

> The app already exposes both quantities, so I can add the preview in one frontend change and cover valid and invalid input with focused tests. No API change is needed. Shall I implement it?

An exact instruction already approving that proposed route counts; a general request to implement does not. Fold the approval question into an existing plan or implementation confirmation when practical.

Reuse the approval while the target outcome, boundaries, material constraints, omitted-step reasons, and delivery shape remain unchanged. Present it again when new evidence makes an omitted step plausible or changes the route. When work needs durable continuation, record the approval scope and the complete route accounting—each of Research, Align, Design Doc, and Delivery Plan as needed or not needed, with its reason—in the canonical `Current` document, such as an alignment, design, plan, milestone index, or handoff. Do not create a separate state file.

## Complete a direct delivery

Continue from the settled outcome or exact bounded request and any approved design. Do not reopen them merely to repeat alignment, design, or planning. Do not make production edits until the current implementation route is approved. Before substantial edits, verify:

- the approved implementation route and its reasons for skipped steps
- the authoritative intent, observable completion, and outcome boundaries
- the next delivery change: one narrow observable outcome or justified enabler, plus the work deferred beyond it
- the settled expected behavior and preservation boundaries still fit the change
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

Start a human update with the result or decision in project language. Add only the validation, review status, or remaining risk needed to understand what happens next. Keep Ship's routing, artifact maintenance, and internal checks out of the update. End with one short action or question when the user must respond. When Markdown cannot make a consequential decision clear, read [references/review-artifacts.md](references/review-artifacts.md) and create the smallest useful review aid.
