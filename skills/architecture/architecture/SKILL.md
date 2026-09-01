---
name: "architecture"
description: "Route architecture work to the right lens. Use when shaping a code change, choosing a data structure, designing a module interface, simplifying code structure, reviewing system trade-offs or relational database concurrency, choosing the simplest sufficient implementation, or clarifying domain language."
license: "MIT; portions adapted from mattpocock/skills and DietrichGebert/ponytail"
---

# Architecture

Inspect the live code, tests, documentation, and recent decisions first. Route the current question to the smallest matching branch and read that reference first. Follow its conditional pointers only when their stated conditions apply. Combine branches only when the current decision genuinely needs both.

- **Shape a change:** read [references/shape-a-change.md](references/shape-a-change.md) when the experience is settled but data, rules, local interfaces, or code structure are not.
- **Choose a data structure:** read [references/data-structures.md](references/data-structures.md) when a consequential representation or access pattern needs comparison.
- **Design an interface:** read [references/interface-design.md](references/interface-design.md) when a module boundary or public API needs meaningfully different options.
- **Simplify existing code:** read [references/simplify-codebase.md](references/simplify-codebase.md) when looking for repeated decisions, needless layers, misplaced seams, or mock-heavy tests.
- **Review a system:** read [references/system-review.md](references/system-review.md) for architecture decisions, migrations, scaling, rollout, or operational risk.
- **Review relational database concurrency:** read [references/relational-databases/concurrency.md](references/relational-databases/concurrency.md) when transactions can overlap on shared state or a change affects isolation, locking, contention, or retries.
- **Choose an implementation:** read [references/simplest-sufficient-change.md](references/simplest-sufficient-change.md) immediately before implementing a settled behavior.
- **Clarify domain language:** read [references/domain-language.md](references/domain-language.md) when domain terms are ambiguous, overloaded, or inconsistent.

Across branches, lead with the recommendation or current decision, then expose evidence and mechanics under named sections so the reader can drill in. If spatial layout or comparison would materially improve judgment, read [references/presentation.md](references/presentation.md). Stop at the branch's checkpoint instead of carrying architecture work into implementation without approval.
