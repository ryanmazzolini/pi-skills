---
name: "research"
description: "Investigate technical questions, uncertain framing, assumptions, evidence, and solution landscapes. Use when the user asks for research, a comparison, or a technical spike, or when investigation could reframe a Ship decision."
---

# Research

Make the situation trustworthy enough to choose a next action. A useful result may answer, reframe, or reject the starting question.

## Frame the investigation

For a narrow fact or exact-document lookup, go directly to the named or authoritative original source, verify it, answer, and stop. It does not require a broad local survey.

Otherwise read the relevant local code, documentation, tests, history, and existing workflow first. Separate observed facts from assumptions. State the provisional question, the decision or understanding it could affect, constraints, what evidence could change the answer or framing, and where the result should go.

When the request names a GitHub issue such as `gh#123` or `#123`, look it up with `gh issue view` when available. Otherwise work from the stated topic and local context.

Ask only when an answer would materially change the investigation or its destination. Begin when the provisional question and useful boundaries are clear. The question does not need to be treated as correct.

When the framing, assumptions, or candidate space remain materially unresolved in a way that could change the answer or next action, read [`exploration.md`](../ship/references/exploration.md) and use its bounded loop.

## Gather decision-relevant evidence

Start with the live system when one exists. Use external sources when local evidence cannot settle the question. Treat model summaries, search rankings, citation counts, and famous authors as leads rather than evidence; verify important claims in original artifacts.

Consider options that satisfy the stated constraints, but use contradictory evidence to test whether those constraints or the starting model are incomplete. Keep candidate discovery separate from accepted evidence.

For a technical spike, state the assumption under test, the smallest experiment, the observation that would settle it, and the cleanup boundary before changing code or infrastructure. Use `prototype` instead when the uncertainty requires human use or observation rather than a technical result.

Stop when the situation supports a next action, material contradictions and gaps are explicit, and another pass is unlikely to change the framing or recommendation. If investigation leaves a consequential preference or trade-off that evidence cannot settle, return to [`align`](../align/SKILL.md) for that decision; otherwise return to the exact Ship checkpoint the investigation interrupted. Do not reopen a settled direction unless new evidence reveals a material conflict or blocker.

## Explain the result

Put the result and its practical effect first. State whether the starting question was answered, reframed, or rejected. Then give the evidence that matters, important trade-offs or unknowns, and any viable alternative a reasonable reader might choose. Cite the local or primary sources behind important claims.

Choose the form that serves the result: prose for reasoning, bullets for choices or actions, and a table only when it makes comparison clearer. Omit raw search logs, source inventories, and rejected paths unless they are needed for reproducibility or continuation.

Finish when the reader can act without reading the sources, can distinguish evidence from assumptions, and can see every uncertainty that still matters.

## Deliver the result

- For inline output, put the result in the conversation.
- For a file, write to the agreed path.
- For active Ship work, retain only decision-relevant synthesis or a bounded no-material-finding result under the work item's `working/research/`, and link it from the decision or question it informs.
- Before posting to a GitHub issue or any other public destination, show the destination and proposed body. Confirm publication and ask whether AI attribution is wanted.
