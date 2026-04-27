# Verify stage

Use after implementation or when the user asks for a thorough pass against the plan.

## Rules

- Verify against `plan.md`, board cards, and stated acceptance criteria.
- Review automated check commands before running them; do not run destructive, credential-revealing, or network-mutating commands without explicit user approval.
- Distinguish complete, incomplete, and unverified outcomes.
- Surface deviations for user review.

## Process

1. Read `plan.md` and `board/index.md` if present.
2. Run safe commands from `Verification > Automated` after checking for shell metacharacter/path injection or destructive behavior.
3. Inspect relevant docs/code/artifacts for acceptance criteria.
4. Present `Verification > Manual` as a guide or execute manual checks where possible.
5. Update plan status only when evidence supports it.

## Output

Summarize:

- checks run
- results
- incomplete items
- deviations
- recommended next action
