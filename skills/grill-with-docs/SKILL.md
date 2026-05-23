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
- **Decision split**: for high-impact, divergent, or hard-to-reverse decisions, ask one focused
  question and wait for the user's answer before continuing; for low-impact, highly aligned
  confirmations, use a short "unless you disagree" proposal list instead of turning each item into a
  blocking question.
- **Recommended answer required**: every high-impact question includes your opinionated
  recommendation so the user has something concrete to accept, reject, or revise.
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
4. If user judgment is needed for a high-impact or divergent decision, ask exactly one question.
5. Provide your recommended answer immediately after the question.
6. If there are low-impact, highly aligned confirmations, include up to 3 concise proposals under
   "Unless you disagree" and do not block on each individually.
7. After the user responds, update docs for any resolved term, durable decision, or accepted
   low-impact proposal that is worth recording.
8. Repeat until the important branches are resolved or the user asks to stop.

Use the same question shape as `grill-me` and RPI handoffs for high-impact or divergent decisions:

```text
Question: [one sharp question]

Recommended answer: [your opinionated recommendation and why]
```

For low-impact, highly aligned confirmations, append this only when useful:

```text
Unless you disagree, I will also assume:
- [proposal] — [short rationale or doc/code consequence]
- [proposal] — [short rationale or doc/code consequence]
```

Do not hide consequential trade-offs in the "unless you disagree" list. Promote them to the single
blocking question instead.

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
