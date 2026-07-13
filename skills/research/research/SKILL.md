---
name: "research"
description: Conduct technical research and produce structured findings. Use for spikes, or when the user asks to research, evaluate, or compare technical options.
---

# Research

Conduct technical research and produce structured findings with diagrams, options analysis, and references.

## GitHub Integration

- **gh CLI** (check with `which gh`): `gh issue view <number>`, `gh issue comment <number> --body "..."`
- **Manual fallback**: Prompt for topic/scope directly

## Retrieval budget

Use the smallest evidence pass that can support the decision. When external evidence is needed, start with one broad pass of 2–4 varied searches, then fetch the strongest primary sources. Search again only for a decision-critical fact that remains missing.

Stop when the recommendation is supported, material gaps are named, and another search is unlikely to change the decision. After the user approves a direction, resume research only when new evidence creates a blocker.

## Process

1. **Gather context**
   - Parse arguments for a GitHub issue (`gh#XXXXX` or `#XXXXX`) or topic.
   - If an issue is present, fetch it with `gh issue view`.
   - Inspect the local code or docs that constrain the decision.

2. **Clarify only blockers**
   - Infer scope, depth, constraints, and a local or inline output destination from context.
   - Ask when an unresolved answer would change the research or destination.
   - Treat publication to a GitHub issue or other public surface as a confirmation gate.

3. **Research**
   - Use the retrieval budget above.
   - Prefer primary sources and current local evidence.
   - Compare only viable options against the user's constraints.

4. **Generate output**

   Format findings using this template:

   ```markdown
   ## {Topic} Research Summary

   ### How {Domain} Works

   [Brief explanation of the core concept]

   ### Design Pattern

   - [Pattern Name](url) — explanation with inline deep-links

   ### Implementation Options

   | Solution | License | Key Feature | Cost  |
   |----------|---------|-------------|-------|
   | Option A | MIT     | Feature X   | Free  |
   | Option B | Apache  | Feature Y   | $X/mo |

   ### Recommended Approach: {Choice}

   - **Rationale**: Why this option fits best
   - **Integration**: How it fits with existing codebase
   - **Caveats**: Known limitations or concerns

   ### Next Steps

   1. Actionable item with owner if known
   2. Follow-up investigation if needed

   ### References

   - [Source Title](url) — brief description
   ```

5. **Deliver output**
   - For a GitHub issue or other public surface, show the destination and proposed body, then confirm posting and whether AI attribution is wanted before publishing.
   - For a markdown file, write to the agreed path.
   - For inline output, display it in the conversation.
