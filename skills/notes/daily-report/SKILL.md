---
name: "daily-report"
description: Set up, create, update, or repair evidence-based daily work and personal reports from local Git, GitHub, and Shortcut activity in an Obsidian vault.
---

# Daily Report

Use the deterministic runner in `scripts/daily-report.mjs`. It collects source evidence, asks a fresh non-interactive Pi process to synthesize one date, and writes an OKF-compatible report under the configured vault.

## Commands

```bash
node scripts/daily-report.mjs install-cli
node scripts/daily-report.mjs init-config
node scripts/daily-report.mjs doctor work
node scripts/daily-report.mjs run work
node scripts/daily-report.mjs run work 2026-07-08
node scripts/daily-report.mjs reconcile work
node scripts/daily-report.mjs reconcile work --max-days 7 --refresh-partial
```

`install-cli` creates `~/.local/bin/daily-report` without replacing an unrelated path. After that, use the shorter `daily-report ...` form. Use `--config <path>` to override configuration discovery. Add `--force` to replace an existing report.

## Scheduling

Daily-report owns report generation and reconciliation, not host scheduling. Use the shared `scheduled-jobs` CLI to declare and operate a job whose argv invokes `daily-report reconcile PROFILE --config <absolute-config-path>`. Keep cadence, adapter lifecycle, and scheduler logs in `scheduled-jobs`.

## Rules

- Keep machine-specific paths in the local settings file, not this skill or a vault.
- Treat `pi`, `git`, the configured vault, and every configured Git root as required.
- Treat enabled GitHub and Shortcut collectors as optional. Missing commands, authentication failures, and network errors produce a partial report and a successful exit.
- Leave an existing report unchanged unless `--force` or `--refresh-partial` applies.
- Keep Slack disabled until the profile has an explicit channel allowlist and an approved collector.
- Do not put credentials or tokens in the settings file.

See [configuration](references/configuration.md) for the schema and operational behavior. Start from [the example settings](assets/config.example.json).
