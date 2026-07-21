---
name: "research"
description: "Research technical questions and decisions. Use when the user asks for evidence, a technical spike, or a comparison of viable options."
---

# Research

Find enough evidence to support a decision, then stop.

## Understand the decision

Read the local code and documentation first. Identify the decision, its constraints, and where the result should go: the conversation, a file, or a public destination.

When the request names a GitHub issue such as `gh#123` or `#123`, look it up with `gh issue view` when available. Otherwise work from the stated topic and local context.

Ask only when an answer would change the research or its destination. Begin when the decision, constraints, and destination are clear.

## Gather enough evidence

Start with local evidence. If external evidence is needed, make one broad pass of 2–4 different queries, then read the strongest current primary sources. Search again only for a fact that could change the decision.

Consider only options that meet the user's constraints. Keep raw notes, source inventories, and rejected paths out of anything written for the reader.

Stop when the evidence supports a recommendation, important gaps are clear, and more searching is unlikely to change the decision. Do not reopen research after the user chooses a direction unless new evidence reveals a blocker.

## Explain the decision

Put the recommendation and its practical effect first. Then give the evidence that matters, important trade-offs or unknowns, and any viable alternative a reasonable reader might choose. Cite the local or primary sources behind important claims.

Choose the form that best serves the decision: prose for reasoning, bullets for choices or actions, and a table only when it makes a comparison clearer. Add headings, background, diagrams, or a next step only when they help the reader act. Do not add empty sections or follow a report template for its own sake.

Finish when the reader can act without reading the sources and can see every important uncertainty.

## Deliver the result

- For inline output, put the result in the conversation.
- For a file, write to the agreed path.
- Before posting to a GitHub issue or any other public destination, show the destination and proposed body. Confirm publication and ask whether AI attribution is wanted.
