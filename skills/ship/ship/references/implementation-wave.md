# Implementation Wave

Use a coordinated wave only when one confirmed slice contains independent work units whose parallelism is worth the integration cost. Otherwise implement synchronously or delegate one bounded task.

The coordinating thread owns decomposition, integration, review synthesis, and human decisions. Keep every work unit inside the confirmed slice; implementation agents do not advance later slices, spawn agents, push, or open pull requests.

Before dispatch:

- Load `agent-coordination` and select each route from the task's cost and risk.
- Give each agent the slice outcome, assigned work unit, acceptance criteria, non-goals, relevant context, allowed files or areas, validation expectation, and stop conditions.
- State the exact cwd and workspace boundary. Parallel writers use isolated workspaces. Let `ticket-workspace` own durable PR-shaped worktrees; use host-provided temporary workspaces for bounded review-before-apply changes. In Pi, use `delegate` for task execution and `delegate_control` only for lifecycle operations; review a temporary writer's exact revision before applying or discarding it.
- State whether the user approved local commits. Approval applies only to the assigned branch and never includes push or PR authority.

Agents escalate product, API, architecture, scope, ownership, and conflict decisions to the coordinator. Their handoff reports changed files, commit or diff status, validation commands and results, risks, and decisions still needed.

Inspect and integrate every result into one current target. Resolve straightforward integration mechanically; return consequential choices to the human. After integration, follow `review-gate.md` against the exact integrated target.
