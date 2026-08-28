---
name: "research"
description: "Investigate uncertainty before a technical decision. Use when the user asks for research, a comparison, or a technical spike, or when Ship needs evidence to test material framing, assumptions, or possible approaches."
---

# Research

Make the situation trustworthy enough to choose a next action. The result may answer, reframe, or reject the starting question.

## Choose the investigation path

For a narrow fact or exact-document lookup, go directly to the original source and verify it. Skip the broader research loop, then deliver the answer through the requested destination or return it to the workflow checkpoint that requested it.

When the request names a GitHub issue such as `gh#123` or `#123`, look it up with `gh issue view` when available. Otherwise work from the stated topic and local context.

Ask only when a missing answer would change the evidence paths, experiment authority, or destination. Otherwise record the gap as an assumption and begin with a provisional question; do not assume the question is correct.

A technical spike with one clear hypothesis may also skip the broader loop and continue at **Own bounded technical experiments** below.

For every other investigation, begin with [Orient in `exploration.md`](../ship/references/exploration.md#orient). When the framing, assumptions, or candidate approaches remain materially uncertain, complete [Phase 1](../ship/references/exploration.md#phase-1--fan-out) before [Phase 2](../ship/references/exploration.md#phase-2--verify-and-reduce). A known question whose candidate set already satisfies the Phase 1 checkpoint may proceed directly to Phase 2. Complete each required phase at its stated checkpoint.

## Own bounded technical experiments

For a direct spike or an experiment requested by Phase 2, state the assumption under test, the smallest experiment, the observation that would settle it, and the cleanup boundary before changing code or infrastructure. Within current authority, run the experiment, record the observation, and complete its cleanup; an experiment proposal alone is not evidence. When authority is missing, present the exact experiment and wait. Use [`prototype`](../prototype/SKILL.md) instead when human use or observation must supply the evidence.

When the loop stops, return workflow-linked research to the exact checkpoint it informs. Send consequential preferences or trade-offs that evidence cannot settle to [`align`](../align/SKILL.md); otherwise resume the interrupted workflow. Standalone research needs no workflow return.

## Deliver the result

Turn the investigation into a reader-facing result, or answer a narrow lookup directly. Lead with the result and its practical effect. Cite the original sources behind important claims. Do not narrate exploration phases, evidence paths, or the workflow checkpoint unless the user needs that detail to act or reproduce the work.

Use prose for connected reasoning, bullets for separate choices or actions, and a table only when it makes comparison clearer. Omit raw search logs, source inventories, and rejected paths unless they are needed for reproducibility or continuation.

- When no destination was requested, put the result in the conversation.
- For a requested file, write to the agreed path.
- For active Ship work with a durable work item, follow the [work-item research guidance](../ship/references/durable-context.md) and link retained synthesis from the decision it informs.
- Before posting publicly, show the destination and proposed body. Confirm publication and whether AI attribution is wanted.
