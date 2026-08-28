---
name: "delivery-plan"
description: Plan dependency-aware delivery changes for one approved benefit. Use only when Ship identifies several dependent implementation changes, PRs, migration steps, or worthwhile parallel work.
---

# Delivery Plan

Turn one approved benefit into the smallest useful `plan.md`, then stop before implementation. A delivery plan is optional. If one coherent direct change can deliver the benefit safely, tell Ship that no plan is needed rather than manufacturing one.

Keep planning mechanics in `plan.md`. When talking to the user, lead with what becomes possible, why the work must be separated, and which concrete change can start. Do not make them decode delivery-change labels, dependency-graph checks, ready sets, enablers, or Ship workflow names unless an exact name helps them review the plan.

## Confirm the planning input

Use a caller-supplied workflow directory only after [`durable-context.md`](../ship/references/durable-context.md) classifies it as a relevant legacy workflow or this workspace profile's canonical work item. Otherwise follow that reference to locate or create the workflow. Do not independently create a repository `.plans` workflow.

Read:

1. The work-item index and its `Current` continuation.
2. `alignment.md`, or legacy `question.md`, when alignment was needed.
3. Existing `plan.md` when revising a plan.
4. The parent roadmap and milestone work-item index or current continuation when this work is one milestone.
5. Relevant `CONTEXT-MAP.md`, `CONTEXT.md`, ADRs, project documentation, code, tests, and history.

Extract the target benefit, observable completion, included and deferred outcomes, constraints, assumptions, open blockers, and confirmed UX/DX walkthrough when applicable. Resolve narrow factual assumptions through inspection. Return to Ship for `research` when investigation could reduce material uncertainty about the framing, assumptions, evidence, or available approaches and thereby stop or reshape delivery. Return to `align` when a consequential choice remains or project evidence conflicts with the approved outcome.

Plan only when a dependency map or explicit delivery boundary would help execution. Common reasons are several PRs, migration sequencing, expand-migrate-contract work, independent branches, or a change too wide for one fresh session. Duration or production editing alone is not enough.

## Build delivery changes

A **delivery change** is a coherent PR-shaped implementation unit inside one approved benefit. Prefer one narrow observable user, caller, or business improvement that crosses every project layer it needs and can be reviewed on its own.

A technical **enabler** may precede that improvement only when migration, compatibility, security, rollout safety, or a specific verification risk cannot safely co-land with its consumer. Include that consumer as a delivery change which depends on the enabler. Name why they cannot safely land together, the protected risk, and what remains working after the enabler merges. “Foundation,” convenience, generic test infrastructure, future-proofing, and technical layering alone do not justify an enabler.

Each delivery change must:

- fit in one fresh session
- contain one primary outcome or one justified enabling boundary
- trace to the target benefit and applicable walkthrough
- state who can do what differently, or name the enabler's immediate consumer and protected risk
- name implementation details only in concrete leaf tasks
- include its own verification evidence
- remain independently understandable, testable, reversible, and mergeable, or state the necessary integration exception
- preserve a working repository state or state a necessary integration exception with its dependent verification change

Build the thinnest useful end-to-end change first. Do not use horizontal sequences such as data → backend → UI or schema → producer → consumer merely to make diffs smaller. Put internal machinery in the first valuable change that needs it. Keep a schema-only or other technical change separate only when it meets the enabler rule above. Add a discovery change only when its result could stop or reshape delivery; state its bound and fallback.

Make the first delivery change the thinnest useful one. Add another only for a distinct delivery, safety, migration, ownership, or verification boundary. Keep cleanup, optimization, speculative flexibility, generalization, and unrelated improvements deferred until a delivered outcome or observed evidence requires them.

## Record dependencies

Give every delivery change a stable short label and outcome name. Every change states **Depends on**, including `None`. Name a dependency only when it must finish before the dependent change can safely start. This field is the only execution-order authority; section order is for reading.

The **ready set** contains every incomplete change whose dependencies are complete. Validate that:

- every dependency names an existing change
- the graph has no cycles
- at least one change is ready
- every included behavior is covered
- every change traces to the target benefit
- every enabler has a named consuming change with a dependency edge

Prefer successive PRs based on the updated default branch after the preceding PR merges. Do not create a stack merely for concurrent review or to partition technical layers. Record an exact stack dependency only when a compatibility seam cannot make the later change independently mergeable.

When a planned change maps to a PR worktree, record its worktree name, base branch, and merge condition. Let `ticket-workspace` create that worktree only when the human confirms it is ready to begin.

## Handle wide migrations

When a mechanical change cannot stay working because it breaks callers across the codebase, plan **expand → migrate → contract**:

1. Add the new form beside the old.
2. Migrate callers in independently verifiable batches.
3. Remove the old form only after every migration dependency completes.

When removal belongs to the approved outcome, treat contract as its required final delivery boundary rather than unrelated cleanup. Keep each change working and its checks passing when possible. If only final integration can pass, state why and add a dependent integration verification change.

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
Covers: [user, caller, or business outcome; for an enabler, its immediate consumer and protected risk]
```

Use project language for outcomes and implementation names only in tasks. Point to alignment, milestone, or design authorities instead of repeating them.

## Review and hand off

Rerun the outcome and graph checks. For vault-native work, resolve `plan.md` and `index.md` through the workflow-profile helper before writing, then set `Current` to the plan. Preserve a verified legacy workflow in place.

Use selective early review from `../ship/references/review-gate.md` only for a named scope, dependency, or high-risk uncertainty. Lead with the result and the first change you recommend. Explain only the deferred behavior, ordering constraint, or risk that could affect approval. Do not reproduce the `plan.md` schema, headings, labels, or graph checks in the conversation; when the sequence matters, use a short numbered list of concrete project changes. End with one short question: **Can we use this plan to start the first change?**

The plan is ready when a fresh session can start every delivery change, graph checks pass, material review findings are closed or explicitly deferred, and the user approves it. Return execution to Ship.
