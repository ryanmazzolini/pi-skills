---
name: ticket-worktree
description: Create, find, or reuse ticket-based worktree folders for Shortcut stories or GitHub issues.
---

# Ticket Worktree

Use this when starting or locating work for a ticket. A ticket gets one folder, and one or more repo worktrees live inside it:

```text
<workspace-root>/worktrees/<ticket-slug>/<repo-worktree>/
```

Examples:

```text
~/git/worktrees/sc-12345-short-description/api/
~/git/worktrees/sc-12345-short-description/web/
~/personal/worktrees/gh-987-short-description/pi-skills/
```

`<workspace-root>` is flexible. Do not assume `~/git`; common roots include `~/git`, `~/personal`, and project-specific directories.

## Ticket folder names

Use stable, ticket-first names:

- Shortcut: `sc-<number>-<short-description>`
- GitHub issue: `gh-<number>-<short-description>` when the repo is clear
- Multi-repo GitHub issue: `gh-<owner-or-repo>-<number>-<short-description>` when needed

Build the slug from the ticket title: lowercase, short, recognizable, no filler words.

## Find existing work first

Before creating anything:

1. Check whether the current path already contains `/worktrees/<ticket-slug>/...`.
2. Check the current branch for `sc-<digits>`, `ch<digits>`, or `gh-<digits>`.
3. If the ticket id is known, search likely roots:
   - parent `worktrees` directories
   - `~/git/worktrees`
   - `~/personal/worktrees`
   - any user-provided root
4. If more than one match is plausible, ask which to use.

Avoid broad home-directory scans. Use targeted, shallow `find` commands.

## Create a workspace

To create a new ticket workspace:

1. Start from a Shortcut story or GitHub issue. If missing, ask for one or offer to search.
2. Fetch the title when tools are available:
   - Shortcut: `short story <id> -q`
   - GitHub: `gh issue view <number>` from the relevant repo
3. Propose the ticket folder, repo worktree paths, branch names, and base branches.
4. Ask before running `mkdir`, `git worktree add`, branch creation, or checkout.

## Branch names

Use readable branch names that keep the ticket id visible:

- `feat/sc-12345/short-description`
- `fix/sc-12345/short-description`
- `chore/gh-987/short-description`

Follow the repo's branch convention when it has one.

## Rules

- Treat the ticket folder as the unit of work.
- Reuse existing ticket folders; do not create duplicates.
- Keep root selection flexible and explicit.
- Ask before choosing between plausible roots.
- Do not create tickets, worktrees, branches, commits, pushes, or PRs without confirmation.
- Do not access secrets, credential files, or `.env` files while discovering roots or repos.
