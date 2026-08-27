---
name: "code-review"
description: "Review code changes against their intended issue, recommend a human review action, and draft clear comments for introduced defects. Use for pull requests, stacked pull requests, commits, patches, or local diffs; combine with repository- and language-specific guidance."
---

# Code Review

Review the selected change against its intended outcome and for defects it introduces. A caller or companion skill may provide repository access, isolation, saved reports, or a required output format.

## Review target

Identify each change's intent, base, head, and changed files. Review the exact requested commit or diff. If it changes during the review, refresh it before drawing conclusions.

For a pull request, read its description and retrieve every explicitly linked issue before inspecting the implementation. Record the original problem, its user or operator impact, the requested outcome, acceptance criteria, and stated exclusions. If no issue is linked or an issue is unavailable, name the context used instead and do not infer missing requirements.

For multiple or stacked pull requests, review each against its immediate parent. Keep its evidence, recommendation, and comments in a separate output section. Assign a finding to the pull request that introduced it, and do not repeat inherited findings higher in the stack.

Read the diff, then inspect enough surrounding code, tests, repository instructions, architecture decisions, and history to understand the affected behavior. Load applicable language, framework, security, or interface-review skills when they add relevant criteria.

Account for every changed file and any behavior that crosses file boundaries.

Reviews are read-only by default. Do not change the reviewed code or publish comments unless the user explicitly asks and the active workflow permits it.

## Review setup

Temporary review infrastructure is allowed when it helps inspect or validate the change without modifying it. Prefer OS temporary directories. Track every clone, worktree, ref, dependency install, process, and generated artifact you create.

Remove only resources created for this review. Do not remove caller-provided or pre-existing resources.

Before returning the review result, stop processes and remove every clone, worktree, ref, dependency install, and generated artifact created for the review. Keep a resource while waiting for publication approval only when the publication step still needs it. Remove it after publishing or when publication is declined. If cleanup fails, report the exact resource left behind and the failure.

## Inspect the behavior

Trace the requested outcome and each acceptance criterion into the implementation and tests. Confirm that the change produces the promised behavior rather than merely resembling the requested implementation. Respect explicit partial scope; when a pull request claims to close an issue, report a material unmet outcome as an introduced finding.

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

Treat deterministic check failures as evidence rather than duplicating them as comments. Mention a material failed or unavailable check under **Notable**; report the underlying defect only when it independently meets the requirements above.

Do not report unsupported risks, generic requests for tests or documentation, or low-value style preferences.

A pre-existing problem is not a pull-request finding. Flag one only when it is concrete, material, directly relevant to the reviewed behavior, and likely to receive a specific follow-up. Do not include an adjacent issue merely because the review exposed it. Put a qualifying note after introduced findings under **Existing issue**, say that the pull request did not introduce it, and link to the relevant code at an immutable revision and to its tracking item when available. It does not affect the pull-request recommendation and is not a proposed inline comment on the pull request.

Before classifying findings or recommending an action, assess the risk of merging the reviewed revision. Use **Low**, **Moderate**, or **High** as a concise judgment, not a score. Consider:

- the worst credible consequence and how many users, systems, or records it could affect;
- whether failure is easy to detect, contain, reverse, or repair;
- exposure involving data integrity, security, money, contracts, concurrency, asynchronous ordering, migrations, or compatibility;
- rollout controls, observability, and exact-head validation that reduce the risk; and
- complexity or novelty that makes an undiscovered defect more likely.

Judge the residual risk with those controls in place. High risk does not prevent approval when the evidence and safeguards are sufficient. Low risk does not excuse a material unmet outcome. Do not inflate the rating with unsupported possibilities.

Classify each introduced finding in the current reviewed revision by what it blocks. A small or already-understood correction may justify **Blocks merge**, but it does not remove the finding until the reviewed head contains it.

- **Blocks approval** means the reviewer should see the correction before approving. Use it when the consequence is material in the context of the change, the correction may alter a design or contract, or validation of the correction is necessary for confidence. Higher-risk changes require stronger justification before using **Blocks merge** instead.
- **Blocks merge** means the defect must be addressed, but its consequence is limited and the expected correction is isolated and clear enough not to need another review. The human may approve with the comment open.
- **Non-blocking** means the pull request can merge without addressing the comment. Treat it as an optional improvement or follow-up.

A material confidence gap may block approval even when it is not a proven defect. Use this only when specific missing evidence prevents confidence proportional to the change risk, such as unavailable exact-head validation for a destructive migration. Put it under **Notable**, name the evidence needed, and do not turn it into an inline finding or a generic request for more tests. Do not create a separate confidence gap for evidence already required to resolve a **Blocks approval** finding; name that verification in the finding or recommendation rationale instead.

## Write the comment

Write each introduced finding as a proposed inline comment on the smallest changed line or range that establishes the defect. Use the old side for deleted lines when the host supports it. Do not anchor comments to unchanged surrounding code.

Make the displayed file and line reference a deep link when the review host supports one. Use an immutable blob link pinned to the reviewed head, or to the base for deleted lines. A host-provided diff link is suitable only when it is pinned to the reviewed revision. Fall back to a plain path for local-only reviews rather than inventing a link. Display ranges as `path/to/file:81-86`; keep host-specific anchors such as `#L81-L86` in the URL.

Group comments by action in this order: **Blocks approval**, **Blocks merge**, then **Non-blocking**. Order comments within each group by impact.

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

Before stating that something is uncertain, try to resolve it from the available implementation, types, tests, configuration, documentation, and history. Only leave it uncertain when those sources do not establish the answer. Residual uncertainty may qualify a finding's scope or remediation, but it cannot substitute for evidence that the defect exists. If an unresolved premise determines whether there is a defect at all, do not report it as a finding. Do not classify a finding as **Blocks approval** while it depends on an unresolved material assumption.

For example, when the defect is verified but the intended remediation is not:

> This returns `success: true` after a reservation fails, so callers treat a partial reservation as complete. The repository does not establish whether partial failures should roll back or return item-level errors. Either approach could preserve the response contract; confirming the intended recovery behavior would determine which one fits.

Keep one idea in each comment. Use code identifiers when they make the explanation more precise. Each comment must stand on its own without a top-level summary.

When prose cannot make the triggering path clear, add a small state or sequence trace and follow it with a text explanation.

Before returning the review, check each comment for unresolved evidence. If missing evidence affects the finding's scope or remediation, the comment must name the missing contract or fact and explain which decision it affects. Listing alternatives alone is not enough.

Then scan every proposed change or test. Rewrite commands, including sentences using “must”, “should”, or “need to”, as suggestions.

## Return the result

Return one section for each reviewed pull request, commit, or diff. For a hosted pull request, make the section title a link to it.

Lead each section with exactly one recommendation:

- **Approve** when no introduced findings or **Discussion** remain and the evidence is sufficient for the change risk. **Existing issue** notes do not affect this recommendation.
- **Approve with comments** when the section contains **Blocks merge**, **Non-blocking**, or **Discussion** items but no **Blocks approval** finding or material confidence gap.
- **Wait before approving** when any **Blocks approval** finding remains or a material confidence gap prevents a risk-proportionate review.

Write it as `**Recommendation: Approve with comments.**` Follow it with `**Change risk: <rating>.**`, replacing `<rating>` with the assessed **Low**, **Moderate**, or **High** value, and one short explanation of the main exposure, containment or recovery path, and evidence that affects the decision. Then add one short recommendation rationale when comments or a material confidence gap exist:

- For **Wait before approving**, say what the human needs to verify before approving.
- When **Blocks merge** items remain, name them and say why the human does not need to review their corrections again.
- With only **Non-blocking** items, say that they are optional or suitable for follow-up.
- With only **Discussion**, say that the open question does not block approval.

This distinction allows a human to approve a narrow required correction without implying that the current revision is ready to merge. The risk statement explains why the same type of defect may warrant a different action in a more consequential or harder-to-recover change.

The recommendation advises the human reviewer. Do not approve the change or request changes on their behalf.

Follow the recommendation with compact prose:

- **Original issue.** For a hosted pull request with an available linked issue, summarize the original problem and requested outcome. Deep-link the issue. State the issue itself rather than narrating that it was retrieved or validated.
- **Context.** Use this instead when a hosted pull request has no available linked issue. Name the PR description or other source used and state what required context remains unavailable.
- **Intent.** Use this for a commit, patch, or local diff with a stated request. Omit it when no intent source is available rather than manufacturing context.
- **Change.** Explain how the implementation addresses the issue or stated intent. When neither is available, describe only the observed behavior without claiming that it satisfies an unstated outcome. For hosted changes, link the defining implementation and tests to immutable reviewed revisions, and link CI or other validation evidence to the exact reviewed run.
- **Notable.** Add this only for another fact, trade-off, dependency, or validation gap that materially helps the review. Do not emit an empty placeholder or a separate validation section.

Then return the draft groups in this order, omitting empty groups: **Blocks approval**, **Blocks merge**, **Non-blocking**, **Discussion**, then **Existing issue**. The first three contain publishable inline comments. Put the classification at the top of each inline comment body, and keep the deep-linked file and line outside it as presentation metadata:

```markdown
### Blocks merge

[`path/to/file:line`](immutable-or-diff-link)

> **Blocks merge**
>
> Exact comment body
```

Each **Existing issue** note must say that the pull request did not introduce the problem. If no groups remain, say that no inline comments are proposed.

Apply AI attribution to publishable drafts by default unless overridden explicitly by the user or policy in context. Keep the classification and any attribution inside the quoted comment body. Each draft should match what would be published.

When another skill supplies an output schema, follow its structure while preserving the issue validation, per-target separation, recommendation, finding requirements, grouping, and prose above.

## PR-level discussion

A pull request may have at most one proposed top-level discussion comment. Use this exception only when every topic:

- concerns an architecture decision or repository rule that materially affects the pull request;
- spans several changes or cannot be fairly anchored to one changed line;
- links to the decision and the defining changes; and
- needs context from the author before the reviewer can draw a conclusion.

Combine multiple qualifying topics into short, readable paragraphs in the same comment. State the observed relationship and ask one focused question for each topic. Do not add an action classification, prescribe a remedy, or change the recommendation to **Wait before approving** because of an unresolved discussion.

Present it only when it exists:

```markdown
### Discussion — PR-level comment

> [ADR-012](immutable-link) places operational reads behind the Admin Gateway. This pull request adds a [worker route](immutable-link) and [direct dashboard request](immutable-link). Does infrastructure still route this request through the gateway?
```

Deep-link each referenced decision and defining change inside the discussion body at an immutable reviewed revision.

Do not use a top-level comment because an ordinary finding lacks a valid inline anchor.

## Publish comments

Before publishing:

1. Show the exact destination and body unless the user already approved that text.
2. If the host cannot attach an introduced finding to a relevant changed line, stop and explain that it cannot be published inline. Do not move it to unchanged code or a top-level comment.
3. Publish a proposed **Discussion** only as the single top-level comment described above. Treat **Existing issue** items as reviewer notes unless the user chooses a separate destination.
4. If the host requires a review event to carry inline comments, use its neutral comment mode with an empty top-level body. Never approve or request changes.
5. Read each published comment back and verify its target, content, and formatting.
