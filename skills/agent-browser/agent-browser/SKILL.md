---
name: "agent-browser"
description: Browser automation via the agent-browser CLI. Use when opening, testing, scraping, or automating websites, or driving Electron apps such as Slack.
---

# Agent Browser

Use this skill as a thin bridge to the installed `agent-browser` CLI.

## Rules

- Before any browser automation, confirm `agent-browser` is installed with `which agent-browser`.
- If it is missing, stop and tell the user how to install it:
  - `npm install -g agent-browser`
  - `agent-browser install`
- Do **not** guess command syntax from memory. Load the version-matched runtime skill content from the CLI first.

## Load Runtime Instructions

`agent-browser` ships its own version-matched skill content. Load the core workflow first, then a specialized skill (`electron`, `slack`, `dogfood`, `vercel-sandbox`, `agentcore`) if the target needs it:

```bash
agent-browser skills list
agent-browser skills get core 2>/dev/null || agent-browser skills get agent-browser
agent-browser skills get <name> --full
```

## Default Workflow

After loading the runtime instructions, prefer the standard snapshot → ref → interact loop unless the loaded skill says otherwise:

1. Open or connect to the target page/app.
2. Take a snapshot, usually of interactive elements.
3. Use returned element refs like `@e1`, `@e2` for interactions.
4. Wait for the expected result and verify it in the page state; a successful interaction command alone does not prove success. Re-snapshot after the page changes before using refs again.
5. Capture screenshots, text, or other output the user asked for.

Take and inspect screenshots when judging layout, interacting with canvas content, resolving ambiguous controls, or investigating unexpected results. Use snapshots for ordinary element-based interactions; screenshots are not required after every click.

## Session Hygiene

- Before browser work, select a named session owned by this task and use it on every command. Follow the runtime instructions for session naming; do not share a session with another active task. Reuse it across testing passes; create separate sessions only for parallel browsers or isolated identities.
- When browser work finishes, close each session this task created by name. Do not use `close --all` or close browsers or sessions owned by the user or another task.
- Accumulated Chromium sessions can consume substantial memory and graphics resources, including WindowServer memory on macOS. If shutdown stalls or memory remains high, run `agent-browser doctor` and confirm that this task's session is gone before launching more sessions. Leave unrelated sessions alone.

If a command fails unexpectedly, run `agent-browser doctor` before improvising.
