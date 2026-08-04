---
name: "commit-simple"
description: Prepare commits and push work, creating branches when needed. Use when committing, cherry-picking, or pushing changes.
---

# Commit

## Workflow

1. Inspect the current branch, repository default branch, expected base, working tree, staged changes, and diff.
2. On the default branch, propose a feature branch. Commit to the default branch only with explicit user approval. Use `ticket-workspace` when the work is durable or the current workspace is shared or dirty.
3. Decide whether the changes belong in one commit or several. Choose any needed branch and draft each Conventional Commit message.
4. Present the branch, commit split, `Subject:`, `Body:`, and validation status. A trivial change may omit the body. Confirm the split when changes belong in separate commits.
5. Ask for explicit approval before each commit. After approval, create the agreed branch if needed and create the commit with the approved message.
6. Offer to push after committing, and push only after explicit approval. Before a direct-to-default-branch push, apply `../../ship/ship/references/review-gate.md` to the delivered diff.
7. If the user wants a pull request, hand off to `commit-pr`.

Present other mutually exclusive choices as named options. Clarify any reply that does not choose one.

## Branches and messages

- Name a new branch `{type}/sc-{number}/{slug}`, `{type}/gh-{number}/{slug}`, `{type}/{number}/{slug}`, or `{type}/{slug}`. In a ticket worktree, keep its ticket ID in the branch name.
- Give every non-trivial commit a human-readable body that lets a reviewer understand the result without reopening the diff. Make it proportional to the change.
- Write the body about the result, not the process: why it matters, what changed, and relevant trade-offs, compatibility, risks, or verification. Do not describe the conversation, prompting, agent workflow, or how the change was produced.
- Record the body with multiple `-m` flags or an editor.

## Cherry-picks

Before cherry-picking, show the destination branch and exact commits in application order. If the requested commit needs dependency commits, explain the expanded set and confirm the full set before applying it.
