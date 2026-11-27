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

Keep short explanations in chat. Read [`visuals`](../visuals/SKILL.md) before adding a visual, then use the smallest one that answers the question:

- a component map for responsibilities and boundaries;
- a pipeline for sequential work or data movement;
- a before-and-after view or state table for mutation;
- a branch diagram for decisions, retries, or failures;
- example rows for a query or data shape.

Keep one reading direction, label arrows with actions or data, and omit unrelated elements. Keep tiny linear traces inline as text.

Build a larger interactive explanation when the reader requests it, or when navigating paths, stepping through state, or comparing scenarios materially helps answer the question. Complexity alone is not a reason to build one.

### When building an interactive explanation

- For a commit, commit range, or PR walkthrough, use the `change-walkthrough` skill. It owns extraction, rendering, validation, and risk-ordered review steps. Do not duplicate its renderer or force a system explanation into a diff. If its requirements cannot be met, explain the limitation and give the useful chat explanation; do not create commits just to make a page possible.
- For a system or execution trace, design the page for the question, following [`visuals`](../visuals/SKILL.md) for design and checking. Lead with the purpose, example, and small map; reveal steps and supporting code on demand. Order the page as the answer, then the picture, then the detail: two to four headline numbers when they help, one or two diagrams, then collapsible detail with only the most important card open. Use words as labels and move lists into the collapsible detail.
- Check every claim and source reference against the code or supplied evidence, as well as the numbers and displayed states.
- Apply the `hci` skill to the page.
- Keep a saved page outside the explained repository, in the caller's work-item directory when supplied or a local artifact directory otherwise. Explaining code does not authorize source edits, commits, publishing, or renderer changes.
