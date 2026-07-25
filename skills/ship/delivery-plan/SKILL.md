---
name: "delivery-plan"
description: Plan dependency-aware delivery changes for one approved benefit. Use only when Ship identifies several dependent implementation changes, PRs, migration steps, or worthwhile parallel work.
---

# Delivery Plan

Turn one approved benefit into the smallest useful `plan.md`, then stop before implementation. A delivery plan is optional. If one coherent direct change can deliver the benefit safely, tell Ship that no plan is needed rather than manufacturing one.

## Confirm the planning input

Use a caller-supplied workflow directory only after [`durable-context.md`](../ship/references/durable-context.md) classifies it as a relevant legacy workflow or this workspace profile's canonical work item. Otherwise follow that reference to locate or create the workflow. Do not independently create a repository `.plans` workflow.

Read:

1. The work-item index and its `Current` continuation.
2. `alignment.md`, or legacy `question.md`, when alignment was needed.
3. Existing `plan.md` when revising a plan.
4. The parent roadmap and milestone work-item index or current continuation when this work is one milestone.
5. Relevant `CONTEXT-MAP.md`, `CONTEXT.md`, ADRs, project documentation, code, tests, and history.

Extract the target benefit, observable completion, included and deferred outcomes, constraints, assumptions, open blockers, and confirmed UX/DX walkthrough when applicable. Resolve factual assumptions through inspection. Return to `align` when a consequential human decision remains or project evidence conflicts with the approved outcome.

Plan only when a dependency map or explicit delivery boundary would help execution. Common reasons are several PRs, migration sequencing, expand-migrate-contract work, independent branches, or a change too wide for one fresh session. Duration or production editing alone is not enough.

## Build delivery changes

A **delivery change** is a coherent PR-shaped implementation unit inside one approved benefit. It crosses every project layer needed for one narrow observable improvement and can be reviewed on its own. When the plan deliberately uses several PRs, each change should remain mergeable independently or state the exact stack dependency that prevents it.

Each delivery change must:

- fit in one fresh session
- trace to the target benefit and applicable walkthrough
- name implementation details only in concrete leaf tasks
- include its own verification evidence
- preserve a working repository state or state a necessary integration exception

Build the thinnest useful end-to-end change first. Do not plan horizontal sequences such as data → backend → UI or schema → producer → consumer. Put internal machinery in the first benefit step that needs it. Add a discovery change only when its result could stop or reshape delivery; state its bound and fallback.

A normal planned benefit often fits in 2–3 delivery changes. Each additional change needs its own delivery, safety, migration, ownership, or verification boundary. Keep speculative flexibility and unrelated improvements deferred.

## Record dependencies

Give every delivery change a stable short label and outcome name. Every change states **Depends on**, including `None`. Name a dependency only when it must finish before the dependent change can safely start. This field is the only execution-order authority; section order is for reading.

The **ready set** contains every incomplete change whose dependencies are complete. Validate that:

- every dependency names an existing change
- the graph has no cycles
- at least one change is ready
- every included behavior is covered
- every change traces to the target benefit

When a planned change maps to a PR worktree, record its worktree name, base branch, and merge condition. Let `ticket-workspace` create that worktree only when the human confirms it is ready to begin.

## Handle wide migrations

When a mechanical change cannot stay working because it breaks callers across the codebase, plan **expand → migrate → contract**:

1. Add the new form beside the old.
2. Migrate callers in independently verifiable batches.
3. Remove the old form only after every migration dependency completes.

Keep each change working and its checks passing when possible. If only final integration can pass, state why and add a dependent integration verification change.

## Write the plan

Keep `plan.md` short and current. A fresh session must be able to find:

- the target benefit and alignment or milestone authority
- observable completion and material deferred outcomes
- the confirmed walkthrough when applicable
- each delivery change's outcome and dependencies
- concrete leaf tasks
- PR/worktree mapping when relevant
- required verification evidence

Use this format:

```md
### Change A — [observable delivery]

**Depends on:** None | Change B — [name], Change C — [name]

[What becomes possible and why this delivery boundary helps.]

Tasks:
- [project surface]: [concrete leaf task]

Delivery: [direct branch or PR worktree, base, and merge condition when relevant]
Verification: [automated, manual, visual, playtest, or review evidence]
Covers: [target benefit and experience steps]
```

Use project language for outcomes and implementation names only in tasks. Point to alignment, milestone, or design authorities instead of repeating them.

## Review and hand off

Rerun the outcome and graph checks. For vault-native work, resolve `plan.md` and `index.md` through the workflow-profile helper before writing, then set `Current` to the plan. Preserve a verified legacy workflow in place.

Use selective early review from `../ship/references/review-gate.md` only for a named scope, dependency, or high-risk uncertainty. Explain the target benefit, deferred work that affects approval, dependency shape, ready changes, and important risk. Recommend the first ready change. End with one short question: **Is this delivery plan ready to use?**

The plan is ready when a fresh session can start every delivery change, graph checks pass, material review findings are closed or explicitly deferred, and the user approves it. Return execution to Ship.
