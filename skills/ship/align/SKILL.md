---
name: "align"
description: Settle the smallest useful release before planning. Use when ship finds open decisions about requirements, user or caller experience, scope, or solution direction, or when the user asks to be grilled.
---

# Align

**Be relentless about decisions that can meaningfully change Now or its plan.** Investigate first. Ask one focused question per turn. Stop when no such decision remains.

**Now** is the smallest useful end-to-end release. **Later** holds deferred behavior. Widen Now only when the user asks for a broader release or an exhaustive stress test.

## Keep one current alignment

Use the workflow directory supplied by the caller. Otherwise reuse the relevant directory under `.plans/`, `.plan/`, or `docs/plans/`. For new durable work without a project convention, create `.plans/YYYY-MM-DD-slug/`.

Use `{workflow-dir}/alignment.md` for new work. Keep a legacy `question.md` when it already holds the alignment. If align starts durable work without the project-vault context from ship, first follow the vault guidance in `../ship/SKILL.md`.

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

## Ask the next question

Before each question, consider the likely answers and how each would change the work. Prefer the decision only the user can make that has the greatest effect on Now, the primary experience, an important constraint, observable behavior, or the solution direction. If two decisions matter equally, ask about the one that is harder to reverse.

Do not ask when inspection can answer, the likely answers produce essentially the same plan, a safe default is easy to reverse, or the matter belongs in Later. Record the fact, assumption, or deferral in the alignment file. State a new assumption briefly when the user may want to correct it. If a wrong assumption could change Now or the plan, make it the next question.

Ask exactly one direct question in plain language. Say why it matters when that is not obvious. End with:

> **My recommended answer:** [answer and short reason]

If the evidence favors no answer, recommend “No preference yet” and say why. A question may use one concrete scenario and a few recognizable outcomes, but it must not bundle independent decisions.

Keep investigation, option ranking, and file maintenance thorough and internal. Keep each turn to the new evidence or assumption needed for one question. Do not restate answers or turn the conversation into a report.

When statements conflict, explain only the conflict and ask which understanding is correct. When inspection contradicts current understanding, show the relevant evidence and reopen only the affected decision.

After roughly ten questions, a major scope change, or whenever the conversation becomes hard to follow, give a short summary of what is settled, assumed, and still open. Then continue with one question. This is not an approval checkpoint.

## Narrow or finish

Stop the current line of questioning when the remaining uncertainty belongs to another useful outcome, actor, release boundary, or solution direction; sits outside Now; or no longer affects the same plan. Also stop when contradictions prevent a clear Now or questions are collecting detail without reducing uncertainty.

Recommend the smallest useful next move: narrow Now, move the branch to Later, open a linked alignment, or name the decision blocking progress. Continue only when the next answer can still meaningfully change the same release or plan.

Alignment is complete when the goal, actor or caller, outcome, success, Now, Later, primary walkthrough when applicable, important constraints, observable behavior, and needed solution direction are clear enough to plan, and the user has settled every decision that could meaningfully change Now or the plan.

Before presenting the completed alignment, follow `../ship/references/review-gate.md`. Resolve factual findings through inspection. Bring only genuine requirement choices back as one-question turns. If independent review is unavailable, state the blocker and stop before requesting approval.

Present a concise summary of the goal, Now, Later, confirmed experience when applicable, current assumptions, and any unresolved blocker. Ask one direct question: is the alignment correct enough to move to planning? Do not ask the user to review a long alignment document.

After approval, hand the alignment back to `ship`, which routes planning to `slice-plan`. Stop before planning or building.

## Preserve durable decisions

With the user's approval, a new or sharper domain term may update `CONTEXT.md` using `./CONTEXT-FORMAT.md`. A hard-to-reverse architecture choice with a real trade-off may become an architecture decision record using `./ADR-FORMAT.md`.

Keep routine and easily reversed choices in the alignment file. Keep operational history out of the project vault; `ship` handles the high-level vault note at graduation and asks before committing it.
