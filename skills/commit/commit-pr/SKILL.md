---
name: "commit-pr"
description: Create or update a draft pull request from the current branch, including a layer in a GitHub stacked pull request. Use when opening or updating a PR.
---

# Pull Request

## Workflow

1. Identify the delivery topology and expected base. Inspect the commits, branch or worktree tracking, and any existing PR. For a locally tracked stack, inspect `gh stack view --json`; for a branch chain managed in separate worktrees, inspect the approved chain and remote PR stack without adding local tracking. A non-default PR base alone does not prove GitHub stack membership. The bottom layer targets the stack's trunk, and each higher layer targets the branch directly below it.
2. Inspect `git diff <base>...HEAD --stat` and the full diff against that base. For a stack, inspect the order and status of every layer, but draft only from the current layer's diff. Resolve unexpected commits, files, bases, or dependencies. Treat existing PR metadata and test results as potentially stale.
3. Run focused checks while diagnosing problems. For a standalone PR, run the repository's expected regression checks for final validation. For a stack, treat the integrated top branch as the sole full-validation target: reuse current evidence when a content-preserving split leaves its cumulative diff and top tree unchanged; otherwise run the expected regression checks once there. Use only layer-specific checks elsewhere. Add another exhaustive run only for a concrete risk or repository requirement not covered by the integrated evidence, and record why. If an expected check is blocked or impractical, say exactly what did not run and why, then ask how to handle the gap. That decision does not replace review or PR approval.
4. Confirm the final code-bearing target has independent review under [the review gate](../../ship/ship/references/review-gate.md). For a stack, review the cumulative trunk-to-top diff once as the integrated target and reuse current evidence when that diff and its material risk are unchanged. Do not repeat the same broad review for each layer. Record any post-review changes and re-review only when the gate classifies the integrated change as material.
5. Trace the change end to end before drafting: the previous behavior, why it was insufficient, the resulting flow, important ordering or invariants, authority boundaries, relevant migration or rollout behavior, and explicit non-goals.
6. Draft a clear title and a self-contained body from the diff and commits against the base. Use `Description`, `Details`, and `Testing`. For a stacked layer, state its dependency or place in the stack when that context affects review. When an issue is available from the branch name or user context, use its ID as the Markdown link text, for example `[sc-123](...)`.
7. Show the full title and body for every PR whose metadata will be created or updated, each base branch, the stack order, the complete branch and PR set affected by the operation, review evidence, and validation status. Ask for one confirmation covering that exact set.
8. After explicit approval, push if needed and create or update the PR. Create new PRs as drafts. For a locally tracked stack, use native local `gh stack` operations; for branches managed in separate worktrees, use `gh stack link` without adopting local tracking. Verify the resulting bases, order, and PR state. Show the relevant PR URLs and offer next steps.

## Stacked pull requests

GitHub's native stacked pull requests are in public preview. Follow the current [GitHub stacked pull request documentation](https://docs.github.com/en/pull-requests/how-tos/stacked-pull-requests) rather than assuming the CLI behavior is stable.

- Treat each layer as an independent PR diff. Its title, description, and changed files describe only the change from the branch directly below it. Its `Testing` section distinguishes focused layer checks from evidence shared by the whole stack.
- Treat the cumulative diff from the trunk through the top branch as the integrated delivery target. Run or reuse one full regression suite and broad independent review there, then share that evidence across every unchanged layer. A content-preserving split of an already validated and reviewed diff normally needs focused boundary checks, not another exhaustive pass. Do not repeat exhaustive tests or broad reviews on each PR.
- Keep dependencies downward: a layer may depend on its own branch or a lower layer, never a higher one. All stack branches must be in the same repository.
- Prefer `gh stack view`, `submit`, `sync`, `rebase`, and `push` for a locally tracked stack. When `ticket-workspace` keeps layers checked out in separate worktrees, preserve that external branch management and use `gh stack link` for the remote stack instead of local tracking commands that check out or rebase its branches. Do not install the `github/gh-stack` extension or convert ordinary dependent PRs into a native stack without approval.
- Before any stack operation, enumerate every branch and PR it can push, create, update, relink, rebase, or merge in the existing confirmation. Approval covers exactly that listed set, without a separate approval turn per layer.
- Run agent-driven stack commands non-interactively: use `gh stack view --json`, `gh stack submit --auto`, and explicit branch or PR arguments for commands that otherwise prompt. After `submit --auto` or `link` creates PRs with generated metadata, apply the approved titles and bodies, then reverify the PR metadata.
- When lower-layer commits change, update later layers in order and rerun affected focused checks. Repeat the stack-wide regression suite or broad review only when the review gate classifies the integrated change as material. Stop for conflicts or diverged local and remote stack topology rather than choosing a source of truth silently.
- Ensure every newly submitted PR remains a draft unless the user explicitly approves ready-for-review state. After submission, verify the stack map, each base branch, and each PR's draft state.

## PR body

Treat the PR body as an interface for a reviewer who has not followed the discussion.

- `Description` — explain what happened before, why it mattered, and what behavior results from this change. State important scope boundaries.
- `Details` — explain the changed path end to end when sequencing, persistence, state transitions, concurrency, or migration behavior affects correctness. Use ordered steps for flows and bullets for separate facts. Introduce concepts in plain language before code identifiers.
- `Testing` — report validation from the current branch, relevant full-suite checks, boundary or migration exercises, and any omissions. Include screenshots or video for UI changes.

Keep simple changes short. Expand `Details` only when the reviewer needs the context to understand behavior or risk; prefer decisions and invariants over file-by-file narration.

Before presenting, account internally for every changed commit and file. Stop when a new reviewer can explain the old behavior, the reason for the change, the new flow, what remains unchanged or authoritative, relevant risks, and how validation exercises the result.
