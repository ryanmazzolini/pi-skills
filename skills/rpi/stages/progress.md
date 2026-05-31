# Progress stage

Use when the user wants bearings without changing workflow state.

## Process

1. Resolve the workflow directory or plan file.
2. Read `plan.md`, `board/index.md` if present, and `qa.md` if present.
3. Read optional card files only when the index summary is insufficient.
4. Summarize:
   - plan status / end state
   - slice progress from `plan.md`, `qa.md`, or board status when present
   - blockers
   - verification state
   - suggested next action

Do not modify files unless the user asks.
