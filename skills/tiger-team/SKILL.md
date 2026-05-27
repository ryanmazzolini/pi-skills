---
name: tiger-team
description: Orchestrate pi-subagents for planned implementation work: deterministic ticket worktrees, parallel implementers, integration, xhigh review, optional security scrutiny, and focused fix loops.
---

# Tiger Team

Use this when the user wants planned work implemented by a small team of specialized subagents. The parent session stays in charge of decomposition, integration, review synthesis, and user decisions.

First run `subagent({ action: "list" })` and use only listed executable agents.

## Non-Negotiables

- Parent decomposes the work; do not launch a planning subagent just to split slices.
- Use durable ticket worktrees by default, not `subagent(..., worktree: true)` temp worktrees.
- Parallel writers get separate worktrees. Integration/fix work uses one explicitly chosen worktree at a time.
- Children must not run subagents or invent alternate paths/branches.
- Escalate unapproved product, API, architecture, scope, or conflict decisions through `contact_supervisor`/intercom.
- No push or PR from tiger-team agents. Local commits are allowed only after the parent explicitly says the user approved local commits for this tiger-team run.

## Defaults

- Implementers, integration workers, fix workers: `openai-codex/gpt-5.5:low`
- Reviewers/validators: `openai-codex/gpt-5.5:xhigh`
- Max implementer slices: 3 unless the user approves more.
- Max review rounds: 3; stop earlier when no fixes worth doing now remain.
- Testing: implementers use an 80/20 hint — add or run the focused checks most likely to catch regressions, not exhaustive scaffolding.

## Worktrees

Use the current ticket-worktree folder when available:

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
3. **Implement** — launch `worker` subagents in parallel with task-level `cwd` set to each durable worktree. Do not set top-level `worktree: true`.
4. **Integrate** — inspect slice diffs/commits. Apply straightforward changes yourself or launch one low-model integration worker. Ask the user before resolving conflicting product/API/architecture choices.
5. **Review** — after an integrated diff exists, launch fresh-context xhigh reviewers for correctness/regressions and maintainability/decoupling/idiomatic code. Add a security reviewer with `security-review` when risk warrants it.
6. **Fix loop** — synthesize reviewer feedback; apply only fixes worth doing now with one low-model fix worker; re-review material fixes.
7. **Finalize** — inspect the final diff yourself, summarize worktrees/branches, validation, remaining risks, deferred feedback, and recommended next step.

## Skill Injection

Pass relevant skills via the `skill` parameter:

- React/Next/UI: `frontend-react`, `nextjs-app-router`, `typescript`, `hci`
- Ruby/Rails/Sorbet: `ruby-sorbet-rails`
- TypeScript/backend: `typescript`
- Architecture/API: `architecture-review`, `design-an-interface`
- Security-sensitive changes: `security-review`

Security review is warranted for auth/authz, tenant/resource boundaries, secrets/PII/tokens, webhooks, public endpoints, billing/quota/abuse controls, external input to dangerous sinks, CI/CD, GitOps, deploy/release/package workflows, or dependency execution.

Read [references/prompt-contracts.md](references/prompt-contracts.md) when writing child prompts.
