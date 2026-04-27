# Research stage

Use after `question.md` or when the user asks to investigate/evaluate before design.

## Rules

- Research prior art, existing codebase patterns, related implementations, and risks.
- Prefer code/docs evidence over assumptions.
- Keep findings durable and concise.

## Process

1. Read `question.md` and any existing workflow artifacts.
2. Explore code, docs, git history, and web sources as needed.
3. Summarize options, constraints, risks, and recommended direction.

## Output

Write `{workflow-dir}/research.md` with:

```md
---
source: {repo basename}
date: YYYY-MM-DD
type: research
goal: [one sentence]
---

# [Topic]

## Sources Reviewed

## Findings

## Options

## Risks

## Recommendation

## Suggested Next Step
```
