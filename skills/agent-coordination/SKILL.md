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

## Shape the Work

Before choosing a route, decide whether the work has independent partitions whose results are cheaper to combine than asking one agent to inspect everything. Lookup, extraction, source review, summarization, distillation, bounded analysis, and independent review lenses often split well. Sequential decisions, shared evolving state, and tightly coupled implementation usually do not.

Fan out to the natural partitions. For independently inspectable sources or artifacts with compact results, prefer one task per item. Group items only when they share context or per-result overhead would make one task per item wasteful. Do not impose an arbitrary smaller batch or create duplicate work to fill the available concurrency. Put partitions with the same model, reasoning, skills, tools, context, cwd, and workspace mode into as few `delegate({ tasks: [...] })` calls as the current batch limit permits. Use separate delegate calls only when that limit requires it or the partitions' resources differ.

Give each agent a bounded question and ask for only the evidence or findings needed for synthesis. The parent combines the results first. Escalate only when synthesis itself requires stronger judgment or leaves a cross-cutting question that does. Do not rerun every partition.

## Select the Route

1. Match each task or homogeneous batch to the named profile whose description fits its contract.
2. Choose a recommended model and reasoning pair using the policy's selection rules.
3. Pass that exact `model` and `reasoning` to `delegate`.
4. Do not treat other recommendations as availability fallbacks.
5. If agents require different routes or resources, use separate `delegate` calls because batch resources are shared.

Follow the `delegate` and `delegate_control` tool guidance for lifecycle, waiting, and delivery. Do not duplicate status requests or poll for completion.
