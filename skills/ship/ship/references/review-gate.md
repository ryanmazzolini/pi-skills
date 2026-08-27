# Adaptive Delivery Review Gate

The Ship coordinating thread owns review strategy. Get at least one independent review of the final integrated code-bearing target before its first delivery boundary: presenting a final branch for pull-request creation or update, pushing directly to the default branch, releasing, or deploying. Reuse that evidence at later boundaries while the code-bearing target and material risk remain unchanged. Local commits, alignment, plans, and intermediate implementation checkpoints do not need independent review by default.

Use independent review earlier only for a named uncertainty or risk that is cheaper to challenge before delivery, or when an intermediate delivery change is independently deliverable or materially high-risk. A blocking question, alignment update, progress report, or local checkpoint does not need this gate.

## Choose enough review

Choose the lenses, reviewer count, model, reasoning depth, and order from how new, hard to reverse, wide-reaching, or visible the work is; what can fail; the strength of validation; and earlier findings. Load `agent-coordination` before choosing delegated routes. Do not hardcode model names here.

Delegated reviewers do not inherit ambient skills. Before each delegate call, choose the skills that define the review criteria and pass every applicable name through `delegate.skills`. Include `code-review` for a final code-bearing review. Add relevant language, framework, and lens-specific skills, such as `security-review` for a security lens, `frontend-hci-review` for a user flow, or `writing-for-agents` for agent instructions. Do not rely on task prose asking the reviewer to load a skill that was not provided.

Use the smallest review that can credibly challenge the result. When the target has independent risk surfaces or evidence partitions, dispatch focused read-only reviewers in parallel and synthesize their findings. Keep one holistic lens when cross-cutting behavior is itself a risk. Do not create duplicate lenses merely to increase the reviewer count.

- A narrow mechanical delivery may need one lightweight review of intended behavior and unintended changes.
- Ordinary implementation needs coverage of accepted behavior, correctness, regressions, and whether validation reaches the real user or system boundary. Use one reviewer when the target is narrow enough to cover those together; otherwise split distinct behavior, validation, UX, maintainability, or compatibility lenses when each could change the result.
- Destructive, concurrent, security-sensitive, release, or migration work may need several independent lenses, deeper reasoning, earlier hazard review, or a dedicated security reviewer.

Reviewers start with fresh context and work read-only. Pass an explicit inspection-only tool allowlist and omit `edit` and `write`. When a reviewer needs `bash`, limit it to non-mutating inspection or validation in disposable temporary infrastructure. Give reviewers the approved alignment or other authority that defines correctness, the exact code-bearing target, one clear lens, relevant repository guidance, and available validation. Review the integrated result rather than isolated agent outputs.

## Review earlier selectively

The coordinator verifies facts and deterministic checks; the human owns requirements, design, and approval. Do not delegate broad alignment or tactical plan reviews by default.

When one ambiguity, assumption, dependency, or hazard could invalidate later work, delegate that named question with a focused lens. Keep findings at the level of the question. Do not turn selective review into implementation design or another artifact-approval gate.

## Close findings proportionally

Synthesize findings instead of accepting them automatically. Fix valid findings, defer them only with a clear reason the human can approve, and ask one focused question when the underlying choice belongs to the human. For selective alignment review, rerun scope and consistency checks; for plan review, rerun scope and dependency checks. For implementation and delivery, run the repository's expected regression checks plus any check needed to exercise the actual user, runtime, deployment, or failure path.

Re-review only when a fix materially changes accepted behavior, the risk profile, a public boundary, or an assumption or conclusion on which the review depended. The coordinator may inspect and validate a narrow or mechanical fix without another independent pass. Changes only to tests, review evidence, workflow status, commit metadata, or pull-request text do not by themselves stale a code review; reassess when such a change exposes a behavior or risk mismatch.

Bind review evidence to the reviewed commit or range, or to a working-tree diff fingerprint. Record later changes, why they were material or nonmaterial, and any resulting validation. Evidence remains current through documented nonmaterial changes; material changes require a new pass.

For durable work, record each completed pass in `review-evidence.md` beside the workflow files. For a vault-native work item, resolve the review-evidence target through the helper in [workflow-profiles.md](workflow-profiles.md) before writing it. Include the exact target, review lenses, selected skills and routes, findings and their resolution, post-review changes, validation, and remaining risk. This is a working record, not part of the reviewed target or deliverable diff. Keep raw transcripts out of the workflow.

## Present the result

At a final code-bearing delivery checkpoint, start with the review outcome. Name the reviewed target and review approach. Then state validation and any finding, approved deferral, post-review change, or remaining risk that affects delivery. Use a few connected sentences rather than a fixed report template.

If required independent review is unavailable, state the blocker and stop before the delivery action. Do not block alignment, planning, or local commits solely because independent review is unavailable.
