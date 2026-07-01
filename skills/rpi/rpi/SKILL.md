---
name: rpi
description: Runs a local-first alignment, PRP, board, implementation, verification, and fresh-session handover workflow. Use for starting, continuing, saving, verifying, or handing over durable multi-step work.
---

# RPI Workflow

RPI is a durable, local-first workflow for work that should survive across sessions. It uses markdown artifacts plus progressive disclosure: keep the default path simple, and load optional playbooks only when the work earns them. In this workflow, the PRP is the implementation-ready prompt/plan captured in `plan.md`.

## Interface

Use natural language. Do not require stage parameters.

Examples:

- `/rpi start a workflow for replacing auth sessions`
- `/rpi continue the latest workflow`
- `/rpi draft a PRP from our questions`
- `/rpi make a board for this PRP`
- `/rpi verify the workflow`
- `/rpi handover continue this workflow from plan.md and board/index.md`

If invoked through the pi `/rpi` extension, use any lightweight workflow candidates it provides. If invoked directly with `/skill:rpi`, inspect the repo yourself.

## Core rules

- **ARTIFACT-FIRST**: Build from files, not chat memory alone.
- **PROGRESSIVE DISCLOSURE**: Load one stage file at a time from `stages/` unless the task needs more.
- **ALIGNMENT GATE**: Unless the user explicitly says to just do it, briefly align before writing durable artifacts or implementing.
- **QUESTION LOG THEN PLAN**: Capture meaningful alignment in `question.md`, then draft/update the compact plan/PRP in `plan.md`.
- **PLAN IS INTENT, BOARD IS OPTIONAL TRACKING**: Keep `plan.md` focused on end state, acceptance criteria, slices, decisions, and verification; use `board/index.md` only when status tracking, blockers, parallel work, or long handoffs need it.
- **VERIFY OUTCOMES**: Each slice needs clear proof. Automated checks are preferred when practical, but manual QA, playtests, visual review, and acceptance review are valid.
- **ARCHITECTURE WHERE IT MATTERS**: For domain modeling, module boundaries, public APIs, service contracts, or testing strategy, load `references/architecture.md`.
- **CONVERSATIONAL HANDOVER**: After writing a durable artifact, ask whether a fresh pi session should continue from it. After the user agrees, suggest a readable `/rpi handover <brief>` command.
- **PORTABLE HANDOFFS**: For out-of-scope, cross-agent, prototype, review, or debug threads that need a markdown context packet instead of immediate pi session automation, suggest `/skill:handoff <focus>`.

## Default path

```text
alignment gate → question.md → plan.md → implement/verify
                         ↘ board/index.md only when tracking is useful
```

Use this path for non-trivial work. For an explicit "just do it" request, respect the user and proceed directly with the smallest safe implementation/verification loop.

## Workflow artifacts

Prefer workflow directories under a plans root:

```text
{plans-root}/YYYY-MM-DD-[slug]/
  question.md       # compact decision interview log
  plan.md           # compact plan/PRP: end state, acceptance criteria, slices, decisions, verification
  board/            # optional status tracker for complex/long-running workflows
    index.md        # compact execution manifest
    cards/          # optional detailed slice files
  research.md       # optional facts cache
  design.md         # optional architecture/design decision artifact
  structure.md      # optional complex sequencing artifact
  qa.md             # optional verification / feedback notes
```

Plans root resolution convention:

1. `PI_SKILLS_PLANS_ROOT` if set
2. existing `.plans/` or `.plan/`
3. existing `docs/plans/`
4. existing `PRPs/`
5. `.plans/` for new local artifacts unless the user chooses a tracked docs location

## Routing

1. If the user asks for a specific action, load the matching stage.
2. If the user explicitly says "just do it", perform the task and verify it without forcing artifacts.
3. If intent or scope is ambiguous, load `stages/question.md`.
4. If alignment exists but `plan.md` is missing or stale, load `stages/create.md`.
5. If `plan.md` needs status tracking, blockers, parallel work, or a longer handoff, load `stages/board.md`.
6. If the user wants action, load `stages/implement.md`; if they want bearings, load `stages/progress.md`. Both handle `plan.md` with or without a board.
7. If implementation is complete or the user asks for a check, load `stages/verify.md`.

Optional playbooks:

- Load `stages/research.md` only when facts are expensive to rediscover, external docs matter, or the codebase is unfamiliar.
- Load `stages/design.md` when meaningful technical tradeoffs need separate design alignment.
- Load `stages/structure.md` when sequencing is too complex for the PRP plus board.
- Load `stages/task.md` for small durable tasks that do not need the full workflow.
- Load `stages/save.md` before pausing.

## Stage files

Load only the stage needed for the current step. Also load `references/architecture.md` when the stage involves domain-driven design, module boundaries, interfaces, or architectural testing strategy.

- Align / question log: `stages/question.md`
- Create PRP: `stages/create.md`
- Create board: `stages/board.md`
- Implement: `stages/implement.md`
- Verify / QA: `stages/verify.md`
- Progress: `stages/progress.md`
- Save: `stages/save.md`
- Lightweight task: `stages/task.md`
- Optional research: `stages/research.md`
- Optional design: `stages/design.md`
- Optional structure: `stages/structure.md`

## Handover and handoff

Use `/rpi handover <brief>` when the next step is clear and a fresh pi context should start working immediately from RPI artifacts.

Use `/skill:handoff <focus>` when the user needs a portable markdown context packet for another tool, an out-of-scope thread, a prototype/review/debug branch, or a session that should not auto-start in pi.

Conversation pattern:

```text
Question: Do you want me to start a fresh rpi session focused on [next step]?

Recommended answer: Yes — [why a clean context helps and which artifact it will continue from].
```

After the user agrees, suggest one readable command:

```text
/rpi handover <brief>
```

Keep `<brief>` concise and copyable. Include the workflow directory when known, because the fresh session starts with clean context.

Example:

```text
/rpi handover Continue workflow /path/to/plans/2026-04-28-62230-invoice-match-backend-search; implement the next board slice and start by reading plan.md and board/index.md.
```

Do not encode handover data or use hidden session state. `/rpi handover <brief>` owns creating the clear-context session.
