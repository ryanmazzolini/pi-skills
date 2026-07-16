# Manifest v1

A manifest is strict JSON. Unknown fields are rejected. Global jobs live at `${XDG_CONFIG_HOME:-~/.config}/pi-scheduler/jobs.json`; project jobs live at `<exact-git-root>/.pi/scheduler.json`.

```json
{
  "version": 1,
  "jobs": {
    "producer:profile": {
      "description": "Human-readable purpose",
      "schedule": "30 17 * * 1-5",
      "argv": ["node", "./scripts/job.mjs", "--config", "./config/job.json"],
      "requiredCommands": ["git"],
      "optionalCommands": ["gh"],
      "workingDirectory": ".",
      "timeoutSeconds": 1800
    }
  }
}
```

## Fields

- `version`: must be `1`.
- `jobs`: up to 128 jobs keyed as `namespace:name`.
- `description`: non-empty display text.
- `schedule`: validated five-field numeric cron expression in host-local time.
- `argv`: non-shell argument array. `argv[0]` is an executable name and is implicitly required.
- `requiredCommands`: executable names that must resolve safely before installation or enablement.
- `optionalCommands`: executable names pinned when available; absence produces a warning.
- `workingDirectory`: optional absolute or manifest-relative directory. Defaults to the user's home directory.
- `timeoutSeconds`: optional integer from 1 to 86400. Defaults to 1800.

Manifests cannot declare environment variables, enablement, adapters, secrets, or credentials. Paths following path-like options such as `--config` are canonicalized. Prefix other relative file arguments with `./` to make their meaning explicit.

## Credential-free project example

At `<git-root>/.pi/scheduler.json`:

```json
{
  "version": 1,
  "jobs": {
    "docs:link-check": {
      "description": "Check documentation links each weekday morning",
      "schedule": "15 8 * * 1-5",
      "argv": ["node", "./scripts/check-links.mjs"],
      "requiredCommands": [],
      "optionalCommands": [],
      "workingDirectory": ".",
      "timeoutSeconds": 600
    }
  }
}
```

Different clones and worktrees receive different project scope identities. Moving a project does not transfer its installed snapshot.
