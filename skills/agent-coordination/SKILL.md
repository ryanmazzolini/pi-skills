---
name: "agent-coordination"
description: "Choose configured model and reasoning profiles for delegated agents. Use before calling `delegate`."
---

# Agent Coordination

Use this only in the parent coordinator. The extension owns execution mechanics; this skill owns model-routing judgment.

## Load Routing Policy

Before selecting a delegated model or reasoning level, read `~/.pi/agent/agent-routing.md` once for the current coordination task.

- An explicit user model or reasoning choice wins.
- If the file is absent or unusable, omit `model` and `reasoning` so `delegate` inherits the parent route.

## Select the Route

1. Match the work to the named profile whose description fits its contract.
2. Choose a recommended model and reasoning pair using the policy's selection rules.
3. Pass that exact `model` and `reasoning` to `delegate`.
4. Do not treat other recommendations as availability fallbacks.
5. If agents in one batch require different routes, use separate `delegate` calls because batch resources are shared.

Follow the `delegate` and `delegate_control` tool guidance for lifecycle, waiting, and delivery. Do not duplicate status requests or poll for completion.
