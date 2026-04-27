# Implement stage

Use when executing a plan or a local board card.

Load `guides/tdd.md`. If a board exists, load `contracts/board.md` and read `board/index.md` first.

## Rules

- Board first when present: select the highest-value unblocked `ready` card.
- Otherwise select the highest-value `Remaining Intent` milestone.
- Use one-behavior-at-a-time TDD.
- Every step ends with relevant checks green.
- Track deviations in `plan.md`.
- Check in between cards/milestones.

## Board flow

1. Read `board/index.md`.
2. Select one unblocked `ready` card.
3. Read only that card body.
4. Move it to `in-progress` and regenerate index.
5. Implement acceptance criteria with red-green-refactor.
6. Move to `review` or `done`, regenerate index, and update `plan.md`.

## Review pass

After a card/milestone passes, run focused reviews if practical:

- Correctness
- Robustness / maintainability
- Simplicity
- Security

Surface only useful findings. If correctness/security reveal real issues, recommend addressing them before continuing.
