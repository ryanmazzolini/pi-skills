---
name: "research"
description: "Research technical questions and decisions. Use when the user asks for evidence, a technical spike, or a comparison of viable options."
---

# Research

Support a decision with the smallest evidence pass that can justify or change it.

## 1. Define the decision

Inspect the local code and documentation that constrain the question. Identify the decision, the user's constraints, and whether the result belongs in the conversation or a file.

When the request names a GitHub issue such as `gh#123` or `#123`, use `gh issue view` when the CLI is available. Otherwise work from the topic and local context.

Ask only when a missing answer would change the research or its destination.

Complete when the decision, constraints, and destination are clear.

## 2. Gather the evidence

Start with local evidence. When external evidence is needed, make one broad pass of 2–4 varied searches, then read the strongest primary sources. Search again only for a decision-critical fact that remains missing.

Prefer current primary sources. Compare only options that satisfy the user's constraints. Keep raw notes, source inventories, and discarded paths out of the reader-facing result.

Stop when the recommendation is supported, material gaps are named, and another search is unlikely to change the decision. After the user approves a direction, resume research only when new evidence creates a blocker.

## 3. Write for the reader

Lead with the recommendation. Use only the sections the reader needs:

```markdown
# {Topic}

## Recommendation

[The recommended decision and its practical effect.]

## Why

[The evidence and constraints that support it.]

## Important trade-offs and unknowns

[Material costs, risks, and unresolved facts.]

## Viable alternatives

[Include only when another option could reasonably be chosen.]

## Next action

[The smallest useful next step.]

## Sources

- [Primary source](url) — why it matters
```

Add background explanation, diagrams, or comparison tables only when they help the reader understand or make the decision.

Complete when the reader can act without reading the sources and every material uncertainty is visible.

## 4. Deliver the result

- For inline output, present the result in the conversation.
- For a file, write to the agreed path.
- Before publishing to a GitHub issue or another public surface, show the destination and proposed body. Confirm publication and whether AI attribution is wanted.
