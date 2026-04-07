---
name: commit-pr
description: Create or update a draft pull request from the current branch. Use when opening or updating a PR.
---

# Pull Request

Use this skill when opening or updating a pull request from the current branch.

## Rules

- Draft the PR from the diff and commits against the base branch.
- Include an issue reference when one is available from the branch name or user context.
- Keep the PR body slim with these sections:
  - `Description` — the problem, why it matters, and how the PR solves it
  - `Details` — high-level implementation notes only when they add useful context
  - `Testing` — testing completed, still needed, or frontend screenshots/videos when UI changed
- Show the full PR title and body before creating or updating the PR.
- Create PRs as draft first, then offer follow-up actions.

## Workflow

1. Inspect the branch diff and commits against the base branch.
2. Check whether a pull request already exists for the current branch.
3. Draft a clear PR title and a slim body with `Description`, `Details`, and `Testing`.
4. Ask for confirmation or edits.
5. Push if needed, then create or update the draft PR.
6. Show the PR URL and offer next steps.
