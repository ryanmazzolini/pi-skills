---
name: "slice-plan"
description: Slice approved Now scope into a compact dependency-shaped plan. Use when ship routes settled alignment to planning.
---

# Slice Plan

Turn approved Now scope into the smallest implementable `plan.md`. Later is deferred. Every slice must trace to Now.

## Inputs and scope gate

Prefer a workflow directory supplied by the caller. Otherwise reuse the relevant directory under an existing `.plans/`, `.plan/`, or `docs/plans/`; create `.plans/YYYY-MM-DD-slug/` when the plan needs to survive the session and no project convention exists.

Read:

1. `{workflow-dir}/alignment.md`, falling back to legacy `question.md`.
2. Existing `plan.md` when revising rather than starting over.
3. Relevant `CONTEXT-MAP.md`, `CONTEXT.md`, and ADRs.
4. Code only far enough to identify real layers, seams, and concrete leaf tasks.

Before slicing, extract the goal, Now, Later, assumptions, open blockers, and the confirmed UX/DX walkthrough when Now changes an interface. The scope gate passes when Now and Later are explicit and non-contradictory, the primary walkthrough is confirmed when applicable, and every human decision capable of materially changing Now is settled. Otherwise return to `align`. When revising an overbuilt plan, replace its out-of-scope structure with the approved Now scope.

## Slice the work

When Now changes an interface, start from the smallest complete walkthrough a person or caller can recognize. Otherwise, start from the next observable operational outcome. Then use the approved high-level shape and project code to identify the layers the outcome crosses.

Each ordinary slice is a **tracer bullet**:

- a narrow but complete path through the relevant layers
- completes a recognizable step of the confirmed UX/DX flow when interface-facing
- independently demonstrable or verifiable
- small enough for one fresh context
- concrete only at task leaves
- traceable to a requirement in Now

Build the thinnest useful end-to-end path first, then thicken it only where Now requires more behavior. Rank candidate slices by user value relative to irreversible commitment; prefer early evidence over early infrastructure.

A sequence such as data → backend → UI or schema → producer → consumer is horizontal even when the final plan becomes end to end. Fold that machinery into the first slice that completes a recognizable flow unless an earlier technical proof can independently stop or reshape the plan; model such a proof as a bounded discovery gate with a stated fallback.

A normal Now often fits in 1–3 slices. For each additional slice, state the independent delivery, safety, migration, or verification boundary that earns it. Fold internal machinery into the first observable slice that needs it. Keep prerequisite research inside the affected slice unless its result could independently stop or reshape the plan; a separate discovery gate must be bounded and state its fallback.

Add supporting machinery only when a Now outcome requires it. Place future flexibility in Later.

## Record dependencies

Give every slice a stable short label and name. Every slice states **Depends on**, including `None`. Dependencies are the single source of truth for execution order; section order is for reading only.

After drafting, verify:

- every dependency names an existing slice
- the graph has no cycles
- at least one slice is ready
- every Now requirement is covered
- every slice traces to Now

The **ready set** is every incomplete slice whose dependencies are complete. A simple chain is valid when the work is genuinely linear; branching is equally valid when independent work becomes ready together.

Keep each slice's `Depends on` field authoritative. Generate a temporary diagram or review artifact when it helps a human understand the graph.

## Wide refactors

A wide mechanical change may be impossible to ship as ordinary vertical slices because one edit breaks callers across the codebase. Model it as **expand → migrate → contract**:

1. Expand by adding the new form beside the old.
2. Migrate callers in independently verifiable batches, branching when batches do not depend on one another.
3. Contract by removing the old form after every migration dependency is complete.

Keep each step green when possible. If only a final integration point can be green, state that exception and make integration verification an explicit dependent slice.

## Plan contract

Keep `plan.md` adaptive, but make it possible for a fresh session to identify:

- the goal and alignment source
- Now and Later
- the confirmed UX/DX walkthrough when applicable
- each slice's observable outcome and actual dependencies
- concrete leaf tasks
- required verification evidence
- the Now requirements each slice covers

A canonical slice is compact:

```md
### Slice A — [outcome name]

**Depends on:** None | Slice B — [name], Slice C — [name]

[What becomes possible and why this slice exists.]

Tasks:
- [project layer or surface]: [concrete leaf task]

Verification: [automated, manual, visual, playtest, or review evidence]
Covers: [requirements and experience steps in Now]
```

Use project language for goals and slice names. Use implementation names only in tasks. Point to alignment or design authorities instead of restating them.

## Review the plan

After drafting, rerun the scope gate and dependency checks. Write or update `{workflow-dir}/plan.md`, then follow `../ship/references/review-gate.md` before presenting the completed plan for approval. Present Now and Later, the dependency shape, the current ready set, the review evidence, and your recommended next slice or safe asynchronous wave. Ask the user to correct the scope, slices, and dependencies.

The plan is ready when both gates pass, each slice can be picked up cold, its review findings are closed or explicitly deferred, and the human confirms the proposed shape. Stop there; execution returns to `ship`.
