# Implementation Wave

Use a wave only when one human-confirmed slice contains independent work units and parallel work is worth the cost of combining the results. Otherwise work synchronously or delegate one bounded task.

The Ship coordinating thread decides how work is split, how much runs at once, how results are combined, and what returns to the human. Agents stay inside their assigned part of the current slice. They do not advance later slices, spawn agents, decide product or architecture questions, push, or open pull requests.

Before dispatch:

- Confirm the ready slice and proposed wave with the human.
- Load `agent-coordination` and choose each route from the work's cost and risk.
- Give each agent the outcome, assigned work, acceptance criteria, non-goals, relevant evidence, allowed files or areas, validation, stop conditions, exact cwd, and workspace boundary.
- Put parallel writers in isolated workspaces. Use `ticket-workspace` for durable PR-shaped work and host-provided temporary workspaces for bounded review-before-apply changes. Inspect a temporary writer's exact revision before applying or discarding it.
- State whether the human approved a local commit. That permission covers only the assigned branch and never grants push or PR authority.

In Pi, use `delegate` for execution and `delegate_control` only for lifecycle operations.

Agents escalate product, API, architecture, scope, ownership, and conflict questions to the coordinator. Their handoff names changed files, diff or commit state, validation and results, risks, and decisions still needed.

The coordinator inspects and combines every result into one current target. Combine straightforward changes directly; return choices that affect behavior or scope to the human. Pushes and pull requests still need their own approval. After integration, apply [review-gate.md](review-gate.md) to the exact integrated target, not the separate work units.
