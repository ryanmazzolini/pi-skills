# Stacked Pull Requests

Use this reference only after the delivery topology is known to be a GitHub pull-request stack.

## Select a stack deliberately

A standalone pull request is the default. Use a stack only when the user requests one, the branch already belongs to one, or an approved delivery plan explicitly names a dependent PR chain because later work must build on an unmerged lower layer. A large diff, several commits or worktrees, or several independent PRs does not by itself justify creating a stack.

All stack branches must be in the same repository. The bottom layer targets the trunk, and each higher layer targets the branch directly below it. Keep dependencies downward: a layer may depend on its own branch or a lower layer, never a higher one.

## Manage the selected topology

GitHub's native stacked pull requests are in public preview. Follow the current [GitHub documentation](https://docs.github.com/en/pull-requests/how-tos/stacked-pull-requests) rather than assuming CLI behavior is stable.

- For a locally tracked stack, inspect `gh stack view --json` and prefer native `submit`, `sync`, `rebase`, and `push` operations over manual base edits or individual force-pushes.
- When `ticket-workspace` keeps layers checked out in separate worktrees, preserve that external branch management and use `gh stack link <bottom> ... <top>` for the remote stack, passing every branch or PR in bottom-to-top order so GitHub derives the correct bases. Do not add local tracking whose navigation and cascading rebase operations expect to check out those branches.
- Run agent-driven commands non-interactively: use `gh stack view --json`, `gh stack submit --auto`, and explicit branch or PR arguments for commands that otherwise prompt. After `submit --auto` or `link` creates PRs with generated metadata, apply the approved titles and bodies and verify them again.
- Do not install the `github/gh-stack` extension or convert ordinary dependent PRs into a native stack without approval.
- Include every branch and PR an operation can push, create, update, relink, rebase, or merge in one existing confirmation. Approval covers exactly that listed set; do not add a confirmation turn per layer.
- When a lower layer changes, update later layers in order and rerun affected focused checks. Leave conflicts or diverged local and remote topology unresolved rather than choosing a source of truth silently.
- Create new PRs as drafts unless the user explicitly approves ready-for-review state. Verify stack order, each base, PR metadata, and draft state after submission.

## Validate the integrated result

Apply [Ship's review gate](../../ship/ship/references/review-gate.md) to the cumulative trunk-to-top result. Treat each layer as an independent PR diff, but run or reuse exhaustive regression checks and broad review once for the integrated target. Give layers focused boundary checks and distinguish those from shared stack evidence in each `Testing` section.
