---
name: "code-review"
description: "Review code changes against their intended issue, recommend a human review action, and draft clear comments for introduced defects. Use for pull requests, stacked pull requests, commits, patches, or local diffs; combine with repository- and language-specific guidance."
---

# Code Review

Review the selected change against its intended outcome and for defects it introduces. A caller or companion skill may provide repository access, isolation, saved reports, or a required output format.

## Review target

Identify each change's intent, base, head, and changed files. Review the exact requested commit or diff. If it changes during the review, refresh it before drawing conclusions.

For a pull request, read its description and retrieve every explicitly linked issue before inspecting the implementation. Record the original problem, its user or operator impact, the requested outcome, acceptance criteria, and stated exclusions. If no issue is linked or an issue is unavailable, name the context used instead and do not infer missing requirements.

When context is missing, complete the inspection that does not depend on it before asking the user. Ask only when the missing answer prevents a useful review; otherwise return the review with the limitation and its effect on the recommendation.

For multiple or stacked pull requests, review each against its immediate parent. Keep its evidence, recommendation, and comments in a separate output section. Assign a finding to the pull request that introduced it, and do not repeat inherited findings higher in the stack.

Read the diff, then inspect enough surrounding code, tests, repository instructions, architecture decisions, and history to understand the affected behavior. Load applicable language, framework, security, or interface-review skills when they add relevant criteria.

Account for every changed file and any behavior that crosses file boundaries.

Before returning a review of an open GitHub pull request, call `monitor_github_pr` with its canonical URL and `notifyExistingFeedback: false` when the tool is available. This records existing feedback without triggering another turn, then notifies the session only about later feedback. For a stack, register each open GitHub pull request in review order until the tool reports its session limit. Continue the review and identify any pull request that remains unmonitored. Monitoring belongs to the current session and does not publish GitHub changes.

Reviews are read-only by default. Do not change the reviewed code or publish comments unless the user explicitly asks and the active workflow permits it.

## Review setup

Temporary review infrastructure is allowed when it helps inspect or validate the change without modifying it. Prefer OS temporary directories. Track every clone, worktree, ref, dependency install, process, and generated artifact you create.

Remove only resources created for this review. Do not remove caller-provided or pre-existing resources.

Before returning the review result, stop processes and remove every clone, worktree, ref, dependency install, and generated artifact created for the review. Keep a resource while waiting for publication approval only when the publication step still needs it. Remove it after publishing or when publication is declined. If cleanup fails, report the exact resource left behind and the failure.

## Inspect the behavior

Trace the requested outcome and each acceptance criterion into the implementation and tests. Confirm that the change produces the promised behavior rather than merely resembling the requested implementation. Respect explicit partial scope; when a pull request claims to close an issue, report a material unmet outcome as an introduced finding.

Inspect removed or narrowed behavior as well as additions, including changes to instructions and documentation. Trace affected existing use cases, callers, safeguards, and fallback paths into the revised behavior. When a procedure or abstraction disappears, check which guarantees it supplied and where any still-required guarantees now live; a replacement name or a passing new-use-case test is not enough.

Verify that consequential behavior removals match the approved scope and have a stated reason in the available change context. Do not infer permission to drop an existing use case from permission to add another or simplify its implementation. Report a proven unintended loss under the finding criteria below. When intent remains unclear, name the missing decision and its effect on the recommendation rather than inventing a defect or a justification.

Support justified removal without demanding preservation for its own sake. Recommend deprecation notices, compatibility layers, or transitional machinery only for a concrete consumer, contract, or rollout need. Put removal reasons in the change explanation, not permanent tombstones in the implementation.

Trace changed state and side effects beyond the edited lines.

- For each temporary flag or bypass, find where the previous state is restored. Inspect every operation that can run before restoration. If the code never restores it, inspect later operations on the same instance and report any unintended wider behavior that meets the requirements below.
- For each lock, resource, or subscription, verify that every exit path releases it.

## Check the final diff against scope

Before returning the review, explicitly check both questions against the final reviewed diff and the available approved goal. These complement correctness and acceptance checks; passing tests does not answer them.

1. **What changed that should have stayed unchanged?** Check edits and removals for behavior outside the approved scope, including guarantees lost indirectly through removed procedures or abstractions. Use the behavior tracing above rather than assuming an unchanged caller or passing new-use-case test proves preservation.
2. **What was added that the goal does not need?** Check for unrelated cleanup, speculative features, unnecessary abstractions or dependencies, and extra UI or documentation. Identify the approved boundary or concrete burden that makes a change unnecessary; fewer lines or a different style alone is not a reason to remove it.

When visible text changes, read [HCI's flow-first copy guidance](../../ux-accessibility/hci/SKILL.md) and check each added or changed string against the user's task. Flag change narration, repeated explanations, or implementation commentary that adds noise instead of useful information. Prefer communicating through the control or flow; preserve necessary labels, constraints, accessible text, errors, and verified recovery guidance.

Apply the finding and uncertainty criteria below to both checks. Do not invent missing scope or demand removal of necessary supporting work. Keep internal coverage separate from the concise review result; these checks do not require boilerplate sections or two reviewers. The caller chooses reviewer count and independence to fit the change.

## What to report

Prioritize correctness, data loss, security, broken control flow, races, contract changes, failure handling, rollout risk, and repository rules whose violation would have a meaningful consequence.

Report a finding only when all of these are clear:

- The change causes it or makes it worse.
- A concrete input, runtime path, or instructed workflow triggers it.
- The consequence matters to a caller, user, operator, or maintainer.
- The author can take a specific next step within the change's scope.

Confirm suspected findings against the implementation and existing tests. When available, use a test, CI for the reviewed revision, or a focused reproduction. Complete required repository checks. Once the triggering path and consequence are established and required checks are complete, broaden or repeat verification only for a specific unresolved concern, a failure, or a changed revision.

Treat deterministic check failures as evidence rather than duplicating them as comments. Include a material failed or unavailable check when it affects the decision; report the underlying defect only when it independently meets the requirements above.

Keep findings focused on supported risks with specific next steps. Generic requests for tests or documentation and low-value style preferences stay outside the review.

Treat a pre-existing problem as an **Existing issue** only when it is concrete, material, directly relevant to the reviewed behavior, and likely to receive a specific follow-up. Present it as a non-blocking inline comment after introduced findings and state that the pull request did not introduce it. It leaves the pull-request recommendation unchanged. Publication requires the same valid changed-line anchor as any other inline comment.

## Assess business risk and classify findings

A reproduction showing 12 reported units becoming 24 proves a reporting error, not its effect on business decisions. Trace who uses those totals and what the error changes for them. Neither assume staffing or payroll harm nor dismiss the error because it affects only reporting.

Before classifying findings or recommending an action, assess the consequences for people and operations if the reviewed revision merges unchanged. Business impact includes inability to complete work, misleading operational decisions, lost or exposed data, contractual failures, support burden, and costly recovery—not only revenue or payments. Ground each claimed consequence in the issue, code, tests, documentation, or repository context; distinguish established effects from plausible downstream harms.

Use **Low**, **Moderate**, or **High** internally to calibrate the review. Consider the worst supported consequence, supported reach and likelihood, persistence, detection and recovery, and controls that limit the risk. Compare merging with correction deferred against the current behavior and the benefit delayed by holding the change, not against an imaginary defect-free system. A useful benefit does not by itself excuse an unacceptable regression. Complexity and novelty affect confidence that undiscovered defects remain; they do not increase the business impact of a proven finding.

Resolve decision-changing uncertainty from available sources. Unknown frequency is neither evidence that a failure is rare nor a reason to inflate its severity. Missing evidence of harm does not establish safety. Name a remaining missing fact and the decision it could change; do not demand production statistics when the supported consequence already settles the decision, such as a demonstrated path to irreversible data loss.

Classify each introduced finding in two steps:

1. **Decide whether correction can wait until after merge.** A reproduction establishes a defect, not a requirement to delay delivery. Explain the supported consequence that makes deferral acceptable or unacceptable. A material failure of the promised outcome can justify correction before merge without catastrophic harm; establish which agreed outcome fails and how much of the intended use it prevents. An error in the behavior being improved does not by itself establish that the outcome fails materially. Respect explicit partial scope and distinguish a useful partial improvement from failure to deliver the agreed outcome. Use **Non-blocking** when the supported risk is acceptable and correction is optional or suitable for follow-up. Otherwise, identify why correction is required before merge and continue to step 2.
2. **Decide whether the reviewer must see the correction before approving.** Use **Blocks approval** when the evidence establishes a significant business consequence if the current revision merges after approval. The reviewer should see the correction first. Use **Blocks merge** when correction is required before merge but the supported consequence does not warrant withholding approval; the reviewer may approve while leaving the correction with the author. Lack of a significant business consequence does not by itself make a finding non-blocking.

Choose the classification before considering the remediation. Use the correction's size or simplicity only to shape the suggestion.

A specific missing contract, fact, or validation result may prevent a risk-proportionate decision without proving a defect. Treat it as a material confidence gap only when the unresolved consequence could justify withholding approval. Name the missing evidence and the decision it would settle; do not turn uncertainty alone into a blocking finding. A lower-consequence question may become a **Discussion** item when it meets the PR-level criteria below.

When challenged or reviewing a new revision, reassess these decisions rather than carrying forward a label or agreeing with the challenge. If the classification changes, identify the new evidence, changed assumption, or error in the earlier reasoning and explain why it changes the required action. If none changes the decision, retain the classification and explain why.

## Write the comment

Write each introduced finding as a proposed inline comment on the smallest changed line or range that establishes the defect. For an **Existing issue**, use the smallest changed line or range that establishes its direct relevance to the reviewed behavior, such as a new caller of an affected helper, and identify the pre-existing defect in the comment. Use the old side for deleted lines when the host supports it. Do not anchor comments to unchanged surrounding code.

Provide a deep-link URL for the file and line reference when the review host supports one. Use an immutable blob link pinned to the reviewed head, or to the base for deleted lines. A host-provided diff link is suitable only when it is pinned to the reviewed revision. Fall back to a plain path for local-only reviews rather than inventing a link. Display ranges as `path/to/file:81-86`; keep host-specific anchors such as `#L81-L86` in the URL.

Order comments by action—**Blocks approval**, **Blocks merge**, **Non-blocking**, then **Existing issue**—and then by impact. Use group headings when they make several comments easier to navigate.

Each comment should:

1. Lead with a direct statement of the problem.
2. Explain what the code does, when it happens, and the concrete consequence.
3. Start a new paragraph, then offer the smallest useful change as a suggestion. Suggest a test when it proves the corrected behavior or prevents a likely regression.

Offer one correction path when the evidence supports a clear default. Give alternatives only when the repository leaves a real design or contract choice unresolved, and say what decides it. Keep the recommendation rationale, risk explanation, and reviewer workflow guidance out of the publishable comment. Keep the required finding classification at the top of the comment.

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

Write for a capable engineer who has not read the issue, diff, or investigation. Give every reviewed pull request, commit, or diff a summary, including clean approvals. Establish who uses the affected workflow, what they are trying to do, and what happens today before explaining the change and how it works. For a preparatory refactor, explain what it enables and what stays unchanged. Use a concrete example when it makes the behavior easier to understand.

Ground that explanation in the issue or other available intent source and the inspected implementation. Include consequential design choices and scope limits that affect how the reader should interpret the change. When intent is unavailable, name the context used and describe observed behavior without inventing requirements. Link the pull request and available issue; use implementation links for supporting detail, not as substitutes for the explanation.

Acknowledge consequential behavior removals in the summary and give their stated reasons. If a reason is missing, say so; do not present the loss as an agreed simplification.

For related pull requests, first explain the combined outcome and any merge or rollout dependencies needed to understand the parts. Then keep each target's summary, recommendation, and proposed comments together. Use headings and paragraphs where they help navigation rather than forcing a fixed “Original issue / Change / Notable” template. Size the explanation to the change, not a sentence limit.

Give each reviewed pull request, commit, or diff exactly one recommendation:

- **Approve** when the evidence is sufficient and no introduced finding or **Discussion** item remains. **Existing issue** notes leave this recommendation unchanged.
- **Approve with comments** when **Blocks merge**, **Non-blocking**, or **Discussion** items remain without a **Blocks approval** finding or material confidence gap.
- **Wait before approving** when a **Blocks approval** finding or material confidence gap remains.

Explain material limitations and business risks through their practical effects: what remains unavailable, whose work or data can be affected, and what detection or recovery involves where the evidence establishes it. Connect those consequences to the recommendation. Summarize the overall consequence when needed, while leaving each finding's triggering path and correction in its comment. A classification alone does not explain why the recommendation fits. Avoid speculative harms and routine risk paragraphs that add no useful context.

Include validation when it changes confidence, explains uncertainty, or tells the reviewer what remains to verify. Routine successful checks can remain implicit; link evidence that materially changes confidence.

Show every proposed inline comment with its changed-line reference followed by a blockquote containing the exact publishable body. In terminal responses, show the reference's full URL on its own line by default; use a labeled Markdown link only when the URL is very long and impairs readability. For local-only reviews, show the plain path instead. Preserve Markdown links inside the publishable body, including drafts shown in chat. Keep the classification and any required AI attribution inside that body. Let the recommendation and comment classifications carry the decision. Reserve wrapper headings, separate classification summaries, and grouping for multiple targets or findings that need them. Separate targets in a stack and assign each finding to the change that introduced it.

Use **Existing issue** as the comment's classification, state that it predates the reviewed change, and link its tracking item when available.

The recommendation advises the human reviewer. Publishing, approving, and requesting changes remain separate actions that require their applicable authorization.

When another skill supplies an output schema, follow its structure while preserving the change summary, issue validation, per-target separation, recommendation, finding, and publication requirements above.

After drafting, read and apply [`clear-writing`](../../ai-authoring/clear-writing/SKILL.md) to the complete review, including the inline comments. Treat investigation notes and unapproved comment drafts as source material, not finished prose to copy. In each summary and comment, explain what a component, field, or background process does before relying on its name. Prefer the action and its result to internal shorthand; retain identifiers where they help locate or distinguish the code.

Check whether the reader can explain the workflow, the change, and why the recommendation fits without opening links or reconstructing the story from comments. If a sentence only names a mechanism, limitation, or risk, explain what it means for the affected person or system. Restore missing context before trimming repetition; concision means removing unnecessary work for the reader, not merely using fewer words.

## PR-level discussion

A pull request may have at most one proposed top-level discussion comment. Use this exception when the available evidence still supports approval and every topic:

- concerns an architecture decision or repository rule that materially affects the pull request;
- spans several changes or cannot be fairly anchored to one changed line;
- links to the decision and the defining changes; and
- needs context from the author before the reviewer can draw a conclusion.

A question that prevents a risk-proportionate decision is a material confidence gap instead of a **Discussion** item.

Combine multiple qualifying topics into short, readable paragraphs in the same comment. State the observed relationship and ask one focused question for each topic. Keep action classifications and remedies with findings.

Present it only when it exists:

```markdown
### Discussion — PR-level comment

> [ADR-012](immutable-link) places operational reads behind the Admin Gateway. This pull request adds a [worker route](immutable-link) and [direct dashboard request](immutable-link). Does infrastructure still route this request through the gateway?
```

Deep-link each referenced decision and defining change inside the discussion body at an immutable reviewed revision.

Reserve top-level comments for the qualifying PR-level discussion above.

## Publish comments

Before publishing:

1. Show the exact destination and body unless the user already approved that text.
2. If the host cannot attach a proposed comment to a relevant changed line, stop and explain that it cannot be published inline. Keep its destination on a changed line rather than moving it to unchanged code or a top-level comment.
3. Publish a proposed **Discussion** only as the single top-level comment described above.
4. If the host requires a review event to carry inline comments, use its neutral comment mode with an empty top-level body. Never approve or request changes.
5. Read each published comment back and verify its target, content, and formatting.
