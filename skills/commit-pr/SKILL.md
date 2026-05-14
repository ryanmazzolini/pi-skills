---
name: commit-pr
description: Create or update a draft pull request from the current branch. Use when opening or updating a PR.
---

# Pull Request

Use this skill when opening or updating a pull request from the current branch.

## Workflow

1. Inspect the branch diff, commits, base branch, and existing PR status.
2. Draft a clear PR title and a slim body with `Description`, `Details`, and `Testing`.
3. Show the full PR title and body to the user and ask for confirmation or edits.
4. After confirmation, push if needed and create or update the draft PR.
5. Show the PR URL and offer next steps.

## Rules

- Draft the PR from the diff and commits against the base branch.
- Include an issue reference when one is available from the branch name or user context.
- Keep the PR body slim with these sections:
  - `Description` — explain the motivation first, then the concrete change. Describe the product/codebase state before and after, not the development process.
  - `Details` — high-level implementation notes only when they add useful context
  - `Testing` — repo-level verification when practical, relevant targeted checks, anything still needed, and screenshots/videos when UI changed.
- Ask before pushing, creating, or updating a PR.
- Create PRs as draft first, then offer follow-up actions.

## PR description style

- Write for a reviewer who has not followed the prior discussion.
- Lead with why the change matters, then describe what changed.
- Describe the resulting code/product behavior, not the path taken to get there.
- Prefer concrete facts over workflow labels: name the old behavior, missing capability, or risk when it matters.
- Keep it concise; move file-by-file detail to `Details`.
