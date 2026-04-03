---
name: commit-pr
description: Create well-structured pull request with proper title, summary, and changes. Use when creating or updating PRs.
---

# Create PR

## Process

1. **Analyze Branch**:
   - `git log origin/main..HEAD --oneline` to see commits
   - `git diff origin/main..HEAD --stat` to see changed files
   - Extract issue reference from branch name or arguments

2. **Draft PR**:
   - Analyze commits and changes to identify main theme
   - Write PR title and description following AGENTS.md conventions
   - Include issue link if found

3. **Present Proposal to User**:
   - Show the full PR title and body for review
   - Ask: "Create draft PR?" or "Edit first?"

4. **Execute if Confirmed**:
   - Push branch if needed
   - Create draft PR
   - Show PR URL after creation

5. **Post-Creation Actions**:
   - Offer to mark ready or add labels
   - Execute requested actions

## Notes

- Always create PRs as draft first, then offer to mark ready
- Follow AGENTS.md conventions for title and body format
