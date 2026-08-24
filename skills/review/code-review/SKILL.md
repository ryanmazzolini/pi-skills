---
name: "code-review"
description: "Review code changes for defects they introduce and propose clear inline comments. Use for pull requests, commits, patches, or local diffs; combine with repository- and language-specific guidance."
---

# Code Review

Review the selected change for defects it introduces. A caller or companion skill may provide repository access, isolation, saved reports, or a required output format.

## Review target

Identify the change's intent, base, head, and changed files. Review the exact requested commit or diff. If it changes during the review, refresh it before drawing conclusions.

Read the diff, then inspect enough surrounding code, tests, repository instructions, and history to understand the affected behavior. Load applicable language, framework, security, or interface-review skills when they add relevant criteria.

Account for every changed file and any behavior that crosses file boundaries.

Reviews are read-only by default. Do not change the reviewed code or publish comments unless the user explicitly asks and the active workflow permits it.

## Review setup

Temporary review infrastructure is allowed when it helps inspect or validate the change without modifying it. Prefer OS temporary directories. Track every clone, worktree, ref, dependency install, process, and generated artifact you create.

Remove only resources created for this review. Do not remove caller-provided or pre-existing resources.

Before returning the review result, stop processes and remove every clone, worktree, ref, dependency install, and generated artifact created for the review. Keep a resource while waiting for publication approval only when the publication step still needs it. Remove it after publishing or when publication is declined. If cleanup fails, report the exact resource left behind and the failure.

## Inspect the behavior

Trace changed state and side effects beyond the edited lines.

- For each temporary flag or bypass, find where the previous state is restored. Inspect every operation that can run before restoration. If the code never restores it, inspect later operations on the same instance and report any unintended wider behavior that meets the requirements below.
- For each lock, resource, or subscription, verify that every exit path releases it.

## What to report

Prioritize correctness, data loss, security, broken control flow, races, contract changes, failure handling, rollout risk, and repository rules whose violation would have a meaningful consequence.

Report a finding only when all of these are clear:

- The changed code causes it or makes it worse.
- A concrete input or runtime path triggers it.
- The consequence matters to a caller, user, operator, or maintainer.
- The author can take a specific next step within the change's scope.

Confirm suspected findings against the implementation and existing tests. When available, use a test, CI for the reviewed revision, or a focused reproduction.

Put deterministic check failures under validation instead of repeating them as findings. Report the underlying defect only when it independently meets the requirements above.

Do not report unsupported risks, generic requests for tests or documentation, low-value style preferences, or problems the change neither introduces nor makes worse.

A finding is **Blocking** only when there is a concrete reason the change should not proceed.

## Write the comment

Write each finding as a proposed inline comment on the smallest changed line or range that establishes the defect. Use the old side for deleted lines when the host supports it. Do not anchor comments to unchanged surrounding code. Order multiple comments by impact.

Apply [`clear-writing`](../../ai-authoring/clear-writing/SKILL.md) when drafting each comment. Preserve the technical meaning and review requirements while making it ready to publish.

Each comment should:

1. Lead with a direct statement of the problem.
2. Explain what the code does, when it happens, and the concrete consequence.
3. Offer the smallest useful change as a suggestion. Suggest a test when it proves the corrected behavior or prevents a likely regression.

State the defect and consequence directly. Phrase the remediation as an option rather than a command. Use forms such as “X could…”, “One option is…”, or “This could be avoided by…”. Do not use imperative remediation such as “Render…”, “Include…”, or “Add…”.

Prefer this remediation sentence:

> A loading or unavailable state could ensure availability is shown only after a successful response.

Avoid this remediation sentence:

> Render a loading or unavailable state and only show availability after a successful response.

Match each claim to the available evidence:

- State verified behavior as fact.
- State an unverified premise conditionally and name it, such as “If `null` means occupancy is unknown, …”.
- When missing context affects the scope or remediation, say what needs confirming and why it matters.
- Do not weaken a verified defect with “might”, “maybe”, or “could”. Reserve those words for genuine uncertainty or suggested remediation.

Before stating that something is uncertain, try to resolve it from the available implementation, types, tests, configuration, documentation, and history. Only leave it uncertain when those sources do not establish the answer. Residual uncertainty may qualify a finding's scope or remediation, but it cannot substitute for evidence that the defect exists. If an unresolved premise determines whether there is a defect at all, do not report it as a finding. Do not classify a finding as **Blocking** while it depends on an unresolved material assumption.

For example, when the defect is verified but the intended remediation is not:

> This returns `success: true` after a reservation fails, so callers treat a partial reservation as complete. The repository does not establish whether partial failures should roll back or return item-level errors. Either approach could preserve the response contract; confirming the intended recovery behavior would determine which one fits.

Keep one idea in each comment. Use code identifiers when they make the explanation more precise. Each comment must stand on its own without a top-level summary.

When prose cannot make the triggering path clear, add a small state or sequence trace and follow it with a text explanation.

Before returning the review, check each comment for unresolved evidence. If missing evidence affects the finding's scope or remediation, the comment must name the missing contract or fact and explain which decision it affects. Listing alternatives alone is not enough.

Then scan every proposed change or test. Rewrite commands, including sentences using “must”, “should”, or “need to”, as suggestions.

## Return the result

When findings exist, return only the proposed inline comments. Classify every finding as **Blocking** or **Non-blocking** using the requirement above. If the caller or host requires another severity scheme, map it separately without replacing this classification.

Put the classification at the top of the publishable comment body. Keep the file and line outside it as presentation metadata:

```markdown
`path/to/file:line`

> **Blocking**
>
> Exact comment body
```

Include the smallest useful changed line range and diff side when needed. Apply AI attribution to the draft by default unless overridden explicitly by the user or policy in context. Keep the classification and any attribution inside the quoted comment body. The draft should match what would be published.

Do not add a top-level review body, summary, or verdict. Do not approve the change or request changes.

When no finding meets the requirements above, say that no inline comments are proposed. Do not create a top-level comment as a fallback.

When another skill supplies an output schema, follow its structure while preserving this skill's finding requirements, classification, inline-only delivery, and prose.

## Publish comments

Before publishing:

1. Show the exact destination and body unless the user already approved that text.
2. If the host cannot attach a finding to a relevant changed line, stop and explain that it cannot be published inline. Do not move it to unchanged code or a top-level comment.
3. If the host requires a review event to carry inline comments, use its neutral comment mode with an empty top-level body. Never approve or request changes.
4. Read each published comment back and verify its target, content, and formatting.
