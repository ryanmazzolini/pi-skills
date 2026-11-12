---
name: "herdr"
description: "Use when the user asks to control Herdr terminals, agents, spaces, tabs or panes, continue Pi work in a fresh session, or keep the calling session safe during ticket cleanup."
---

# Herdr

Use the installed manuals for commands and this skill for the user's approval and session-safety rules.

## Choose the tool

- **Programs and agents:** read `hc --skill`. Use herdr-core (`hc`) to start, inspect, message, wait on, or terminate terminal processes.
- **What the person sees:** read `herdr-app --skill`. Use `herdr-app` for spaces, tabs, panes, focus and appearance. If the request affects both programs and their visible containers, read both manuals.

Follow the relevant manual's `--help`, command discovery and linked guides rather than guessing arguments.

## Identify the source and targets

`$HC_TERMINAL_ID` is the calling terminal's address, not a pane ID. When set, verify it with `hc get "$HC_TERMINAL_ID"`; do not rely on an omitted target selecting it. If it is absent or cannot be verified, do not guess the source or perform an action that could end it. Read-only discovery and operations on separately verified, explicitly authorized targets may still be possible.

Use IDs from live command output for other terminals and visible resources. Correlate app panes with core terminal addresses before acting. The calling terminal need not be the focused pane, and a listed terminal is not automatically yours to control.

Inspect the running app through its documented read-only commands. Do not launch bare `herdr-app` to inspect it: that opens or raises the window. Do not launch an app or core, or stop, restart or update either, without approval for that action.

## Keep approval and focus explicit

State the intended targets and effects before creating, moving, focusing or closing resources unless the user already approved those exact changes. A request to inspect or explain authorizes no mutation.

- Starting a background worker does not authorize showing a new tab or split. Keep workers hidden unless the user requested a visible destination.
- Do not use `tab.new`, `space.new` or `terminal.open` to start sessions. App creation/showing commands require an explicit request to see the destination, separate from starting work.
- Focus only in response to a current, explicit request. Issue the approved change once; do not record and later restore focus or reassert it after the person moves elsewhere.
- Creating or focusing a destination does not authorize closing its source. Keep the source and unrelated terminals running.

Before an approved closure, recheck the exact target, its processes, children and visible containers. Stop if the approved target or surrounding state changed. Do not treat an agent's `done` status as proof that its ticket is resolved; check the requested business condition in its canonical source.

Distinguish removing a visible container from ending a program. Read the installed command's effects: window closure and parking can leave programs alive, while tab, pane or space closure can end terminals and their children. Approval to hide something is not approval to terminate it. Terminate or remove only your own accepted work, or exact targets the user explicitly authorized. Keep saved investigations and worktrees unless their deletion was separately approved.

After acting, verify the approved outcome and the survival of non-target resources without changing focus. On an uncertain result, inspect before retrying; do not launch a duplicate or blindly repeat a destructive command.

## Start sessions without changing focus

Starting a session or worker must never change the person's focus. Launch it with `hc`, not an app creation command. This policy deliberately overrides the installed app manual's agent-launch examples; use that manual for separately requested UI actions.

For an independent continuation in an approved existing space, use this launch shape with verified IDs and shell-escaped values:

```sh
hc run --bg --outlive-parent --name <name> --cwd <cwd> --label herdr.space=<space-id> pi-tab "<brief>"
```

The `pi-tab` template starts Pi in the user's login shell, so Pi gets their PATH, and the tab stays open at a shell prompt when Pi exits. `--keep` does not do this: it only replaces a program lost to a core restart. As a template launch, `hc` sends the brief once Pi is ready and reports `first_message.sent`. If `hc templates` does not list `pi-tab` (for a remote launch, check with `hc exec --on <machine> 'hc templates'`), stop and tell the user; the template lives in `pi-config` at `herdr-core/templates/pi-tab.md`.

The space label opts the terminal into the window; omitting `herdr.tab` creates a new tab in that space. Add only `herdr.space` for an approved new tab. `--outlive-parent` is for independent continuations, not ordinary task-bound workers. Keep ordinary workers unlabeled and omit `--outlive-parent` so they end with their parent.

A request such as “open it so I can watch” explicitly authorizes showing the destination: still launch with `hc`, then focus that exact terminal once through the app. A request merely to start work does not authorize showing or focusing it.

If the requested space does not exist, stop before launch. This handoff procedure requires an existing space; explain that restriction and ask the user to choose one. Do not create a new space or add an initial shell tab as part of session startup, and do not substitute another destination without the user's decision.

For an approved visible destination, the core terminal's name does not name its app tab. After launch, use `herdr-app ls` to find the tab containing the exact terminal address returned by `hc`. Rename that tab with the approved work-item name:

```sh
herdr-app do tab.rename --id <tab-id> --name <work-item>
```

Use the matched tab ID, not the currently focused tab, tab position or numeric default name. If the mapping is missing or ambiguous, report the naming step as blocked rather than renaming another tab. Check `herdr-app status` again after renaming.

Read `herdr-app status` before and after each real launch to compare focus. If focus changed, report the observation and leave focus as it is now; do not move it back. If status is unavailable, report that the focus check is unavailable rather than claiming it passed. Do not retry a launch to test focus or fall back to app creation commands. Do not launch disposable sessions on the person's window to test focus.

## Continue Pi work

For a fresh-session handoff or an assigned standalone review, read [references/pi-session-transfer.md](references/pi-session-transfer.md).

## Retire ticket work

When `ticket-workspace-cleanup` is invoked, perform that cleanup in the calling terminal. Protect its shell, Pi process and current cleanup command chain, even if filesystem cleanup removes its cwd.

Do not create a handoff destination, prompt another agent, relay closure through another session, change focus or close the calling terminal. Report that it is ready for manual closure after the approved cleanup and verification, then stop without running more commands from a removed cwd.
