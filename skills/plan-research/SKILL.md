---
name: plan-research
description: Research a problem space before planning. Explores prior art, codebase patterns, related implementations, and risks.
---

# Research

## Rules

- **DIVERGE FIRST**: Explore broadly before narrowing — surface options, patterns, and risks
- **WEB + CODEBASE**: Research both external prior art and internal patterns
- **DEVIL'S ADVOCATE**: Always challenge assumptions and surface counterarguments
- **STRUCTURED OUTPUT**: Produce a research doc that /skill:plan-create can consume
- **TEACH**: Explain what you found and why it matters — don't just dump links
- **NO DECISIONS**: Surface tradeoffs, don't make choices — that's /skill:plan-create's job

## Process

### 1. Parse Input

```bash
DATE=$(date +%Y-%m-%d)
```

**Auto-detect source from arguments:**
- Contains `github.com` or `gh#` or `#NNN` → `gh issue view <number>`
- Otherwise → use as plain text feature description

Summarize the problem space in 2-3 sentences. Identify what needs researching.

### 2. Choose Research Approach

Analyze the feature and propose how to organize the research. Ask the user to confirm:

- **By problem concern** (e.g. Security, User experience, Integration, Performance)
- **By implementation domain** (e.g. Frontend UI, API layer, Database, Auth middleware)
- **By perspective** (e.g. Codebase patterns, External prior art, Devil's advocate)

### 3. Research

For each research area:

**Codebase exploration** — explore internal patterns, conventions, existing implementations relevant to the feature.

**Web research** — search for prior art, OSS implementations, blog posts, library docs, and known pitfalls. Cite sources with URLs.

**Devil's advocate** (always) — challenge the premise, identify what could go wrong, find examples of projects that struggled with similar things, surface hidden complexity and maintenance burden.

### 4. Synthesize Findings

Present findings as narrative organized by theme. Highlight:
- Consensus (strong signals)
- Contradictions (areas needing decisions)
- Surprises or non-obvious findings
- Devil's advocate concerns that seem most legitimate

Write research doc to `thoughts/ryan/research/YYYY-MM-DD-[slug].md`:

```markdown
---
source: {repo basename}
date: YYYY-MM-DD
type: research
---

# [Feature Name] — Research

**Date**: YYYY-MM-DD
**Problem**: [1-2 sentence problem statement]
**External**: [Link if applicable]

## Key Findings

[3-5 bullet points — the most important things learned]

## Codebase Patterns

[Relevant existing patterns, conventions, and code.
Include file paths and brief explanations.]

## Prior Art

[How other projects/libraries solve this. Include links.
Note what worked, what didn't, and why.]

## Approaches Identified

### [Approach name]
- **How**: [Brief description]
- **Pros**: [What's good about it]
- **Cons**: [What's risky or costly]
- **Evidence**: [What supports this]

## Risks & Concerns

- [Risk]: [Why it matters] — [Evidence or reasoning]

## Open Questions

[Things that still need answers before planning.]

## Sources

- [URL or file path] — [What it contributed]
```

### 5. Handoff

Sync and prompt next steps:

```bash
humanlayer thoughts sync
```

```
Research saved to thoughts/ryan/research/YYYY-MM-DD-[slug].md

Next steps:
- /skill:plan-create — distill research into an implementation plan
- /skill:plan-task — if this turned out to be simpler than expected
```
