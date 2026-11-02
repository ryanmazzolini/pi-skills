---
name: "explain-code"
description: "Explain unfamiliar code, systems, queries, or PR behavior with a small map and a verified concrete trace. Reveal detail progressively in chat; create interactive HTML when exploration helps or the reader requests it."
---

# Explain Code

Help the reader reason about what the code does, how the relevant pieces fit, and where to look next. Start with a small model, then reveal one useful layer at a time. Order the explanation for understanding, not by file order or review risk.

## Build the explanation

1. **Verify the behavior.** Read the relevant entry point, callers, implementation, and tests until you can follow the path the question asks about. Reuse supplied, inspected evidence when it already establishes that path. For a change, check both versions and keep references tied to the version being explained. Distinguish observed behavior from inference; a call graph is a navigation aid, not proof of runtime order.
2. **Orient the reader.** For a broad question, lead with what the code accomplishes, one small realistic input, and its result. Map only the components, responsibilities, and boundaries needed to connect them. A sentence can be the whole map. Define the few terms needed for this layer. For a narrow question, answer the requested layer directly; add broader context only when it helps.
3. **Trace the requested layer.** Follow the same input from entry point to result, showing the decisions, data movement, and state changes that explain the behavior. Include failures and retries when they affect the answer. Connect each important step to the component responsible and explain why the connection matters. Give source paths and symbols or line references where they help the reader verify or continue, rather than cataloguing every function.
4. **Stop at a useful boundary.** For a broad first answer, keep the trace at the component level; do not expand all the implementation layers you investigated. Offer two to four concrete drill-downs when useful detail remains, such as retry scheduling or transaction boundaries. When the reader chooses one, trace only that layer and reconnect it to the model. Stop when they can reason about the requested behavior without needing the adjacent mechanics.

For a change, explain what happened before, what happens now, and why the difference matters. For alternatives, run the same input through each and state what changes and what stays the same. For numeric comparisons, show current and proposed counts in parallel, then say which workload changes in practice.

Use literal language and one stable term per concept. Define necessary jargon rather than replacing it with vague words. Use an analogy only after the literal explanation and state where it stops matching. If an explanation did not land, restore missing context and change the example or visual rather than merely shortening the same answer.

## Choose the presentation

Keep short explanations in chat. Use the smallest visual that answers the question:

- a component map for responsibilities and boundaries;
- a pipeline for sequential work or data movement;
- a before-and-after view or state table for mutation;
- a branch diagram for decisions, retries, or failures;
- example rows for a query or data shape.

Keep one reading direction, label arrows with actions or data, and omit unrelated elements. Follow every visual with a prose interpretation that preserves its meaning without the spatial layout. Keep tiny linear traces inline as text. Use Mermaid for multi-node diagrams when the output surface renders it; otherwise use a compact text sketch.

Create a self-contained HTML explanation when the reader requests it, when the spatial detail cannot stay legible inline, or when navigating paths, stepping through state, or comparing scenarios materially helps answer the question. Complexity alone is not a reason to generate a page. Use tldraw only when the reader needs to rearrange or explore the space.

### When creating HTML

- For a commit, commit range, or PR walkthrough, use [`change-walkthrough`](../../review/change-walkthrough/SKILL.md). It owns extraction, rendering, validation, and risk-ordered review steps. Do not duplicate its renderer or force a system explanation into a diff. If its requirements cannot be met, explain the limitation and give the useful chat explanation; do not create commits just to make a page possible.
- For a system or execution trace, start from [`assets/explainer.html`](assets/explainer.html). Replace its data block, numbers, labels, and diff cards; delete sections that do not help answer the question. Keep one offline file with inline CSS, JavaScript, and SVG. Lead with the purpose, example, and small map; reveal steps and supporting code on demand. Add only controls that help answer the question, such as stepping a failed job through its retries or switching between two verified scenarios. Mark illustrative inputs and assumptions so the page does not imply it executes the real system.
  - Order the page as the answer, then the picture, then the detail: two to four headline numbers when they help, one or two diagrams, then collapsible detail with only the most important card open.
  - When size represents a quantity, derive widths and stroke weights from measured lines, call counts, or rows. State how you measured and whether a figure is an estimate.
  - Give each concept one colour and reuse it in every view. Use words as labels; move lists into the collapsible detail.
  - Reuse familiar notation: `+` and `−` diff lines for what arrives and leaves, and the same layout for before and after so only the differences stand out.
- Apply [`hci`](../../ux-accessibility/hci/SKILL.md) to the page. Keep controls keyboard-accessible and labels explicit; preserve the prose interpretation of each visual.
- Keep the page outside the explained repository, in the caller's work-item directory when supplied or a local artifact directory otherwise. Keep it as a deliverable and report its path with a short orientation. Explaining code does not authorize source edits, commits, publishing, or renderer changes.
- Check every number, claim, displayed state, and source reference against the code or supplied evidence. Render and visually inspect the page with the `agent-browser` skill when available, or a headless screenshot otherwise. Use a new screenshot filename after each edit to avoid cached images. Fix overlapping or clipped labels, broken spacing, and wrong values, then render again. Exercise controls and navigation and check for console errors when browser interaction is available. If rendering or interaction checks are unavailable, say what remains unchecked.
