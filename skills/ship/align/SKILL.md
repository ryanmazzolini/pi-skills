---
name: "align"
description: Settle consequential human decisions for one target outcome. Use when Ship finds uncertainty about requirements, user or caller experience, scope, or solution direction, or when the user asks to be grilled.
---

# Align

**Be relentless about decisions that can materially change the target outcome or how it will be delivered.** Investigate first. Settle one focused decision per turn. Stop when no such decision remains.

Alignment is optional. Do not use it when the requested benefit, completion signal, and important boundaries are already clear. An approved alignment returns to Ship's direct route unless dependency-aware delivery planning is genuinely useful.

## Keep one target outcome

The **target outcome** is the smallest coherent human or caller benefit being aligned. **Deferred outcomes** name related benefits explicitly excluded from this change. If several independently useful benefits need durable coordination under one destination, return to Ship to propose a roadmap instead of forcing them through one alignment.

Use a caller-supplied workflow directory only after [`durable-context.md`](../ship/references/durable-context.md) classifies it as a relevant legacy workflow or this workspace profile's canonical work item. Otherwise follow that reference to locate or create the workflow. Do not independently create a repository `.plans` workflow.

Use `{workflow-dir}/alignment.md` for new work. Keep a legacy `question.md` when it already holds the alignment. For vault-native work, resolve the alignment and `index.md` targets through the workflow-profile helper before writing them, then set `Current` to the alignment.

Before asking, compare the request with how the system works today. Read relevant docs, code, tests, history, conversation, and workflow files. Use project language and relevant `CONTEXT-MAP.md`, `CONTEXT.md`, and architecture decisions. Clarify important differences and terms that hide more than one concept.

Keep the alignment short and current. Replace outdated understanding rather than keeping a transcript. Record the actor or caller, target outcome, observable success, included and deferred outcomes, confirmed walkthrough when applicable, settled behavior and constraints, needed solution direction, inspected facts, assumptions, contradictions, and open decisions.

## Settle what implementation needs

Work from the benefit toward concrete behavior:

1. Identify the actor or caller, desired benefit, observable completion, included behavior, and deferred outcomes.
2. When the change affects an interface, confirm one primary UX/DX walkthrough: how the person or caller starts, acts, receives feedback, finishes, leaves, resumes, retries, and recovers.
3. Resolve constraints that could change the outcome or experience, such as security, reliability, accessibility, compatibility, performance, viability, or migration.
4. Settle observable behavior for the normal path, important boundaries, failures, and recovery.
5. Choose only the solution direction needed to distinguish meaningfully different implementations or delivery plans.

Describe the walkthrough in user or caller language with ordinary values, not proposed types, schemas, status values, or architecture. Reuse a confirmed walkthrough unless new evidence changes it.

When solution shaping is needed, use `../../architecture/shape-first/SKILL.md`. Stop at what implementation needs. Leave local interfaces, structure, TODOs, and code to later work. Reopen only the parts changed by later answers.

## Prototype what words cannot settle

When one consequential experiential decision cannot be judged through inspection, conversation, or a sketch, pause alignment and use [`prototype`](../prototype/SKILL.md). Before prototyping, name the single question, minimum fidelity, and observation that will settle it. Ask for approval unless the user already requested the prototype.

Afterward, keep the verdict and its effect on alignment, discard the prototype by default, and resume the interrupted decision. A prototype supplies evidence; it does not complete alignment or authorize production implementation.

## Compress and ask the next question

Continuously reduce the unresolved queue:

- Resolve facts through quick inspection.
- For longer fact-finding, use a bounded read-only agent when available. Record which open decision waits on the result, retain the decision-relevant result or a bounded no-material-finding note under the [work-item research guidance](../ship/references/durable-context.md), and keep its pointer with that decision. Continue with an unblocked decision. In Pi, load `agent-coordination` before `delegate`.
- When a decision needs bounded prerequisite work—such as provisioning access or preparing representative data—record the blocked decision and exact completion signal. Complete it within existing authority or give the human a precise checklist, then record its completion and resulting facts. Work performed solely to make a decision possible is not delivery; if it itself delivers approved behavior, return it to Ship's normal delivery route.
- Leave local mechanisms and choices that do not distinguish the outcome to implementation.
- Convert well-supported, low-impact, easily reversed defaults to assumptions.
- Defer related benefits that do not belong to the target outcome.
- Return to Ship for a roadmap only when several benefits need durable coordination or recovery; independence alone does not justify one for a low-complexity change.
- When detailed questions depend on one outcome-boundary decision, keep the parent decision and defer its branches. If questions multiply, narrow the target instead of interrogating the tree.

When fact-finding or prerequisite work returns, record the result as fact, assumption, or deferral. Update only the decision that depended on it, clear the completed prerequisite from the unresolved queue, and keep material evidence linked. Reopen that decision only when it still needs human judgment. Do not poll or pause unrelated questioning.

Rank remaining human decisions by **impact × uncertainty**. Impact measures how much plausible answers change the benefit, walkthrough, important constraint, observable behavior, or solution direction, including reversal cost. Uncertainty measures how evenly plausible answers fit the evidence. Ask the highest-ranked unblocked decision only the user can settle.

Settle exactly one blocking decision in plain language. Give only the setup needed, then ask one short question and include:

> **My recommended answer:** [answer and short reason]

When useful, append up to three new low-risk proposals under **Assuming unless you disagree:**. If the user answers without correcting them, record them as accepted assumptions. Keep consequential uncertain trade-offs as questions.

A multi-step proposal may need a short sequence before the question. It remains one decision only when its parts must be accepted together. If parts can vary independently, ask separately.

Keep investigation, ranking, and file maintenance internal. Do not turn the conversation into a report. When evidence contradicts current understanding, reopen only the affected decision, explain the conflict briefly, and ask which understanding is correct.

Before a fourth blocking question, check that every remaining decision still changes the same target outcome. Collapse dependent questions, defer separate benefits, propose a roadmap only when coordination warrants it, and use a prototype for an experiential question words cannot settle. After roughly ten questions, a major scope change, or lost conversational orientation, give a short settled/assumed/open summary and continue with one question.

## Narrow or finish

Stop when remaining uncertainty belongs to another benefit, actor, release boundary, or solution direction; is deferred; or no longer affects the same implementation. Also stop when contradictions prevent a coherent target or questions collect detail without reducing uncertainty.

Recommend the smallest useful move: narrow the target, defer a benefit, return to Ship for a roadmap, or name the blocking decision. Continue only when the next answer can materially change this outcome or its delivery.

Alignment is complete when the actor, benefit, observable completion, included and deferred outcomes, primary walkthrough when applicable, important constraints, observable behavior, and needed solution direction are clear enough to implement, and every consequential human decision is settled.

Before presenting completion, rerun scope and consistency checks. Use selective early review from `../ship/references/review-gate.md` only for a named ambiguity or high-risk choice. Present the target benefit, deferred outcomes, confirmed experience, current assumptions, and any unresolved blocker. Ask one short question: **Is this alignment ready to use?**

After approval, return to Ship. Ship resumes direct implementation unless `delivery-plan` would add real dependency or coordination value.

## Preserve durable decisions

With user approval, a sharper domain term may update `CONTEXT.md` using `./CONTEXT-FORMAT.md`. A hard-to-reverse architecture choice with a real trade-off may become an ADR using `./ADR-FORMAT.md`.

Keep routine choices in the alignment. Keep raw transcripts and logs out of workflow documents; put material implementation and review evidence with the work item. Ship closes the existing work-item index at graduation instead of creating a separate vault summary.
