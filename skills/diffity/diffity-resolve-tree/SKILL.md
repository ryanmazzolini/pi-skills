---
name: diffity-resolve-tree
description:
  Resolve open comments from the Diffity tree browser by making code changes. Use after commenting
  on files in Diffity tree.
disable-model-invocation: true
---

# Resolve Tree

Resolve comments left in the Diffity tree browser. Same workflow as `/skill:diffity-resolve` but for
tree-mode comments.

1. Run `which diffity`.
   - If missing, stop and tell the user to install it with `npm install -g diffity`.
2. Verify a tree session exists: `diffity agent list`.
   - If it fails with "No active review session", tell the user to start one with
     `/skill:diffity-tree`.
3. Load open threads with `diffity agent list --status open --json`.
   - If the user provided a thread id, narrow to that thread.
   - If there are no actionable threads, say there is nothing to resolve.
4. Skip general comments (`filePath == "__general__"`).
5. For each actionable thread:
   - read the latest comment and the surrounding file context
   - make the smallest correct change
   - if the request is unclear, reply asking for clarification with
     `diffity agent reply <id> --body "..."`
   - when done, resolve with `diffity agent resolve <id> --summary "Fixed: ..."`
6. For question threads, answer with a reply or resolve summary.
7. After processing, run `diffity agent list --json` to confirm state.
8. Reply briefly and tell the user to check the browser.
