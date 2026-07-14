---
name: "commit-simple"
description: Branch, commit, and push changes. Use when preparing a commit or pushing work.
---

# Commit

## Workflow

1. Inspect the current branch, expected base, working tree, staged changes, and diff.
2. Propose any branch change, commit split, and Conventional Commit message(s).
3. After confirmation, create the branch if needed and commit.
4. Offer to push after the commit.
5. If the user wants a pull request, suggest `commit-pr` as the next step.

## Cherry-picks

Before cherry-picking, show the destination branch and exact commits in application order. If one requested commit requires additional dependency commits, explain the expansion and confirm the full set before applying it.

## Rules

- If there are logically separate changes, propose separate commits and confirm the plan before committing.
- If the current branch is `main` or `master`, ask the single yes/no question: “Create a new branch before committing?” When offering mutually exclusive actions, ask the user to name one option and clarify any reply that does not select one.
- For new branches, use `{type}/sc-{number}/{slug}`, `{type}/gh-{number}/{slug}`, `{type}/{number}/{slug}`, or `{type}/{slug}`.
- When working inside a ticket worktree folder, keep the branch aligned with the folder's ticket id.
- Use Conventional Commits for commit messages.
- When proposing a commit, show both `Subject:` and `Body:` unless the change is typo-only, formatting-only, or similarly trivial.
- For any non-trivial change, **always** include a human-readable commit body with enough reviewer context to understand the resulting change without reopening the full diff.
- Make the body proportional to the change. A small change may need one short paragraph; a complex change may need multiple paragraphs or bullets.
- Focus the body on the resulting change: why it matters, what behavior/API/module/workflow/docs changed, and any important tradeoffs, compatibility notes, risks, or verification context.
- Omit the development process: do not describe the conversation, prompting, agent workflow, or steps taken to arrive at the change.
- When committing, use multiple `-m` flags or an editor so the body is actually recorded, not just proposed.
- Ask before each commit or push.
- Handoff pull request work to `commit-pr`.
