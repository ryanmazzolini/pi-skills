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

Keep one reading direction, label arrows with actions or data, and omit elements that do not help answer the question. Follow every visual with a prose interpretation that preserves its meaning without the spatial layout. Keep tiny linear traces inline as text. Prefer Mermaid for multi-node sequence, state, branch, or relationship diagrams when the output surface renders it. When Mermaid is unavailable, preserve the same view as a compact text sketch. For structure, boundaries, ownership, or a refactor's before and after, or when Mermaid cannot express the spatial detail legibly, build a visual explainer as described below. Use tldraw only when the reader needs to rearrange or explore the space.

## Visual explainers

A visual explainer is one self-contained HTML page with inline CSS, SVG, and script. Start from [`assets/explainer.html`](assets/explainer.html): replace its data block, numbers, and diff cards, and delete sections that do not help answer the question. Save it in the current work item directory when one exists, otherwise in a temporary directory, never inside the explained repository unless the user asks.

- Order the page as the answer, then the picture, then the detail: two to four headline numbers, one or two diagrams, then collapsible detail with only the most important card open.
- Make size carry information. Measure widths and stroke weights from the code, such as lines, call counts, or rows, and say on the page how you measured and whether a figure is an estimate.
- Give each concept one colour and reuse it in every view.
- Reuse notation the reader already knows: `+` and `−` diff lines for what arrives and leaves, and the same layout for before and after so only the differences stand out.
- Use words as labels. When a box needs a bulleted list, move the list into the collapsible detail.
- Verify every number and claim against the code before sharing.

The page is done when you have rendered it and looked at the result. Use the `agent-browser` skill when it is available; otherwise take a headless screenshot, such as `firefox --headless --profile "$(mktemp -d)" --window-size=1150,1900 --screenshot <new-file>.png file://<page>`. Use a new screenshot filename after each edit, because image readers can return a cached copy of an existing path. Fix overlapping or clipped labels, broken spacing, and wrong values, then render again. In the response, give the page path and a short prose summary of what it shows.

Use literal, concrete language and one stable term for each concept. Define necessary jargon rather than replacing precise terms with vague ones. Use an analogy only after the literal explanation, and state where it stops matching. When re-pitching an explanation that did not land, restore the missing context and change the example or visual instead of merely shortening the same answer.

For numeric comparisons, show current and proposed counts in parallel, then state which workload changes in practical terms.

Stop each response when the reader can reason about the current layer and choose whether to go deeper. Include source references, edge cases, implementation mechanics, or gotchas only when they answer the current question.
