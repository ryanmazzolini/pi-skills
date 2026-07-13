---
name: "architecture-review"
description: Cross-cutting architecture review lens for system design, rollout risk, and operability. Use when evaluating design tradeoffs, migrations, or scaling concerns.
---

# Architecture Review

## Priorities

- Optimize for correctness, operability, and safe change over cleverness
- Prefer deletion or simplification before adding new moving parts
- Choose proven technology unless a new option has a clear measured advantage

## Defaults

- Define rollout and rollback paths before implementation
- Make shared contracts explicit and versioned at service or API boundaries
- Add observability where failures would otherwise be silent or slow to diagnose

## Review Questions

- What breaks at 10x load, data volume, or team usage?
- How will we detect failure and recover safely?
- What is the smallest change that solves the real problem?

## Related Skills

- Use `ship` when the change needs durable alignment, implementation planning, or work across sessions
