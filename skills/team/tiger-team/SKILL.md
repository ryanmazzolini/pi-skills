---
name: "tiger-team"
description: "Orchestrate planned implementation work with host-provided subagents or task agents: durable worktrees, parallel implementers, integration, high-scrutiny review, optional security review, and focused fix loops."
---

# Tiger Team

Use this when the user wants planned work implemented by a small team of specialized agents. The parent session stays in charge of decomposition, integration, review synthesis, and user decisions.

## Host Adapter

Use the best subagent mechanism the current host provides:

- **pi**: run `subagent({ action: "list" })` first and use only listed executable agents. Prefer durable ticket worktrees over `subagent(..., worktree: true)` temp worktrees.
- **Claude Code**: use the Task/subagent capability available in the session. If model or skill injection is not available, include the relevant skill names and files in each child prompt.
- **No subagent support**: do not fake parallelism. Run the same workflow sequentially and say which parallel steps are being collapsed.

## Non-Negotiables

- Parent decomposes the work; do not launch a planning subagent just to split slices.
- Use durable ticket worktrees by default when the repo/workflow has earned parallel writers.
- Parallel writers get separate worktrees. Integration/fix work uses one explicitly chosen worktree at a time.
- Children must not spawn more agents or invent alternate paths/branches.
- Escalate unapproved product, API, architecture, scope, or conflict decisions to the parent/user. If the host has child-to-parent channels such as intercom or `contact_supervisor`, use them.
- No push or PR from tiger-team agents. Local commits are allowed only after the parent explicitly says the user approved local commits for this tiger-team run.

## Defaults

- Implementers, integration workers, fix workers: use the host's fast/low-reasoning implementation model when configurable.
- Reviewers/validators: use the host's highest-scrutiny available reviewer model when configurable.
- Max implementer slices: 3 unless the user approves more.
- Max review rounds: 3; stop earlier when no fixes worth doing now remain.
- Testing: implementers use an 80/20 hint — add or run the focused checks most likely to catch regressions, not exhaustive scaffolding.

## Worktrees

Use the current ticket-workspace folder when available:

```text
<workspace-root>/worktrees/<ticket-slug>/
```

Slice worktrees use semantic names, not sequence numbers:

```text
<ticket-folder>/<repo>-<slice-slug>/
```

Slice branches append the same semantic slug to the main ticket branch name:

```text
feat/sc-12345/short-description-auth
fix/sc-12345/short-description-tests
feat/gh-987/short-description-ui
chore/gh-owner-repo-987/short-description-ci
```

Use specific slugs like `auth-api`, `checkout-ui`, or `concourse-deploy` when a short slug would collide. Avoid `slice-01` / `worker-a` style names unless the user explicitly asks for ordered experiments. Use `integrate` for the integration worktree/branch when needed:

```text
<ticket-folder>/<repo>-integrate/
feat/sc-12345/short-description-integrate
```

Read [references/worktrees.md](references/worktrees.md) before creating/reusing worktrees.

## Workflow

1. **Align** — summarize target, acceptance criteria, non-goals, and whether local commits are approved for this run. Ask one question if any of those are unclear.
2. **Slice** — define up to 3 independent implementation slices with assigned worktree, branch, relevant skills, validation expectation, and stop rules.
3. **Implement** — launch host-provided implementation agents in parallel when available, with each child scoped to one durable worktree. Do not use temporary worktrees unless the user explicitly prefers them.
4. **Integrate** — inspect slice diffs/commits. Apply straightforward changes yourself or launch one integration worker. Ask the user before resolving conflicting product/API/architecture choices.
5. **Review** — after an integrated diff exists, launch fresh-context high-scrutiny reviewers for correctness/regressions and maintainability/decoupling/idiomatic code. Add a security reviewer with `security-review` when risk warrants it.
6. **Fix loop** — synthesize reviewer feedback; apply only fixes worth doing now with one fix worker; re-review material fixes.
7. **Finalize** — inspect the final diff yourself, summarize worktrees/branches, validation, remaining risks, deferred feedback, and recommended next step.

## Skill Injection

When the host supports skill injection, pass relevant skills to child agents. Otherwise include the relevant skill names and file paths in the child prompt.

- All implementation and fix work: `simplest-sufficient-change`
- React/Next/UI: `frontend-react`, `nextjs-app-router`, `typescript`, `hci`
- Ruby/Rails/Sorbet: `ruby-sorbet-rails`
- TypeScript/backend: `typescript`
- Architecture/API: `architecture-review`, `design-an-interface`
- Security-sensitive changes: `security-review`

Security review is warranted for auth/authz, tenant/resource boundaries, secrets/PII/tokens, webhooks, public endpoints, billing/quota/abuse controls, external input to dangerous sinks, CI/CD, GitOps, deploy/release/package workflows, or dependency execution.

Read [references/prompt-contracts.md](references/prompt-contracts.md) when writing child prompts.
