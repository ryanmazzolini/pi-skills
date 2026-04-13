---
name: plan-research
description: Research a problem space before planning. Explores prior art, codebase patterns, related implementations, and risks.
---

# Research

## Rules

- **DIVERGE FIRST**: Explore broadly before narrowing — surface options, patterns, and risks
- **WEB + CODEBASE**: Research both external prior art and internal patterns
- **DEVIL'S ADVOCATE**: Always challenge assumptions and surface counterarguments
- **STRUCTURED OUTPUT**: Produce a durable `research.md` artifact that later stages can consume
- **TEACH**: Explain what you found and why it matters — don't just dump links
- **NO DECISIONS**: Surface tradeoffs, don't make choices — that's for later stages

## Process

### 1. Load Context

Treat the input as a workflow handoff. Prefer a workflow directory path such as:

`thoughts/ryan/plans/YYYY-MM-DD-[slug]/`

If a workflow directory is provided:
- read `question.md` if it exists
- use that as the framing artifact
- write research back into the same directory as `research.md`

If the user gives only a feature description, derive a workflow directory under:
`thoughts/ryan/plans/YYYY-MM-DD-[slug]/`
and continue there.

Summarize the problem space in 2-3 sentences. Identify what needs researching.

### 2. Choose Research Approach

Analyze the feature and propose how to organize the research. Ask the user to confirm:
- by problem concern
- by implementation domain
- by perspective

### 3. Research

For each research area:
- explore codebase patterns
- research external prior art
- run a devil's-advocate pass

### 4. Synthesize Findings

Write `research.md` in the workflow directory:

`thoughts/ryan/plans/YYYY-MM-DD-[slug]/research.md`

```markdown
---
source: {repo basename}
date: YYYY-MM-DD
type: workflow-stage
stage: research
goal: [one sentence goal]
---

# Research

## Problem
[1-2 sentence problem statement]

## Key Findings
- ...

## Codebase Patterns
- [file path] — [why it matters]

## Prior Art
- [URL] — [what it shows]

## Approaches Identified
### [Approach name]
- **How**: ...
- **Pros**: ...
- **Cons**: ...
- **Evidence**: ...

## Risks & Concerns
- ...

## Open Questions
- ...

## Sources
- [URL or file path] — [contribution]
```

### 5. Handoff

Sync and suggest the next stage:

```bash
humanlayer thoughts sync
```

```text
Research stage complete.

Artifact written:
- thoughts/ryan/plans/YYYY-MM-DD-[slug]/research.md

Next steps:
- Run /plan-next to continue in a fresh /skill:plan-design session
- Run /skill:plan-task only if the work turned out to be much smaller than expected
```
