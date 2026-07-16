# Adaptive Review Gate

The coordinating thread owns review strategy. Before asking the human to approve a completed alignment, plan, implementation, or delivery artifact, obtain at least one independent review of its current form. A blocking question or progress update is not a review checkpoint.

## Choose the review

Select the lenses, reviewer count, model size, reasoning level, and sequence from the artifact's novelty, reversibility, blast radius, user visibility, failure modes, validation strength, and prior findings. Load `agent-coordination` before selecting delegated routes; do not hardcode model names here.

Use the smallest review that can credibly challenge the work:

- A narrow mechanical artifact may need one lightweight reviewer focused on contract fidelity and unintended changes.
- An ordinary implementation normally needs one balanced reviewer covering accepted behavior, correctness, regressions, and whether validation exercises the real seam. Add a distinct UX, maintainability, or compatibility lens when it could change the result.
- Destructive, concurrent, security-sensitive, release, migration, or otherwise high-blast-radius work may need multiple orthogonal reviewers, deeper reasoning, earlier hazard review, and a dedicated security reviewer.

Reviewers use fresh context and work read-only. Give each reviewer the approved artifact that defines correctness, the exact review target, its assigned lens, relevant repository guidance, and available validation evidence. Review the integrated result rather than isolated implementation units.

## Close the gate

The coordinator synthesizes findings rather than accepting them mechanically. For each material finding, fix and re-review, defer it with an explicit reason the human can approve, or surface the underlying decision. For alignment and planning, rerun the artifact's scope, consistency, and dependency checks. For implementation and delivery, run the repository's expected regression checks and any scenario-specific check needed to exercise the actual user, runtime, deployment, or failure path.

Bind review evidence to an exact target: an artifact revision, commit or range, or working-tree diff fingerprint. Any target change makes the review stale and requires another independent pass; a purely mechanical change can use the configured lightweight route. For durable work, record each completed pass in a separate `review-evidence.md` beside the workflow artifacts, including the target, lenses and routes, finding dispositions, validation, and residual risk. Treat this evidence log as operational metadata outside the reviewed target and deliverable diff; do not amend reviewed alignment, plan, or code merely to record the result. Keep raw reviewer transcripts out of the workflow.

At the human checkpoint, summarize the reviewed target, review strategy, closed or deferred findings, validation evidence, and remaining risk. If independent review is unavailable, state the blocker and do not present the completed artifact for approval until review is available.
