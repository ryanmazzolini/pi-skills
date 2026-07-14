---
name: "agent-coordination"
description: "Choose configured model and reasoning routes for delegated agents. Use before calling delegate, especially when deciding whether work is lightweight, balanced, or deep."
---

# Agent Coordination

Use this only in the parent coordinator. The extension owns execution mechanics; this skill owns model-routing judgment.

## Load Routing Configuration

Before selecting a delegated model or reasoning level, read `~/.pi/agent/agent-routing.json` once for the current coordination task.

- An explicit user model or reasoning choice wins.
- If the file is absent or invalid, omit `model` and `reasoning` so `delegate` inherits the parent route.
- Treat configured fallbacks as availability recovery, not as extra attempts after a task failure.

## Classify the Task

Choose the least expensive category that can complete the work reliably.

- **Lightweight**: bounded lookup, search, inventory, extraction, mechanical transformation, or a narrow check with clear success criteria.
- **Balanced**: implementation, debugging, ordinary code review, or multi-file work that requires judgment but has established patterns.
- **Deep**: architecture, security, ambiguous cross-context synthesis, high-risk decisions, or work whose failure would be expensive.

Move up one category when scope, ambiguity, or risk materially exceeds the category description. Do not move up merely because the parent uses a stronger model.

## Resolve the Route

1. Select the category from the task shape.
2. Use its configured `primary` route.
3. Pass that exact `model` and `reasoning` to `delegate`.
4. Use the next configured fallback only after an explicit model availability, authentication, or capability error.
5. If agents in one batch require different categories, use separate `delegate` calls because batch resources are shared.

Follow the `delegate` and `delegate_control` tool guidance for lifecycle, waiting, and delivery. Do not duplicate status requests or poll for completion.
