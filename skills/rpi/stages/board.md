# Board stage

Use when `plan.md` chooses a local board or when implementation should be split into tracer-bullet cards.

Load `contracts/board.md` before writing cards.

## Rules

- `plan.md` remains canonical; cards are the execution queue.
- Each card is an end-to-end vertical slice.
- Mark cards `AFK` or `HITL`.
- Make blockers explicit in `blocked_by`.
- Keep `board/index.md` compact; card bodies carry detail.

## Process

1. Read `plan.md`, then `structure.md` if present.
2. Create `board/` and `board/cards/` beside `plan.md`.
3. Write 3-7 normal-feature cards unless the work is clearly smaller/larger.
4. Regenerate the index with the helper script resolved relative to this skill's `SKILL.md`. Pass the workflow path as one argument; do not interpolate untrusted path text into a shell command.

```bash
node "{path-to-rpi-skill}/scripts/update-board-index.mjs" "{workflow-dir}"
```

Do not assume the current project has a `./scripts/` directory; installed skills live outside the target repo.

## Check-in

Ask the user to review granularity, order/blockers, and AFK/HITL classification. If a fresh implementation context would help, ask conversationally before calling `rpi_handoff`.
