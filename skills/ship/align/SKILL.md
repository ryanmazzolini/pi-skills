---
name: "align"
description: Align on requirements and high-level solution shape before planning or building. Use when the user wants to be grilled, clarify what a feature should do, resolve non-functional or functional requirements, or align on a design.
---

# Align

Reach shared understanding before planning or building. Ask exactly one human-owned decision per turn, give your recommended answer, and state useful assumptions so the user can correct them cheaply.

Facts come from inspection; decisions come from the human. Read the relevant docs, code, tests, prior conversation, and existing artifacts before asking. Do not ask the user to retrieve something you can discover yourself.

## Durable alignment

Prefer a workflow directory supplied by the caller. Otherwise reuse the relevant directory under an existing `.plans/`, `.plan/`, or `docs/plans/`; create `.plans/YYYY-MM-DD-slug/` when the work needs to survive the session and no project convention exists.

New work uses `{workflow-dir}/alignment.md`. Read a legacy `question.md` when that is the existing artifact; keep one source of truth rather than copying it into a parallel document.

Keep the artifact adaptive. It is complete when a fresh session can identify:

- the goal
- settled non-functional and functional requirements
- assumptions the user may still correct
- any high-level solution shape needed for planning
- any human decision still open

Update it after meaningful answers. Preserve decisions and current understanding, not a transcript or a mandatory section template.

## Follow the uncertainty

Use **non-functional requirements → functional requirements → high-level solution shape** as a light attention order, not fixed stages.

- Surface early any non-functional requirement that could materially change the solution, such as security, performance, reliability, accessibility, or compatibility.
- Resolve observable behavior and edge cases one human-owned decision at a time.
- Refine relevant non-functional requirements as concrete behavior makes them measurable.
- Revisit earlier understanding whenever a later answer changes it.
- When the scope warrants high-level shaping, use the domain-shape and boundary concepts from `../../architecture/shape-first/SKILL.md`. Stop at enough architecture to plan safely; implementation may shape slice-local interfaces and structure later.

Use the project's domain language. Read `CONTEXT-MAP.md`, relevant `CONTEXT.md` files, and ADRs when present. Challenge a term that conflicts with the glossary or hides two different concepts.

## Ask one question

Ask exactly one direct question in plain prose, then wait. Explain briefly why it matters and end with:

> **My recommended answer:** [answer and short reason]

State newly inferred assumptions when they would help the user catch a mistake. Skip empty ceremony when there is nothing useful to assume or report.

Concrete scenarios are often the shortest route to a precise requirement: describe one actor, event, or failure and ask what should happen. Keep requirements observable; leave slice-local mechanisms to planning and implementation.

## Finish alignment

Before planning, check that no unresolved human decision would materially change the requirements, scope, or high-level shape. State any remaining low-risk assumptions.

Ask the user to confirm shared understanding. Continue to planning only after that confirmation.

## Durable language and decisions

After the user resolves knowledge worth preserving beyond this workflow:

- A new or sharpened domain term may update `CONTEXT.md` using `./CONTEXT-FORMAT.md`.
- A high-reversal-cost architecture decision with a real trade-off may become an ADR using `./ADR-FORMAT.md`.

Keep routine or easily reversed choices in the alignment artifact.
