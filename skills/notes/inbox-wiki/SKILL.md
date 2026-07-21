---
name: "inbox-wiki"
description: Organize an Obsidian vault's top-level inbox into raw sources and wiki or project notes. Use for interactive inbox triage.
---

# Inbox Wiki

Interactive, human-reviewed intake for the current vault.

## Contract

- Read the vault's `AGENTS.md`, `CONTEXT.md`, and `README.md` before deciding placement. Also read its reference template and wiki index/log when present.
- Treat `inbox/` as an unprocessed queue and `raw/` as immutable source storage.
- Process at most 3–5 items per batch.
- Inspect existing wiki and project notes for duplicates.
- Propose `Source → durable note path → raw path → rationale` before editing.
- Stop for approval before reading sensitive material or moving, renaming, deleting, or summarizing an inbox item.

## Filing

- Follow the current vault's vocabulary and placement rules instead of imposing a shared taxonomy.
- Move approved sources from `inbox/` to the vault's documented `raw/` structure.
- Prefer `obsidian move` for Markdown moves when link updates matter; use normal file moves for raw non-notes.
- Use the vault's reference template when applicable.
- Link durable notes back to their raw and external sources.
- Co-locate note-specific assets with the owning note.
- Update generated index or log files only when the vault documents them as agent-owned.

## Finish

Read changed files, run `git status --short`, and summarize changed paths plus unresolved filing decisions.
