# Tiger Team Worktrees

Use deterministic ticket-workspace folders for parallel writers and durable work. Temporary task workspaces are for small review-before-apply changes, not tiger-team branches.

## Naming

Ticket folder:

```text
<workspace-root>/worktrees/<ticket-slug>/
```

Work-unit worktree:

```text
<ticket-folder>/<repo>-<work-unit-slug>/
```

Work-unit branch:

```text
<type>/<ticket-id>/<short-description>-<work-unit-slug>
```

Examples:

```text
~/personal/worktrees/sc-12345-short-description/pi-skills-auth/
feat/sc-12345/short-description-auth

~/git/worktrees/gh-987-short-description/web-checkout-ui/
feat/gh-987/short-description-checkout-ui

~/git/worktrees/gh-owner-repo-987-short-description/api-concourse-deploy/
chore/gh-owner-repo-987/short-description-concourse-deploy
```

Integration worktree/branch:

```text
<ticket-folder>/<repo>-integrate/
<type>/<ticket-id>/<short-description>-integrate
```

## Creation Rules

1. Reuse an existing matching worktree if it points at the intended repo and its status is safe for the work unit.
2. Propose paths, branches, and base ref before creating worktrees unless the user already approved tiger-team worktree creation.
3. Create from the approved base ref, usually the parent worktree's `HEAD`.
4. Use semantic suffixes (`-auth`, `-checkout-ui`, `-concourse-deploy`, `-integrate`) rather than nested branch paths under the main ticket branch; this avoids Git ref conflicts if `feat/sc-123/short-description` already exists.
5. Avoid sequence-numbered names like `slice-01-auth` unless the user explicitly wants ordered experiments. If names collide, make the slug more specific instead.
6. Ask before creating anything if the ticket id, ticket folder, base ref, branch type, or root path is ambiguous.

Command shape:

```bash
git worktree add -b <branch> <ticket-folder>/<repo>-<work-unit-slug> <base-ref>
```

## Local Commit Policy

Local commits make integration and review easier because the parent or integration worker can inspect, cherry-pick, merge, or range-diff work-unit branches.

Because repo rules require asking before commits:

- During alignment, ask whether local commits are approved for this tiger-team run.
- If approved, workers may create local commits only on their assigned work-unit branch, with Conventional Commit messages, and must not push or open PRs.
- If not approved, workers leave uncommitted diffs in their assigned worktree and report changed files.
- Integration/fix workers follow the same policy for the integration branch.

Approval for local tiger-team commits is not approval to push, PR, or commit unrelated parent-worktree changes.
