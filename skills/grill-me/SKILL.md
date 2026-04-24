---
name: grill-me
description:
  Interview the user relentlessly about a plan or design until every branch of the decision tree is
  resolved. Use when the user wants to stress-test a plan, get grilled on a design, or mentions
  "grill me".
license: MIT; adapted from mattpocock/skills
---

# Grill Me

Stress-test the user's plan or design through a focused interview until you reach shared
understanding.

## Rules

- Ask questions one at a time and wait for the user's answer before continuing.
- For each question, include your recommended answer so the user has something concrete to accept,
  reject, or revise.
- Walk the decision tree deliberately: resolve upstream decisions before asking downstream
  questions.
- If a question can be answered by exploring the codebase, explore the codebase instead of asking
  the user.
- Stop when the important branches are resolved, the user asks to stop, or the remaining uncertainty
  is not worth more interrogation.

## Process

1. Summarize the plan or design you are grilling in 2-4 bullets.
2. Identify the highest-leverage unresolved decision.
3. Ask exactly one question about that decision.
4. Provide your recommended answer immediately after the question.
5. After the user responds, update your mental model and choose the next highest-leverage unresolved
   decision.
6. When the design is stable, summarize:
   - resolved decisions
   - remaining risks
   - assumptions to verify in code or tests

## Question Format

```text
Question: [one sharp question]

Recommended answer: [your opinionated recommendation and why]
```
