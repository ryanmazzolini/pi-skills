---
name: "shortcut"
description: Interact with Shortcut stories via the `short` CLI. Use when viewing, searching, commenting on, or updating Shortcut stories.
---

# Shortcut

Wraps the [`short`](https://github.com/useshortcut/shortcut-cli) CLI. Assume it is installed; if missing, stop and tell the user to run `npm i -g @useshortcut/shortcut-cli && short install`.

## Common commands

- View story: `short story <id> -q`
- Add comment: `short story <id> -c "text"`
- Update state: `short story <id> -s "<state>"`
- Update owners / labels / estimate: `-o`, `-l`, `-e`
- Search by text: `short search -t "<query>"`
- Search by operator: `short search <operators>` (e.g. `owner:%self% state:"In Development"`)
- Open in browser: `short story <id> -O`

Prefer `-q` to suppress loading output when piping or parsing.

## From the current branch or path

Branch names and ticket worktree folders often embed the story id (e.g. `feat/sc-62230/...`, `rm/ch12345/...`, `~/git/worktrees/sc-62230-short-description/repo`). To look up the story:

1. Check the current path for a `sc-<digits>` or `ch<digits>` worktree folder segment.
2. If needed, run `git rev-parse --abbrev-ref HEAD` and inspect the branch name.
3. Extract the first `sc-<digits>` or `ch<digits>` group; the digits are the story id.
4. Run `short story <id> -q`.

`short story --from-git` only works for the `<mention>/ch<id>/<title>` branch format, so parse manually when branches use other conventions.

## Rules

- Never update state, owners, or add comments without confirming the exact action with the user first.
- Quote multi-word arguments (states, labels, comments).
- For bulk or destructive updates, show the plan and ask before executing.
