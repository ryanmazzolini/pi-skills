---
name: "ticket-workspace"
description: "Create, find, or reuse workspaces with one git worktree per PR. Use when the user asks for a separate workspace or worktree for a ticket, quick fix, stacked PR, or multi-repo change."
---

# Ticket Workspace

Keep one workspace folder for the ticket or approved ticketless fix, with one git worktree for each real PR:

```text
<workspace-root>/worktrees/<ticket-slug>/<pr-worktree>/
```

Add a worktree only when work on that PR is ready to begin and the user has confirmed its folder, branch, and base. This keeps every PR independently revisable and rebaseable without branch switching.

Worktrees preserve delivery boundaries; they do not decide them. Prefer successive independently mergeable PRs based on the updated default branch. Do not propose a stack merely to partition a broad feature or separate technical layers. Use a stack only when an approved delivery plan records the exact technical dependency that prevents a later PR from merging independently.

## Shape the workspace

- Name a single-PR worktree after its repo: `api/`.
- Give each PR in a same-repo stack its own worktree. Name later worktrees `<repo>-<pr-slug>`, such as `api-graphql/`. Base each new branch on the preceding PR branch, not the default branch. After amending an earlier PR, rebase every later worktree in order.
- Give each repo in a multi-repo change its own worktree or stack inside the same ticket folder.
- Choose the workspace root explicitly. Roots may include `~/git`, `~/personal`, or a project-specific directory; do not assume `~/git`.

For example:

```text
~/git/worktrees/sc-12345-invoice-match/api/
~/git/worktrees/sc-12345-invoice-match/api-graphql/
~/git/worktrees/sc-12345-invoice-match/web/
~/personal/worktrees/gh-987-fix-roles/pi-skills/
```

## Find existing work first

Before proposing or creating anything:

1. Check whether the current path is already under `/worktrees/<ticket-slug>/`.
2. Check the current branch for `sc-<digits>`, `ch<digits>`, or `gh-<digits>`.
3. When the ticket id is known, search parent `worktrees` directories, `~/git/worktrees`, `~/personal/worktrees`, and any user-provided root.
4. Reuse a matching workspace. If multiple workspaces or roots are plausible, ask which one to use.

Use targeted, shallow scans rather than searching the whole home directory. Do not inspect secrets, credential files, or `.env` files while locating roots or repos.

## Name the workspace

Start with a Shortcut story or GitHub issue. If none is available, ask for one or offer to search. Create a ticket only after confirmation.

When a ticket exists, look up its title before deriving a lowercase, short, recognizable slug without filler words:

- Shortcut: `short story <id> -q`
- GitHub: `gh issue view <number>` from the relevant repo

Use these forms:

- Shortcut: `sc-<number>-<short-description>`
- GitHub issue with an unambiguous repo: `gh-<number>-<short-description>`
- Multi-repo GitHub issue: `gh-<owner-or-repo>-<number>-<short-description>` when needed

If the user explicitly waives a ticket for a quick fix, treat that waiver as the ticket decision for this task. Use a short descriptive slug without a ticket prefix, such as `local-date-spec-flakes`.

## Propose, then create

In one checkpoint, propose the exact workspace folder, repo worktree, branch, and base for the first PR, plus the branches and bases of any approved stack. Ask the user to confirm before running `mkdir`, creating a branch, checking out a branch, or running `git worktree add`.

Follow the repository's branch convention while keeping ticket ids visible:

- `feat/sc-12345/short-description`
- `fix/sc-12345/short-description`
- `chore/gh-987/short-description`

For an approved ticketless quick fix, use `{type}/{short-description}`, such as `fix/local-date-spec-flakes`.

After confirmation, create only the approved folder, branch, and worktree. Keep later PR worktrees deferred until those PRs become real.

## Choose where to continue

Preparing a ticket folder and worktrees does not require a new terminal destination or a fresh Pi session. Honor the user's choice to stay in the current session or use a particular destination without asking them to choose again. Keep the filesystem layout above unchanged; Herdr grouping is independent of the folder layout.

When the current agent is Pi and `HERDR_ENV=1`, use the following guidance if the user has not chosen where to continue. Establish the ticket's parent epic from the supplied context or read-only ticket metadata when needed. Do not infer an epic from a repository or folder name, or treat missing metadata as proof that there is no epic.

- **Ticket in an epic:** propose a Herdr workspace for the epic, with one tab for the ticket. Load `herdr` to inspect live workspaces and tabs first. Propose the matching epic workspace when unambiguous; if none exists, propose creating one named for the epic, with its initial tab named for the ticket. If several destinations match, ask which one to use. An existing ticket tab is not permission to create a duplicate or replace its Pi session; inspect it and ask how the user wants to continue there.
- **Isolated ticket or ticketless fix:** ask whether to continue in the current session, use an existing workspace/tab/pane or Pi session, or create a workspace/tab. Present relevant options from the work context and live topology, not an automatic project or activity fallback. The current location is an option, not an inferred choice.
- **Epic relationship still unknown:** ask for the missing context or the user's destination choice instead of inventing a grouping.

If the user chooses the current session, continue using the approved worktree paths without creating terminal resources or starting another Pi. For another existing destination, use `herdr` to inspect the exact workspace, tab and pane and confirm the intended action. Choosing an existing workspace does not itself choose between an existing session and a fresh Pi in a new tab. Do not replace or restart an existing agent, or send work to another Pi, without explicit approval.

Preserve workspace, tab or work label, and cwd choices independently. When a new destination needs defaults, propose the ticket folder as cwd so the session can reach every repo worktree, and the ticket slug as the tab label. For a new epic workspace, pass both the epic workspace label and the ticket tab label to `herdr`; the first ticket uses the workspace's initial tab, not an extra tab.

Only when the user chooses a fresh Pi destination, follow `herdr`'s fresh-session confirmation and verification. A proposal to create a workspace or tab still needs approval before creation. Keep the existing confirmation format, preserve human focus and the source pane, and require the separate approvals defined by `herdr` before focusing or closing anything.

## Keep consent explicit

Also require confirmation before creating tickets, committing, pushing, or opening PRs. Reuse existing work instead of creating duplicates.
