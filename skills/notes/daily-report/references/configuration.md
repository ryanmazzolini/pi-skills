# Daily report configuration

## Location

The runner resolves settings in this order:

1. `--config <path>`
2. `DAILY_REPORT_CONFIG`
3. `$XDG_CONFIG_HOME/llm-wiki/daily-report.json`
4. `~/.config/llm-wiki/daily-report.json`

Run `daily-report.mjs init-config` to copy the bundled example without overwriting an existing file.

## Schema

The top-level `version` must be `1`. `profiles` is keyed by a short profile name such as `work` or `personal`.

Required profile fields:

- `vault`: destination Obsidian vault.
- `gitRoots`: directories recursively searched for Git repositories.

Optional profile fields:

- `reportDirectory`: vault-relative destination; defaults to `daily-reports` and may not escape the vault.
- `timezone`: IANA timezone used for report dates and source windows; falls back to `defaults.timezone` and then the host timezone.
- `reportDays`: any of `sun`, `mon`, `tue`, `wed`, `thu`, `fri`, `sat`; defaults to every day.
- `gitAuthors`: author names or email addresses. When omitted, each repository's configured `user.email` and `user.name` are used.
- `github.enabled`: collect authenticated-user GitHub events. Defaults to `false`.
- `github.owners`: optional repository-owner allowlist.
- `github.includeBodies`: include bounded issue, review, and comment body snippets. Defaults to `false`.
- `shortcut.enabled`: collect owned Shortcut stories updated during the report window. Defaults to `false`.
- `shortcut.includeRequested`: also collect stories requested by the authenticated member. Defaults to `true`.
- `pi.model`: optional Pi model selector.
- `pi.thinking`: optional Pi thinking level.
- `pi.timeoutSeconds`: generation timeout; defaults to 600.

`defaults.maxReconcileDays` controls the rolling catch-up window and defaults to seven calendar days. A command-line `--max-days` overrides it.

Paths support a leading `~`. Keep tokens and credentials in each CLI's normal authentication storage rather than this file.

## Output and failures

Reports are written atomically to:

```text
<reportDirectory>/YYYY/YYYY-MM-DD.md
```

Frontmatter follows the Open Knowledge Format v0.1 compatible subset. Operational source fields are producer extensions.

- `complete`: every enabled source succeeded.
- `partial`: an enabled optional source was unavailable or a collector only partially succeeded.
- Fatal: Pi or Git is missing, the vault or a configured Git root is inaccessible, Git collection fails for every discovered valid repository, or Pi generation fails. No report is written.

An isolated repository failure marks Git as degraded so useful evidence from other repositories can still produce a partial report. Invalid `.git` markers are ignored and logged.

A partial report exits successfully so the scheduler records a completed run rather than an execution failure. Use `reconcile --refresh-partial` after repairing an optional source.

Generation uses an exclusive hidden lock beside each report. An interrupted process can leave this lock behind. The resulting error names the lock path; verify that no report process is active before removing it manually.

## Scheduling

Daily-report does not configure or operate host schedulers. Declare a `scheduled-jobs` job that invokes `daily-report reconcile PROFILE --config <absolute-config-path>`; the shared scheduler owns cadence, platform adapters, lifecycle, and logs. The profile timezone still controls report dates and exact source windows, while the scheduler interprets its five-field schedule in the host timezone. Legacy profile `schedule` fields are rejected.
