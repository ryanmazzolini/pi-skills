---
name: "design-doc"
description: "Create a compact human-readable design before implementation. Use when wrong implicit decisions about the intended experience, system fit, program shape, or build order would cause expensive rework."
---

# Design Doc

Make consequential solution choices legible before code exists. Produce one adaptive `design.md`, get the smallest useful human review, then return to Ship without implementing.

Keep document structure and Ship routing out of the conversation. Lead the user-facing review with the proposed experience or system change, why deciding it now avoids rework, and the one choice that most needs challenge. Mention section names or workflow mechanics only when they help the reviewer navigate an artifact.

## Confirm design review is warranted

Inspect the settled request, live code, tests, project documentation, decisions, history, and any already-verified current workflow. Do not create durable workflow context while deciding whether design review is warranted.

Use this skill only when both conditions hold:

1. The implementation would otherwise make an implicit choice about the intended experience, system fit, program shape, or build order.
2. Discovering that choice was wrong after implementation would cause expensive rework.

Judge expense by reversal cost and the amount of work a wrong choice would invalidate, not by file count, elapsed time, branch, or PR size. Skip the design when relevant choices are already authoritative, obvious from repository patterns, trivial, or cheaply reversible. Tell Ship no design review is needed rather than manufacturing a document.

Intent must be settled enough to design. Use [`research`](../research/SKILL.md) when evidence could resolve material uncertainty. Return to [`align`](../align/SKILL.md) when plausible answers could still change the benefit, scope, important experience, constraint, or high-level solution direction.

## Write the smallest useful design

Follow [`durable-context.md`](../ship/references/durable-context.md) to choose one workflow home: reuse a verified legacy workflow in place, or locate or create the canonical vault work item, never both. Then read [DESIGN-FORMAT.md](DESIGN-FORMAT.md) and create or update `design.md` in that home. For vault-native work, set the work-item index's `Current` pointer to it; for legacy work, retain its existing continuation convention when present. Delete inapplicable template sections instead of filling them with ceremony.

Scale the document to the expensive choices:

- **Product promise:** translate settled intent into a concrete future-facing launch paragraph or caller example, observable success, primary walkthrough, important failure or recovery path, and explicit non-goals. Do not restate the whole alignment.
- **Experience artifact:** when prose is hard to judge, link the smallest useful mockup, state storyboard, CLI transcript, or API example and say exactly what the reviewer should assess. Summarize accepted behavior in `design.md`.
- **System design:** show the current fit, desired runtime flow, contracts, data transformations, and only the security, reliability, compatibility, migration, rollout, or operational risks that can change the solution.
- **Program design:** show the proposed file-tree diff, key types or signatures without bodies, important call-stack trees, ownership of state and side effects, error paths, and test seams. Expose the least-confident decisions an implementer would otherwise make silently.
- **Vertical build outline:** start with the thinnest touchable tracer, then add end-to-end increments with an observable check after each. This decides a useful build order, not PR boundaries.
- **Authority and lifecycle:** link the inputs, name decisions that need promotion to executable checks, contracts, an ADR, or durable product documentation, and state that the delivered code and those lasting artifacts become authority.

Use a diagram only for a named question that prose cannot answer as clearly. Label current fact, proposed design, assumption, and unresolved risk distinctly. Include alternatives only when more than one option could credibly win; lead with the recommendation.

## Use static mockups without turning them into prototypes

A static HTML mockup may be a design artifact when seeing the proposed surface makes review easier. Put it under the work item's `working/mockups/`, prefer self-contained HTML and CSS with representative data and no backend, and visually check it before presenting it. Create multiple variants only when comparison is itself the decision.

Use [`prototype`](../prototype/SKILL.md) instead when interaction or human observation is needed to settle one experiential uncertainty. A design mockup communicates a proposed contract; a prototype runs an experiment.

## Check the design

Before review, confirm that:

- every proposed element traces to the settled outcome or a necessary risk control
- the normal path and one important failure or recovery path are concrete
- system and program claims agree with the live repository
- ownership, side effects, errors, and verification seams are visible where they matter
- the first build increment is end-to-end and touchable rather than a horizontal foundation
- no consequential human decision is hidden as an assumption
- the document contains no implementation bodies, exhaustive task list, or detail that does not help this review

If the design reveals that settled success cannot be met under the approved constraints, record the conflict and return to Align instead of asking for design approval.

If several PRs, migrations, worktrees, releases, or dependency edges need coordination, note that a separate [`delivery-plan`](../delivery-plan/SKILL.md) may follow. Do not put a dependency graph or detailed task plan in `design.md`.

## Review and return to Ship

Present only the parts needed to judge the costly choices. Lead with the recommendation and its practical effect, then explain the one choice or risk the reviewer should challenge. Do not reproduce `design.md` headings or its section order, and do not label the message as a design checkpoint. Ask one short question: **Is this design ready to implement?**

Split review into product/experience and technical/program checkpoints only when a wrong first-half decision would invalidate substantial work on the second half. Do not add independent gates for every section.

When approved, update the document's status and settled direction. Approval makes the design tactical implementation input; it does not authorize a delivery plan or production edits beyond the user's existing authority. Return to Ship to choose direct or planned delivery.

During implementation, use the approved design to detect intended deviations and accidental drift, not as a substitute for reading the code. After delivery, promote lasting decisions to the authoritative artifacts named in the design, leave `design.md` as historical work-item evidence, and move it out of the active `Current` read path. Do not maintain it as a permanent second source of truth.
