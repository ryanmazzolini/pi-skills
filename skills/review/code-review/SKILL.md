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

Use severity labels only when the caller or host expects them. Reserve a blocker for a concrete reason the change should not proceed. Keep the label separate from the plain-language title.

## Write the comment

Write each finding as a proposed inline comment on the smallest changed line or range that establishes the defect. Use the old side for deleted lines when the host supports it. Do not anchor comments to unchanged surrounding code. Order multiple comments by impact.

Each comment should:

1. Lead with a direct statement of the problem.
2. Explain what the code does, when it happens, and the concrete consequence.
3. Suggest the smallest useful change. Suggest a test when it proves the corrected behavior or prevents a likely regression.

Keep one idea in each comment. Use concrete subjects and direct verbs. Use code identifiers when they make the explanation more precise, and explain necessary technical terms once. Each comment must stand on its own without a top-level summary.

Prefer:

> This enables the bypass and leaves it enabled, so later updates on the same object can skip the read-only guard. One option is to limit the bypass to this write and add a test that confirms the guard is restored afterward.

Avoid abstract shorthand such as “the bypass outlives the intended write” when a direct description says the same thing.

When prose cannot make the triggering path clear, add a small state or sequence trace and follow it with a text explanation.

## Return the result

When findings exist, return only the proposed inline comments. For each comment, include the file, smallest useful changed line range, and diff side when needed, followed by the exact comment body. Do not add a top-level review body, summary, or verdict. Do not approve the change or request changes.

When no finding meets the requirements above, say that no inline comments are proposed. Do not create a top-level comment as a fallback.

When another skill supplies an output schema, follow its structure while preserving this skill's finding requirements, inline-only delivery, and prose.

## Publish comments

Before publishing:

1. Show the exact destination and body unless the user already approved that text.
2. Follow the active attribution policy.
3. If the host cannot attach a finding to a relevant changed line, stop and explain that it cannot be published inline. Do not move it to unchanged code or a top-level comment.
4. If the host requires a review event to carry inline comments, use its neutral comment mode with an empty top-level body. Never approve or request changes.
5. Read each published comment back and verify its target, content, and formatting.
