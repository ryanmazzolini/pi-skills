---
name: "align"
description: Align the critical path to the smallest useful release. Use when ship routes work with open requirements, user or caller experience, scope, or high-level shape decisions, or when the user explicitly asks to be grilled.
---

# Align

Follow the critical path to shared understanding before planning or building. Ask one question at a time, but choose the question that settles the most important later decisions.

**Now** is the smallest useful end-to-end release by default. **Later** holds explicitly deferred behavior. Widen Now only when the user asks for a broader release or exhaustive stress test.

Facts come from inspection; decisions come from the human. Read relevant docs, code, tests, prior conversation, and existing artifacts before asking.

## Durable alignment

Prefer a workflow directory supplied by the caller. Otherwise reuse the relevant directory under an existing `.plans/`, `.plan/`, or `docs/plans/`; create `.plans/YYYY-MM-DD-slug/` when the work needs to survive the session and no project convention exists.

New work uses `{workflow-dir}/alignment.md`. Read a legacy `question.md` when that is the existing artifact and keep it as the single source of truth.

Keep the artifact adaptive and compact. It is ready when a fresh session can identify:

- the goal and intended outcome
- Now and Later
- the primary experience when Now changes an interface
- settled requirements and any necessary high-level shape
- current assumptions the user may still correct
- any unresolved human decision

After meaningful answers, replace superseded understanding rather than preserving a transcript. Keep facts, decisions, assumptions, and open questions current.

## Move from broad to concrete

Use this as an attention order, not a sequence of mandatory phases:

1. Establish the actor or caller, desired outcome, success, and Now and Later boundary.
2. When Now changes an interface, describe how the person or caller starts, acts, receives feedback, finishes, resumes, retries, or recovers.
3. Surface only the constraints that could materially change that scope or experience, such as security, reliability, accessibility, compatibility, performance, viability, or migration.
4. Resolve observable behavior along the normal path, important boundaries, failures, and recovery.
5. Settle only the high-level solution shape needed to distinguish materially different plans.

For an experience walkthrough, use user or caller language and ordinary values rather than proposed types, schemas, status values, or architecture. Confirm the walkthrough before shaping the solution, but do not turn it into a separate ceremony when it is already clear.

Later answers may change earlier understanding. Revisit the affected branch instead of treating each part as complete forever. When high-level shaping is necessary, use the domain-shape and boundary concepts from `../../architecture/shape-first/SKILL.md`. Leave slice-local interfaces and structure to implementation.

Use the project's domain language. Read `CONTEXT-MAP.md`, relevant `CONTEXT.md` files, and architecture decisions when present. Challenge a term that conflicts with the glossary or hides two different concepts.

## Choose the next question

Before asking, consider the plausible answers and what each would change. Prefer the question whose plausible answers would change the most downstream decisions across:

- Now or Later scope
- the primary experience
- an important constraint
- observable behavior or verification
- the high-level shape needed for planning

Break ties in favor of choices that are expensive to reverse and genuinely belong to the human.

Do not ask when inspection can answer the question, the plausible answers lead to essentially the same plan, a safe default is easy to reverse, or the branch belongs in Later. Resolve these cases through inspection, a stated assumption, or deferral instead.

## Ask one question

Ask exactly one direct question in plain language. Explain briefly why it matters and end with:

> **My recommended answer:** [answer and short reason]

One question may use a concrete scenario and contrast a small number of recognizable outcomes. Do not bundle independent decisions or collect several fields at once.

When new context creates an assumption the user may want to correct, state only that new assumption in natural language before asking the next question. Do not require a fixed heading or repeated sentence pattern. Do not restate the user's answer, repeat earlier assumptions, or mix inferred assumptions with recommendations. If getting the inference wrong could materially change Now, make it the next question instead.

## Keep the conversation oriented

Maintain a current picture of inspected facts, human decisions, assumptions, contradictions, Now and Later, and the most consequential unresolved branches.

After roughly ten questions, after a material scope change, or whenever the conversation becomes difficult to follow, give a concise conversational summary. State:

- what is settled
- what is currently assumed
- the few outstanding questions that matter most

Replace stale understanding rather than replaying the history. This summary helps the human stay oriented; it is not an approval ceremony. Continue with the highest-value outstanding question unless the summary exposes a real scope decision.

When statements conflict, explain the conflict briefly and ask the human to choose or clarify. When a term has two plausible meanings, state them. When inspection contradicts the current understanding, present the evidence and reopen only the affected decision.

## Narrow, split, or stop

Reassess the conversation when:

- the remaining questions describe another independently useful outcome
- branches have different actors, release boundaries, or solution directions
- uncertainty outside Now dominates the discussion
- the next questions no longer affect the same plan
- contradictions prevent a coherent Now
- the discussion is collecting details rather than removing meaningful ambiguity

Recommend the smallest useful response: narrow Now, move a branch to Later or a linked alignment, or identify the specific ambiguity that must be resolved before continuing. Question count is a signal, not a quota; continue when the next answer can still materially change the same release and plan.

## Finish alignment

Alignment is ready when Now and Later are coherent, the primary experience is confirmed when applicable, consequential constraints are resolved or explicitly assumed, observable behavior is sufficient to plan, and no remaining human-owned question has plausible answers that would materially change the release or plan.

Before presenting the completed alignment summary, follow `../ship/references/review-gate.md`. Treat independent analysis as support for the coordinating thread. Resolve factual corrections directly, and bring only genuine requirement-level ambiguity or choices back into the conversation. Do not ask the human to review a long alignment document.

Summarize the goal, Now, Later, the confirmed experience when applicable, current assumptions, and any unresolved decision. Ask the human to correct that summary or confirm moving to planning.

## Durable language and decisions

After the user resolves knowledge worth preserving beyond this workflow:

- A new or sharpened domain term may update `CONTEXT.md` using `./CONTEXT-FORMAT.md`.
- A high-reversal-cost architecture decision with a real trade-off may become an architecture decision record using `./ADR-FORMAT.md`.

Keep routine or easily reversed choices in the alignment artifact.
