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
3. Offer the smallest useful change as a suggestion. State what the change could achieve instead of telling the author what to do. Suggest a test when it proves the corrected behavior or prevents a likely regression.

Keep one idea in each comment. Use code identifiers when they make the explanation more precise. Each comment must stand on its own without a top-level summary.

When prose cannot make the triggering path clear, add a small state or sequence trace and follow it with a text explanation.

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
