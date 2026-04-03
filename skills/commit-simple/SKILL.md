---
name: commit-simple
description: Full git workflow handling branch creation, commits, and PRs. Use when committing changes, creating branches, or pushing code.
---

# Commit

Unified git workflow handling branch creation, commits, and PRs.

## Process

1. **Gather context**
   - Parse arguments for description or hints
   - Check branch name for context

2. **Branch check**
   - `git branch --show-current`
   - If on main/master:
     - Propose branch name following the git workflow standards in AGENTS.md
     - Confirm branch creation with user
     - If confirmed: `git checkout main && git pull && git switch -c {name}`
   - If on feature branch: continue

3. **Changes check**
   - `git status`, `git diff --staged` (or `git diff` if nothing staged)
   - `git log -5 --oneline` to match existing commit style
   - If has changes:
     - Analyze the diff and write a commit message following AGENTS.md conventions
     - If >10 files or distinct concerns, split into multiple commits
     - Show the full commit message (subject + body) and ask user to confirm or edit
   - If no changes:
     - Check for unpushed commits: `git log origin/HEAD..HEAD`
     - If unpushed: skip to step 4
     - If nothing: ask user for context, stop

4. **Push check**
   - `git log origin/HEAD..HEAD 2>/dev/null || git log HEAD~5..HEAD`
   - If unpushed commits exist:
     - Confirm push with user
     - If confirmed: `git push -u origin HEAD`

5. **PR check**
   - `gh pr view HEAD 2>/dev/null`
   - If no PR exists:
     - Analyze commits with `git log origin/main..HEAD` and `git diff origin/main..HEAD --stat`
     - Write PR title and description following AGENTS.md conventions
     - Show the full PR title and body, ask user to confirm or edit
     - If confirmed: execute `gh pr create --draft`
   - If PR exists: show URL, offer to update/push
