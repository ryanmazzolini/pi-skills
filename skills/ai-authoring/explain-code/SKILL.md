---
name: "explain-code"
description: "Explain how unfamiliar code or a system works by establishing a high-level model, then revealing targeted detail through concrete examples and visual traces. Use for codebase teaching or when a reader needs to understand PR behavior, a query, or a data or state flow."
---

# Explain Code

Start with a high-level model that lets a capable reader orient themselves before seeing implementation detail. Then peel back one targeted layer at a time.

1. Verify the actual path through the code, then choose one small, realistic input.
2. For a broad question, return only the first useful layer: what the code accomplishes, one ordinary example or compact visual, and the result. Define only the terms needed for that layer.
3. End with two to four explicit breadcrumbs naming useful areas the reader can ask about next, such as lock acquisition, transaction boundaries, retry routing, or failure behavior.
4. When the reader chooses an area, explain only that layer with a concrete trace, reconnect it to the high-level model, then offer narrower breadcrumbs when more detail remains useful. Do not include adjacent mechanics merely because the investigation uncovered them.
5. For a narrow question, answer the requested layer directly and briefly reconnect it to the broader model when that context is needed. For alternatives, run the same input through each option and say what changes and what stays the same.

Use the smallest visual that fits the behavior:

- a pipeline for sequential work or data movement;
- a before-and-after view or state table for mutation;
- a branch diagram for decisions, retries, or failures;
- example rows for a query or data shape.

Keep one reading direction, label arrows with actions or data, and omit elements that do not help answer the question. Follow every visual with a prose interpretation that preserves its meaning without the spatial layout. Keep simple visuals inline. When spatial detail cannot stay legible inline, use one self-contained HTML file with inline CSS and SVG; use tldraw only when the reader needs to rearrange or explore the space.

Use literal, concrete language and one stable term for each concept. Define necessary jargon rather than replacing precise terms with vague ones. Use an analogy only after the literal explanation, and state where it stops matching. When re-pitching an explanation that did not land, restore the missing context and change the example or visual instead of merely shortening the same answer.

For numeric comparisons, show current and proposed counts in parallel, then state which workload changes in practical terms.

Stop each response when the reader can reason about the current layer and choose whether to go deeper. Include source references, edge cases, implementation mechanics, or gotchas only when they answer the current question.
