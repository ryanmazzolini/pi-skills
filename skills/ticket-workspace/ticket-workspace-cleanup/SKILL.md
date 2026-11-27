---
name: "ticket-workspace-cleanup"
description: "Remove completed ticket worktrees and local branches, optionally delete their upstream branches, and leave the calling session open for manual closure."
disable-model-invocation: true
argument-hint: "ticket id, slug, or path"
---

# Ticket Workspace Cleanup

The user invoked this skill to retire a ticket workspace. Cleanup deletes work; run it like a lockout/tagout.

## Scope

A ticket workspace is a ticket folder created by `ticket-workspace`:

```text
<workspace-root>/worktrees/<ticket-slug>/<pr-worktree>/
```

Cleanup covers that folder, the local branches checked out in its worktrees, processes running inside it and, if approved, those branches' upstream branches. Leave anything else alone unless the user names it, including other worktrees and branches in the same repositories.

Do the cleanup in this session. Do not hand it off, prompt another agent, change focus, or close any terminal, tab, pane or thread.

Never signal this session's own processes: its shell, the agent, and the commands the agent launched for the current step. Other processes are not exempt just because the shell or the agent started them.

## 1. Pin the target

Find exactly one ticket folder:

- If the current path is inside `/worktrees/<ticket-slug>/...`, start with that folder.
- If the user gave a path, it must be the ticket folder or a repo folder inside it.
- If the user gave a ticket id or slug, search only the nearest parent `worktrees`, `~/git/worktrees`, `~/personal/worktrees`, and roots the user names.
- Every linked worktree in it must belong to this ticket. A folder that holds many tasks' worktrees, such as `~/.t3/worktrees/<project>/`, is not a ticket folder.

Use shallow, targeted `find`. Do not scan all of home or read secrets, credential files or `.env` files.

Completion: one ticket folder is selected, or you have stopped and asked the user to choose.

## 2. Take inventory

For each child directory:

- Classify it as a linked worktree, regular checkout, or non-repo directory. A regular checkout is a blocker; removing it needs its own approval after you inventory its unique refs, local config, unpushed objects and ignored files.
- Record its branch, tip commit, upstream, `git status --short --branch --ignored`, and whether it contains this session's working directory. List ignored paths by name without reading them; `git worktree remove` deletes them silently.
- After `git fetch <remote>`, record whether the branch is merged: its tip is an ancestor of the remote's default branch, or its pull request was merged at the same head commit. Merged only into its own upstream does not count.
- Mark its upstream eligible for deletion only when it has the local branch's name, is not the remote's default branch, and the remote has one fetch URL and one identical push URL (`git remote get-url --all <remote>`, `git remote get-url --push --all <remote>`). Record that URL and the object ID from `git ls-remote --heads <remote> refs/heads/<branch>`, and whether that object ID is merged by the same test; someone may have pushed commits the local branch lacks. A branch already absent needs no deletion.

Also record:

- files that would remain after the worktrees are removed, including those directly inside the ticket folder
- every process whose working directory is inside the ticket folder, with PID, command and cwd. Mark this session's own processes. Clearly disposable dev servers and watchers are safe to stop. Any other agent, shell, editor, shared or unclear process is a blocker, and so is an incomplete scan.

Completion: every path and process is classified, and nothing dirty, unpushed, unmerged, untracked, ignored, detached or running is hidden.

## 3. Gate destructive work

Show the user:

- the ticket folder path
- worktrees to remove, and the ignored paths each removal deletes
- blockers: dirty, unpushed or detached worktrees, regular checkouts, and processes
- leftover files and directories
- processes: this session's own, safe to stop, and blockers
- local branches to delete, with tip commit and merge evidence; unmerged ones listed separately as needing a named force-delete
- upstream branches that may be deleted, with remote name, URL, branch, object ID and merge evidence; unmerged ones listed separately as needing a named force-delete
- whether this session's working directory will be removed

Ask once for approval of the exact list. Upstream branches stay unless the user names each one at its object ID; an approval that names none covers local cleanup only, so don't ask about upstream again. If there are blockers, recommend the smallest safe next step rather than forcing. Until approval, only read state and run `git fetch`: don't signal processes, delete files, change branches or push.

Completion: the user approved the local cleanup and named which upstream branches to delete, if any; or cleanup stops at the blockers.

## 4. Stop approved processes

Re-scan, then `SIGTERM` only the approved PIDs, never a broad selector such as `pkill node`. If the processes changed or a blocker appeared, ask again. Confirm each PID exited, and ask before `SIGKILL`.

Completion: every approved process has exited, or the user has decided what to do about it.

## 5. Remove only what was approved

Don't ask the user anything in this step. If something no longer matches what was approved, skip it rather than force it, and skip anything that depends on it.

If this session's working directory is inside the ticket folder, run this step and step 6 as one shell command, because nothing can run from a deleted directory. The command first moves to a surviving checkout of the repository, never moves back, and prints each action's result. Make no tool call after it.

1. **Worktrees.** Just before each removal, keep the worktree if any process except this session's own uses it, or if `git status --short --branch --ignored` no longer matches the inventory. Run `git worktree remove <path>` from a surviving worktree of the same repo. Add `--force` only if the user named that worktree for forced removal.
2. **Local branches.** Delete one only if its worktree is gone, its tip still matches the approved commit, and it was merged or the user named a force-delete. Delete with `git update-ref -d refs/heads/<branch> <approved-commit>`, which refuses if the tip has moved. Do not use `git branch -d`: it accepts a branch merged only into its upstream and refuses a squash-merged one.
3. **Ticket folder.** Remove it with `rmdir` once empty; use `rm -rf` only for approved leftovers.
4. **Upstream branches.** Delete only an approved one whose local branch was deleted, and only if its object ID was merged or the user named its force-delete. Just before, check that the remote still has one fetch URL and one identical push URL equal to the recorded URL, and that `git ls-remote --heads <remote> refs/heads/<branch>` returns the recorded object ID. Otherwise skip it. Delete with `git push --force-with-lease=refs/heads/<branch>:<object-id> <remote> :refs/heads/<branch>`. If the lease is rejected, skip that branch and continue.

Completion: every approved item is gone or named as skipped with its reason, and nothing unapproved was touched.

## 6. Verify and report

Check, inside the same shell command when step 5 used one:

- approved processes are gone
- `git worktree list` in each repo no longer shows removed worktrees
- deleted local branches are gone
- the ticket folder is gone, or only approved or skipped leftovers remain
- each approved upstream branch is gone, and no other upstream branch was touched

Report what changed, what was skipped and why, and anything the user may still want to handle. If this session's working directory was removed, say the session is ready to close and leave closing it to the user. Then stop.
