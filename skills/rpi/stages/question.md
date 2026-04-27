# Question stage

Use when starting a workflow or when the problem shape is still unclear.

## Rules

- Surface the highest-leverage unknowns before research.
- Inspect the codebase instead of asking questions whose answers are discoverable.
- Ask one focused question at a time when user input is required.
- Capture concise framing in `question.md`.

## Output

Write `{workflow-dir}/question.md` with:

```md
---
source: {repo basename}
date: YYYY-MM-DD
type: question
goal: [one sentence]
---

# [Workflow Title]

## Goal

## Known Context

## Key Questions

## Suggested Next Step
```

After writing, suggest continuing with research or ask whether to hand off to a fresh rpi session.
