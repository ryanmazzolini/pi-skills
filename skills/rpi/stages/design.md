# Design stage

Use after research when the team needs to align on current state, target state, and key technical choices.

## Rules

- Separate what is known from what is a choice.
- Present 2-4 viable options for meaningful decisions.
- Ask the user to choose when tradeoffs matter.
- Avoid implementation detail that will stale quickly.

## Output

Write `{workflow-dir}/design.md` with:

```md
---
source: {repo basename}
date: YYYY-MM-DD
type: design
goal: [one sentence]
---

# [Feature/System]

## Current State

## Desired State

## Key Decisions

## Selected Design

## Open Questions

## Suggested Next Step
```
