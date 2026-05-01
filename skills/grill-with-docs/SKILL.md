---
name: grill-with-docs
description:
  Stress-test a plan against the existing codebase and project docs, sharpen domain terminology, and
  update CONTEXT.md / ADRs as decisions crystallize. Use when the user wants to be grilled on a
  design while keeping durable docs in sync.
license: MIT; adapted from mattpocock/skills
---

# Grill With Docs

Stress-test the user's plan or design through a focused interview, using the codebase and durable
project docs as the source of truth. Capture resolved terminology and durable decisions as they
become clear.

## Rules

- **Artifact-first**: build from code and docs, not chat memory alone.
- **One question at a time**: ask one focused question and wait for the user's answer before
  continuing.
- **Recommended answer required**: every question includes your opinionated recommendation so the
  user has something concrete to accept, reject, or revise.
- **Investigate before asking**: if a question can be answered by reading code or docs, investigate
  instead of asking.
- **Ask only when ambiguity matters**: do not run a checklist; surface the highest-leverage unknown
  that blocks the next decision.
- Challenge the plan against existing terminology, ADRs, tests, and implementation details.
- Update docs inline when a term or decision is resolved; do not batch documentation updates for the
  end.
- Create documentation files lazily: only when there is something real to record.

## Documentation Discovery

Look for existing docs before grilling:

1. If `CONTEXT-MAP.md` exists, read it and use it to identify the relevant bounded context.
2. Otherwise, look for a relevant `CONTEXT.md` at the repo root or near the code being discussed.
3. Look for ADRs in `docs/adr/` at the repo root or inside the relevant context.
4. Read nearby README files, design notes, tests, and implementation code that could answer open
   questions.

If multiple contexts could apply, ask one clarifying question before writing docs.

## During the Session

### Grill the plan

1. Summarize the plan or design in 2-4 bullets.
2. Identify the highest-leverage unresolved decision.
3. Investigate code/docs if they can answer it.
4. Ask exactly one question when user judgment is needed.
5. Provide your recommended answer immediately after the question.
6. After the user responds, update docs for any resolved term or durable decision.
7. Repeat until the important branches are resolved or the user asks to stop.

Use the same question shape as `grill-me` and RPI handoffs:

```text
Question: [one sharp question]

Recommended answer: [your opinionated recommendation and why]
```

Good questions should be:

- upstream of several downstream choices
- answerable by the user better than by the codebase
- specific enough that a yes/no or short correction can resolve them
- paired with the doc/code consequence if the recommendation is accepted

### Sharpen language

- When the user uses a term that conflicts with `CONTEXT.md`, call it out immediately.
- When a term is vague or overloaded, propose a precise canonical term.
- Prefer domain-expert language over implementation names.
- Stress-test domain relationships with concrete scenarios and edge cases.
- If the code contradicts the conversation, surface the contradiction and ask which source should
  change.

### Update CONTEXT.md

When terminology is resolved, update the relevant `CONTEXT.md` immediately. Use
[`CONTEXT-FORMAT.md`](./CONTEXT-FORMAT.md) for new files or sections.

Only include domain terms that are meaningful to a domain expert. Omit generic programming concepts
unless they have project-specific domain meaning.

### Offer ADRs sparingly

Offer to create an ADR only when all three are true:

1. **Hard to reverse** — changing later would be meaningfully expensive.
2. **Surprising without context** — a future reader would wonder why this path was chosen.
3. **A real trade-off** — there were credible alternatives and one was chosen for specific reasons.

Use [`ADR-FORMAT.md`](./ADR-FORMAT.md). If any condition is missing, skip the ADR.

## Wrap-up

When the grilling session ends, summarize:

- resolved decisions
- docs updated
- remaining risks or assumptions
- code/tests/docs that should be verified next
