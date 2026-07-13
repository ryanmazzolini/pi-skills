---
name: "handoff"
description: Compact the current conversation into a markdown handoff document another agent or fresh session can continue from. Use when passing context across sessions.
argument-hint: "What will the next session focus on?"
license: "MIT; adapted from mattpocock/skills"
---

# Handoff

Write a focused handoff document so another agent or fresh session can continue without inheriting this whole conversation.

## Rules

- Save the handoff to `.plans/` by default, creating the directory if missing. Use the OS temp directory only when the user wants a throwaway handoff or there is no repo.
- If the user passed arguments, treat them as the next session's purpose and tailor the document to that focus.
- Reference existing artifacts instead of duplicating them: PRPs, durable plans, boards, thoughts, ADRs, issues, commits, diffs, screenshots, logs, or prototypes.
- Include a `Suggested skills` section with relevant skills the next agent should invoke. Prefer installed repo skills such as `ship`, `research`, `align`, `simplify-codebase-architecture`, `frontend-react`, or `typescript` only when they actually fit.
- Redact sensitive information. Do not copy API keys, tokens, passwords, private keys, auth headers, cookies, session values, MFA codes, `.env` values, personal data, or raw logs/config dumps that may contain secrets.
- Preserve safe continuation context when redacting: service names, variable names, file paths, and where the next agent should retrieve credentials through normal project mechanisms.
- If a secret may already have been exposed in chat or logs, say it was redacted and recommend rotation; do not repeat the value.

## Filename

```text
.plans/YYYY-MM-DD-handoff-<short-subject>.md
```

Derive `<short-subject>` from the handoff focus: lowercase, kebab-case, usually 2-5 words, e.g. `.plans/2026-07-07-handoff-auth-refactor.md`. If the filename exists, add a small suffix like `-2`.

## Document shape

```md
# Handoff: [short subject]

## Next-session purpose

[What the next agent/session should accomplish.]

## Current state

[Concise status: what was decided, what changed, what remains.]

## Artifact pointers

- [Path or URL] — [why it matters]

## Suggested skills

- `/skill:name` — [why]

## Open questions / risks

- [Question, risk, or "None known"]

## Next steps

1. [First concrete action]
2. [Second concrete action]

## Verification expectations

[How the next session should prove completion.]

## Redactions

[State whether anything was redacted, without exposing the value.]
```

After writing the file, report the absolute path and a one-sentence summary of what the handoff is for.
