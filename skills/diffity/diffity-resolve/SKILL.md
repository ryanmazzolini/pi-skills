---
name: diffity-resolve
description:
  Resolve open Diffity threads by making the requested code changes. Use after reviewing or
  commenting in Diffity.
disable-model-invocation: true
---

# Resolve

Resolve open Diffity feedback with the smallest correct change. Assume diffity is installed
globally. If missing, stop and guide the user to install it with `npm install -g diffity`.

1. Load open threads with `diffity agent list --status open --json`.
   - If the user provided a thread id, narrow to that thread.
   - If there are no actionable threads, tell the user there is nothing to resolve.
2. Skip resolved general comments (`filePath == "__general__"`).
3. For each actionable thread:
   - read the latest comment and the surrounding file context
   - determine the smallest correct change and propose this to the user
   - if the request is unclear, ask for clarification with `diffity agent reply <id> --body "..."`
   - when the change is done, resolve it with `diffity agent resolve <id> --summary "Fixed: ..."`
4. If the thread is really a question instead of a change request, answer it with a reply or resolve
   summary.
5. After processing threads, run `diffity agent list --json` to confirm state.
6. Reply with a brief summary and ask the user for next steps with proposals.
