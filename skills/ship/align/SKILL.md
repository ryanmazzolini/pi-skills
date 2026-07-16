---
name: "align"
description: Align the critical path to the smallest useful release. Use when ship routes work with open requirements, UX/DX, scope, or high-level shape decisions, or when the user explicitly asks to be grilled.
---

# Align

Follow the critical path to shared understanding before planning or building. **Now** is the smallest useful end-to-end release by default. **Later** holds explicitly deferred behavior. Widen Now only when the user explicitly asks for a broader release or exhaustive stress test.

Facts come from inspection; decisions come from the human. Read relevant docs, code, tests, prior conversation, and existing artifacts before asking.

## Durable alignment

Prefer a workflow directory supplied by the caller. Otherwise reuse the relevant directory under an existing `.plans/`, `.plan/`, or `docs/plans/`; create `.plans/YYYY-MM-DD-slug/` when the work needs to survive the session and no project convention exists.

New work uses `{workflow-dir}/alignment.md`. Read a legacy `question.md` when that is the existing artifact and keep it as the single source of truth.

Keep the artifact adaptive and compact. It is ready when a fresh session can identify:

- the goal
- Now and Later
- the primary UX/DX flow when Now changes an interface
- settled requirements and any necessary high-level shape
- assumptions the user may still correct
- any blocking human decision

After meaningful answers, replace superseded choices and summarize or link supporting evidence so the artifact reflects current understanding.

## Establish experience before shape

When Now changes how a person or caller completes a task, inspect the current behavior and describe one concrete walkthrough:

```text
entry or trigger → actions and choices → feedback or waiting
→ completion → leave, resume, retry, or recover
```

For UX, state what the person sees, understands, and can do. For DX—such as an API, CLI, event, or library—state what the caller sends, receives, retries, and handles. Use user or caller language and ordinary values, not proposed types, schemas, status enums, or architecture.

Ask the user to correct this walkthrough before crafting domain shapes, boundaries, or system architecture. Reuse an already confirmed flow instead of reopening it. If Now changes no interface, state that briefly and continue.

## Follow the critical path

Establish Now from the request and existing artifacts before exploring branches. If Now is unclear, make that the first decision.

Most ordinary alignment turns on 2–3 load-bearing decisions. Rank unresolved decisions by downstream impact, divergence between plausible answers, reversal cost, and need for human judgment. Ask only when a decision belongs to Now and could materially change its requirements or high-level shape. Reaching a fourth blocking question triggers a scope check before continuing.

Use **experience flow → non-functional requirements → detailed behavior → high-level solution shape** as a light attention order:

- Confirm the primary UX/DX walkthrough before exploring isolated cases or implementation mechanisms.
- Surface any non-functional requirement that could materially change Now, such as security, performance, reliability, accessibility, or compatibility.
- Resolve observable behavior and edge cases that change Now or prevent safe planning.
- Treat low-impact or easily reversed choices as assumptions the user can veto cheaply.
- Move branches that cannot change Now to Later.
- When high-level shaping is necessary, use the domain-shape and boundary concepts from `../../architecture/shape-first/SKILL.md`. Leave slice-local interfaces and structure to implementation.

Use the project's domain language. Read `CONTEXT-MAP.md`, relevant `CONTEXT.md` files, and ADRs when present. Challenge a term that conflicts with the glossary or hides two different concepts.

## Ask one question

Ask exactly one direct blocking question in plain prose, explain briefly why it matters, and end with:

> **My recommended answer:** [answer and short reason]

When useful, append up to three low-impact proposals under **Unless you disagree**. A consequential trade-off belongs in the blocking question.

Concrete scenarios are often the shortest route to a precise requirement. Prefer completing the primary walkthrough before branching into isolated edge cases. Keep requirements observable and leave slice-local mechanisms to planning and implementation.

## Finish alignment

Alignment passes its scope gate when Now and Later are explicit and non-contradictory, the primary UX/DX walkthrough is confirmed when applicable, and every human decision capable of materially changing Now is settled. Keep remaining low-risk uncertainty in assumptions and future behavior in Later.

Summarize the goal, **Now**, **Later**, the confirmed experience when applicable, assumptions, and any open blocker. Before asking the user to approve the completed alignment artifact, follow `../ship/references/review-gate.md`; a blocking alignment question does not require review. Planning begins after human confirmation.

## Durable language and decisions

After the user resolves knowledge worth preserving beyond this workflow:

- A new or sharpened domain term may update `CONTEXT.md` using `./CONTEXT-FORMAT.md`.
- A high-reversal-cost architecture decision with a real trade-off may become an ADR using `./ADR-FORMAT.md`.

Keep routine or easily reversed choices in the alignment artifact.
