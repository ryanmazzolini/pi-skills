---
name: rpi
description: Runs the RPI workflow for durable planning, research, design, local board execution, implementation, verification, progress checks, and fresh-session handoffs. Use for starting, continuing, saving, or verifying multi-step work.
---

# RPI Workflow

RPI is a durable, local-first workflow for work that should survive across sessions. It uses markdown artifacts plus progressive loading: read only the stage guidance needed for the current situation.

## Interface

Use natural language. Do not require stage parameters.

Examples:

- `/rpi start a workflow for replacing auth sessions`
- `/rpi continue the latest workflow`
- `/rpi make a board for this plan`
- `/rpi verify the local kanban board workflow`

If invoked through the pi `/rpi` extension, use any lightweight workflow candidates it provides. If invoked directly with `/skill:rpi`, inspect the repo yourself.

## Core rules

- **ARTIFACT-FIRST**: Build from files, not chat memory alone.
- **PROGRESSIVE LOADING**: Load one stage file at a time from `stages/` unless the task needs more.
- **NATURAL-LANGUAGE CONTROL**: Infer the next useful step from artifacts and user intent; ask only when ambiguity matters.
- **PLAN IS COMPASS, NOT RAILS**: Adapt as you learn and update artifacts when reality diverges.
- **LOCAL BOARD WHEN USEFUL**: For multi-slice implementation, use the board contract in `contracts/board.md`.
- **ONE BEHAVIOR AT A TIME**: For implementation, follow `guides/tdd.md`.
- **CONVERSATIONAL HANDOFF**: When a clean session would help, ask the user in chat. After they agree, call `rpi_handoff` with `user_confirmed: true`.

## Workflow artifacts

Prefer workflow directories under a plans root:

```text
{plans-root}/YYYY-MM-DD-[slug]/
  question.md
  research.md
  design.md
  structure.md
  plan.md
  board/
    index.md
    cards/
```

Plans root resolution convention:

1. `PI_SKILLS_PLANS_ROOT` if set
2. `thoughts/$PI_SKILLS_THOUGHTS_PROFILE/plans/` if set
3. existing `.plans/`
4. existing `thoughts/*/plans/`
5. existing `docs/plans/`
6. existing `PRPs/`
7. ask where to create new artifacts

## Stage selection

1. If the user asks for a specific action, load the matching stage.
2. Otherwise inspect artifacts:
   - no workflow: load `stages/question.md`
   - missing `question.md`: load `stages/question.md`
   - missing `research.md`: load `stages/research.md`
   - missing `design.md`: load `stages/design.md`
   - missing `structure.md`: load `stages/structure.md`
   - missing `plan.md`: load `stages/create.md`
   - `plan.md` chooses local board and `board/index.md` is missing: load `stages/board.md`
   - board exists or plan has remaining intent: load `stages/implement.md`
   - remaining intent/cards are complete: load `stages/verify.md`
3. For a lightweight single-concern task, load `stages/task.md`.
4. For bearings or checkpointing, load `stages/progress.md` or `stages/save.md`.

## Stage files

- Clarify: `stages/question.md`
- Research: `stages/research.md`
- Design: `stages/design.md`
- Structure: `stages/structure.md`
- Create plan: `stages/create.md`
- Create board: `stages/board.md`
- Implement: `stages/implement.md`
- Verify: `stages/verify.md`
- Progress: `stages/progress.md`
- Save: `stages/save.md`
- Lightweight task: `stages/task.md`

## Handoff

Use handoff when the next step is clear and a fresh context would help.

Conversation pattern:

```text
Question: Do you want me to start a fresh rpi session focused on [next step]?

Recommended answer: Yes — [why a clean context helps and what will be carried over].
```

After the user agrees, call `rpi_handoff` with:

- `user_confirmed: true`
- concise `next_step`
- optional `workflow_dir`
  - Passed to the fresh session as context only; the handoff tool does not create or validate it.
- compact `carryover` bullets
- `kickoff` that tells the fresh session to start working immediately
