---
name: "slice-plan"
description: Turn approved Now scope into a compact plan with explicit dependencies. Use when ship routes settled alignment to planning.
---

# Slice Plan

Turn approved Now scope into the smallest implementable `plan.md`. Stop before implementation.

## Confirm the planning input

Use a caller-supplied workflow directory only after [`durable-context.md`](../ship/references/durable-context.md) classifies it as a relevant legacy workflow or this workspace profile's canonical work item. Otherwise follow that reference to locate the workflow. Do not independently create a repository `.plans` workflow.

Read:

1. `{workflow-dir}/alignment.md`; fall back to the legacy `question.md` only when `alignment.md` is absent.
2. Existing `plan.md` when revising a plan.
3. Relevant `CONTEXT-MAP.md`, `CONTEXT.md`, ADRs, and project documentation.
4. Inspect code, tests, and history until you can identify current behavior, affected layers, integration boundaries, and concrete leaf tasks.

Compare the approved understanding with the project. Resolve factual assumptions through inspection. Do not base the plan on an unchecked assumption. Return to `align` when project evidence conflicts with approved scope or solution direction, or when a remaining assumption could change the plan.

Extract the goal, Now, Later, assumptions, open blockers, and the confirmed UX/DX walkthrough when Now changes an interface. Plan only when:

- Now and Later are explicit and consistent.
- The primary walkthrough is confirmed when applicable.
- Every decision only the user can make that could meaningfully change Now is settled.

Otherwise return to `align`. When revising an overbuilt plan, remove structure outside approved Now.

## Build outcome slices

Start with the smallest complete outcome a user, caller, or operator can recognize. For an interface change, start with a complete step from the confirmed walkthrough. Then identify every project layer needed to make that outcome real.

Use **tracer-bullet slices** for ordinary work. A tracer-bullet slice crosses the layers needed for one narrow, recognizable outcome and stops when that outcome can be demonstrated or verified on its own. Each slice must:

- fit in one fresh session
- trace to Now and, when applicable, its walkthrough
- name implementation details only in concrete leaf tasks
- include its own verification evidence

Build the thinnest useful end-to-end outcome first. Add behavior only where Now requires it. Prefer early user value and evidence over irreversible structure and infrastructure.

Do not plan horizontal sequences such as data → backend → UI or schema → producer → consumer. Put internal machinery in the first outcome that needs it. Create a separate discovery slice only when its result could stop or reshape the plan; state what it investigates, its bound, and its fallback.

A normal Now often fits in 1–3 slices. Each additional slice must have its own delivery, safety, migration, or verification boundary. Keep other research inside the outcome it supports. Add supporting machinery only when a Now outcome requires it. Put future flexibility in Later.

## Record dependencies

Give every slice a stable short label and outcome name. Every slice states **Depends on**, including `None`. Name a dependency only when that slice must finish before this one can safely start. This field is the only execution-order authority; section order is only for reading.

The **ready set** contains every incomplete slice whose dependencies are complete. A chain is valid for linear work. Independent branches may become ready together.

Check the graph after drafting:

- every dependency names an existing slice
- the graph has no cycles
- at least one slice is ready
- every Now requirement is covered
- every slice traces to Now

Use a temporary diagram or review artifact only when it helps explain the graph.

## Handle wide refactors

When a mechanical change cannot stay working because it breaks callers across the codebase, plan **expand → migrate → contract**:

1. Add the new form beside the old.
2. Migrate callers in independently verifiable batches. Branch batches that do not depend on each other.
3. Remove the old form only after every migration dependency is complete.

Keep each step working and its checks passing when possible. If only final integration can pass, state the exception and add a dependent slice for integration verification.

## Write the plan

Keep `plan.md` short and update it as understanding changes. A fresh session must be able to find:

- the goal and alignment source
- Now and Later
- the confirmed UX/DX walkthrough when applicable
- every slice's observable outcome and dependencies
- concrete leaf tasks
- required verification evidence
- the Now requirements each slice covers

Use this slice format:

```md
### Slice A — [outcome name]

**Depends on:** None | Slice B — [name], Slice C — [name]

[What becomes possible and why this slice exists.]

Tasks:
- [project layer or surface]: [concrete leaf task]

Verification: [automated, manual, visual, playtest, or review evidence]
Covers: [requirements and experience steps in Now]
```

Use project language for goals and slice names. Use implementation names only in tasks. Point to alignment or design authorities instead of repeating them.

## Review and hand off

Rerun the scope gate and graph checks. For a vault-native work item, apply its target validator immediately before writing `{workflow-dir}/plan.md` or updating `index.md`, then set `Current` to the plan. Write a legacy plan in its verified directory. Do not request broad independent review by default. Use the selective early-review guidance in `../ship/references/review-gate.md` only for a named scope, dependency, or high-risk uncertainty, then resolve or explicitly defer any resulting finding.

Ask one direct question: is the plan correct enough to approve? Include the Now and Later boundary, dependencies, ready work, recommendation, and important remaining risk—nothing else.

The plan is ready when the scope and graph checks pass, a fresh session can start every slice, any selective review findings are closed or explicitly deferred, and the user approves the plan. Stop there and return execution to `ship`.
