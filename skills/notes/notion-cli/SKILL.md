---
name: "notion-cli"
description: Use the Notion `ntn` CLI for reading, creating, updating, querying, or calling Notion API endpoints.
---

# Notion CLI

Use `ntn` for Notion work. Assume it is installed via mise; if a command fails, run `ntn doctor` and summarize the fix.

## Common commands

- Health/auth: `ntn doctor`, `ntn login`, `ntn logout`
- Read page Markdown: `ntn pages get <page-id>`; use `--json` when Markdown is truncated or block details matter
- Create/update page from Markdown: `ntn pages create --parent page:<id> < file.md`, `ntn pages update <page-id> < file.md`
- Query data source: `ntn datasources query <data-source-id> --limit 50 --json`
- Resolve database to data source IDs: `ntn datasources resolve <database-id> --json`
- Public API escape hatch: `ntn api <path> --docs`, `ntn api <path> --spec`, then call with `-X`, `-d`, stdin JSON, or inline inputs

## Rules

- Do not read or print tokens, auth files, keychain contents, or `.env` files. Use `NOTION_API_TOKEN` only if already present in the environment.
- Prefer stdin or temp files for multi-line Markdown/JSON instead of fragile shell quoting.
- Ask before trashing pages, overwriting page content, or making bulk updates.
- Use `--json` for parsing; use default Markdown output for human page review.
