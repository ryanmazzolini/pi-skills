---
name: "research"
description: "Investigate uncertainty before a technical decision. Use when the user asks for research, a comparison, or a technical spike, or when Ship needs evidence to test material framing, assumptions, or possible approaches."
---

# Research

Make the situation trustworthy enough to choose a next action. The result may answer, reframe, or reject the starting question.

## Frame the investigation

For a narrow fact or exact-document lookup, go directly to the original source and verify it. Skip the broader research loop, then deliver the answer through the requested destination or return it to the workflow checkpoint that requested it.

Otherwise inspect the relevant code, documentation, tests, history, workflow, and observed behavior. Separate observations from assumptions. State the provisional question, the decision or understanding it could affect, constraints, what evidence could change the answer or framing, and where the result should go.

When the request names a GitHub issue such as `gh#123` or `#123`, look it up with `gh issue view` when available. Otherwise work from the stated topic and local context.

Ask only when a missing answer would change the evidence paths, experiment authority, or destination. Otherwise record the gap as an assumption and begin with the provisional question; do not assume the question is correct.

## Phase 1 — Fan out

Use this phase when the framing, assumptions, or candidate approaches remain materially uncertain. Read [Phase 1 in `exploration.md`](../ship/references/exploration.md#phase-1--fan-out). Map distinct explanations, approaches, terminology, evidence sources, and challenge paths without recommending a direction yet.

Treat model summaries, search rankings, citation counts, and prominent authors as leads. Verify that candidate artifacts, authors, links, and attributions exist, but defer decision-relevant claim checking and selection to Phase 2.

Stop expanding at the reference's checkpoint. A known question whose candidate set already satisfies that checkpoint may proceed directly to Phase 2.

## Phase 2 — Verify and reduce

Read [Phase 2 in `exploration.md`](../ship/references/exploration.md#phase-2--verify-and-reduce). Check the claims that affect the decision against original artifacts, the live system, or bounded experiments. Test assumptions, compare viable candidates, look for falsifying evidence, and remove directions that the evidence does not support.

For a technical spike, state the assumption under test, the smallest experiment, the observation that would settle it, and the cleanup boundary before changing code or infrastructure. Use `prototype` instead when the uncertainty requires human use or observation.

Stop when the evidence supports a next action, material contradictions and gaps are explicit, and more checking is unlikely to change the result. For workflow-linked research, return the result to the exact checkpoint it informs. Send consequential preferences or trade-offs that evidence cannot settle to [`align`](../align/SKILL.md); otherwise resume the interrupted workflow. Standalone research needs no workflow return.

## Deliver the result

Lead with the result and its practical effect. State whether the starting question was answered, reframed, or rejected. Give the evidence that matters, material counterevidence or unknowns, and any viable alternative a reasonable reader might choose. Cite the original sources behind important claims.

Use prose for connected reasoning, bullets for separate choices or actions, and a table only when it makes comparison clearer. Omit raw search logs, source inventories, and rejected paths unless they are needed for reproducibility or continuation.

- When no destination was requested, put the result in the conversation.
- For a requested file, write to the agreed path.
- For active Ship work with a durable work item, follow the [work-item research guidance](../ship/references/durable-context.md) and link retained synthesis from the decision it informs.
- Before posting publicly, show the destination and proposed body. Confirm publication and whether AI attribution is wanted.
