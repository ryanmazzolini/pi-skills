---
name: "diffity-tree"
description: Open the Diffity file tree browser to browse and comment on any file. Use when browsing a repo visually.
disable-model-invocation: true
---

# Tree

Open a full file-tree browser for the current repo — no diff required.

1. Run `which diffity`.
   - If missing, stop and tell the user to install it with `npm install -g diffity`.
2. Run `diffity tree` in the background.
3. Wait briefly, then run:
   - `git rev-parse --show-toplevel`
   - `diffity list --json`
4. Match the running session for the current repo and report the local URL.
5. Keep the reply short:
   - say the tree browser is ready
   - suggest leaving comments in the browser and then running `/skill:diffity-resolve-tree`
