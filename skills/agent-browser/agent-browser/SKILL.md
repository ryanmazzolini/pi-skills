---
name: "agent-browser"
description: Browser automation via the agent-browser CLI. Use when the user needs to open websites, click buttons, fill forms, take screenshots, scrape page data, test a web app, automate Slack/Electron/browser workflows, or otherwise control a browser.
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

Run one of these before using `agent-browser` commands:

```bash
agent-browser skills get core 2>/dev/null || agent-browser skills get agent-browser
agent-browser skills get <name> --full
```

Why: `agent-browser` ships its own skill content, and the exact commands can change between releases. Some versions expose the core skill as `core`; older versions use `agent-browser`.

## Choosing a Skill

Start with the core browser workflow, then switch to a specialized skill if needed:

```bash
agent-browser skills list
agent-browser skills get core 2>/dev/null || agent-browser skills get agent-browser
agent-browser skills get electron
agent-browser skills get slack
agent-browser skills get dogfood
agent-browser skills get vercel-sandbox
agent-browser skills get agentcore
```

## Default Workflow

After loading the runtime instructions, prefer the standard snapshot → ref → interact loop unless the loaded skill says otherwise:

1. Open or connect to the target page/app.
2. Take a snapshot, usually of interactive elements.
3. Use returned element refs like `@e1`, `@e2` for interactions.
4. Re-snapshot after the page changes.
5. Capture screenshots, text, or other output the user asked for.

## Notes

- Prefer `agent-browser` over ad-hoc browser scripting when the user explicitly wants browser automation.
- Use the specialized skills for Electron apps, Slack, QA/dogfooding, Vercel Sandbox, or AgentCore.
- If a command fails unexpectedly, run `agent-browser doctor` before improvising.
