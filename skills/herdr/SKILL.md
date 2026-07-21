---
name: "herdr"
description: "Control Herdr when the user explicitly asks, or hand off an active Pi conversation to a Herdr workspace after ticket-workspace prepares it. Requires HERDR_ENV=1."
---

# Herdr

Herdr is the terminal runtime. Use its CLI to inspect and control the workspace, tab, pane, and agent topology the user requested.

## Enter Herdr

Before issuing a control command, verify this agent owns a Herdr-managed pane:

```bash
test "${HERDR_ENV:-}" = 1
```

If the check fails, explain that the current agent is outside Herdr and stop. Control only the Herdr session that injected the current pane IDs.

Treat the installed binary as the command reference. Run `herdr --help`, then the relevant command group such as `herdr workspace`, `herdr pane`, or `herdr wait`. Reserve bare `herdr` for an explicit request to open or attach the TUI because it is not a discovery command.

Read opaque IDs and state from command JSON. Target the calling pane with `--current` or `$HERDR_PANE_ID`; target every other resource with an explicit returned ID.

## Control topology

Before creating, moving, focusing, or closing terminal resources, state the intended topology when the user has not already approved those exact changes.

Treat focus as user-owned state:

- Read the currently focused pane and its workspace before each topology mutation; do not assume the calling pane is focused.
- Inspect and control background resources by ID, passing `--no-focus` to `workspace create`, `pane split`, and `pane move`.
- When closing a background workspace, tab, or pane, restore the previously focused pane immediately with `herdr agent focus <pane-id>` in the same shell operation if Herdr moves focus.
- Focus a different resource only when the user explicitly requests it or at the final visible transition of an approved conversation handoff.

Close only resources created during the current flow or resources the user explicitly named. Keep the Herdr server and unrelated panes running. After an operation, verify the approved topology and focus, then report the changes concisely.

## Hand off a Pi conversation

When moving the current Pi conversation to another Herdr workspace, read [references/pi-session-transfer.md](references/pi-session-transfer.md) and follow its complete handoff, including its confirmation and completion criteria.
