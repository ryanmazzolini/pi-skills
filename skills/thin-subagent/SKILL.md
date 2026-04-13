---
name: thin-subagent
description: Human-in-the-loop workflow for delegating read-mostly research, review, or focused context gathering to an installed subagent extension. Use when a thin subprocess subagent should investigate something and report back.
---

# Thin Subagent

Use this skill with an installed subagent extension such as `npm:@mjakl/pi-subagent`.

Starter agent presets live in [`agents/`](agents/) next to this skill. Copy the ones you want into `~/.pi/agent/agents/` or project-local `.pi/agents/` before using this workflow.

## When to Use

Use a thin subagent for:
- Read-mostly research
- Code review
- Focused context gathering
- A second opinion on a narrow question

Avoid thin subagents for:
- Long-running implementation work
- Open-ended orchestration
- Tasks better handled directly in the current session

## Rules

- Confirm a fitting subagent is available before delegating
- Use a **suggest + confirm** workflow with the user before calling `subagent`
- Prefer `mode: "spawn"` so the handoff is explicit and context stays tight
- Prefer read-only agents and read-only toolsets when possible
- Avoid `fork`, parallel runs, or recursive delegation unless the user explicitly wants them
- If no fitting subagent exists, say so clearly instead of improvising
- Prefer the starter presets in [`agents/`](agents/) as a base before inventing a new agent from scratch

## Suggest + Confirm Workflow

Before calling `subagent`, draft a compact handoff in chat using this shape:

```markdown
Goal
- What the subagent should answer or inspect

Suggested context
- Files, directories, diffs, or constraints to inspect first
- Any important assumptions or prior decisions

Constraints
- Read-only unless explicitly stated otherwise
- Keep scope narrow
- Cite concrete evidence with file paths / line numbers when possible

Expected output
- Short summary
- Findings
- Risks / open questions
- Recommended next step
```

Ask the user to confirm or adjust the handoff. Only delegate after explicit confirmation.

## Calling the Tool

When the user confirms, call the installed `subagent` tool with:
- the most fitting available agent
- a self-contained task prompt based on the confirmed handoff
- `mode: "spawn"` by default

Keep the task prompt compact and explicit. Do not rely on hidden context.

## After the Subagent Returns

- Summarize the result for the user
- Highlight the most important findings first
- Call out gaps, uncertainty, or follow-up work
- Do not immediately spawn another subagent unless the user wants that

## Agent Preset Frontmatter

Agent presets in `agents/` use YAML frontmatter compatible with `@mjakl/pi-subagent`:

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Agent identifier used in tool calls |
| `description` | Yes | What the agent does (shown to the main agent for selection) |
| `model` | No | Model override, e.g. `anthropic/claude-sonnet-4-5` |
| `thinking` | No | Thinking level: `off`, `minimal`, `low`, `medium`, `high`, `xhigh` |
| `tools` | No | Comma-separated built-in tools (default: `read,bash,edit,write`) |

The markdown body after frontmatter becomes the agent's system prompt.
