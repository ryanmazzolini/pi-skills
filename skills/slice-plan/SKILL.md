---
name: "slice-plan"
description: Turn durable alignment artifacts or acceptance criteria into a compact RPI-compatible plan.md under .plans/, sequenced as MVP vertical slices. Use after converge/question.md, when planning implementation, or when a board would be overkill.
---

# Slice Plan

Turn aligned acceptance criteria into a compact durable `plan.md` that RPI can implement without requiring a board. This is the planning handoff after `converge`: `question.md` records alignment; `plan.md` records the MVP goal, vertical slices, verification, and deferred decisions.

## Artifact contract

Prefer an existing RPI workflow directory. If none is given, use the RPI plans-root convention from `../rpi/SKILL.md`; `.plans/YYYY-MM-DD-slug/` is the default when no project convention exists.

Write/update:

```text
{workflow-dir}/
  question.md   # input from converge when available
  plan.md       # output from this skill
  qa.md         # optional verification findings later
  board/        # optional; do not create by default
```

Do not create `board/index.md` unless the user asks or tracking needs statuses, blockers, parallel work, or a long handoff. RPI's implement stage can choose the next highest-value outcome directly from `plan.md`.

## Inputs

Read in order:

1. `{workflow-dir}/question.md` if present.
2. User-provided acceptance criteria.
3. `CONTEXT-MAP.md` if present, then the relevant root/context `CONTEXT.md` and ADRs for constraints and vocabulary.
4. Codebase files only far enough to name real layers and concrete leaf tasks.

If acceptance criteria are missing, unstable, or still hide high-reversal-cost choices, stop and use `converge` first. Don't invent criteria just to make a plan look complete.

## Plan abstract at the top, concrete only at the leaves

Predict coarsely at the top, precisely at the bottom. The top level is reliable about *direction* but vague about *implementation* — and that's correct. Only the leaves name concrete code. This lets you re-plan one subtask without re-planning the tree.

Three levels:

1. **Goal** (coarse): the user-observable outcome the MVP delivers. Defined by benefit, never by files.
2. **Slices** (mid): vertical cuts by feature, each delivering observable value on its own.
3. **Tasks** (leaf): concrete work. Leaf tasks may name modules, files, functions, scenes, commands, or tests.

Use domain language for the goal and slice names. Use implementation names only at the task leaves.

## Slicing rules

**Cut vertically by feature; identify the layers from the project; sequence as a tracer bullet.**

First, find the layers this project's work actually passes through — read CONTEXT.md and the codebase rather than assuming. Every project has a stack of layers a feature must cross to become real; name them in the project's own terms. For worked examples across web services, games, audio/MIDI tools, CLIs, and libraries, see `references/layer-examples.md` only if the project's layers aren't obvious.

Then: don't build a whole layer at a time. For the first slice, build the thinnest cut that crosses every layer and reaches the user — one happy path, end to end. Thicken each layer in later slices.

A tracer bullet proves the full path cheaply, so costly structural decisions get validated against real behavior early instead of after a horizontal layer is overbuilt.

## Ordering the slices

Order by **earliest user value per unit of irreversible commitment**. For each candidate slice estimate:

- **Value** — does the user observe a benefit when this ships?
- **Commitment cost** — how much hard-to-reverse structure, data shape, public contract, or core model does it lock in?

Do high-value / low-commitment slices first. Defer decisions that can be made later more cheaply.

## Output format

Write `{workflow-dir}/plan.md` using this compact RPI-compatible shape:

```md
---
source: {repo basename}
date: YYYY-MM-DD
type: slice-plan
goal: [one sentence]
---

# [Feature / Workflow Name]

**Status**: planned
**Workflow**: {workflow-dir}/

## Goal

[One line: the user benefit at MVP.]

## Acceptance Criteria

- [AC1: plain testable behavior.]
- [AC2: plain testable behavior.]

## Slice Plan

### Slice 1 — [name]  [first: high value, low commitment]

Tracer bullet: [the one end-to-end happy path this proves]

Tasks:
- [layer A]: [concrete task or "none"]
- [layer B]: [concrete task]
- [layer C]: [concrete task]

Verification: [automated/manual/playtest/visual/review proof]
Ships: [what the user can now do]
Covers: [AC1, AC2]

### Slice 2 — [name]

Tracer bullet: [what this thickens or adds]

Tasks:
- [layer A]: [task]
- [layer B]: [task]

Verification: [proof]
Ships: [observable value]
Covers: [AC3]

## Deferred

- [decision] — defer because [cheap to change later]

## Notes

- [Assumptions, dependencies, or follow-up context only.]
```

## Notes

- One tracer-bullet slice first, always. Everything else thickens layers behind it.
- A slice that ships nothing observable isn't a slice — fold it into one that does, or move it to Deferred.
- Keep leaves concrete and everything above abstract.
- Every slice must include verification and map back to acceptance criteria.
- If a slice forces a new high-reversal-cost decision, use `converge`/ADR rules instead of burying the decision in a task.
- After writing `plan.md`, ask whether to implement the first slice directly or create an optional board for tracking.
