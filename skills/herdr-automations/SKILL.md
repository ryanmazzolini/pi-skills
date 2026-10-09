---
name: "herdr-automations"
description: "Schedule recurring Pi work with the Herdr automations plugin, or change, pause, test, or inspect existing schedules. Use when the user wants an agent task to run on a schedule."
---

# Herdr Automations

The Herdr automations plugin (`dnzzl.automations`) starts Pi on a cron schedule in a Herdr tab and submits a prompt. It runs only while the Herdr server is running, on the machine whose Herdr owns the schedule.

## Find the plugin

```bash
config_dir="$(herdr plugin config-dir dnzzl.automations)" &&
plugin_root="$(herdr plugin list --plugin dnzzl.automations --json | jq -er '.result.plugins[0].plugin_root // empty')" &&
test -n "$config_dir" && test -n "$plugin_root" &&
config="$config_dir/automations.yaml" &&
cli="$plugin_root/bin/herdr-automations" &&
test -x "$cli"
```

If either lookup fails or returns an empty path, or `$cli` is not executable, report what failed and stop. A lookup failure does not necessarily mean the plugin is missing. The CLI is not on `PATH`; call it through `"$cli"`.

## Read the config and choose the action

Read the whole `$config` file first. If it is missing, create it only when adding the first job. If an existing file cannot be read, stop rather than replace it. Change only what the user requested in the target entry, and keep every other entry and all unrelated text as written. The scheduler reloads the file within 30 seconds.

- **Inspect:** use `"$cli" list` and, when needed, `"$cli" history [name]`. Report the findings without editing the config or running the job, then stop.
- **Pause or remove:** add `disabled: true` to pause, or delete the entry to remove it. Don't use `"$cli" pause`: it rewrites the whole file, dropping comments and changing other entries. Continue to **Verify**, without a test-run.
- **Create or change:** use the fields below. Apply the requested edit without a separate review gate; ask only about genuinely ambiguous choices, such as an unclear time or no fitting workspace.

## Create or change an entry

```yaml
automations:
  - name: daily-release-notes
    cron: "30 9 * * 1-5"
    repo: ~/notes
    workspace: existing
    workspace_id: <id>
    agent: pi
    model: openai-codex/gpt-6.1-sol:high
    agent_args: [--no-mcp, --tools, "read,bash,write"]
    prompt: |
      Load the release-notes skill and write today's summary to release-notes/<date>.md.
      This runs unattended: don't ask questions and don't commit. End with a one-line summary.
    timeout_minutes: 30
```

For a new entry, decide each field. For an existing entry, keep fields unrelated to the requested change:

- **cron:** five fields in the local time of the machine running Herdr. Translate the user's wording directly, and ask only when the time is ambiguous.
- **repo:** the repository that owns the job's skills and config, such as a notes vault. Pi runs there and loads its `AGENTS.md` and trusted project resources, plus the user's installed skills. Confirm the task's skills and config are available there. Name skills in the prompt; never put a path into an installed package, because it differs per machine.
- **workspace:** use `existing` when the job writes into the repository's working copy, such as a notes vault. Each run then opens a tab in that workspace. Find the user's automations workspace with `herdr workspace list` and use its `workspace_id`. Never invent an ID; ask when no workspace fits. Use `worktree` only for code changes that should land on a fresh branch for review.
- **agent:** set `pi` explicitly unless the user names another agent; the plugin defaults to Claude.
- **model:** `openai-codex/gpt-6.1-sol:high` unless the user names another. Pi takes `provider/id:thinking`.
- **agent_args:** allow only the tools the job needs with `--tools`. Add `--no-mcp` when the job needs no MCP server.
  - Add `--approve` when the repository has `.pi/settings.json`, `.pi/mcp.json`, other `.pi` resources such as `.pi/skills`, or a discovered `.agents/skills` directory (including in an ancestor). Pi requires project trust before loading them, and an unattended run cannot answer a trust prompt.
  - Name MCP tools as `mcp__<server>__<tool>`, with hyphens in the server name replaced by underscores. Without an `mcp__` entry, `--tools` keeps every MCP tool. With one, it keeps only the MCP tools you list.
  - When the job needs MCP, confirm the tool names by running `pi --print` once in the repository with the same flags. Ask it to list its tools, without calling the MCP tools or performing the job.
  - Never set `mcp_config`. Pi rejects `--mcp-config`, so the run fails before it starts.
- **prompt:** state the task, the skill to load, and where results go. Say the run is unattended: it must not ask questions, and it must not commit unless the user asked for that. If blocked, it should stop and report what prevented completion.
- **timeout_minutes:** the longest the run may take. The default is 60.
- **catch_up_minutes:** how late a run may still start after the machine slept. The default is 120. Raise it for a daily job that should still run after a late start.

## Verify

1. Check that the edit left unrelated text unchanged, then run `"$cli" list`. A created or changed entry must appear with the intended schedule, agent and model; a paused entry must be marked disabled; a removed entry must be absent. A broken entry is listed with the line to fix. Fix only the requested entry and report unrelated errors without changing them.
2. After creating a job or changing its task, run it once with `"$cli" run <name>` only when it has no effect outside the machine, or the user approves the test. Don't run a job the user asked to pause, remove, or inspect; `run` ignores `disabled`. The command opens a tab named after the job and blocks until the run ends. Check the tab and the task's expected output before reporting success.
3. Report the schedule and next run with the machine's time zone, or confirm that the job is paused or removed. State the test result, or why no test ran. Include the manual-run command only for an enabled job you created or changed.

## Limits

- The scheduler records a prompt job as `done` once Pi goes idle, even if the task failed. Check the run's tab before trusting `done`. A run is `failed` only when Pi did not start, exited, or timed out, and Herdr then shows a notification.
- Runs leave their tabs open. Closing a tab is how the user marks a run as read. Closing a run's workspace cancels the run; leave tabs and workspaces open for the user.
