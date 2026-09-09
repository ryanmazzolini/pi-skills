# Simplest Sufficient Change

Read this after the required behavior and touched flow are understood. It simplifies the solution, not the investigation.

Choose the first rung that fully satisfies the approved target benefit:

1. Satisfy it with existing behavior or configuration.
2. Reuse code or a pattern already in the repository.
3. Use the standard library or native platform.
4. Use an installed dependency.
5. Write the smallest local implementation.
6. Introduce a new dependency or abstraction only for requirements the earlier rungs cannot meet.

**Sufficient** includes explicit requirements and necessary risk controls: trust-boundary validation, data-loss protection, security, accessibility, compatibility, and verification proportional to risk.

Prefer deleting or simplifying existing code when that best serves the approved user outcome. Retain complexity only for a current requirement or necessary risk control. Distinguish removing an implementation from retiring behavior: verify remaining use cases and the guarantees the removed code supplied. Explain intentional behavior removals and their reasons in the change context; seek approval when they exceed the agreed scope.

Add deprecation notices, compatibility layers, or transitional machinery only for a concrete consumer, contract, or rollout need. When no such need remains, remove the obsolete path cleanly rather than preserving it just because it existed.

Defer speculative flexibility. Every added file, dependency, abstraction, configuration point, and extension point must trace to the current change. Finish when the selected rung is the earliest one that satisfies the contract and every new concept pays for itself now.
