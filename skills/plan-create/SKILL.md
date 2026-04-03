---
name: plan-create
description: Distill research into an implementation plan with options analysis and intent shaping. Use after /skill:plan-research or when you have enough context to plan.
---

# Plan Creation

## Rules

- **OPTIONS-FIRST**: Present 2-4 approaches with detailed context, user picks
- **GOALS NOT TASKS**: Remaining Intent describes outcomes, not checkbox items
- **RESEARCH-INFORMED**: Build on research findings — don't re-research
- **TEACH**: Explain WHY at every step — patterns, tradeoffs, reasoning
- **LEAN PLANS**: Plan doc stays under 150 lines
- **ASK WHEN UNCLEAR**: Clarify before assuming

## Process

### 1. Load Context

```bash
DATE=$(date +%Y-%m-%d)
```

**Auto-detect source from arguments:**
- Matches a research slug → read `thoughts/ryan/research/*[slug].md`
- Contains `github.com` or `gh#` or `#NNN` → `gh issue view <number>`
- Otherwise → use as plain text feature description

If no research doc found, check for recent ones:
```bash
ls thoughts/ryan/research/*.md 2>/dev/null | sort | tail -5
```

If recent docs exist, ask which to use. If none exist, suggest running `/skill:plan-research` first or `/skill:plan-task` for simple work. Let the user choose to continue without research if they prefer.

If research doc loaded, summarize key findings and identified approaches as context.

### 2. Define Feature Iteratively

Converge on WHAT before exploring HOW.

Ask 1-4 clarifying questions:
- Problem/solution fit
- Scope boundaries (in/out)
- Success criteria
- Technical constraints

Iterate until locked. Reference codebase patterns from research where relevant.

### 3. Options Analysis

Identify 3-6 key decisions. When research exists, use the **Approaches Identified** section as a starting point.

For each decision, output the detailed comparison — code snippets, architecture diagrams, tradeoff tables. Then ask the user which approach to take with concise options that reference the analysis above.

Record each choice for the Decisions section.

### 4. Shape Intent

**Remaining Intent** — describe outcomes, not rigid tasks. Structure by concern and milestone:

```
### [Concern area]

#### [Milestone — coherent sub-goal]
_after: [dependency milestone, if any]_
- [Goal-oriented outcome]
- [Goal-oriented outcome]
```

- `###` — concern or component area (e.g. "Auth layer", "UI")
- `####` — milestone, a cluster of intents that deliver a coherent sub-goal
- `_after: X_` — optional dependency: don't start this milestone until X is in Done
- `-` — individual intents: outcomes not tasks

**Minimize dependencies.** Only add `_after:` when one milestone produces artifacts (files, schema, API) that another must read or call.

**Verification** — split into automated + manual:
- Automated: test commands (`npm test`, `pytest`, etc.)
- Manual: step-by-step actions ("Load /login, enter creds, verify redirect")

### 5. Confirm & Document

Present summary, confirm with user. Write plan doc to `thoughts/ryan/plans/YYYY-MM-DD-[slug].md`:

```markdown
---
source: {repo basename}
date: YYYY-MM-DD
type: plan
---

# [Feature Name] - YYYY-MM-DD

**Status**: Planning | **Goal**: [one sentence outcome]
**External**: [Link if applicable]
**Research**: [Link to research doc if applicable]

## Approach
[Selected strategy]
**Why**: [reasoning, rejected alternatives]

## Decisions
- [Decision]: [choice] — [why this fits]

## Done
[Empty — filled during implementation]

## Remaining Intent

### [Concern area]

#### [Milestone name]
- [Goal-oriented outcome]

#### [Another milestone]
_after: [Milestone name]_
- [Goal-oriented outcome]

## Deviations
[Empty — tracked when going off-script during implementation]

## Verification

### Automated
- [test commands]

### Manual
1. [Load X / Launch Y]
2. [Perform action]
3. [Verify outcome]

## Notes
[Empty — filled by /skill:plan-save or during /skill:plan-implement]
```

After writing, sync thoughts and prompt next steps:

```bash
humanlayer thoughts sync
```

```
Plan saved to thoughts/ryan/plans/YYYY-MM-DD-[slug].md

Next steps:
- Run /skill:plan-implement YYYY-MM-DD-[slug]
```
