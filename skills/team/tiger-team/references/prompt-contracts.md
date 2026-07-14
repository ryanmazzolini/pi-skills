# Tiger Team Prompt Contracts

Use compact role contracts. Do not paste the whole tiger-team skill into child prompts.

## Implementer Prompt Must Include

- Confirmed slice outcome, assigned work unit, non-goals, acceptance criteria, assigned files/areas, and relevant context paths.
- Assigned worktree path, branch, and base ref.
- Whether local commits are approved. If approved: commit only on the assigned branch; no push/PR. If not approved: leave uncommitted diffs.
- Bootstrap rule: confirm the current cwd is the assigned worktree; create/reuse only the assigned path/branch if the parent explicitly authorized creation; otherwise ask supervisor.
- Injected skills when supported, or relevant skill names/file paths plus repo conventions to follow.
- 80/20 testing hint: add/run the focused checks most likely to catch regressions in the assigned work unit; avoid broad low-value scaffolding.
- Stop rule: ask supervisor for unapproved product/API/architecture/scope choices or conflicts.
- Handoff shape: changed files, commits or diff status, validation commands/results, risks, and decisions needing approval.

## Reviewer Prompt Must Include

- Review the integrated diff, not isolated work-unit assumptions.
- Fresh context; inspect files and diff directly.
- Read-only: do not modify project/source files.
- Model: use the host's highest-scrutiny reviewer model when configurable.
- Angle:
  - correctness/regressions;
  - maintainability/decoupling/idiomatic code;
  - security with `security-review` when warranted.
- Findings must be evidence-backed with file/line references and smallest safe fix.

## Fix/Integration Worker Prompt Must Include

- Accepted scope and explicit reviewer findings to apply.
- Worktree path/branch and whether local commits are approved.
- Implement only fixes worth doing now; preserve approved scope.
- Ask supervisor before resolving product/API/architecture conflicts.
- Run focused validation and report changed files, commits or diff status, validation, and remaining risks.
