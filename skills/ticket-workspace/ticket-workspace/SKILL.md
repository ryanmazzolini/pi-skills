---
name: "ticket-workspace"
description: "Create, find, or reuse workspaces with one git worktree per PR. Use when the user asks for a separate workspace or worktree for a ticket, quick fix, stacked PR, or multi-repo change."
---

# Ticket Workspace

A ticket gets one workspace folder. Inside it, each PR gets its own git worktree, so any PR can be cut, revised, or rebased without switching branches anywhere:

```text
<workspace-root>/worktrees/<ticket-slug>/<pr-worktree>/
```

Examples:

```text
~/git/worktrees/sc-12345-invoice-match/api/           # single PR against api
~/git/worktrees/sc-12345-invoice-match/api-graphql/   # stacked PR 2, based on api's PR branch
~/git/worktrees/sc-12345-invoice-match/web/           # separate repo, its own PR or stack
~/personal/worktrees/gh-987-fix-roles/pi-skills/
```

`<workspace-root>` is flexible. Do not assume `~/git`; common roots include `~/git`, `~/personal`, and project-specific directories.

## Worktrees are PR-shaped

- One worktree per PR. Add a worktree when its PR becomes real, not upfront.
- A single PR against a repo names its worktree after the repo (`api/`).
- Stacked PRs in one repo get one worktree each, named `<repo>-<pr-slug>` (`api/`, then `api-graphql/`). Base each stacked branch on the previous PR's branch, not the default branch.
- Multi-repo tickets give each repo its own worktree or its own stack.
- A stack cascades: after amending an earlier PR, rebase the later worktrees onto it.

## Workspace folder names

Use stable, ticket-first names when a ticket exists:

- Shortcut: `sc-<number>-<short-description>`
- GitHub issue: `gh-<number>-<short-description>` when the repo is clear
- Multi-repo GitHub issue: `gh-<owner-or-repo>-<number>-<short-description>` when needed

Build the slug from the ticket title: lowercase, short, recognizable, no filler words.

### Ticketless quick fixes

When the user explicitly waives a ticket or issue, use a short descriptive slug without a ticket prefix:

```text
~/git/worktrees/local-date-spec-flakes/logistics-delivery-service/
```

Treat the waiver as the ticket decision for the current task. Propose the exact workspace folder, repo worktree, branch, and base in one checkpoint, then follow the normal worktree-per-PR rules.

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

1. Start from a Shortcut story or GitHub issue. If missing, ask for one or offer to search unless the user explicitly chooses a ticketless quick fix.
2. When a ticket exists, fetch its title with available tools:
   - Shortcut: `short story <id> -q`
   - GitHub: `gh issue view <number>` from the relevant repo
3. Propose the workspace folder, the worktree for the first PR (and base branches for any planned stack), and branch names.
4. Ask before running `mkdir`, `git worktree add`, branch creation, or checkout.

## Branch names

When a ticket exists, keep its id visible:

- `feat/sc-12345/short-description`
- `fix/sc-12345/short-description`
- `chore/gh-987/short-description`

For a ticketless quick fix, use `{type}/{short-description}`, such as `fix/local-date-spec-flakes`.

Follow the repo's branch convention when it has one.

## Rules

- Treat the ticket or quick-fix workspace as the unit of work.
- Reuse existing workspaces; do not create duplicates.
- Keep root selection flexible and explicit; ask before choosing between plausible roots.
- Do not create tickets, worktrees, branches, commits, pushes, or PRs without confirmation.
- Do not access secrets, credential files, or `.env` files while discovering roots or repos.
