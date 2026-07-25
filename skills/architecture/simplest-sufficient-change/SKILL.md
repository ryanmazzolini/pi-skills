---
name: "simplest-sufficient-change"
description: "Choose the simplest sufficient solution. Use before implementing a code change after its required behavior is understood."
license: "MIT; adapted from DietrichGebert/ponytail"
---

# Simplest Sufficient Change

Use this after the required behavior and touched flow are understood. It simplifies the solution, not the legwork.

Choose the first rung that fully satisfies the approved target benefit:

1. Satisfy it with existing behavior or configuration.
2. Reuse code or a pattern already in the repository.
3. Use the standard library or native platform.
4. Use an installed dependency.
5. Write the smallest local implementation.
6. Introduce a new dependency or abstraction for requirements beyond what the earlier rungs provide.

**Sufficient** includes explicit requirements and the risk controls the change needs: trust-boundary validation, data-loss protection, security, accessibility, required compatibility, and verification proportional to risk.

Defer speculative flexibility. Each added file, dependency, abstraction, configuration point, and extension point must trace to the current change.

Done when the selected rung is the earliest one that satisfies the contract and every new concept pays for itself now.
