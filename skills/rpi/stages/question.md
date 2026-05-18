# Question stage

Use when starting a meaningful workflow, when intent/scope is ambiguous, or when a PRP needs a decision interview log before drafting.

## Rules

- Respect explicit "just do it" requests; do not force a grill when the user asked to proceed.
- If the work is clear but not urgent, state why it seems clear and ask whether to continue.
- If the work is ambiguous, state the ambiguity and ask whether to align with questions.
- Ask one focused question at a time when user input is required.
- Every question must include a recommended answer.
- Resolve upstream decisions before downstream details.
- Inspect code/docs instead of asking questions whose answers are discoverable.
- Update `question.md` incrementally during meaningful alignment so it can serve as a handoff point.

## Alignment gate format

For ambiguous work:

```text
This seems ambiguous because [specific uncertainty].

Question: Would you like to align with a short question sequence before I draft the PRP?

Recommended answer: Yes — [why alignment is worth it].
```

For clear work:

```text
This seems clear because [specific reason]. I think the next step is [action] and verification is [proof].

Question: Should I continue?

Recommended answer: Yes — [why].
```

For the grill itself:

```text
Question: [one sharp decision question]

Recommended answer: [opinionated recommendation and why]
```

## Process

1. Resolve or create the workflow directory.
2. Summarize the current understanding in 2-4 bullets.
3. Identify the highest-leverage unresolved decision.
4. Ask exactly one question with a recommended answer.
5. After the user answers, update `question.md` with the compact decision log.
6. Repeat until the important decisions are resolved or remaining uncertainty is not worth more interrogation.
7. When aligned, load `stages/create.md` to draft/update the PRP in `plan.md`.

## Output

Write or update `{workflow-dir}/question.md`:

```md
---
source: {repo basename}
date: YYYY-MM-DD
type: question-log
goal: [one sentence]
---

# [Workflow Title] — Alignment Log

## Goal

[What we are trying to accomplish.]

## Current Understanding

- [Compact context bullet]

## Question Log

### Q1 — [decision name]

Question: [question asked]

Recommended answer: [recommendation given]

User answer: [accepted/revised/rejected answer]

Decision: [resolved decision, if any]

## Resolved Decisions

- [Decision]: [choice] — [why]

## Open Questions

- [Question or none]

## Assumptions

- [Assumption to verify]

## Suggested PRP Direction

[Short handoff note for `plan.md`: likely end state, scope boundaries, verification expectations, and whether a board is likely needed.]
```

After alignment is sufficient, draft/update the PRP automatically unless the workflow location is unclear or writing would overwrite meaningful existing content.
