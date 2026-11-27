---
name: "explain-code"
description: "Explain how code, a system, or a query behaves, or how a change affects that behavior. Use when asked how it works or what a change does, or when an earlier explanation of it did not land. For a requested page explaining the changes in a commit, commit range, or PR, use change-walkthrough."
---

# Explain Code

Help the reader reason about what the code does, how the relevant pieces fit, and where to look next. Order the explanation for understanding, not by file order or review risk.

Explaining code does not authorize source edits, commits, publishing, or renderer changes.

## Build the explanation

1. **Verify the behavior.** Read the relevant entry point, callers, implementation, and tests until you can follow the path the question asks about. Reuse supplied, inspected evidence when it already establishes that path. For a change, check both versions and keep references tied to the version being explained. Distinguish observed behavior from inference; a call graph is a navigation aid, not proof of runtime order. When evidence the answer needs is unavailable, such as a revision or configuration, explain what you can establish.
2. **Orient the reader.** For a broad question, lead with what the code accomplishes, one small realistic input, and its result. Map only the components, responsibilities, and boundaries needed to connect them. A sentence can be the whole map. Define the few terms needed for this layer. For a narrow question, answer the requested layer directly; add broader context only when it helps.
3. **Trace the requested layer.** Follow one concrete input through that layer, showing the decisions, data movement, and state changes that explain the behavior. For a broad question, follow the input from step 2 from entry point to result. For a narrow question, trace an input only as far as the answer needs. For a drill-down, continue the earlier example when it reaches that layer. Include failures and retries when they affect the answer. Connect each important step to the component responsible and explain why the connection matters. Give source paths and symbols or line references where they help the reader verify or continue, rather than cataloguing every function. Tell the reader which steps you inferred and which conclusions depend on evidence you could not check.
4. **Stop at a useful boundary.** For a broad first answer, keep the trace at the component level; do not expand all the implementation layers you investigated. Offer two to four concrete drill-downs when useful detail remains, such as retry scheduling or transaction boundaries. When the reader chooses one, trace only that layer and reconnect it to the map. Stop when they can reason about the requested behavior without needing the adjacent mechanics.

For a change, explain what happened before, what happens now, and why the difference matters. For alternatives, run the same input through each and state what changes and what stays the same. For numeric comparisons, show current and proposed counts in parallel, then say which workload changes in practice.

Use literal language and one stable term per concept. Define necessary jargon rather than replacing it with vague words. Use an analogy only after the literal explanation and state where it stops matching. If an explanation did not land, restore missing context and change the example or visual rather than merely shortening the same answer.

## Choose the presentation

Answer in chat by default. Read [`visuals`](../visuals/SKILL.md) before adding a visual, then use the smallest one that answers the question:

- a component map for responsibilities and boundaries;
- a pipeline for sequential work or data movement;
- a before-and-after view or state table for mutation;
- a branch diagram for decisions, retries, or failures;
- example rows for a query or data shape.

Keep one reading direction, label arrows with actions or data, and omit unrelated elements. Keep tiny linear traces inline as text.

A page is a standalone HTML file. An inline visual with controls is still a chat answer. Build a page only when the reader asks for one. When navigating paths, stepping through state, or comparing scenarios would help and the chat cannot show it inline, answer in chat and offer a page as one of the drill-downs.

For a page or a visual with controls, check every claim and source reference against the code or supplied evidence, and apply the `hci` skill.

### When building a page

- When the page explains the changes a commit, commit range, or PR introduces, use the `change-walkthrough` skill. It owns extraction, rendering, validation, and risk-ordered review steps. Do not duplicate its renderer or force a system explanation into a diff. If its requirements cannot be met, explain the limitation and give the useful chat explanation; do not create commits just to make a page possible.
- For a system or execution trace, design the page for the question, following [`visuals`](../visuals/SKILL.md) for design, checking and saving. Lead with the answer for the example input. Show the map or trace next. Let the reader open individual steps and supporting code for detail. Use words as labels.
- Save the page outside the explained repository.
