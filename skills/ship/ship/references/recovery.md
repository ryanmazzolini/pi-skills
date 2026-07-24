# Resume and Recovery

Treat context compaction as a cold resume. Use its summary only to find evidence.

## Locate the authority

Treat a workflow directory supplied by the caller as a locator. Classify it using [durable-context.md](durable-context.md) before any read or write; refuse it unless it is a relevant legacy workflow under an allowed legacy root or the workspace profile's canonical work item. Otherwise:

1. Search `PI_SKILLS_PLANS_ROOT`, repository `.plans/` or `.plan/`, and `docs/plans/` for one relevant legacy workflow. Reuse it in place; ask when several match. For a repository `.plans/` match, also apply the migration offer in [durable-context.md](durable-context.md).
2. When no relevant legacy workflow exists, follow [durable-context.md](durable-context.md) to resolve the workspace profile.
3. Read the vault's instructions and project index, then find the one work-item `index.md` whose ticket or approved slug identifies the current work and whose workspace also matches. Never recover by workspace equality alone; ask for the current identity when it is unknown, and fail rather than choosing among multiple matches.

For vault-native work, resolve each target through the helper in [workflow-profiles.md](workflow-profiles.md) before access. Read the work-item index first, resolve its canonical relative `Current` target within the work item, then read alignment or legacy `question.md`, plan, and directly linked review evidence. Read a file under `working/` only when the resolved index or current document points to it.

## Reconcile live state

Inspect the live repository, cwd, branch or worktree, run state, diffs, and recorded review or validation evidence. Reconstruct:

- the last approved goal and Now scope
- the current confirmed slice
- settled and open decisions
- completed and incomplete work
- the slices that can start based on their dependencies
- the next human checkpoint

Reconcile the files with the repository before editing. Recommend the smallest safe path to the next useful checkpoint. State uncertainty before any retry that could overwrite work, repeat an external side effect, or duplicate completed work.

For a legacy RPI workflow, preserve its files and content. Infer a proposed state and dependency graph from the evidence, then ask about ambiguous progress or dependencies before writing any migration. Do not bulk-migrate old workflows or provide an `rpi` alias.

Once the state is clear, return to the routing order in [../SKILL.md](../SKILL.md).
