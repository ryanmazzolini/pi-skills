---
name: "design-an-interface"
description:
  Generate multiple meaningfully different interface designs for a module or API and compare
  tradeoffs. Use when designing module boundaries or public APIs, or to "design it twice" before
  implementation.
license: "MIT; adapted from mattpocock/skills"
---

# Design an Interface

Design the boundary from the caller's point of view before implementing it. Aim for a small interface that hides the hard parts.

## Work

1. Inspect the codebase to understand the problem, callers, common operations, current conventions, and constraints. Ask only about choices the code cannot answer.
2. Sketch two or three credible interfaces with meaningfully different shapes or ownership. For each, show the contract, a short usage example, what it hides, and its main cost. Do not add an alternative that could not reasonably win.
3. Compare only the differences that affect this decision, such as caller effort, correct use, misuse, testing, compatibility, or future change.
4. Lead with the recommended interface and why it wins. Then show the alternatives and important tradeoffs. If a hybrid is best, show its concrete interface.
5. Ask which direction the user wants. Do not implement it until the user explicitly asks.

Favor the common caller path and keep lifecycle, dependencies, policy, and other internal complexity behind the boundary when possible.
