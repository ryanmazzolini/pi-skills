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
4. Re-snapshot after the page changes.
5. Capture screenshots, text, or other output the user asked for.

If a command fails unexpectedly, run `agent-browser doctor` before improvising.
