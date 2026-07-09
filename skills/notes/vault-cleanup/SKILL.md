---
name: "vault-cleanup"
description: Audit and optionally repair Obsidian vault metadata, links, assets, indexes, and legacy structure without ingesting inbox content. Use for scheduled or manual vault cleanup.
---

# Vault Cleanup

Cleanup only. Do not perform intake.

## Contract

- Read the vault's `AGENTS.md`, `CONTEXT.md`, and `README.md` before inspecting structure or proposing changes.
- Do not read, summarize, or move `inbox/` content except to count it.
- Treat `raw/` as immutable.
- Default to report-only unless the user explicitly says to apply changes.
- Ask before reading sensitive material or deleting, archiving, renaming, mass-moving, or migrating notes.
- Clean existing notes only; do not synthesize new wiki knowledge from raw sources.

## Checks

Adapt checks to the current vault's documented structure:

- broken or unresolved links
- orphan or dead-end wiki notes
- missing required frontmatter
- note-owned assets outside their local folder
- duplicate or legacy notes that have one clear documented destination
- stale generated indexes or logs clearly marked agent-owned

Prefer the `obsidian` CLI for link, property, backlink, and history semantics. Use `rg` and `find` for simple scans.

## Safe edits when apply is explicit

- Add obvious required metadata from the note itself.
- Fix a link when exactly one target is clear.
- Move note-owned assets locally when links can be updated safely.
- Refresh files clearly marked generated or agent-owned.

## Finish

Return a short report with applied changes, decisions still needed, and `git status --short`.
