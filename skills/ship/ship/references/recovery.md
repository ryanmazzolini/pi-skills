# Resume and Recovery

Treat context compaction as a cold resume. Use its summary only to locate evidence.

## Locate the authority

Treat a supplied workflow directory as a locator. Classify it with [durable-context.md](durable-context.md) before access; refuse it unless it is a relevant legacy workflow under an allowed legacy root or the workspace profile's canonical work item. Otherwise:

1. Search `PI_SKILLS_PLANS_ROOT`, repository `.plans/` or `.plan/`, and `docs/plans/` for one relevant legacy workflow. Reuse it in place and ask when several match.
2. When no relevant legacy workflow exists, follow [durable-context.md](durable-context.md) to resolve the workspace profile.
3. Read vault instructions and the project index, then find the one work-item index whose ticket or approved slug identifies the work and whose workspace also matches. Never recover by workspace equality alone.

For vault-native work, resolve each target through [workflow-profiles.md](workflow-profiles.md). Read the work-item index first and then its canonical `Current` target. Read alignment, delivery plan, roadmap, review evidence, or files under `working/` only when the index or current document points to them.

A direct change may have no workflow files. In that case, reconcile the explicit user request and conversation with the live repository, branch, worktree, diff, tests, external delivery state, and any approved implementation route. If that evidence establishes one clear continuation, resume it through Ship. Ask rather than inventing scope when it does not.

## Reconstruct the route

Inspect live repository state, run state, diffs, and recorded review or validation evidence. Reconstruct only what applies:

- **Direct:** requested benefit, observable completion, existing edits, remaining work, approved implementation route, and next checkpoint.
- **Aligned:** target benefit, deferred outcomes, settled and open decisions, post-alignment design and delivery route, and route approval.
- **Planned:** approved benefit, completed delivery changes, dependency-derived ready changes, and current implementation-route confirmation.
- **Roadmap:** shared destination, milestone results, dependency-derived ready milestones, changed parent decisions, and next human checkpoint.

Reconcile files with live evidence before editing. Recommend the lightest safe route forward. Duration, a branch, or a PR does not promote a clear direct continuation into alignment or planning. When current route approval cannot be recovered or a skipped-step reason no longer holds, return to Ship's implementation-route checkpoint before production edits.

For a legacy RPI workflow, preserve its files and content. Infer a proposed route and dependency graph from evidence, then ask about ambiguous progress or dependencies before writing any migration. Do not bulk-migrate old workflows or provide an `rpi` alias.

State uncertainty before any retry that could overwrite work, repeat an external side effect, or duplicate completed work. Once state is clear, return to [Ship](../SKILL.md).
