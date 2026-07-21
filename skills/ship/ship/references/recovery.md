# Resume and Recovery

Treat context compaction as a cold resume. Use its summary only to find evidence.

If the workflow directory is unknown, resolve the plans root in this order: `PI_SKILLS_PLANS_ROOT`, an existing `.plans/` or `.plan/`, an existing `docs/plans/`, then `.plans/`. Find the relevant directory there. Read `alignment.md`, or a legacy `question.md`, and `plan.md` when present.

Then inspect the live repository, cwd, branch or worktree, run state, diffs, and recorded review or validation evidence. Reconstruct:

- the last approved goal and Now scope
- the current confirmed slice
- settled and open decisions
- completed and incomplete work
- the slices that can start based on their dependencies
- the next human checkpoint

Reconcile the files with the repository before editing. Recommend the smallest safe path to the next useful checkpoint. State uncertainty before any retry that could overwrite work, repeat an external side effect, or duplicate completed work.

For a legacy RPI workflow, preserve its files and content. Infer a proposed state and dependency graph from the evidence, then ask about ambiguous progress or dependencies before writing any migration. Do not bulk-migrate old workflows or provide an `rpi` alias.

Once the state is clear, return to the routing order in [../SKILL.md](../SKILL.md).
