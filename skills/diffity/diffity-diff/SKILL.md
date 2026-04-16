---
name: diffity-diff
description:
  Open Diffity for the current repo so you can inspect changes in the browser. Use when viewing
  diffs visually.
disable-model-invocation: false
---

# Diff

Use Diffity as a browser-first diff surface. Assume diffity is installed globally. If missing, stop
and guide the user to install it with `npm install -g diffity`.

1. Start Diffity for the requested ref.
   - If no arguments were provided ask the user if they would like to review the staged
     changes/latest commit or whole feature.branch.
   - Otherwise run `diffity <ref>` with the user's arguments. eg. `diffity HEAD~1` or
     `diffity main..feature` or `diffity work` (uncommitted changes)
   - Run in the background.
2. Wait briefly, then run:
   - `git rev-parse --show-toplevel`
   - `diffity list --json`
3. Match the running Diffity session for the current repo and report only the local URL.
4. Keep the reply short:
   - say the diff is ready
   - suggest leaving comments in the browser and then running `/skill:diffity-resolve`
   - suggest `/skill:diffity-review` for an AI review
