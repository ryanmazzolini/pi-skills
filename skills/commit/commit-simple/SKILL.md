---
name: "commit-simple"
description: Prepare commits and push work, creating branches when needed, including branches in a pull-request stack. Use when committing, cherry-picking, or pushing changes.
---

# Commit

## Workflow

1. Inspect the current branch, repository default branch, expected base, working tree, staged changes, and diff. Identify any local or remote stack membership and the current layer's parent branch.
2. On the default branch, keep only trivial bug fixes and chores in place. For other work, propose a feature branch; use `ticket-workspace` when the work is durable or the current workspace is shared or dirty. Respect an explicit user choice to remain on the default branch. For a proposed layer in a locally tracked native stack, plan to create it with `gh stack add`; let `ticket-workspace` create branches managed in separate worktrees.
3. Decide whether the changes belong in one commit or several. Keep each stack layer focused, choose any needed branch, and draft each Conventional Commit message.
4. Present the branch, stack position when applicable, commit split, `Subject:`, `Body:`, and current validation evidence. A trivial change may omit the body. Confirm the split when changes belong in separate commits. Do not trigger exhaustive stack validation here; `commit-pr` and the review gate define the integrated validation target.
5. Ask for explicit approval before each commit. After approval, create the agreed branch with the approved ordinary or stack-aware method if needed, then create the commit with the approved message. Commit approval applies only to that branch.
6. Offer to push after committing, and push only after explicit approval. For `gh stack push`, include every active branch it can update in that one push confirmation; approval covers exactly the listed set. Before a direct-to-default-branch push, apply `../../ship/ship/references/review-gate.md` to the delivered diff.
7. If the user wants a pull request, hand off to `commit-pr`.

Present other mutually exclusive choices as named options. Clarify any reply that does not choose one.

## Branches and messages

- Name a new branch `{type}/sc-{number}/{slug}`, `{type}/gh-{number}/{slug}`, `{type}/{number}/{slug}`, or `{type}/{slug}`. In a ticket worktree, keep its ticket ID in the branch name.
- Give every non-trivial commit a human-readable body that lets a reviewer understand the result without reopening the diff. Make it proportional to the change.
- Write the body about the result, not the process: why it matters, what changed, and relevant trade-offs, compatibility, risks, or verification. Do not describe the conversation, prompting, agent workflow, or how the change was produced.
- Record the body with multiple `-m` flags or an editor.

## Cherry-picks

Before cherry-picking, show the destination branch and exact commits in application order. If the requested commit needs dependency commits, explain the expanded set and confirm the full set before applying it.
