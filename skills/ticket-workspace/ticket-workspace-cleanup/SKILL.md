---
name: "ticket-workspace-cleanup"
description: "Remove completed ticket worktrees and local branches, optionally delete their upstream branches, and leave any Herdr pane open for manual closure."
disable-model-invocation: true
argument-hint: "ticket id, slug, or path"
---

# Ticket Workspace Cleanup

The user invoked this skill to retire a ticket workspace. Cleanup is destructive; run it like a lockout/tagout.

## Scope

A ticket workspace is the ticket folder used by `ticket-workspace`:

```text
<workspace-root>/worktrees/<ticket-slug>/<pr-worktree>/
```

Clean the ticket folder as the unit of work. Never broaden cleanup outside that folder unless the user explicitly asks.

When `HERDR_ENV=1`, run cleanup in the calling pane and leave that pane open. Do not hand off cleanup, prompt another agent, focus another pane, or close any pane. Keep the calling pane's session spine—the pane shell, its Pi process, and the exact foreground command chain Pi launched for the current cleanup step. Never signal those processes. Do not exempt an older or unrelated descendant merely because the pane shell or Pi is its ancestor; classify it normally as safe to stop or as a blocker.

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
- Record branch, `git status --short --branch`, upstream/tracking state, and whether the path is the current working directory. Upstream deletion supports only a remote with exactly one fetch URL and one identical push URL, as reported by `git remote get-url --all <remote>` and `git remote get-url --push --all <remote>`; exclude custom or multi-destination push configurations. For each eligible upstream branch, query `git ls-remote --heads <remote> refs/heads/<branch>` and record its object ID or absence.
- Record untracked/non-repo files that would remain if repo worktrees were removed.
- Treat a regular Git checkout as a blocker outside the standard worktree cleanup. Do not reduce it to an approved leftover: removing it requires separate approval after inventorying unique refs, repository-local configuration, unpushed objects, and ignored files.
- List complete process trees with a working directory inside the target, including every PID, command, and cwd. Identify the calling pane's session spine from current pane and process state: its pane shell, Pi process, and exact foreground command chain for the current cleanup step. Mark only that spine as expected self-processes. Classify every other descendant normally: clearly disposable dev servers or watchers are safe to stop; other Pi/agent, shell, editor, shared, or ambiguous processes are blockers. An incomplete scan is a blocker.

Completion: every path and process is classified, and all dirty, unpushed, untracked, detached, non-repo, process, or calling-pane state is visible.

## 3. Gate destructive work

Before deleting anything, summarize:

- ticket folder path
- repo worktree paths to remove
- dirty/unpushed/detached blockers
- leftover non-repo files or directories
- expected self-processes, safe process trees, and process blockers
- local branches eligible for deletion
- upstream branches eligible for optional deletion, with exact remote names, branch names, and inventoried object IDs
- whether the calling Herdr pane will remain open with its working directory removed

Ask the user to confirm the exact processes, worktrees, local branches, ticket-folder contents, and any upstream branches to remove. Upstream deletion is excluded unless the user explicitly approves the named remote branch at its inventoried object ID. If there are blockers, recommend the smallest safe next action instead of forcing. Do not signal a process or run `git worktree remove`, `rm -rf`, `git branch -d/-D`, `git push --delete`, or `git worktree prune` before confirmation.

Completion: the user has approved the exact local cleanup and separately chosen whether to delete each named upstream branch, or cleanup stops with unresolved blockers.

## 4. Remove only what was approved

Execute exactly the approved list, nothing beside it:

1. Re-scan, then `SIGTERM` only confirmed safe PIDs; omit broad selectors such as `pkill node`. If the tree changed or a blocker appeared, ask again. Verify every PID exits and ask before `SIGKILL`. Never signal the calling pane's session spine, but do not protect an unrelated descendant based only on ancestry.
2. Remove linked worktrees with `git worktree remove <path>`, run from a surviving worktree of the same repo, never from inside the path being removed.
3. Delete approved local branches only after their worktrees are removed and only when they are merged. Force-delete a local branch only when the user named that exact action.
4. Remove the emptied ticket folder with `rmdir`; use `rm -rf` only for approved leftovers.
5. Delete an upstream branch only when the user approved that exact remote and branch. Immediately before deletion, verify the remote still has exactly one fetch URL and one identical push URL, then query it with `git ls-remote --heads <remote> refs/heads/<branch>`. Stop if its URL configuration changed, its object ID differs from the inventoried ID, or the branch is already absent. Guard the deletion against a later race with `git push --force-with-lease=refs/heads/<branch>:<inventoried-oid> <remote> :refs/heads/<branch>`; treat a rejected lease as changed state and stop.

When the calling Pi's cwd is inside the target, run the approved mutations and verification as one final shell operation whose first action moves to a surviving repository path and that never returns to the target cwd. Perform local branch and ticket-folder cleanup before optional upstream deletion. Do not invoke another tool after that operation.

Completion: approved processes have exited; approved worktrees, local branches, ticket-folder paths, and upstream branches are gone; skipped items are named with the reason; the calling pane is still open; and no unapproved process, path, branch, or pane was touched.

## 5. Verify

Run a final narrow check:

- confirmed processes are gone
- `git worktree list` in each affected repo no longer lists removed paths
- deleted local branches no longer exist
- the ticket folder is gone, or only approved/skipped leftovers remain
- each approved upstream branch is absent, and no deletion was attempted for an unapproved upstream branch

In Herdr, stop here. Report what changed, name any skipped item, identify the calling pane as ready for manual closure, and let the user close it. Do not hand off, prompt another Pi session, focus a pane, or close a pane.
