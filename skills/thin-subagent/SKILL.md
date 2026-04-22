---
name: thin-subagent
description: Human-in-the-loop workflow for delegating read-mostly research, review, or focused context gathering to an installed subagent extension. Use when a thin subprocess subagent should investigate something and report back.
---

# Thin Subagent

Use this skill with an installed subagent extension such as `npm:@tintinweb/pi-subagents`.

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
- Use a **suggest + confirm** workflow with the user before calling `Agent`
- Prefer a self-contained prompt and keep `inherit_context: false` unless the user wants broader context
- Prefer read-only agents and read-only toolsets when possible
- Avoid parallel runs, worktree isolation, or recursive delegation unless the user explicitly wants them
- If no fitting subagent exists, say so clearly instead of improvising
- Prefer the starter presets in [`agents/`](agents/) as a base before inventing a new agent from scratch

## Suggest + Confirm Workflow

Before calling `Agent`, draft a compact handoff in chat using this shape:

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

When the user confirms, call the installed `Agent` tool with:
- the most fitting available `subagent_type`
- a short `description` (3-5 words)
- a self-contained `prompt` based on the confirmed handoff
- `inherit_context: false` by default
- `run_in_background: false` by default unless the user wants to keep working while it runs

Keep the task prompt compact and explicit. Do not rely on hidden context.

## After the Subagent Returns

- Summarize the result for the user
- Highlight the most important findings first
- Call out gaps, uncertainty, or follow-up work
- Do not immediately spawn another subagent unless the user wants that

## Agent Preset Frontmatter

Agent presets in `agents/` use YAML frontmatter compatible with `@tintinweb/pi-subagents`.

The filename becomes the agent type used in `Agent({ subagent_type: ... })`.

| Field | Required | Description |
|-------|----------|-------------|
| `description` | No | What the agent does (shown to the main agent for selection) |
| `model` | No | Model override, e.g. `anthropic/claude-sonnet-4-5` |
| `thinking` | No | Thinking level: `off`, `minimal`, `low`, `medium`, `high`, `xhigh` |
| `tools` | No | Comma-separated built-in tools |
| `extensions` | No | Set `false` to avoid inheriting extension/MCP tools |
| `max_turns` | No | Optional upper bound for narrow tasks |

The markdown body after frontmatter becomes the agent's system prompt.
