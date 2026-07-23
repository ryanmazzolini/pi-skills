---
name: "align"
description: Settle the smallest useful release before planning. Use when ship finds open decisions about requirements, user or caller experience, scope, or solution direction, or when the user asks to be grilled.
---

# Align

**Be relentless about decisions that can meaningfully change Now or its plan.** Investigate first. Ask one focused question per turn. Stop when no such decision remains.

**Now** is the smallest useful end-to-end release. **Later** holds deferred behavior. Widen Now only when the user asks for a broader release or an exhaustive stress test.

## Keep one current alignment

Use a caller-supplied workflow directory only after [`durable-context.md`](../ship/references/durable-context.md) classifies it as a relevant legacy workflow or this workspace profile's canonical work item. Otherwise follow that reference to locate or create the workflow. Do not independently create a repository `.plans` workflow.

Use `{workflow-dir}/alignment.md` for new work. Keep a legacy `question.md` when it already holds the alignment. For a vault-native work item, apply its target validator immediately before writing the alignment or updating `index.md`, then set `Current` to the alignment.

Before asking, compare the user's description with how the system works today. Read relevant docs, code, tests, prior conversation, and workflow files. Use the project's domain language and read relevant `CONTEXT-MAP.md`, `CONTEXT.md`, and architecture decisions. Clarify important differences and terms that hide more than one concept.

Keep the alignment file short and current. Replace outdated understanding rather than keeping a transcript. Record the actor or caller, outcome, success, Now, Later, confirmed walkthrough when applicable, settled behavior and constraints, needed solution direction, inspected facts, assumptions, contradictions, and open decisions.

## Settle what planning needs

Work from the outcome toward concrete behavior:

1. Identify the actor or caller, desired outcome, observable success, Now, and Later.
2. When Now changes an interface, confirm one primary UX/DX walkthrough: how the person or caller starts, acts, receives feedback, finishes, leaves, resumes, retries, and recovers.
3. Resolve constraints that could change the release or experience, such as security, reliability, accessibility, compatibility, performance, viability, or migration.
4. Settle observable behavior for the normal path, important boundaries, failures, and recovery.
5. Choose only the solution direction needed to tell meaningfully different plans apart.

Describe the walkthrough in user or caller language with ordinary values, not proposed types, schemas, status values, or architecture. Reuse a confirmed walkthrough unless new evidence changes it.

When solution shaping is needed, use the domain-shape and boundary guidance in `../../architecture/shape-first/SKILL.md`. Stop at what planning needs. Leave local interfaces, structure, TODOs, and code to later work. Reopen only the parts changed by later answers.

## Prototype what words cannot settle

When investigation and questioning expose one consequential decision that the user cannot judge without seeing or using something, pause alignment and use [`prototype`](../prototype/SKILL.md). Do not prototype when further inspection, a simple sketch, or an easy-to-reverse assumption can settle the decision.

Before prototyping, name the single question, the minimum fidelity needed, and what observation will settle it. Ask the user to approve this interruption as the current one-question turn unless they already requested a prototype.

Afterward, keep the verdict and its effect on alignment, discard the prototype by default, and resume the decision it interrupted. A prototype supplies evidence; it does not complete alignment or authorize planning or production implementation.

## Ask the next question

Rank open decisions by **impact × uncertainty**. Judge impact by how much the plausible answers would change Now, the primary experience, an important constraint, observable behavior, or the solution direction. Treat a decision that prevents a coherent Now as high impact, and include reversal cost in that judgment. Judge uncertainty by how evenly plausible answers fit inspected evidence and prior decisions—not intuition alone. Ask the highest-ranked decision that only the user can settle.

Do not ask when inspection can answer, the plausible answers produce essentially the same plan, a well-supported default has low impact × uncertainty, or the matter belongs in Later. Record the fact, assumption, or deferral in the alignment file. If later evidence raises an assumption's impact × uncertainty, return it to the open decisions and rank it again.

Ask exactly one direct blocking question in plain language. Say why it matters when that is not obvious. Include:

> **My recommended answer:** [answer and short reason]

When useful, append up to three newly relevant proposals under **Assuming unless you disagree:**. Use short, scoped statements only for well-supported choices with low impact × uncertainty that the user can veto cheaply. If the user answers the blocking question without correcting them, record them as accepted assumptions for the current alignment. Keep a consequential, uncertain trade-off as the blocking question; do not invent assumptions to fill the list.

If the evidence favors no answer, recommend “No preference yet” and say why. A question may use one concrete scenario and a few recognizable outcomes, but it must not bundle independent decisions.

Keep investigation, option ranking, and file maintenance thorough and internal. Keep each turn to the blocking question, the new evidence needed to answer it, and any newly relevant low-risk assumptions. Do not restate answers or turn the conversation into a report.

When statements or inspection contradict current understanding, return only the affected decision to the open queue and rank it again. If it ranks highest, explain only the conflict, show relevant evidence when applicable, and ask which understanding is correct.

Before asking a fourth blocking question, compress the remaining uncertainty: resolve facts through inspection, convert well-supported defaults with low impact × uncertainty to assumptions, move behavior outside Now to Later, and use `prototype` for an experiential question that words cannot settle. Continue only when a remaining decision still ranks high by impact × uncertainty. This is a scope check, not a hard question limit.

After roughly ten questions, a major scope change, or whenever the conversation becomes hard to follow, give a short summary of what is settled, assumed, and still open. Then continue with one question. This is not an approval checkpoint.

## Narrow or finish

Stop the current line of questioning when the remaining uncertainty belongs to another useful outcome, actor, release boundary, or solution direction; sits outside Now; or no longer affects the same plan. Also stop when contradictions prevent a clear Now or questions are collecting detail without reducing uncertainty.

Recommend the smallest useful next move: narrow Now, move the branch to Later, open a linked alignment, or name the decision blocking progress. Continue only when the next answer can still meaningfully change the same release or plan.

Alignment is complete when the goal, actor or caller, outcome, success, Now, Later, primary walkthrough when applicable, important constraints, observable behavior, and needed solution direction are clear enough to plan, and the user has settled every decision that could meaningfully change Now or the plan.

Before presenting the completed alignment, rerun its scope and consistency checks. Do not request broad independent review by default. Use the selective early-review guidance in `../ship/references/review-gate.md` only for a named ambiguity or high-risk choice. Resolve factual findings through inspection and bring only genuine requirement choices back as one-question turns.

Present a concise summary of the goal, Now, Later, confirmed experience when applicable, current assumptions, and any unresolved blocker. Ask one direct question: is the alignment correct enough to move to planning? Do not ask the user to review a long alignment document.

After approval, hand the alignment back to `ship`, which routes planning to `slice-plan`. Stop before planning or building.

## Preserve durable decisions

With the user's approval, a new or sharper domain term may update `CONTEXT.md` using `./CONTEXT-FORMAT.md`. A hard-to-reverse architecture choice with a real trade-off may become an architecture decision record using `./ADR-FORMAT.md`.

Keep routine and easily reversed choices in the alignment file. Keep raw transcripts and logs out of workflow documents; put material implementation and review evidence in the work item's plan and review evidence. Ship closes the existing work-item index at graduation instead of creating a separate vault summary.
