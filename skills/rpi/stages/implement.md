# Implement stage

Use when executing the PRP or a local board slice.

If a board exists, load `contracts/board.md` and read `board/index.md` first. Load `guides/tdd.md` only when test-first implementation is a useful tactic for the current slice.

## Rules

- Board first when present: select from `Next` first; otherwise choose the highest-value unblocked `ready` slice.
- Treat slice IDs and filenames as stable references, not execution order.
- If no board exists, choose the highest-value outcome from `plan.md`.
- Implement to the slice end state; do not prescribe TDD unless it is useful.
- Every slice ends with relevant verification: automated checks when practical, otherwise manual QA, playtest, visual review, code review, or acceptance review.
- Keep `plan.md` stable. Update it only when intent, decisions, scope, or verification strategy changes.
- Track execution status in `board/index.md` and optional card files.
- Check in between slices/milestones.

## Board flow

1. Read `board/index.md`.
2. Select from `Next` first. If empty, choose one unblocked `ready` slice by value, risk reduction, and user priority.
3. Read the optional `Detail:` card only if the selected slice links one.
4. Move the selected slice to `in-progress` in `board/index.md`; update its card frontmatter too if a card file exists.
5. Implement the end state and acceptance criteria.
6. Run the slice's verification. If verification is manual-only, prepare clear steps/results for the user.
7. Move the slice to `review` or `done` based on evidence and user expectations.
8. Record deviations in `plan.md` only if they change durable intent; otherwise note them in the board/card.

## Review pass

After a slice passes, run focused reviews if practical:

- Correctness
- Robustness / maintainability
- Simplicity
- Security
- UX / accessibility / visual fit when relevant

Surface only useful findings. If correctness/security reveal real issues, recommend addressing them before continuing.
