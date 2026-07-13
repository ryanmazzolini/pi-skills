---
name: "align"
description: Align the critical path to the smallest useful release. Use when the user wants to be grilled, clarify requirements, or align on a design.
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
- settled requirements and any necessary high-level shape
- assumptions the user may still correct
- any blocking human decision

After meaningful answers, replace superseded choices and summarize or link supporting evidence so the artifact reflects current understanding.

## Follow the critical path

Establish Now from the request and existing artifacts before exploring branches. If Now is unclear, make that the first decision.

Most ordinary alignment turns on 2–3 load-bearing decisions. Rank unresolved decisions by downstream impact, divergence between plausible answers, reversal cost, and need for human judgment. Ask only when a decision belongs to Now and could materially change its requirements or high-level shape. Reaching a fourth blocking question triggers a scope check before continuing.

Use **non-functional requirements → functional requirements → high-level solution shape** as a light attention order:

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

Concrete scenarios are often the shortest route to a precise requirement. Keep requirements observable and leave slice-local mechanisms to planning and implementation.

## Finish alignment

Alignment passes its scope gate when Now and Later are explicit and non-contradictory, and every human decision capable of materially changing Now is settled. Keep remaining low-risk uncertainty in assumptions and future behavior in Later.

Summarize the goal, **Now**, **Later**, assumptions, and any open blocker. Ask the user to confirm shared understanding. Planning begins after confirmation.

## Durable language and decisions

After the user resolves knowledge worth preserving beyond this workflow:

- A new or sharpened domain term may update `CONTEXT.md` using `./CONTEXT-FORMAT.md`.
- A high-reversal-cost architecture decision with a real trade-off may become an ADR using `./ADR-FORMAT.md`.

Keep routine or easily reversed choices in the alignment artifact.
