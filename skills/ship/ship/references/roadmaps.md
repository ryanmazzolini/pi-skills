# Milestone Roadmaps

Use a roadmap only when several independently useful human or caller benefits need durable coordination or recovery under one shared destination. The shared destination may be an MVP; each milestone is one useful increment toward it, not the whole MVP as a single delivery scope. A low-complexity coherent change stays direct only when its named improvements are all required for the same observable outcome rather than independently deliverable or reviewable outcomes. Multiple files, sessions, branches, PRs, or implementation dependencies do not by themselves justify a roadmap.

## Frame human-centered milestones

A **milestone** is the roadmap's vertical outcome slice. It names one benefit that can be approved, delivered, or abandoned independently. It is not a task group, phase, branch, PR, status, or percentage.

Before creating files, inspect breadth-first and propose:

- the shared destination and observable completion
- each milestone's benefit and completion condition
- dependencies that truly prevent one milestone from starting
- sharp open decisions
- in-scope uncertainty that is not precise enough to become a decision
- explicit boundaries

Keep fog visible instead of inventing premature milestones. A question is sharp when it can be stated precisely, even if it cannot yet be answered. Route sharp questions to inspection, [`research`](../../research/SKILL.md), Align, or Prototype as appropriate. Keep any pending research and retained result linked from the sharp question it blocks. When bounded prerequisite work must make a decision possible, route it through Align and link the sharp question to Align's pending checklist and retained result. Prerequisite work does not deliver the destination.

Ask for one semantic confirmation of the roadmap, milestone boundaries, and dependency graph. That confirmation authorizes the corresponding workflow files. It does not authorize prerequisite work, tickets, workspace movement, branches, worktrees, implementation dispatch, commits, pushes, pull requests, releases, or deployments.

## Keep the parent low resolution

The parent work item owns `roadmap.md` and points `Current` to it. The roadmap contains only:

- destination and completion
- shared decisions and boundaries
- milestone names, benefits, completion conditions, links, and dependencies
- sharp open decisions and unresolved fog

The parent is an index, not an executable plan. Do not copy milestone alignment, implementation tasks, validation, or progress into it. Do not add stored ready, blocked, stage, or percentage fields.

Use this compact milestone shape:

```md
### [Human-centered milestone]

**Benefit:** [What becomes useful to a person or caller.]
**Complete when:** [Observable result.]
**Depends on:** None | [other milestone names]
**Work item:** [link to milestone index]
```

Dependencies, not section order, determine the ready set. A milestone with no incomplete dependencies is ready. Prefer the ready milestone that delivers the earliest usable or learnable value. Choose risk reduction first only when it materially unlocks or protects that value. Explain why and get confirmation before starting it.

## Give every milestone a stable home

Roadmap approval creates one minimal sibling work item per milestone so links and dependencies survive fresh sessions. Its `index.md` records the project, ticket, profile, workspace, parent roadmap, benefit, completion condition, and dependencies. Until another continuation exists, `Current` may point to the milestone index itself.

Add `alignment.md`, `design.md`, `plan.md`, a ticket workspace, or review evidence only when that milestone's chosen route needs it. A selected milestone returns to Ship to choose and approve its current Research, Align, Design Doc, and Delivery Plan route before production implementation.

A milestone may need several PRs without becoming several milestones. Route those boundaries through `delivery-plan`. Keep each PR independently mergeable by default; use a stack only when the plan records the exact technical dependency that prevents it.

## Complete and reconcile milestones

Graduating a milestone records its durable `Result` in its own index. The parent derives completion from that result and may add a one-line outcome gist with the link; the milestone remains the detailed authority. Recompute the ready set and recommend the next useful benefit.

When a parent decision or dependency changes, identify affected milestone descendants. Do not rewrite their alignments or plans from the parent. Route each affected milestone through its own Ship state, returning to Align when human judgment is needed.

After any decision, research result, prototype verdict, or prerequisite that affects roadmap fog, revisit only that parent fog. Remove any patch that has become specifiable, add the resulting sharp question, and propose any newly justified milestone or boundary change under the confirmation rule below. Keep milestone detail in its milestone work item.

Get confirmation before materially changing the graph or boundaries: adding, reparenting, merging, abandoning, or rescoping a milestone; changing a dependency that changes the route; or invalidating approved milestone behavior. Mechanical link repair and derived completion refresh after approved delivery do not need another confirmation.

Close the roadmap when every intended milestone has a durable result or the human explicitly removes or closes the remaining benefits. Record the overall result in the parent index and keep it pointed at the roadmap or most useful result evidence.
