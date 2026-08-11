---
name: "commit-simple"
description: "Prepare commits and push work, creating branches when needed. Use when committing, cherry-picking, or pushing changes."
---

# Commit

## 1. Inspect the repository

Inspect the current branch, repository default branch, expected base, working tree, staged changes, and diff.

## 2. Choose a branch

Choose the branch where the planned commits belong. On the default branch, propose a feature branch. Commit to the default branch only with explicit user approval.

Use `ticket-workspace` when the work needs a lasting work item or workspace, or when the current workspace is shared or dirty.

Name a new branch `{type}/sc-{number}/{slug}`, `{type}/gh-{number}/{slug}`, `{type}/{number}/{slug}`, or `{type}/{slug}`. In a ticket worktree, keep its ticket ID in the branch name.

## 3. Plan the commits

Decide whether the changes belong in one commit or several. Draft a Conventional Commit message for each commit.

Give every non-trivial commit a human-readable body that lets a reviewer understand the result without reopening the diff. Keep it proportional to the change. A trivial commit may omit the body.

Write the body about the result, not the process. Explain why the result matters, what changed, and any relevant trade-offs, compatibility, risks, or verification. Do not describe the conversation, prompting, agent workflow, or how the change was produced.

Record the body with multiple `-m` flags or an editor.

## 4. Present the plan

Show the destination branch, commit split, and validation status. For each commit, show its `Subject:` and `Body:`. State when a trivial commit has no body.

When the changes belong in separate commits, ask the user to confirm the split. When a decision has mutually exclusive choices, present each choice as a named option. Clarify any reply that does not select one.

## 5. Commit

Ask for explicit approval before each commit. After approval, create the agreed branch if needed and commit only the agreed changes with the approved message.

Commit approval does not include approval to push.

## 6. Push

Offer to push after committing. Push only after explicit approval.

Before pushing directly to the default branch, apply [the review gate](../../ship/ship/references/review-gate.md) to the delivered diff.

## Cherry-picks

Before cherry-picking, show the destination branch and exact commits in application order. If a requested commit depends on other commits, explain the expanded set and confirm the full set before applying it.

## Pull requests

If the user wants a pull request, hand off to `commit-pr`.
