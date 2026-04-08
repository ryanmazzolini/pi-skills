---
name: diffity-resolve
description: Resolve open Diffity threads by making the requested code changes. Use after reviewing or commenting in Diffity.
disable-model-invocation: true
---

# Resolve

Resolve open Diffity feedback with the smallest correct change.

1. Run `which diffity`.
   - If missing, stop and tell the user to install it with `npm install -g diffity`.
2. Load open threads with `diffity agent list --status open --json`.
   - If the user provided a thread id, narrow to that thread.
   - If there are no actionable threads, tell the user there is nothing to resolve.
3. Skip general comments (`filePath == "__general__"`).
4. For each actionable thread:
   - read the latest comment and the surrounding file context
   - make the smallest correct change
   - if the request is unclear, ask for clarification with `diffity agent reply <id> --body "..."` instead of guessing
   - when the change is done, resolve it with `diffity agent resolve <id> --summary "Fixed: ..."`
5. If the thread is really a question instead of a change request, answer it with a reply or resolve summary.
6. After processing threads, run `diffity agent list --json` to confirm state.
7. Reply briefly and tell the user to check Diffity in the browser.
