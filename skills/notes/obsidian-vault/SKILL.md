---
name: "obsidian-vault"
description: Use the Obsidian CLI for vault-aware note workflows. Use when reading, creating, moving, filing, triaging, recovering, or validating notes in an Obsidian vault.
---

# Obsidian Vault

Use the `obsidian` CLI for operations where Obsidian semantics matter: link-aware moves, templates, properties, tasks, backlinks, file history, sync history, and visual validation. Use normal shell/Git tools for repository status, commits, broad text search, and simple file inspection.

## Preconditions

- Assume `obsidian` is installed, but verify with `obsidian version` if a command fails.
- Obsidian CLI requires the desktop app/CLI bridge. If disabled, tell the user to enable **Settings → General → Command line interface**.
- Run commands from the target vault directory when possible, or pass `vault=<name>` as the first parameter.

## Preferred commands

- Move/rename notes with link updates: `obsidian move path="old.md" to="Folder/new.md"`, `obsidian rename path="old.md" name="new"`
- Create from templates: `obsidian templates`, `obsidian create path="Folder/name.md" template="reference" open`
- Inspect note graph before deleting/archiving: `obsidian backlinks path="note.md" counts`, `obsidian links path="note.md"`, `obsidian unresolved counts verbose`
- Triage vault structure: `obsidian files folder="10-Inbox"`, `obsidian orphans`, `obsidian deadends`, `obsidian tags counts`, `obsidian properties counts`
- Tasks/daily capture: `obsidian daily:path`, `obsidian daily:read`, `obsidian daily:append content="- [ ] task"`, `obsidian tasks todo verbose`
- Recovery checks: `obsidian history path="note.md"`, `obsidian diff path="note.md" from=1`, `obsidian sync:history path="note.md"`
- Obsidian UI validation: `obsidian open path="note.md"`, `obsidian workspace`, `obsidian tabs`, `obsidian dev:screenshot path="/tmp/obsidian.png"`

## Rules

- Prefer `obsidian move` / `rename` over `mv` for Markdown notes that may have wikilinks or embeds.
- Before deleting or archiving note content, inspect backlinks and summarize the impact for the user.
- Use `delete` only after confirmation; omit `permanent` unless the user explicitly asks.
- Do not use `eval`, developer tools, plugin/theme install, publish, or sync restore commands without explicit confirmation.
- After batches of cleanup or filing, check `git status --short` and ask before committing or pushing.
