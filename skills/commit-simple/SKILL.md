---
name: commit-simple
description: Branch, commit, and push changes. Use when preparing a commit or pushing work.
---

# Commit

Use this skill when creating a branch, committing changes, or pushing work.

## Rules

- If the current branch is `main` or `master`, propose a new branch before committing.
- For new branches, use `{type}/sc-{number}/{slug}`, `{type}/gh-{number}/{slug}`, `{type}/{number}/{slug}`, or `{type}/{slug}`.
- When working inside a ticket worktree folder, keep the branch aligned with the folder's ticket id.
- Use Conventional Commits for commit messages.
- Split unrelated work into separate commits.
- Show the proposed commit message before committing.
- Push only after user confirmation.
- Hand pull request work off to `commit-pr`.

## Workflow

1. Check the current branch, working tree, and staged changes.
2. If needed, propose a branch name and confirm branch creation.
3. Draft a Conventional Commit message from the diff.
4. Ask for confirmation before committing.
5. Offer to push after the commit.
6. If the user wants a pull request, suggest `commit-pr` as the next step.
