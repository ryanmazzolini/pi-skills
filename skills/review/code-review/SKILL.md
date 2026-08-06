---
name: "code-review"
description: "Review code changes for concrete introduced defects and write actionable findings in plain language. Use for pull requests, commits, patches, or local diffs; combine with repository- and language-specific guidance."
---

# Code Review

Review the selected change for concrete defects it introduces. This skill owns the review standard and finding prose. A caller or companion skill may own repository access, isolation, saved reports, or a machine-readable output schema.

## Establish the target

Identify the change's intent, base, head, and changed files. Read the diff, then inspect enough surrounding code, tests, repository instructions, and history to understand the affected behavior. Load applicable language, framework, security, or interface-review skills when they add relevant criteria.

Use the exact requested revision. If the target moves during review, refresh it before drawing conclusions. Account for every changed file, including interactions that cross file boundaries.

Trace changed state and side effects beyond the immediate edit. For each temporary flag or bypass, find where the prior state is restored and inspect every operation that can run before it. If no restoration exists, inspect later operations on the same instance and report any unintended wider behavior. Prove that locks, resources, and subscriptions are released on every exit path.

Reviews are report-only by default. Do not change the reviewed code or publish comments unless the user explicitly asks and the active workflow permits it.

## Decide what is worth reporting

Prioritize correctness, data loss, security, broken control flow, races, contract changes, failure handling, rollout risk, and material violations of repository instructions.

Report a finding only when all of these are clear:

- The changed code causes it.
- A concrete input or runtime path triggers it.
- The consequence matters to a caller, user, operator, or maintainer.
- The author can take a specific next step within the change's scope.

Confirm suspected findings against the implementation and existing tests. When available, use a test, CI for the reviewed revision, or a focused reproduction.

Put deterministic check failures under validation instead of repeating them as findings. Report the underlying defect only when it independently meets the finding bar.

Omit problems the change neither introduces nor makes worse, unsupported risks, generic requests for tests or documentation, and low-value style preferences.

Use a severity taxonomy only when the caller or host expects one. Reserve a blocker for a concrete reason the change should not proceed in its current form. Keep any severity label separate from the plain-language title.

## Write for the code author

Write every finding as a proposed inline comment on the smallest changed line or range in the reviewed diff that establishes the defect. Use the old side for deleted lines when the host supports it. Do not anchor a comment to unchanged surrounding code. Order multiple comments by impact.

Each comment should:

1. Lead with a direct statement of the problem.
2. Explain what the code does, when that behavior occurs, and its concrete consequence.
3. Ask for the smallest useful change. Request a test when it proves the corrected behavior or prevents a likely regression.

Keep one idea in each comment. Use concrete subjects and direct verbs. Use code identifiers only when they make the explanation more precise, and explain necessary technical terms once. The comment must stand on its own without a top-level summary.

Prefer:

> This enables the bypass and leaves it enabled, so later updates on the same object can skip the read-only guard. Limit the bypass to this write and add a test that confirms the guard is restored afterward.

Avoid abstract shorthand such as “the bypass outlives the intended write” when a direct description says the same thing.

## Return the result

When findings exist, return only the proposed inline comments. For each comment, provide its file, smallest useful changed line range, and diff side when needed as routing metadata, followed by the exact comment body. Do not add a top-level review body, summary, or verdict. Do not approve the change or request changes.

When no finding meets the reporting bar, say that no inline comments are proposed. Do not create a top-level comment as a fallback.

When another skill supplies an output schema, follow its structure and metadata contract while keeping this skill's finding threshold, inline-only delivery, and prose.

Before publishing an inline comment, show its exact destination and body unless the user already approved that exact text. Follow the active attribution policy. If the host cannot attach a finding to a relevant changed line, stop and tell the requester that the finding cannot be published inline; do not move it to unchanged code or a top-level comment. If the host requires a review event to carry inline comments, use its neutral comment mode with an empty top-level body; never approve or request changes. After publication, read each comment back and verify its target, content, and formatting.
