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

Judge expense by reversal cost and the amount of work a wrong choice would invalidate, not by file count, elapsed time, branch, or PR size. A choice is not costly merely because changing it would touch local code, CSS, or tests. Skip the design when relevant choices are already authoritative, obvious from repository patterns, trivial, or cheaply reversible. Tell Ship no design review is needed with one brief reason and the next step; do not manufacture a document or append an implementation checklist.

Intent must be settled enough to design. Use [`research`](../research/SKILL.md) when evidence could resolve material uncertainty. Return to [`align`](../align/SKILL.md) when plausible answers could still change the benefit, scope, important experience, constraint, or high-level solution direction.

## Write the smallest useful design

Follow [`durable-context.md`](../ship/references/durable-context.md) to choose one workflow home: reuse a verified legacy workflow in place, or locate or create the canonical vault work item, never both. Then read [design-format.md](design-format.md) and create or update `design.md` in that home. For vault-native work, set the work-item index's `Current` pointer to it; for legacy work, retain its existing continuation convention when present.

1. **Lead with the future state.** In the first roughly 150 words, state the useful result in actor or caller language. Use one ordinary example to show the normal path and the most important failure or recovery behavior.
2. **Include only costly choices.** State each decision heading as the proposed choice. Name what approved behavior, contract, migration, or substantial implementation work it would invalidate if wrong. Ground that reversal cost in the current scope and system. Settled requirements, routine local edits, and hypothetical future needs are supporting material, not decision headings. Every proposed element must support the settled outcome or a necessary risk control.
3. **Expose only the shape needed to judge those choices.** Before reading a shape guide, name the specific behavior or constraint the draft would otherwise leave implicit; if you cannot name one, do not read it. When that gap is user-visible behavior, read [experience-shapes.md](references/experience-shapes.md). When it is an implementation constraint, read [technical-shapes.md](references/technical-shapes.md). Load both only when the decision crosses both boundaries. Do not load either merely to make the document look concrete.
4. **Focus the review.** Name any remaining uncertainty, why evidence has not settled it, and whether it blocks approval. Link the few authoritative inputs and name which delivered tests, contracts, ADRs, or documentation should become lasting authority.

If another option remains genuinely viable, name the strongest one and briefly explain why the recommendation wins. Omit alternatives when an authoritative constraint leaves only one feasible option.

Only when inspected evidence already establishes a costly or unsafe sequence, read [build-rollout.md](references/build-rollout.md). Do not load it to decide whether ordinary implementation order deserves a section.

## Check the design

Before review, confirm that:

- the opening makes the future result, normal path, and important failure or recovery behavior concrete
- every decision heading names a reversal cost grounded in approved scope and the current system
- settled requirements, routine local edits, and hypothetical future needs remain supporting material
- every proposed element supports the settled outcome or a necessary risk control
- claims about the existing system agree with inspected evidence; proposed contracts and shapes are labeled as proposed, with assumptions and unresolved details distinct
- the document loads and follows only the shape guides whose conditions apply
- authoritative product artifacts are linked and intentional deviations are explicit
- any build and rollout section names the costly or unsafe sequence that qualified it
- remaining uncertainty says whether it blocks approval; no consequential human decision is hidden as an assumption
- the final prune removed repeated shapes, optional scaffolding, implementation-sized bodies, and exhaustive inventories

If the design reveals that settled success cannot be met under the approved constraints, record the conflict and return to Align instead of asking for design approval.

If several PRs, migrations, worktrees, releases, or dependency edges need coordination, note that a separate [`delivery-plan`](../delivery-plan/SKILL.md) may follow. Do not put a dependency graph or detailed task plan in `design.md`.

## Review and return to Ship

Present only the parts needed to judge the costly choices. Lead with the recommendation and its practical effect, then explain the one choice or risk the reviewer should challenge. Do not reproduce `design.md` headings or its section order, and do not label the message as a design checkpoint. Ask one short question: **Is this design ready to implement?**

Split review into product/experience and technical/program checkpoints only when a wrong first-half decision would invalidate substantial work on the second half. Do not add independent gates for every section.

When approved, update the document's status and settled direction. Approval makes the design tactical implementation input; it does not authorize a delivery plan or production edits beyond the user's existing authority. Return to Ship to choose direct or planned delivery.

During implementation, use the approved design to detect intended deviations and accidental drift, not as a substitute for reading the code. Keep implementation results, validation logs, changing PR status, and retrospective narration in the work-item index, delivery plan, or review evidence; link them rather than appending them to the approved design. After delivery, promote lasting decisions to the authoritative artifacts named in the design, leave `design.md` as historical work-item evidence, and move it out of the active `Current` read path. Do not maintain it as a permanent second source of truth.
