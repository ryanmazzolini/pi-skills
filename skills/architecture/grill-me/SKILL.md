---
name: grill-me
description:
  Interview the user relentlessly about a plan or design until the critical path and highest-impact
  decisions are resolved. Use when the user wants to stress-test a plan, get grilled on a design, or
  mentions "grill me".
license: MIT; adapted from mattpocock/skills
---

# Grill Me

Stress-test the user's plan or design through a focused interview until you reach shared
understanding.

## Rules

- Split decisions by impact and alignment:
  - For high-impact, divergent, or hard-to-reverse decisions, ask one focused question and wait for
    the user's answer before continuing.
  - For low-impact, highly aligned confirmations, use a short "unless you disagree" proposal list
    instead of turning each item into a blocking question.
- For each high-impact question, include your recommended answer so the user has something concrete
  to accept, reject, or revise.
- Walk the critical path, not the full decision tree: ask only about upstream choices that would
  change several downstream decisions, are hard to reverse, or require user judgment. Default or
  defer reversible/local choices.
- If a question can be answered by exploring the codebase, explore the codebase instead of asking
  the user.
- Stop when the important branches are resolved, the user asks to stop, or the remaining uncertainty
  is not worth more interrogation.

## Process

1. Summarize the plan or design you are grilling in 2-4 bullets.
2. Identify the highest-leverage unresolved decision: the one with the most downstream fan-out,
   irreversibility, uncertainty, or need for user judgment.
3. If it is high-impact or divergent, ask exactly one question about that decision and briefly say
   why it comes first.
4. Provide your recommended answer immediately after the question.
5. If there are low-impact, highly aligned confirmations, include up to 3 concise proposals under
   "Unless you disagree" and do not block on each individually.
6. After the user responds, update your mental model and choose the next highest-leverage unresolved
   decision.
7. When the design is stable, summarize:
   - resolved decisions
   - remaining risks
   - assumptions to verify in code or tests

## Question Format

For high-impact or divergent decisions:

```text
Question: [one sharp question]

Recommended answer: [your opinionated recommendation and why]
```

For low-impact, highly aligned confirmations, append this only when useful:

```text
Unless you disagree, I will also assume:
- [proposal] — [short rationale or consequence]
- [proposal] — [short rationale or consequence]
```

Do not hide consequential trade-offs in the "unless you disagree" list. Promote them to the single
blocking question instead.
