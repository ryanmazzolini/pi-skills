---
name: diffity-diff
description: Open Diffity for the current repo so you can inspect changes in the browser. Use when viewing diffs visually.
disable-model-invocation: true
---

# Diff

Use Diffity as a browser-first diff surface.

1. Run `which diffity`.
   - If missing, stop and tell the user to install it with `npm install -g diffity`.
2. Start Diffity for the requested ref.
   - If no arguments were provided, run `diffity`.
   - Otherwise run `diffity <ref>` with the user's arguments.
   - Run in the background.
3. Wait briefly, then run:
   - `git rev-parse --show-toplevel`
   - `diffity list --json`
4. Match the running Diffity session for the current repo and report only the local URL.
5. Keep the reply short:
   - say the diff is ready
   - suggest leaving comments in the browser and then running `/skill:diffity-resolve`
   - suggest `/skill:diffity-review` for an AI review
