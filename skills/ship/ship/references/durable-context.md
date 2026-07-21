# Durable Context

Read this when Ship creates or locates a durable workflow. Use local workflow files to decide current state. Keep only the small, lasting summary future work needs in the notes vault.

## Find the workflow

Resolve the plans root in this order:

1. `PI_SKILLS_PLANS_ROOT` when set
2. an existing `.plans/` or `.plan/`
3. an existing `docs/plans/`
4. `.plans/` for new work

Reuse the relevant workflow directory. New work normally starts with `alignment.md` and gains `plan.md` after alignment. When a legacy workflow has `question.md` instead of `alignment.md`, keep and read it; do not rename it only to modernize the workflow.

Keep the workflow files current rather than treating them as transcripts. Do not add a separate status file or stage flags.

## Read project context

Map the repository to a notes vault:

- a repository under `~/git/` maps to `~/work-notes`
- a repository under `~/personal/` maps to `~/personal/notes`
- when neither rule fits, ask which vault to use

Follow the vault's local instructions. Before new alignment, inspect `projects/<repo-name>/`: read `index.md` first when it exists, then only recent notes relevant to this work. Briefly say what useful context you found, or that the project folder does not exist.

Vault notes do not replace repository inspection or workflow files. Keep implementation history, review logs, and recovery detail in the workflow directory; reserve the vault for the final summary.
