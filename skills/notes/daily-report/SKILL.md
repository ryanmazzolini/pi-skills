---
name: "daily-report"
description: Generate or reconcile evidence-backed daily work and personal reports from local Git, GitHub, and Shortcut activity. Use when setting up, running, scheduling, or repairing daily reports in an Obsidian vault.
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

Install or remove the host's preferred scheduler with:

```bash
node scripts/daily-report.mjs install-schedule work
node scripts/daily-report.mjs remove-schedule work
```

`install-schedule` prefers launchd on macOS and a systemd user timer on Linux, then falls back to cron when the native scheduler or schedule shape is unavailable. Use `install-cron` and `remove-cron` only when explicitly choosing cron.

## Rules

- Keep machine-specific paths in the local settings file, not this skill or a vault.
- Treat `pi`, `git`, the configured vault, and every configured Git root as required.
- Treat enabled GitHub and Shortcut collectors as optional. Missing commands, authentication failures, and network errors produce a partial report and a successful exit.
- Leave an existing report unchanged unless `--force` or `--refresh-partial` applies.
- Keep Slack disabled until the profile has an explicit channel allowlist and an approved collector.
- Do not put credentials or tokens in the settings file.

See [configuration](references/configuration.md) for the schema and operational behavior. Start from [the example settings](assets/config.example.json).
