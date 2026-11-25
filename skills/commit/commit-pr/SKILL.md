---
name: "commit-pr"
description: Create or update a draft pull request from the current branch. Use when opening or updating a PR.
---

# Pull Request

## Workflow

1. Identify the branch this work should merge into. Inspect the commits, `git diff <base>...HEAD --stat`, the full branch diff, and any existing PR. Do not treat the stat as a substitute for the full diff. Resolve unexpected commits or files. Treat an existing title, body, and test results as potentially stale.
2. Confirm that the branch fits the [scope rules](#scope). Stop if it contains work that should be split or deferred.
3. Run focused checks while diagnosing problems, then run the repository's expected regression checks. If a check is blocked or impractical, say what did not run and why, then ask how to handle the gap. This decision does not replace review or PR approval.
4. For a change someone can see or call, such as a screen, a rendered document, an API, or a command, gather [captures](#captures) or a [worked example](#worked-examples) from the branch running. Reuse what you made while validating the change. If there is none and you cannot run the change, say so and ask how to handle the gap.
5. Confirm that the final code-bearing branch diff has independent review under [the review gate](../../ship/ship/references/review-gate.md). Record changes made after review. Re-review when the gate requires it.
6. Understand why the change exists. If the diff and commits do not explain it, read the related issue or work item. Identify what happened before, why it was a problem, and what happens now.
7. Draft the title and body using the guidance below. Follow the writing guidance in the active project and user instructions.
8. Show the full title and body, any capture files, base branch, review evidence, and validation status. End the response by asking for confirmation or edits; do not stop after presenting the draft or status.
9. After explicit approval, push if needed and create or update the PR, attaching the captures. Create new PRs as drafts. When `monitor_github_pr` is available, call it with the canonical URL after creating a PR; after updating an existing PR, also pass `notifyExistingFeedback: false` so historical feedback does not trigger another turn. Then show the PR URL and offer next steps.

## Scope

Each PR should have one purpose: deliver a useful result or safely prepare for one immediate next change. When a PR is preparation, explain in the body what it delivers, how that supports the next change, and what remains undelivered.

Stop and propose splitting or deferring work when the branch also contains another useful result, unrelated cleanup or optimization, generalization for a possible future need, or unrelated formatting. Keep extra work only when this PR or the repository checks require it for safety, compatibility, or formatting enforced by project tools.

Wait for confirmation before removing work or rewriting history.

## Title

Name the concrete change or problem solved at the level this PR delivers. An API capability or refactor is a valid result; the title need not promise a downstream user benefit. Prefer a specific change over a vague phrase about preparing for future work. Use sentence case and a direct action verb. Keep the claim within this PR's scope; explain its broader purpose and any follow-up work in the body.

Treat existing PR, ticket, branch, and commit wording as context, not an approved title. The title should tell a teammate what changes or what problem is solved without the original discussion. Keep useful project terms, but avoid stacked nouns. Repository conventions may add metadata such as a ticket ID.

## Body

Write for a capable engineer who has not read the ticket or followed the work, and who reads the diff next. Tell them what the diff cannot: what was wrong, what happens now, and what to watch for when reviewing or deploying.

Leave out what they get elsewhere. The diff shows how the code works, the ticket link carries the history, and the PR's checks show what passes. Before keeping a sentence, ask whether the reviewer would miss it while reading the diff. If not, cut it.

Order the body as the lead, then `## Review notes`, `## Evidence`, and a collapsed appendix. Only the lead is required. Add each other part when it has content and leave it out otherwise.

Keep the prose outside the appendix under about 200 words. Examples, captures, and diagrams do not count toward it. A small change gets a body of one or two sentences. When a draft runs longer, cut the detail about how the code works first. Keep review and agent process out of the body.

When the repository has a pull request template, such as `.github/pull_request_template.md`, keep its headings, checklists, and required answers instead of the order above. Apply the rest of this guidance inside them: the lead goes in its summary section and evidence in its testing section.

### Lead

Open with no heading. Start with the problem instead of background: what went wrong or was missing, and for whom, in one or two sentences. Then say what happens now, in one or two sentences. Give background only as a clause the problem sentence needs.

When those sentences do not make the behavior obvious, follow them with one concrete example. Explain a project term the first time you use it.

When the change has no problem to state, such as a refactor or a dependency update, say what changed in a sentence or two.

Say what is unchanged only where a reviewer would otherwise expect a change. For a preparatory PR, say what this PR delivers and what waits for the next change. End the lead with the ticket link.

### Review notes

Add `## Review notes` for facts that change how someone reviews, deploys, or relies on the change, and that the diff does not make obvious:

- a risk or trade-off the reviewer should weigh
- a known limit, or behavior left for a follow-up
- a migration or rollout order
- a failure, rollback, or retry path that correctness depends on, with enough steps to show how the change produces the result

Most PRs need between zero and three notes. Give each one or two sentences that say what the reviewer should know or check. Put supporting mechanics, such as the steps of a migration, in the appendix or leave them to the diff. Leave out decision history, rejected alternatives, and file-by-file summaries.

### Evidence

Add `## Evidence` to show the change working in ways the PR's checks do not:

- [captures](#captures) of a change someone can see
- a [worked example](#worked-examples) of a change someone can call
- a check on a deployed environment, with what you did and what you saw
- a measurement, such as a query count or a timing before and after
- the result of a check CI does not run
- what was not tested, when a reviewer would assume it was

Leave out checks that CI runs on the pull request, such as unit tests, lint, type checks, and the build. You still run them in step 3 and report them to the user in step 8. Mention one only when it is expected to fail or be skipped, and say why. Read the repository's CI configuration when you are unsure what it runs.

### Captures

A visible change needs a screenshot of each state it changes. When the change is a flow across several steps, record a short video of the flow as well, or instead. Capture the branch running, using the browser or device tools the session provides. Add a capture from the base branch when the reviewer needs the old state to see the difference. Save captures outside the repository so they are not committed.

Lay screenshots out in a table with one row per state. Add a `Before` column only when you have base-branch captures. Put a video on a line of its own, outside the table: GitHub shows a player only when the video is alone in its paragraph, and a plain link otherwise.

Upload captures with `--attach '<path>#<alt text>'` on `gh pr create`, `gh pr edit`, or `gh pr comment`, one flag per file, run from inside the repository. Reference each file in the body with the exact path string passed to the flag, such as `![Nothing left to move](./empty.png)`, and gh rewrites it to the uploaded URL in place. An unreferenced file is appended to the end of the body. Alt text should name the state shown; gh ignores it for video. See [Attaching files with GitHub CLI](https://docs.github.com/en/github-cli/github-cli/attaching-files-with-github-cli) for file types and size limits.

### Worked examples

A change to an API, a command, or a query needs one real example: the call and what came back. Copy both from a run on the branch and say where it ran. Do not write the output by hand; if you cannot run it, say so instead.

Pick the case the PR exists for. Show the old result beside the new one when the difference is the point. Trim fields that do not matter to the change, and collapse an example longer than about 30 lines in its own `<details>` block.

### Diagrams and tables

GitHub renders a fenced `mermaid` block in a PR body. Add a diagram when the change has a shape that prose would leave the reviewer to assemble:

- a flow with branches or more than three steps, or components and how they connect: a flowchart
- state that changes over time, or messages between parts: a state or sequence diagram

State the point in a sentence before the diagram. Skip the diagram when a sentence or a short list already says it.

Use a table only to compare the same attributes across several items, such as measurements or screenshots of each state. Write everything else as prose or a short list. A PR body does not run HTML charts or mockups; attach a screenshot of one instead.

### Appendix

Put reference material that a reviewer may look up, but does not need in order to review, in one collapsed block at the end: the steps of a migration, a rollout sequence, or a longer example. Use `<details><summary>…</summary>`, name the summary after its contents, and leave a blank line after the summary line so GitHub renders the Markdown inside.

Do not move text into the appendix to shorten the body. If no reviewer would look it up, cut it.

## Links

Link only to pages the reviewer can open, such as a ticket, PR, commit, GitHub file, or shared design document. When an issue is available from the branch name or user context, use its ID as the link text, for example `[sc-123](...)`.

Do not link to local paths, editor links, or vault notes. Summarize any context that exists only locally.

## Final check

Before presenting the draft:

- Make sure every changed commit and file supports the PR's one purpose.
- Check that the title names the concrete change or problem solved, and that neither the title nor the body claims benefits deferred to later work.
- Read the lead alone. A teammate new to the work should be able to say what was wrong and what happens now.
- Cut every sentence the reviewer would not miss while reading the diff, and every optional part that has nothing to say. Count the words of prose outside the appendix and cut again when there are more than about 200.
- Check that the body lists no passing CI checks and no review or agent process.
- Check that a visible change has its captures referenced in the body, and that a callable change has a worked example copied from a real run.
