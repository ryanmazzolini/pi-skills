---
name: "code-review"
description: "Review code changes against their intended issue, recommend a human review action, and draft clear comments for introduced defects. Use for pull requests, stacked pull requests, commits, patches, or local diffs; combine with repository- and language-specific guidance."
---

# Code Review

Review the selected change against its intended outcome and for defects it introduces. A caller or companion skill may provide repository access, isolation, saved reports, or a required output format.

## Standalone review ownership

A standalone review is a user's request to review a change, rather than a review assigned by an implementation workflow. These ownership rules do not change caller-owned reviews such as Ship's internal implementation-review gate.

For standalone reviews, do not use subagents. A review thread is an independent, user-visible agent conversation. A thread already assigned ownership of a review completes it in place, including later revisions and feedback; it does not launch another review thread. If the user explicitly requests an in-place review, review in the current thread without subagents.

Otherwise, create one review thread per related ticket group in the selected workspace:

1. For PRs, read descriptions and linked ticket identities to establish the groups before dispatch. For commits, patches and local diffs, use the supplied work context. Keep the same ticket, an explicit stack, or documented review dependencies together; sharing a repository or author alone is not a reason to group changes. Keep unrelated tickets in separate threads. A target without a linked ticket can form its own group; do not require or invent a ticket. The launching thread gathers routing context, not a second review.
2. Use the host's available workspace/thread tools and runtime instructions. Honor the user's workspace choice, or infer an unambiguous existing workspace. Obtain any missing creation approval; do not repeat approval for explicitly authorized launches. Preserve the source thread and human focus.
3. Give each destination its exact review targets and checkout paths, related ticket context, approved scope, canonical report/evidence paths when available, and this skill. Identify it as the review owner, not another launcher. Preserve explicit launch options. The assigned task includes inspection, validation, reports, the companion walkthrough, PR monitoring and follow-ups as applicable, but no code changes or publication without their applicable approval.
4. Verify that each destination thread exists and has received its assigned task before reporting dispatch. The owner begins the already authorized review without asking again whether to start. It performs the review itself, without subagents, and returns the complete result in its own thread.

In Herdr (`HERDR_ENV=1`), a review thread is a named tab running a fresh Pi session. Use [`herdr`](../../herdr/SKILL.md) and its [fresh-session procedure](../../herdr/references/pi-session-transfer.md), including **Start the assigned review** after startup verification.

If the host does not expose thread creation or verification, explain the limitation and ask whether to review in the current thread. Do not invent host commands or silently substitute an in-place review or subagent.

The launching thread reports which targets belong to each destination, then stops. Do not wait for review completion, poll owners for progress, or collect their reviews into the launching thread. Each owner keeps its evidence, report, PR monitors and subsequent review conversation. The remaining sections apply to the thread performing the review.

## Review target

Identify each change's intent, base, head, and changed files. Review the exact requested commit or diff. If it changes during the review, refresh it before drawing conclusions.

For a pull request, read its description and retrieve every explicitly linked issue before inspecting the implementation. Record the original problem, its user or operator impact, the requested outcome, acceptance criteria, and stated exclusions. If no issue is linked or an issue is unavailable, name the context used instead and do not infer missing requirements.

When context is missing, complete the inspection that does not depend on it before asking the user. Ask only when the missing answer prevents a useful review; otherwise return the review with the limitation and its effect on the recommendation.

For multiple or stacked pull requests, review each against its immediate parent. Keep its evidence, recommendation, and comments in a separate output section. Assign a finding to the pull request that introduced it, and do not repeat inherited findings higher in the stack.

Read the diff, then inspect enough surrounding code, tests, repository instructions, architecture decisions, and history to understand the affected behavior. Load applicable language, framework, security, or interface-review skills when they add relevant criteria.

Account for every changed file and any behavior that crosses file boundaries.

Before returning a review of an open GitHub pull request, call `monitor_github_pr` with its canonical URL and `notifyExistingFeedback: false` when the tool is available. This records existing feedback without triggering another turn, then notifies the session only about later feedback. For a stack, register each open GitHub pull request in review order until the tool reports its session limit. Continue the review and identify any pull request that remains unmonitored. Monitoring belongs to the current session and does not publish GitHub changes.

Reviews are read-only by default. Do not change the reviewed code or publish comments unless the user explicitly asks and the active workflow permits it.

## Companion walkthrough

For a pull request, commit, or commit range, also build the walkthrough page with [`change-walkthrough`](../change-walkthrough/SKILL.md) while inspecting the change. Writing its guide checks that you understand the change, and its notes often become findings. Link the page in the review result. It lives outside the reviewed repository and stays after the review; it is not review infrastructure to remove. Skip it, and say so, when the renderer cannot run or the change has no supported code entities.

## Review setup

Temporary review infrastructure is allowed when it helps inspect or validate the change without modifying it. Prefer OS temporary directories. Track every clone, worktree, ref, dependency install, process, and generated artifact you create.

Remove only resources created for this review. Do not remove caller-provided or pre-existing resources.

Before returning the review result, stop processes and remove every clone, worktree, ref, dependency install, and generated artifact created for the review. Keep a resource while waiting for publication approval only when the publication step still needs it. Remove it after publishing or when publication is declined. If cleanup fails, report the exact resource left behind and the failure.

## Inspect the behavior

Trace the requested outcome and each acceptance criterion into the implementation and tests. Confirm that the change produces the promised behavior rather than merely resembling the requested implementation. Record each point where the result differs from the request: an outcome delivered differently, narrowed, deferred, or added beyond it, with the stated reason when one exists. Report material deviations whether or not they qualify as findings. Respect explicit partial scope; when a pull request claims to close an issue, report a material unmet outcome as an introduced finding.

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

The author reads each comment beside the anchored code, so the comment adds only what that code does not show: what goes wrong, when, and why it matters. Write it the way an experienced reviewer writes in a pull request thread. Start with the classification, then the effect. A short comment the author can absorb at a glance serves better than a complete account of the investigation; the evidence stays in the review, and the author can ask.

Hints that keep comments short:

- Lead with the consequence the author cares about, such as “console capture stays dead until the server restarts”, rather than the chain of calls that produces it.
- Name the one or two identifiers that locate the cause. The anchored code shows the rest of the mechanism.
- Leave out a correction the problem already implies. When it is not obvious, offer it as an option (“X could…”), not a command, and offer one path unless a real design or contract choice remains open; say what decides it.
- When the failure depends on ordering, state, or another file the anchor does not show, a short trace or input/output example usually explains it faster than prose. Use it instead of prose, not as well as.
- Say each thing once; a second phrasing of the effect adds nothing.
- Keep how you verified the finding, recommendation rationale, and reviewer workflow guidance out of the comment. Reproduction steps belong in the review's validation.

A dense comment that walks through every step:

> **Blocks merge** — After a successfully initialized connection receives a TCP reset, `fail()` clears `this.socket` before the close handler runs, suppressing `close` and leaving `index.ts`'s `isDAPConnected` true; subsequent `get_console_output` calls return stale output without reconnecting until the MCP process restarts. Failed-attempt cleanup could be separated from established-connection loss so the latter still emits `close`.

The same finding, written for the author:

> **Blocks merge** — After a TCP reset, `fail()` clears the socket before the close handler runs, so `close` never fires and console capture stays dead until the server restarts. Failed-attempt cleanup could stay separate from losing an established connection.

A finding where a trace earns its place, because the failure is in an interaction the code does not show:

> **Blocks approval** — Timeout retries use a new idempotency key, so a payment the gateway accepted can be charged twice.
>
> Gateway accepts key A → response times out → retry sends key B.

Match each claim to the available evidence:

- State verified behavior as fact.
- State an unverified premise conditionally and name it, such as “If `null` means occupancy is unknown, …”.
- When missing context affects the scope or remediation, say what needs confirming and why it matters.
- Do not weaken a verified defect with “might”, “maybe”, or “could”. Reserve those words for genuine uncertainty or suggested remediation.

Before stating that something is uncertain, try to resolve it from the available implementation, types, tests, configuration, documentation, and history. Only leave it uncertain when those sources do not establish the answer. Residual uncertainty may qualify a finding's scope or remediation, but it cannot substitute for evidence that the defect exists. If an unresolved premise determines whether there is a defect at all, do not report it as a finding. Do not classify a finding as **Blocks approval** while it depends on an unresolved material assumption.

Keep one idea in each comment. Each comment must stand on its own without a top-level summary.

Before returning the review, check each comment for unresolved evidence. If missing evidence affects the finding's scope or remediation, the comment must name the missing contract or fact and explain which decision it affects. Listing alternatives alone is not enough.

Then scan every proposed change or test. Rewrite commands, including sentences using “must”, “should”, or “need to”, as suggestions.

## Return the result

Write for a capable engineer who has not read the issue, diff, or investigation. Give every reviewed pull request, commit, or diff a summary, including clean approvals. Open with the recommendation and its decisive reason, stating the consequence: “Wait before approving: a timeout retry can charge twice.”

Then explain what was wrong before: who hit the problem and what it cost them. “Users lost everything printed before the first console tool call, and runtime exceptions never reached the console” orients the reviewer; “Startup capture addresses issue #77” does not. Follow with what changed and whether it matches the request. Report material deviations with their stated reasons, or say the reason is missing. When a deviation is a finding, keep its detail in the comment rather than repeating it. Add design context or a reading pointer only when it changes how the reviewer reads the diff. A confirmed match needs only a brief mention, not a requirements table. A clean approval can be the recommendation plus one sentence.

Ground the summary in the available intent source and inspected implementation. When intent is unavailable, name the context used and describe observed behavior without inventing requirements. Link the pull request and available issue; use implementation links for supporting detail, not as substitutes for the explanation.

Acknowledge consequential behavior removals in the summary and give their stated reasons. If a reason is missing, say so; do not present the loss as an agreed simplification.

For related pull requests, keep each target's summary, recommendation, and proposed comments together. In the opening orientation, explain the combined outcome and any merge or rollout dependencies needed to understand the parts. Use headings when they help the reader navigate a long or multi-target review.

Give each reviewed pull request, commit, or diff exactly one recommendation:

- **Approve** when the evidence is sufficient and no introduced finding or **Discussion** item remains. **Existing issue** notes leave this recommendation unchanged.
- **Approve with comments** when **Blocks merge**, **Non-blocking**, or **Discussion** items remain without a **Blocks approval** finding or material confidence gap.
- **Wait before approving** when a **Blocks approval** finding or material confidence gap remains.

Explain material limitations through their practical effect on the recommendation; avoid speculative harms and routine risk paragraphs. Apart from the decisive consequence in the opening, keep each finding's explanation in its comment, not a summary or separate index.

Include CI or validation only when failed, pending, unavailable, or decision-changing. Name unresolved checks and their effect on the recommendation; link evidence that materially changes confidence.

Return the complete review in the response. When the caller or a companion workflow saves a report file, the file is a copy for later reference, not a replacement. Do not shorten the summary, recommendation rationale, or comments in the response because a fuller version exists in a file or an earlier message.

Show each proposed inline comment once: its changed-line reference followed by the exact publishable body. Link the reference; use a labeled `path:line` link when the full URL impairs readability, or a plain path for local-only reviews. Preserve Markdown links inside the body, including drafts shown in chat, and keep the classification and any required AI attribution inside it. Separate targets in a stack and assign each finding to the change that introduced it.

Use **Existing issue** as the comment's classification, state that it predates the reviewed change, and link its tracking item when available.

The recommendation advises the human reviewer. Publishing, approving, and requesting changes remain separate actions that require their applicable authorization.

When another skill supplies an output schema, follow its structure while preserving the change summary, issue validation, per-target separation, recommendation, finding, and publication requirements above.

After drafting, read and apply [`clear-writing`](../../ai-authoring/clear-writing/SKILL.md) to the complete review, including the inline comments. Treat investigation notes and unapproved comment drafts as source material, not finished prose to copy. Explain unfamiliar domain terms only when needed to understand the point; do not paraphrase what the anchored code shows. Retain identifiers where they help locate or distinguish the code.

Read the review without opening links. Check that the recommendation and decisive reason are clear, the orientation explains the intended outcome, changed behavior, and fit to the request, and material deviations, missing reasons, and unresolved checks are accounted for. Remove repeated findings, obvious code paraphrases, and detail that does not help the reviewer decide or the author act.

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
