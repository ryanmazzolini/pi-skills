---
name: "commit-pr"
description: Create or update a pull request from the current branch, including draft or ready state and existing GitHub PR stacks. Use when opening or updating a PR.
---

# Pull Request

## Workflow

1. Treat a standalone PR as the default. Use a stack only when the user requested one, the branch already belongs to one, or an approved delivery plan explicitly names a chain where a later PR must build on an unmerged lower layer and continuing or reviewing it before that layer merges is useful. A large diff, several commits or worktrees, or several independent PRs is not enough. When a stack applies, read [the stacked pull request reference](../references/stacked-pull-requests.md).
2. Identify the expected base. Inspect the commits, `git diff <base>...HEAD --stat`, the full branch diff, and any existing PR. For a selected stack, also inspect its complete topology and each layer's state, but draft the current layer only from its parent-branch diff. Resolve unexpected commits, files, bases, or dependencies. Treat existing PR metadata and test results as potentially stale.
3. Run focused checks while diagnosing problems, then run or reuse the repository's expected regression checks for the integrated target defined by [the review gate](../../ship/ship/references/review-gate.md). If an expected check is blocked or impractical, say exactly what did not run and why, then ask how to handle the gap. That decision does not replace review or PR approval.
4. Confirm the final code-bearing target has independent review under the review gate. Record any post-review changes and re-review only when the gate classifies them as material.
5. Trace the change end to end before drafting: the previous behavior, why it was insufficient, the resulting flow, important ordering or invariants, authority boundaries, relevant migration or rollout behavior, and explicit non-goals.
6. Draft a clear title and a self-contained body from the diff and commits against the base. Use `Description`, `Details`, and `Testing`. When an issue is available from the branch name or user context, use its ID as the Markdown link text, for example `[sc-123](...)`.
7. Show the full title and body for every PR whose metadata will be created or updated, each base branch, the complete branch and PR set affected by the operation, review evidence, and validation status. Ask for one confirmation covering that exact set.
8. After explicit approval, push if needed and create or update the PR. Create new PRs as drafts unless the user approved ready-for-review state. Verify the resulting base, metadata, and state; for a stack, also verify its order. Show the relevant PR URLs and offer next steps.

## PR body

Treat the PR body as an interface for a reviewer who has not followed the discussion.

- `Description` — explain what happened before, why it mattered, and what behavior results from this change. State important scope boundaries.
- `Details` — explain the changed path end to end when sequencing, persistence, state transitions, concurrency, or migration behavior affects correctness. Use ordered steps for flows and bullets for separate facts. Introduce concepts in plain language before code identifiers.
- `Testing` — report validation from the current branch, relevant full-suite checks, boundary or migration exercises, and any omissions. Include screenshots or video for UI changes.

Keep simple changes short. Expand `Details` only when the reviewer needs the context to understand behavior or risk; prefer decisions and invariants over file-by-file narration.

Before presenting, account internally for every changed commit and file. Stop when a new reviewer can explain the old behavior, the reason for the change, the new flow, what remains unchanged or authoritative, relevant risks, and how validation exercises the result.
