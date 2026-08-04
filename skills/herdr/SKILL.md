---
name: "herdr"
description: "Control Herdr when the user explicitly asks, or hand off active Pi work to a fresh workspace session after ticket-workspace prepares it. Requires HERDR_ENV=1."
---

# Herdr

Herdr is the terminal runtime. Use its CLI to inspect and control the workspace, tab, pane, and agent topology the user requested.

## Enter Herdr

Before issuing a control command, verify this agent owns a Herdr-managed pane:

```bash
test "${HERDR_ENV:-}" = 1
```

If the check fails, explain that the current agent is outside Herdr and stop. Control only the Herdr session that injected the current pane IDs.

Treat the installed binary as the command reference. Run `herdr --help`, then the relevant command group such as `herdr workspace`, `herdr pane`, or `herdr agent`. Reserve bare `herdr` for an explicit request to open or attach the TUI because it is not a discovery command.

Read opaque IDs and state from command JSON. Target the calling pane with `--current` or `$HERDR_PANE_ID`; target every other resource with an explicit returned ID. `herdr pane current --current` identifies the calling pane, not the pane the human currently has focused.

## Control topology

Before creating, moving, focusing, or closing terminal resources, state the intended topology when the user has not already approved those exact changes.

Treat focus as live human input:

- Run background operations by ID with `--no-focus` or an agent-aware command. Do not record and later restore focus.
- Focus a resource only in direct response to a current, explicit human request. Issue that focus change once; do not reassert it if the human moves elsewhere.
- The calling or source pane is not implicitly focused.

Treat focus and closure as separate decisions. Before closing anything, inspect current topology and stop if the approved target or surrounding state changed. Close only an exact pane, tab, or workspace the human explicitly approved closing. Creating or focusing a destination never authorizes closing its source. Keep the Herdr server and unrelated panes running. After an operation, verify the approved topology without changing focus, then report the result concisely.

## Hand off Pi work

When continuing the current work in another Herdr workspace, read [references/pi-session-transfer.md](references/pi-session-transfer.md). Start a fresh Pi session with a concise continuation brief; inherit the full source session only when the human explicitly requests a fork. The default handoff preserves the source pane and human focus. Focusing the destination or closing the source requires the distinct approval described there.
