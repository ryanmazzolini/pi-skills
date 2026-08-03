---
name: "commit-pr"
description: Create or update a draft pull request from the current branch. Use when opening or updating a PR.
---

# Pull Request

## Workflow

1. Identify the expected base. Inspect the commits, `git diff <base>...HEAD --stat`, the full branch diff, and any existing PR. Resolve unexpected commits or files. Treat an existing title, body, and test results as potentially stale.
2. Run focused checks while diagnosing problems, then run the repository's expected regression checks for final validation. If an expected check is blocked or impractical, say exactly what did not run and why, then ask how to handle the gap. That decision does not replace review or PR approval.
3. Confirm the final code-bearing branch diff has independent review under [the review gate](../../ship/ship/references/review-gate.md). Record any post-review changes and re-review only when the gate classifies them as material.
4. Recover the reader's missing context before drafting. When the diff and commits do not explain why the change exists, read the available issue or durable work item. Identify the affected user, caller, or workflow; the concrete limitation; the resulting behavior; and only the non-obvious details needed to review it.
5. Draft a clear title and a self-contained body from the current change and its relevant context. Use `Description`, `Details`, and `Testing`. When an issue is available from the branch name or user context, use its ID as the Markdown link text, for example `[sc-123](...)`.
6. Show the full title and body, base branch, review evidence, and validation status. Ask for confirmation or edits.
7. After explicit approval, push if needed and create or update the PR. Create new PRs as drafts. Show the PR URL and offer next steps.

## PR body

Treat the PR body as an interface for a reviewer who has not followed the discussion.

- `Description` — orient the reader in one or two short paragraphs. Name the affected user, caller, or workflow, explain the concrete limitation, and state the resulting behavior. Introduce project-specific terms through that explanation rather than assuming the reader knows them.
- `Details` — include only the behavior and non-obvious technical detail needed to review correctness. Use ordered steps for flows and bullets for separate facts. Prefer important decisions and invariants over decision history, exhaustive alternatives, or file-by-file narration.
- `Testing` — report validation from the current branch, relevant full-suite checks, boundary or migration exercises, and any omissions. Include screenshots or video for UI changes.

Keep simple changes short. Link supporting history or design records when useful instead of reproducing them in the body.

Before presenting, account internally for every changed commit and file. Stop when a reviewer with limited context can explain the concrete problem, resulting behavior, and the non-obvious details that matter to correctness.
