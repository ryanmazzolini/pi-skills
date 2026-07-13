---
name: "commit-pr"
description: Create or update a draft pull request from the current branch. Use when opening or updating a PR.
---

# Pull Request

## Workflow

1. Identify the expected base, then inspect the commits, `git diff <base>...HEAD --stat`, full branch diff, and existing PR status. Resolve unexpected commits or files before drafting.
2. Run targeted checks for diagnosis and the repository's expected regression checks for final validation.
3. If expected checks are blocked or impractical, state exactly what did not run and why, then ask whether to proceed.
4. Draft a clear PR title and a slim body with `Description`, `Details`, and `Testing`.
5. Show the full PR title, body, base branch, and validation status; ask for confirmation or edits.
6. After confirmation, push if needed and create or update the draft PR.
7. Show the PR URL and offer next steps.

## Rules

- Draft the PR from the diff and commits against the base branch.
- Include an issue markdown link (eg. [sc-123](..)) when one is available from the branch name or user context.
- Keep the PR body slim with these sections:
  - `Description` — explain the motivation first, then the concrete change.
  - `Details` — high-level implementation notes only when they add useful context
  - `Testing` — repo-level verification, relevant full-suite tests/checks, explicit omissions or blockers, and screenshots/videos when UI changed (use tools like Playwright or agent-browser for screenshots).
- Ask before pushing, creating, or updating a PR.
- Create PRs as draft first, then offer follow-up actions.

## PR description style

- Write for a reviewer who has not followed the prior discussion.
- Lead with why the change matters, then describe what changed.
- Describe the resulting code/product behavior, not the path taken to get there.
- Prefer concrete facts over workflow labels: name the old behavior, missing capability, or risk when it matters.
- Keep it concise; move file-by-file detail to `Details`.
- Add deep links.
