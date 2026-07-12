---
name: "slice-plan"
description: Turn approved alignment or acceptance criteria into a dependency-shaped plan.md of vertical slices. Use when planning implementation after align or within a durable tick workflow.
---

# Slice Plan

Turn shared understanding into a `plan.md` that a fresh session can implement slice by slice. Model the work's real dependencies; document order is for reading only.

## Inputs

Prefer a workflow directory supplied by the caller. Otherwise reuse the relevant directory under an existing `.plans/`, `.plan/`, or `docs/plans/`; create `.plans/YYYY-MM-DD-slug/` when the plan needs to survive the session and no project convention exists.

Read:

1. `{workflow-dir}/alignment.md`, falling back to legacy `question.md`.
2. Existing `plan.md` when revising rather than starting over.
3. Relevant `CONTEXT-MAP.md`, `CONTEXT.md`, and ADRs.
4. Code only far enough to identify real layers, seams, and concrete leaf tasks.

The alignment does not need fixed headings or numbered requirements. Derive testable outcomes from its settled understanding. If an open human decision could change requirements, scope, or high-level solution shape, return to `align` instead of inventing an answer.

## Slice the work

Start from the user-observable goal and approved high-level shape. Identify the layers the work actually crosses from project docs and code; do not assume a web stack.

Each ordinary slice is a **tracer bullet**:

- a narrow but complete path through the relevant layers
- independently demonstrable or verifiable
- small enough for one fresh context
- concrete only at task leaves
- traceable to the settled requirements it satisfies

Build the thinnest useful path first when dependencies allow it, then thicken behavior in later slices. A slice that delivers no observable outcome belongs inside a slice that does, unless it is part of the wide-refactor exception below.

## Record dependencies, not order

Give every slice a stable short label and name. Every slice states **Depends on**, including `None`. Dependencies are the single source of truth for execution order; the order of sections carries no scheduling meaning.

Use a dependency only when another slice must finish before this one can safely start. After drafting, verify:

- every dependency names an existing slice
- the graph has no cycles
- at least one slice is ready
- every requirement is covered or explicitly deferred

The **ready set** is every incomplete slice whose dependencies are complete. A simple chain is valid when the work is genuinely linear; branching is equally valid when independent work becomes ready together.

Do not duplicate the dependency ledger in another maintained section. Generate a temporary diagram or review artifact when it helps a human understand the graph, but keep each slice's `Depends on` field authoritative.

## Wide refactors

A wide mechanical change may be impossible to ship as ordinary vertical slices because one edit breaks callers across the codebase. Model it as **expand → migrate → contract**:

1. Expand by adding the new form beside the old.
2. Migrate callers in independently verifiable batches, branching when batches do not depend on one another.
3. Contract by removing the old form after every migration dependency is complete.

Keep each step green when possible. If only a final integration point can be green, state that exception and make integration verification an explicit dependent slice.

## Plan contract

Keep `plan.md` adaptive, but make it possible for a fresh session to identify:

- the goal and alignment source
- each slice's outcome and actual dependencies
- concrete leaf tasks
- verification evidence required
- the settled requirements each slice covers
- deferred work or decisions

A canonical slice is compact:

```md
### Slice A — [outcome name]

**Depends on:** None | Slice B — [name], Slice C — [name]

[What becomes possible and why this slice exists.]

Tasks:
- [project layer or surface]: [concrete leaf task]

Verification: [automated, manual, visual, playtest, or review evidence]
Covers: [settled requirements in the alignment artifact]
```

Use project language for goals and slice names. Use implementation names only in tasks. Point to alignment or design authorities instead of restating them.

## Review the plan

Write or update `{workflow-dir}/plan.md`, then present the dependency shape, current ready set, and your recommended next slice or safe asynchronous wave. Ask the user or active workflow coordinator to correct the slices and dependencies.

The plan is ready when the graph checks pass, each slice can be picked up cold, and the human or coordinator confirms the proposed shape. Stop there; execution belongs to `tick` or the chosen coordinator.
