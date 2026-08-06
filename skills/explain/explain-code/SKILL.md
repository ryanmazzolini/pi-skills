---
name: "explain-code"
description: "Explain how unfamiliar code works with a concrete example and visual trace. Use for codebase teaching or when a reader needs to understand PR behavior, a query, or a data or state flow."
---

# Explain Code

Build a **concrete trace** so a capable reader can reason about the behavior before seeing implementation detail. Make the first view stand on its own: what the code accomplishes, one ordinary example, and the result. Put deeper mechanics, edge cases, and source paths under descriptive headings so the reader can drill in.

1. Verify the actual path through the code, then choose one small, realistic input.
2. State what the code accomplishes and define only the terms needed to follow the example.
3. Show the input or starting state, trace each meaningful data or state change, and show the result.
4. State the general rule after the trace. For alternatives, run the same input through each option and say what changes and what stays the same.

Use the smallest visual that fits the behavior:

- a pipeline for sequential work or data movement;
- a before-and-after view or state table for mutation;
- a branch diagram for decisions, retries, or failures;
- example rows for a query or data shape.

Keep one reading direction, label arrows with actions or data, and omit elements that do not help answer the question. Follow every visual with a prose interpretation that preserves its meaning without the spatial layout. Keep simple visuals inline. When spatial detail cannot stay legible inline, use one self-contained HTML file with inline CSS and SVG; use tldraw only when the reader needs to rearrange or explore the space.

Use literal, concrete language and one stable term for each concept. Define necessary jargon rather than replacing precise terms with vague ones. Use an analogy only after the literal explanation, and state where it stops matching. When re-pitching an explanation that did not land, restore the missing context and change the example or visual instead of merely shortening the same answer.

For numeric comparisons, show current and proposed counts in parallel, then state which workload changes in practical terms.

Stop when the reader can identify the input, important changes, result, and practical difference between any options. Include source references, edge cases, implementation mechanics, or gotchas only when they are needed to answer the question.
