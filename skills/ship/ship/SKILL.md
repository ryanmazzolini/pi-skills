---
name: "ship"
description: "Use before building, changing, or fixing anything beyond a trivial, exactly specified edit, including when the user floats an idea and asks for thoughts. Works out which choices belong to the user and how to deliver the change. Also use when asked to plan or split work across several PRs or milestones, when the work grows beyond what was approved, when resuming after a context reset or from existing workflow files, and before presenting, pushing, or releasing the finished code."
---

# Ship

For every change, establish what it should do and what it should leave alone before choosing a solution. A small, precisely specified change may need only a quick check. Use the broader goal to understand the request, not to grow it. Take the work to its next useful human checkpoint with the least process that keeps the outcome clear and recoverable.

Research, alignment, design review and delivery planning answer different questions. Each is optional. Before production edits, check whether the user has explicitly approved the current implementation route. Ask only if that approval is missing.

After every context compaction, read [references/recovery.md](references/recovery.md) first. Also read it when workflow files or an interruption leave the state unclear.

## Settle expectations and scope

Inspect the request, the live repository, project evidence and any existing workflow. Before proposing a solution or delivery chunks, establish:

- **Result:** who the work helps, what they can then do or understand, and what counts as done.
- **Behavior:** for an interface change, the current and intended user or caller walkthroughs, including feedback, completion, failure and recovery states. Otherwise, one concrete path to the result, or the behavior that must not change. Reuse walkthroughs that already settle this.
- **Scope:** what the change includes, what it excludes or defers, and which behavior, interfaces and UI it must preserve.

Reuse settled decisions and exact, bounded requests. When these are already clear, don't ask the user to restate the rationale, approve again or write an alignment document.

Establish facts from the live system, code, tests, automation and docs. Use [`research`](../research/SKILL.md) only when real uncertainty blocks a trustworthy decision. Keep current behavior, requested behavior and your proposal distinct.

Stop before choosing a solution or implementing when sources of intent conflict, or when finishing would mean inventing a consequential choice: one where plausible answers change the goal, priority, value, experience, scope, risk or overall direction. Bring each such choice to the user in the form that settles it fastest, and mix forms when choices differ:

- a focused question with a recommendation ([`align`](../align/SKILL.md))
- a proposed design to react to
- a before/after sketch of the shape
- a throwaway [`prototype`](../prototype/SKILL.md)

Don't ask what inspection or research can answer.

For example, a small preference toggle can change existing users' behavior. If its default is unspecified and the plausible defaults differ in effect, settle it first. If its behavior and what it must preserve are already decided, reuse those decisions, and any approval that covers the change, without asking again.

The check is done when result, behavior and scope are clear without inventing a consequential choice. Don't walk the user through it; bring only the choices it leaves open. If the result would change something the user asked to preserve, explain the conflict and ask. Suggest related improvements separately; they are not approved work.

## Decide whether to review the design

Use [`design-doc`](../design-doc/SKILL.md) before choosing a delivery shape only when implementation would otherwise make an implicit choice about the experience, system fit, program shape or build order, and finding it wrong after coding would mean expensive rework. Skip it when those choices are already decided, obvious, trivial or cheap to reverse.

A design review makes a solution legible. It does not settle conflicting intent or replace delivery planning. After approval, come back here to choose the delivery shape.

## Choose the delivery shape

- **Direct:** one settled outcome or exact, bounded request that needs one coherent change, with no useful dependency graph.
- **Planned:** one settled outcome that needs several changes, when explicit boundaries would help execution or recovery. Use `delivery-plan`. Signs include one change depending on another, PRs or releases that must land separately, a migration or rollout that needs sequencing, and parallel work worth doing.
- **Roadmap:** several independently useful outcomes that need durable coordination or recovery. See [references/roadmaps.md](references/roadmaps.md).

Pick the lightest shape that keeps the settled intent and useful boundaries. An MVP is a destination, not one delivery. Keep work direct only when every part is needed for the same narrow, observable outcome; plan or defer any other independently reviewable outcome or enabling change. Size, time, branches, worktrees, PRs and session count don't decide the boundary on their own.

## Confirm the implementation route

Ship may start Research, Align, Design Doc or Delivery Plan on its own when their triggers are met. Ask for route approval only once intent is settled, and never bundle it with an open product, safety, scope or experience decision.

Before production implementation, decide once for each of Research, Align, Design Doc and Delivery Plan whether it is needed, with a reason. Keep this to yourself while the work is session-local. Consider Prototype only when an experiential uncertainty makes it plausible, and Roadmap only when several independently useful outcomes do. Don't invent reasons to mention them on ordinary work.

Ask for approval in plain project language. Lead with the change and how you'll deliver it. Mention investigation, a decision, upfront design or sequencing only if it will happen before implementation. Don't list routine steps you'll skip. When a skipped step matters to the approval, say what you'll leave out and the boundary or risk that creates, not the process name. Don't show checklists, `Use`/`Skip` sections, workflow names or delivery-shape labels unless the user asks or needs an exact artifact name. For example:

> The app already exposes both quantities, so I can add the preview in one frontend change and cover valid and invalid input with focused tests. No API change is needed. Shall I implement it?

An exact instruction approving that route counts; a general "implement it" does not. Fold the question into an existing plan or implementation confirmation when you can.

The approval holds while the outcome, boundaries, material constraints, skip reasons and delivery shape stay the same. Ask again when new evidence makes a skipped step plausible or changes the route. When work must survive a fresh session, record the approval scope and the four needed/not-needed decisions with reasons in the workflow's current continuation document, such as an alignment, design, plan, milestone index or handoff. For vault-native work that is the document the work-item index's `Current` pointer names ([references/durable-context.md](references/durable-context.md)); a legacy workflow keeps its own convention. Don't create a separate state file.

## Complete a direct delivery

Continue from the settled outcome and any approved design without reopening them just to repeat alignment, design or planning. Make no production edits until the current route is approved. Before substantial edits, check:

- the approved route and why steps were skipped
- the intent, observable completion and boundaries
- the next change (one narrow outcome or justified enabler) and what is deferred past it
- that the expected behavior and preservation boundaries still fit
- the live repository, cwd, branch and worktree
- allowed scope, existing work to preserve and known sibling work
- validation that exercises the real behavior and an important failure path

Ask about a gap only when it could materially change the settled value, behavior, scope or risk.

On the default branch, propose a feature branch; commit to the default branch only with explicit approval. Use `ticket-workspace` when the work is durable or the workspace is shared or dirty.

Make ordinary repo-native interface, data and structure choices yourself. Use the shaping branch of the `architecture` skill when the user asks for shaping or a consequential local design choice needs its checkpoints, and apply its simplest-sufficient-change lens before every implementation. Defer cleanup, optimization, generalization and machinery this delivery doesn't need.

Finish, validate and present this delivery before starting another. Stop sooner if implementation reveals another independently reviewable change, an open consequential choice or a conflict with intent. Use `delivery-plan` for the extra change, and `align` only when human judgment is still needed.

A long direct delivery doesn't need workflow files. When it must survive a fresh session or context reset, read [references/durable-context.md](references/durable-context.md) and create only a minimal continuation record. Keep it direct unless the intent or the coherence of the delivery changes.

## Resume after alignment

Alignment settles a human choice that evidence can't. Its approval doesn't require design review or a delivery plan: come back here, decide whether design review is warranted, then choose the delivery shape.

A [`prototype`](../prototype/SKILL.md) can settle a choice at any point, with or without alignment. Its verdict settles only that choice and doesn't authorize production implementation.

## Execute a delivery plan

Dependencies in `plan.md`, not section order, decide which changes can start. Recommend the most useful ready change and say why, then get confirmation before starting or dispatching it. Include the route in that confirmation if it isn't already approved.

Run one change synchronously unless it holds independent work units worth the integration cost; then read [references/implementation-wave.md](references/implementation-wave.md). The Ship coordinator owns concurrency and integration. Validate and present each change before starting the next.

## Navigate a roadmap

A roadmap coordinates human-centered milestones, not tasks or PRs. Follow [references/roadmaps.md](references/roadmaps.md) to find ready milestones from their dependencies, recommend the next useful one, and keep parent and child authority separate. Get confirmation before creating or materially changing a roadmap, and before starting or dispatching a milestone. Each selected milestone comes back here and takes the route it needs.

## Choose the next checkpoint

The live project and the canonical work-item files decide the current state; conversation and notes only help find it. Take the first that applies:

1. A final code-bearing delivery lacks required independent review: apply [references/review-gate.md](references/review-gate.md).
2. Completed work has passed any required review and awaits approval: present the checkpoint and wait.
3. An investigation tied to a decision remains: use `research`, then return to the checkpoint it informs.
4. A consequential human decision remains: bring it to the user as a question, a proposed design, a before/after sketch or a prototype, whichever settles it fastest.
5. Settled intent still hides costly implicit solution choices: use `design-doc`.
6. Implementation is ready but its route lacks current approval: present the route and wait.
7. An approved outcome has a delivery plan with a ready change: recommend it.
8. An approved roadmap has a ready milestone: recommend it.
9. A direct continuation is clear: resume it.
10. The work is done or closed: follow [references/graduation.md](references/graduation.md) if a durable work item exists; otherwise report the result.

If the state is truly ambiguous, give your reading and ask one direct question. Don't add tracking fields to avoid reading the evidence.

## Record and present results

Record material decisions, scope changes, approved routes, results and validation as they happen. Keep a change's evidence with its plan entry, and a milestone's in its work item.

Before presenting a final code-bearing delivery for approval, apply [references/review-gate.md](references/review-gate.md). Alignment, plans and intermediate checkpoints don't need broad independent review by default.

Open a human update with the result or decision in project language. Add only the validation, review status or risk needed to understand what happens next. Leave out Ship's routing, file upkeep and internal checks. End with one short action or question when the user must respond. When Markdown can't make a consequential decision clear, read [references/review-artifacts.md](references/review-artifacts.md) and make the smallest useful review aid.
