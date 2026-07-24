# Project evidence

Read this for an exact Ship escalation or when confirmed peer inspection needs an explicit workflow pointer. Start with the request itself; workflow metadata is optional routing context.

## Answer from the message first

A useful project escalation names:

- the blocker or factual question
- the evidence already checked
- the exact answer or reconciliation needed
- an optional profile and vault-relative work-item `index.md` pointer when more context may help

Use the message, current peer evidence, and located repository files first. If that evidence is sufficient, answer without discovering profiles or opening workflow files. If essential context is missing, follow an explicit pointer or ask the owning session for the missing evidence instead of searching unrelated vaults.

## Follow an explicit work-item pointer

A profile and path locate vault material; they do not establish project identity or authority. Resolve the workflow-profile helper from the First Mate skill directory only when a vault pointer is needed. Validate each exact file immediately before reading it:

```bash
node "<first-mate-skill-dir>/../ship/ship/scripts/workflow-profile.mjs" path \
  --profile "PROFILE" \
  --target "RELATIVE_PATH" \
  --mode read
```

Read the selected vault's `AGENTS.md` and directed context before the work item. Open the supplied `index.md` first. Follow `Current` only when it is relevant, validating it with the work-item directory as `--within`. Treat a recorded workspace as a locator when repository evidence is needed; confirm that the directory exists and read its repository instructions before using it.

Do not require profile, work-item, and workspace metadata to prove one another. A missing path, unavailable profile, conflicting locator, or ambiguous context limits the answer; it does not trigger broader discovery. State the missing evidence and ask for the smallest correction.

Gather only the read-only evidence needed for the question. Do not edit workflow files or project state, and do not copy raw tails or routine command output into the response.

## Answer the exact escalation

Identify the correlated inbound ask and reply to that exact ask ID. When multiple asks need disambiguation, call `intercom` with only `action: "pending"`; use the displayed exact ID and sender for `reply`.

Return factual evidence, named conditions, or a clear limitation. Send requirements, scope, priority, architecture, production, approval, and other human-owned decisions back to the human rather than deciding or relaying them.

The owning project session verifies the guidance, performs any approved action, and captures a material result. A routed reply confirms transport only; it does not confirm handling or a state change.
