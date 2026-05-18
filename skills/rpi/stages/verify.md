# Verify stage

Use after implementation, during QA, or when the user asks for a thorough pass against the PRP/board.

## Rules

- Verify against `plan.md`, `board/index.md`, optional card files, and stated acceptance criteria.
- Review automated check commands before running them; do not run destructive, credential-revealing, or network-mutating commands without explicit user approval.
- Automated checks are preferred when practical, but manual QA, playtests, visual/design review, code review, and acceptance review are valid verification modes.
- Distinguish complete, incomplete, and unverified outcomes.
- Surface deviations for user review.
- Update `plan.md` only when evidence changes durable intent/status; use `board/index.md`, card notes, or `qa.md` for execution findings.

## Process

1. Read `plan.md` and `board/index.md` if present.
2. Read optional detail cards only for slices being verified.
3. Run safe automated verification commands after checking for shell metacharacter/path injection or destructive behavior.
4. Execute or describe manual verification steps where appropriate.
5. Inspect relevant docs/code/artifacts for acceptance criteria.
6. Write or update `qa.md` when verification findings are substantial or should become follow-up board slices.
7. Update board statuses only when evidence supports it.

## Output

Summarize:

- outcomes verified
- checks/reviews run
- results
- incomplete or unverified items
- deviations
- recommended next action
