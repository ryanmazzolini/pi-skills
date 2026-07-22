# Adaptive Review Gate

The Ship coordinating thread owns review strategy. Before presenting a completed alignment summary or asking the human to approve a plan, implementation, or delivery result, get at least one independent review of its current form. A blocking question, short alignment update, or progress report does not need this gate.

## Choose enough review

Choose the lenses, reviewer count, model, reasoning depth, and order from how new, hard to reverse, wide-reaching, or visible the work is; what can fail; the strength of validation; and earlier findings. Load `agent-coordination` before choosing delegated routes. Do not hardcode model names here.

Use the smallest review that can credibly challenge the result:

- Narrow mechanical work may need one lightweight review to check the intended behavior and unintended changes.
- Ordinary implementation usually needs one balanced review of accepted behavior, correctness, regressions, and whether validation reaches the real user or system boundary. Add a separate UX, maintainability, or compatibility lens only when it could change the result.
- Destructive, concurrent, security-sensitive, release, or migration work may need several independent lenses, deeper reasoning, earlier hazard review, or a dedicated security reviewer.

Reviewers start with fresh context and work read-only. Give them the current alignment or approved artifact that defines correctness, the exact target, one clear lens, relevant repository guidance, and available validation. Review the integrated result rather than isolated agent outputs.

## Keep alignment review at the alignment level

Alignment analysis helps the coordinator; it does not design implementation or create another document for the human to review. Look for unsupported assumptions, conflicting Now and Later scope, a missing primary experience, overlooked constraints, unclear observable behavior, premature solution choices, and open questions whose answers could change planning.

Code may provide evidence about current behavior or feasibility. Keep findings about requirements, experience, constraints, or necessary high-level direction. Do not propose files, APIs, schemas, components, classes, tasks, slices, dependencies, or implementation architecture.

The coordinator corrects facts from evidence. Ask the human only when a finding reveals a real human-owned ambiguity or choice, and ask one decision at a time. Do not expose raw reviewer output.

## Close every finding

Synthesize findings instead of accepting them automatically:

- Fix a finding and review the changed target again.
- Defer it only with a clear reason the human can approve.
- When the underlying choice belongs to the human, ask one focused question and wait.

For alignment, resolve findings through inspection or the ongoing one-question conversation, then rerun scope and consistency checks. For plans, rerun scope and dependency checks. For implementation and delivery, run the repository's expected regression checks plus any check needed to exercise the actual user, runtime, deployment, or failure path.

Bind review evidence to an exact artifact revision, commit or range, or working-tree diff fingerprint. Any target change makes prior review stale. A purely mechanical correction may use the configured lightweight route.

For durable work, record each completed pass in `review-evidence.md` beside the workflow files. For a vault-native work item, apply the target validator from [workflow-profiles.md](workflow-profiles.md) immediately before writing it. Include the exact target, review lenses and routes, how findings were resolved, validation, and remaining risk. This is a working record, not part of the reviewed target or deliverable diff; do not change reviewed alignment, planning, or code merely to record it. Keep raw transcripts out of the workflow.

## Present the result

At an alignment checkpoint, give the current shared understanding, any important correction, and the one remaining human decision or approval question. For plan, implementation, and delivery checkpoints, summarize the exact target, review approach, closed or approved deferrals, validation, and remaining risk.

If independent review is unavailable, state the blocker and stop before presenting the work as complete or asking for approval.
