---
name: "commit-pr"
description: Create or update a draft pull request from the current branch. Use when opening or updating a PR.
---

# Pull Request

## Workflow

1. Identify the expected base. Inspect the commits, `git diff <base>...HEAD --stat`, the full branch diff, and any existing PR. Name the one delivered outcome or justified enabler. An enabler must name its immediate consumer and protected risk. If the diff also contains a separable outcome, cleanup, optimization, generalization, speculative machinery, or opportunistic formatting, stop and propose deferring or splitting it unless the current outcome or repository checks require it for safety, compatibility, or mechanical formatting. Wait for confirmation before removing work or rewriting history. Resolve unexpected commits or files. Treat an existing title, body, and test results as potentially stale.
2. Run focused checks while diagnosing problems, then run the repository's expected regression checks for final validation. If an expected check is blocked or impractical, say exactly what did not run and why, then ask how to handle the gap. That decision does not replace review or PR approval.
3. Confirm the final code-bearing branch diff has independent review under [the review gate](../../ship/ship/references/review-gate.md). Record any post-review changes and re-review only when the gate classifies them as material.
4. Before drafting, make sure a teammate can understand why the change exists. If the diff and commits do not explain it, read the related issue or work item. Identify what happened before, why it was a problem, and what this change does now. Keep only the context needed to review the change.
5. Draft a clear title and a self-contained body from the current change and its relevant context. Use `Description`, `Details`, and `Testing`. When an issue is available from the branch name or user context, use its ID as the Markdown link text, for example `[sc-123](...)`.
6. Show the full title and body, base branch, review evidence, and validation status. Ask for confirmation or edits.
7. After explicit approval, push if needed and create or update the PR. Create new PRs as drafts. Show the PR URL and offer next steps.

## PR title

State the concrete resulting change in plain, specific language. Use sentence case and a direct verb. Prefer changed behavior or an outcome over task wording, and unpack dense noun phrases when that makes the title easier to read. Keep precise project terms when they help the reviewer.

The title should make sense without the original discussion. Repository conventions may add metadata such as a ticket ID, but the wording should remain readable on its own. For example, prefer `[sc-64199] Record inventory observations with the extensible schema` over `[sc-64199] Use the extensible inventory observation schema`.

## PR body

Treat the PR body as an interface for a reviewer who has not followed the discussion.

- `Description` — in one or two short paragraphs, explain what happened before, why it was a problem, and what happens after this change. Define project terms as you introduce them.
- `Details` — add only the technical details a reviewer needs to check the change. Use numbered steps when order matters and bullets for separate facts. Explain important behavior and limits; omit long decision histories, exhaustive alternatives, and file-by-file summaries.
- `Testing` — list the checks run on the current branch and what they covered. Say what could not be tested. Include screenshots or video for UI changes.

Keep simple changes short. Link only to pages the reviewer can open, such as a ticket, PR, commit, GitHub file, or shared design document. Do not link to local paths, editor links, or vault notes. If the context exists only locally, summarize it in the PR.

Before presenting, make sure every changed commit and file belongs to the one delivered outcome or justified enabler. A teammate with limited context should be able to explain the problem, the new behavior, what is deliberately deferred, and the details that matter without reading the original discussion.
