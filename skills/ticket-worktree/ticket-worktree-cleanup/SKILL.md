---
name: "ticket-worktree-cleanup"
description: "Safely remove completed ticket-worktree folders after checking git state."
disable-model-invocation: true
argument-hint: "ticket id, slug, or path"
---

# Ticket Worktree Cleanup

The user invoked this skill to retire a ticket workspace. Cleanup is destructive; run it like a lockout/tagout.

## Scope

A ticket workspace is the ticket folder used by `ticket-worktree`:

```text
<workspace-root>/worktrees/<ticket-slug>/<repo-worktree>/
```

Clean the ticket folder as the unit of work. Never broaden cleanup outside that folder unless the user explicitly asks.

## 1. Pin the target

Find exactly one ticket folder:

- If the current path is inside `/worktrees/<ticket-slug>/...`, use that ticket folder as the first candidate.
- If the user gave a path, resolve it and verify it is either the ticket folder or one repo folder inside it.
- If the user gave a ticket id/slug, search only likely roots: nearest parent `worktrees`, `~/git/worktrees`, `~/personal/worktrees`, and any user-provided root.

Use shallow, targeted `find` commands. Do not scan the whole home directory. Do not read secrets, credential files, or `.env` files.

Completion: exactly one ticket folder is selected, or you stop and ask the user to choose.

## 2. Take inventory

For each immediate child directory of the ticket folder:

- Classify it as a linked Git worktree, regular Git checkout, or non-repo directory.
- Record branch, `git status --short --branch`, upstream/tracking state, and whether the path is the current working directory.
- Record untracked/non-repo files that would remain if repo worktrees were removed.

Completion: every child path has a classification and any dirty, unpushed, untracked, detached, or non-repo state is visible in the summary.

## 3. Gate destructive work

Before deleting anything, summarize:

- ticket folder path
- repo worktree paths to remove
- dirty/unpushed/detached blockers
- leftover non-repo files or directories
- branch cleanup options, if any

Ask for explicit confirmation. If there are blockers, recommend the smallest safe next action instead of forcing. Do not run `git worktree remove`, `rm -rf`, `git branch -d/-D`, `git push --delete`, or `git worktree prune` before confirmation.

Completion: the user has approved the exact cleanup actions, or cleanup stops with the unresolved blockers.

## 4. Remove only what was approved

Execute exactly the approved list, nothing beside it:

- Remove linked worktrees with `git worktree remove <path>`, run from another worktree of the same repo, never from inside the path being removed.
- Remove the emptied ticket folder with `rmdir`; use `rm -rf` only for approved leftovers.
- Delete local branches only when approved and merged; force-delete local branches or delete remote branches only when the user named them.

Completion: approved paths are gone, skipped paths are named with the reason, and no unapproved path was touched.

## 5. Verify

Run a final narrow check:

- `git worktree list` in each affected repo no longer lists removed paths.
- the ticket folder is gone, or only approved/skipped leftovers remain.

Report what changed and any follow-up branches or directories the user may still want to handle.
