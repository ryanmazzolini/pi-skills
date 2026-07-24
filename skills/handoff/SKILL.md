---
name: "handoff"
description: Write a Markdown handoff so another agent or fresh session can continue the work. Use when passing context across sessions.
argument-hint: "What will the next session focus on?"
license: "MIT; adapted from mattpocock/skills"
---

# Handoff

Write a focused handoff document so another agent or fresh session can continue without inheriting this whole conversation.

## Rules

- When the conversation already has a canonical vault-native Ship work item, resolve the handoff and `index.md` targets through Ship's workflow-profile helper before writing them. Save the handoff there and set `Current` to its canonical relative path. Do not create a repository copy.
- Otherwise ask the user to confirm a durable destination under the selected vault's project area. Follow that vault's `AGENTS.md` and `CONTEXT.md`; use the OS temp directory when the user wants a throwaway handoff or no durable destination is appropriate. Do not create a repository `.plans/` directory.
- If the user passed arguments, treat them as the next session's purpose and tailor the document to that focus.
- Reference existing artifacts instead of duplicating them: PRPs, durable plans, boards, thoughts, ADRs, issues, commits, diffs, screenshots, logs, or prototypes.
- Include a `Suggested skills` section with relevant skills the next agent should invoke. Prefer installed repo skills such as `ship`, `research`, `align`, `simplify-codebase-architecture`, `frontend-react`, or `typescript` only when they actually fit.
- Redact sensitive information. Do not copy API keys, tokens, passwords, private keys, auth headers, cookies, session values, MFA codes, `.env` values, personal data, or raw logs/config dumps that may contain secrets.
- Preserve safe continuation context when redacting: service names, variable names, file paths, and where the next agent should retrieve credentials through normal project mechanisms.
- If a secret may already have been exposed in chat or logs, say it was redacted and recommend rotation; do not repeat the value.

## Filename

```text
<ship-work-item>/working/YYYY-MM-DD-handoff-<short-subject>.md
<confirmed-vault-project-path>/YYYY-MM-DD-handoff-<short-subject>.md
<os-temp>/YYYY-MM-DD-handoff-<short-subject>.md  # throwaway handoff
```

Derive `<short-subject>` from the handoff focus: lowercase, kebab-case, usually 2-5 words, e.g. `2026-07-07-handoff-auth-refactor.md`. If the filename exists, add a small suffix like `-2`.

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
