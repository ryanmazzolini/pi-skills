---
name: "commit-pr"
description: Create or update a draft pull request from the current branch. Use when opening or updating a PR.
---

# Pull Request

## Workflow

1. Identify the expected base. Inspect the commits, `git diff <base>...HEAD --stat`, the full branch diff, and any existing PR. Resolve unexpected commits or files. Treat an existing title, body, and test results as potentially stale.
2. Run focused checks while diagnosing problems, then run the repository's expected regression checks for final validation. If an expected check is blocked or impractical, say exactly what did not run and why, then ask how to handle the gap. That decision does not replace review or PR approval.
3. Confirm the final code-bearing branch diff has independent review under [the review gate](../../ship/ship/references/review-gate.md). Record any post-review changes and re-review only when the gate classifies them as material.
4. Trace the change end to end before drafting: the previous behavior, why it was insufficient, the resulting flow, important ordering or invariants, authority boundaries, relevant migration or rollout behavior, and explicit non-goals.
5. Draft a clear title and a self-contained body from the diff and commits against the base. Use `Description`, `Details`, and `Testing`. When an issue is available from the branch name or user context, use its ID as the Markdown link text, for example `[sc-123](...)`.
6. Show the full title and body, base branch, review evidence, and validation status. Ask for confirmation or edits.
7. After explicit approval, push if needed and create or update the PR. Create new PRs as drafts. Show the PR URL and offer next steps.

## PR body

Treat the PR body as an interface for a reviewer who has not followed the discussion.

- `Description` — explain what happened before, why it mattered, and what behavior results from this change. State important scope boundaries.
- `Details` — explain the changed path end to end when sequencing, persistence, state transitions, concurrency, or migration behavior affects correctness. Use ordered steps for flows and bullets for separate facts. Introduce concepts in plain language before code identifiers.
- `Testing` — report validation from the current branch, relevant full-suite checks, boundary or migration exercises, and any omissions. Include screenshots or video for UI changes.

Keep simple changes short. Expand `Details` only when the reviewer needs the context to understand behavior or risk; prefer decisions and invariants over file-by-file narration.

Before presenting, account internally for every changed commit and file. Stop when a new reviewer can explain the old behavior, the reason for the change, the new flow, what remains unchanged or authoritative, relevant risks, and how validation exercises the result.
