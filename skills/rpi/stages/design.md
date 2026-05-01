# Design stage

Use after research when the team needs to align on current state, target state, and key technical choices.

Load `references/architecture.md` when decisions involve domain modeling, module boundaries,
public APIs, service contracts, or testing strategy.

## Rules

- Separate what is known from what is a choice.
- Present 2-4 viable options for meaningful decisions.
- For architectural interfaces, sketch at least two meaningfully different shapes before selecting one.
- Ask the user to choose when tradeoffs affect scope, architecture, contracts, rollout, or operability.
- Use one focused question with a recommended answer; do not dump a questionnaire.
- Avoid implementation detail that will stale quickly.

## HITL Checkpoint

Before finalizing `Selected Design`, briefly present:

- the current-state summary
- the recommended target design
- meaningful alternatives and tradeoffs
- anticipated architectural interfaces or boundaries, when relevant

Ask for user judgment if the recommendation changes shared contracts, domain language, module
boundaries, persistence shape, deployment topology, or rollout risk.

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

## Architectural Interfaces

## Selected Design

## Open Questions

## Suggested Next Step
```
