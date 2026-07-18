# Adaptive Review Gate

The coordinating thread owns review strategy. Before presenting a completed alignment summary or asking the human to approve a plan, implementation, or delivery artifact, obtain at least one independent review of its current form. A blocking question, periodic alignment summary, or progress update is not a review checkpoint.

## Choose the review

Select the lenses, reviewer count, model size, reasoning level, and sequence from the artifact's novelty, reversibility, blast radius, user visibility, failure modes, validation strength, and prior findings. Load `agent-coordination` before selecting delegated routes; do not hardcode model names here.

Use the smallest review that can credibly challenge the work:

- A narrow mechanical artifact may need one lightweight reviewer focused on contract fidelity and unintended changes.
- An ordinary implementation normally needs one balanced reviewer covering accepted behavior, correctness, regressions, and whether validation exercises the real seam. Add a distinct UX, maintainability, or compatibility lens when it could change the result.
- Destructive, concurrent, security-sensitive, release, migration, or otherwise high-blast-radius work may need multiple orthogonal reviewers, deeper reasoning, earlier hazard review, and a dedicated security reviewer.

Reviewers use fresh context and work read-only. Give each reviewer the current alignment or approved artifact that defines correctness, the exact review target, its assigned lens, relevant repository guidance, and available validation evidence. Review the integrated result rather than isolated implementation units.

## Support alignment without designing implementation

Independent alignment analysis supports the coordinating thread; it is not another review task for the human. Check for unsupported assumptions, contradictory Now and Later scope, a missing or inconsistent primary experience, overlooked consequential constraints, ambiguous observable behavior, premature solution choices, and unresolved questions whose plausible answers would materially change planning.

Inspect code when it provides evidence about current behavior or feasibility, but keep findings at the requirement, experience, constraint, or necessary high-level shape. Do not propose files, APIs, schemas, components, classes, tasks, slices, dependencies, or implementation architecture.

The coordinator applies factual corrections and resolves findings from existing evidence. Turn a finding into one conversational question only when it exposes a genuine human-owned ambiguity or choice. Give the human a concise current summary and focused decisions rather than raw reviewer output or a long artifact to inspect.

## Close the gate

The coordinator synthesizes findings rather than accepting them mechanically. For alignment, resolve findings from inspection or through the ongoing conversation, then rerun the scope and consistency checks. Surface only a genuine human-owned decision. For plan, implementation, and delivery findings, fix and re-review, defer with an explicit reason the human can approve, or surface the underlying decision. Rerun dependency checks for plans and the repository's expected regression checks for implementation and delivery, plus any scenario-specific check needed to exercise the actual user, runtime, deployment, or failure path.

Bind review evidence to an exact target: an artifact revision, commit or range, or working-tree diff fingerprint. Any target change makes the review stale and requires another independent pass; a purely mechanical change can use the configured lightweight route. For durable work, record each completed pass in a separate `review-evidence.md` beside the workflow artifacts, including the target, lenses and routes, finding dispositions, validation, and residual risk. Treat this evidence log as operational metadata outside the reviewed target and deliverable diff; do not amend reviewed alignment, plan, or code merely to record the result. Keep raw reviewer transcripts out of the workflow.

At an alignment checkpoint, present the current shared understanding, any material correction from independent analysis, and the remaining human-owned decision. For plan, implementation, and delivery checkpoints, summarize the reviewed target, review strategy, closed or deferred findings, validation evidence, and remaining risk. If independent review is unavailable, state the blocker and do not present the completed summary or artifact for approval until review is available.
