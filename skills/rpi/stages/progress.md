# Progress stage

Use when the user wants bearings without changing workflow state.

## Process

1. Resolve the workflow directory or plan file.
2. Read `plan.md` and `board/index.md` if present.
3. Read optional card files only when the index summary is insufficient.
4. Summarize:
   - PRP status / end state
   - board status by slice
   - blockers
   - verification state
   - suggested next action

Do not modify files unless the user asks.
