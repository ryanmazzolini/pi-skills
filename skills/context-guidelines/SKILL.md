---
name: context-guidelines
description: Context engineering principles for AI configuration. Use when editing AGENTS.md, skills, agent prompts, or discussing AI configuration.
---

# Context Engineering Principles

## Core Rules

- Concrete examples beat abstract rules — 2-3 canonical patterns > 15 edge cases
- Describe "what" and "why", not step-by-step "how"
- Start minimal, add guidance reactively after observed failures
- Prefer pointers to copies — reference files, don't duplicate content
- Positive directives over negative framing ("Omit X" not "NEVER X")

## Structure

- Markdown headers for human scanning, max 2 nesting levels
- Specific thresholds over vague guidance (">50 LOC" not "too long")
- Persistent knowledge (principles, architecture decisions) in files; ephemeral (debug traces, task details) in session only

## Instruction Budget

- LLMs reliably follow ~150-200 instructions; system prompts use ~50
- Always-injected context (AGENTS.md) costs every session — keep minimal
- On-demand context (skills) only costs when invoked — can be longer
- Irrelevant context degrades ALL instruction following, not just nearby

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Using LLMs as linters | Deterministic tools (hooks, formatters) |
| Generic knowledge the model has | Only encode opinionated preferences |
| Code examples in rules | Go stale, waste tokens |
| Exhaustive checklists | 2-3 examples instead |
| Auto-generated AGENTS.md | Hand-craft the highest-leverage file |

## References

- [Anthropic: Effective Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [HumanLayer: Writing a Good CLAUDE.md](https://www.humanlayer.dev/blog/writing-a-good-claude-md)
- [Evaluating AGENTS.md (arxiv 2602.11988)](https://arxiv.org/abs/2602.11988)
