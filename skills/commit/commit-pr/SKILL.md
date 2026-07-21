---
name: "commit-pr"
description: Create or update a draft pull request from the current branch. Use when opening or updating a PR.
---

# Pull Request

## Workflow

1. Identify the expected base. Inspect the commits, `git diff <base>...HEAD --stat`, the full branch diff, and any existing PR. Resolve unexpected commits or files before drafting.
2. Run focused checks while diagnosing problems, then run the repository's expected regression checks for final validation. If an expected check is blocked or impractical, say exactly what did not run and why, then ask how to handle the gap. That decision does not replace review or PR approval.
3. Confirm the exact branch diff has current independent review under [the review gate](../../ship/ship/references/review-gate.md). Reuse review evidence only while its target is unchanged.
4. Draft a clear title and a slim body from the diff and commits against the base. Use `Description`, `Details`, and `Testing`. When an issue is available from the branch name or user context, use its ID as the Markdown link text, for example `[sc-123](...)`.
5. Show the full title and body, base branch, review evidence, and validation status. Ask for confirmation or edits.
6. After explicit approval, push if needed and create or update the PR. Create new PRs as drafts. Show the PR URL and offer next steps.

## PR body

- `Description` — lead with why the change matters, then explain the resulting product or code behavior.
- `Details` — include high-level implementation context only when it helps the reviewer.
- `Testing` — report repository-level validation, relevant full-suite checks, and any omissions or blockers. Include screenshots or video for UI changes.

Write for a reviewer who has not followed the discussion. Prefer concrete facts to workflow labels, omit file-by-file detail unless it helps review, and add useful deep links.
