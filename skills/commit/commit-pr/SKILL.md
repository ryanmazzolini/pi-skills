---
name: "commit-pr"
description: Create or update a draft pull request from the current branch. Use when opening or updating a PR.
---

# Pull Request

## Workflow

1. Identify the branch this work should merge into. Inspect the commits, `git diff <base>...HEAD --stat`, the full branch diff, and any existing PR. Do not treat the stat as a substitute for the full diff. Resolve unexpected commits or files. Treat an existing title, body, and test results as potentially stale.
2. Confirm that the branch fits the [scope rules](#scope). Stop if it contains work that should be split or deferred.
3. Run focused checks while diagnosing problems, then run the repository's expected regression checks. If a check is blocked or impractical, say what did not run and why, then ask how to handle the gap. This decision does not replace review or PR approval.
4. Confirm that the final code-bearing branch diff has independent review under [the review gate](../../ship/ship/references/review-gate.md). Record changes made after review. Re-review when the gate requires it.
5. Understand why the change exists. If the diff and commits do not explain it, read the related issue or work item. Identify what happened before, why it was a problem, and what happens now.
6. Draft the title and body using the guidance below. Follow the writing guidance in the active project and user instructions.
7. Show the full title and body, base branch, review evidence, and validation status. End the response by asking for confirmation or edits; do not stop after presenting the draft or status.
8. After explicit approval, push if needed and create or update the PR. Create new PRs as drafts. When `monitor_github_pr` is available, call it with the canonical URL after creating a PR; after updating an existing PR, also pass `notifyExistingFeedback: false` so historical feedback does not trigger another turn. Then show the PR URL and offer next steps.

## Scope

Each PR should have one purpose: deliver a useful result or safely prepare for one immediate next change. When a PR is preparation, name the next change and the specific risk reduced by landing the preparation separately.

Stop and propose splitting or deferring work when the branch also contains another useful result, unrelated cleanup or optimization, generalization for a possible future need, or unrelated formatting. Keep extra work only when this PR or the repository checks require it for safety, compatibility, or formatting enforced by project tools.

Wait for confirmation before removing work or rewriting history.

## Title

Before drafting, privately answer: without this PR, what goes wrong for a user, caller, or operator, or what can they not do? Build the title from that consequence, not by rewording the code summary. Use sentence case and a direct action verb. Add the mechanism only after the purpose, when it helps explain the result. Keep the claim within this PR's scope; for preparation, follow the scope guidance above.

Treat existing PR, ticket, branch, and commit wording as context, not an approved title. The title alone should tell a teammate why the change matters without the original discussion. Keep useful project terms, but avoid stacked nouns. Repository conventions may add metadata such as a ticket ID. For example, prefer `[sc-65850] Prevent putaway lock-order deadlocks` over `[sc-65850] Acquire putaway planning locks once per operation`.

## Body

Write for a capable engineer who has not read the ticket or followed the work. Give them a self-contained explanation of the affected workflow and change, not an investigation report. Establish the context needed to understand the problem, new behavior, important limits, and validation before trimming repetition.

Use `Description`, `Details`, and `Testing` as headings.

### Description

Open with the same practical consequence used to frame the title: the problem experienced or the capability enabled. A problem-first or result-first sentence is fine; a description of internal storage or processing alone is not. The opening should explain why this PR matters without relying on the title or Details. Then explain who uses the affected workflow, what they are trying to do, what happened before, and how the change improves it. Walk through the changed behavior, including consequential interactions and what stays unchanged. Size the explanation to what the reader needs to understand, not a paragraph limit; a list of changed features is not a substitute for that explanation. When the behavior is not immediately obvious, use one representative example to ground the explanation. Explain project terms when you first use them.

### Details

Explain implementation mechanics only after the behavior is clear. Keep each cause-and-effect path together. When correctness depends on a failure, rollback, or retry sequence, name enough steps to show how the change produces the result. Use concrete subjects and direct verbs. Keep connected ideas in prose, use numbered steps when order matters, and use bullets only for genuinely separate facts.

Include only the behavior, limits, and trade-offs needed to review the change. Omit decision history, exhaustive alternatives, and file-by-file summaries.

### Testing

List the checks run on the current branch and their results. Add relevant manual, UI, or deployment verification, and say what could not be tested. Include screenshots or video for UI changes. Keep review and agent process out of this section.

## Links

Link only to pages the reviewer can open, such as a ticket, PR, commit, GitHub file, or shared design document. When an issue is available from the branch name or user context, use its ID as the link text, for example `[sc-123](...)`.

Do not link to local paths, editor links, or vault notes. Summarize any context that exists only locally.

## Final check

Before presenting the draft:

- Make sure every changed commit and file supports the PR's one purpose.
- Remove repeated context, abstract phrasing that hides who or what performs the action, and detail that does not help review.
- Keep simple changes short.
- Read the title and opening sentence separately. Each should explain why the change matters, not just what the code does, without claiming benefits deferred to later work.
- Read the Description without Details or links. Make sure a teammate new to the work can explain the previous workflow, the problem, the changed workflow, and important limits without reconstructing the story from feature bullets. Restore missing context before trimming; keep supporting mechanics in Details.
