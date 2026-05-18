# Research stage

Optional playbook. Use when facts are expensive to rediscover, external docs matter, the codebase is unfamiliar, or the PRP needs evidence before decisions can be made.

## Rules

- Prefer facts, code/docs evidence, and file references over assumptions.
- Keep findings durable and concise.
- Avoid turning research into an implementation plan.
- If the research question is driven by `question.md`, preserve the user's goal while separating facts from recommendations.

## Process

1. Read `question.md`, `plan.md` if present, and any relevant existing artifacts.
2. Explore code, docs, git history, and web sources as needed.
3. Summarize facts, constraints, options, risks, and any recommended direction.
4. Call out which findings should affect the PRP.

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

## PRP Impact

## Suggested Next Step
```
