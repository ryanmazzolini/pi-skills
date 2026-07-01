# Task stage

Use for focused single-concern work where the full alignment → PRP → board path would be overkill.

## Rules

- Respect explicit "just do it" requests and proceed with the smallest safe implementation/verification loop.
- If the request is vague, ask one clarifying question with a recommended answer.
- Still write durable context when the work may span sessions.
- Keep any `plan.md` slim and end-state oriented.
- Prefer direct implementation when risk is low and scope is clear.

## Output

For durable small tasks, create or update a workflow-local `plan.md` with:

```md
# [Task]

## End State

## Decisions / Assumptions

## Verification

## Notes
```

Then implement using `stages/implement.md` if requested.
