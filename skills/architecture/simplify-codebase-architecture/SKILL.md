---
name: "simplify-codebase-architecture"
description: "Find refactors that remove repeated decisions and needless layers. Use when simplifying code structure, questioning an abstraction, bringing code that changes together under one module, or reducing mock-heavy tests."
---

# Simplify Codebase Architecture

Make the code easier to understand and change by removing knowledge that several places must carry. Moving files or adding layers is not simplification by itself.

A useful module hides decisions callers would otherwise repeat. An abstraction is too thin when using it requires nearly as much knowledge as its implementation. Add a name only when it captures behavior already present in the code.

## Explore

Read the affected code, tests, nearby documentation, and relevant recent history. Follow evidence, not a preferred pattern. Look for repeated rules, ordering, error handling, ownership, or coordinated changes; pass-through wrappers; behavior split so no place owns it; helpers extracted only for test access while the workflow remains untested; and performance or operational limits hidden by a layer.

In a broad or unfamiliar area, inspect a few representative paths first. Expand only when they show the same pressure. A pattern usually needs three examples; two high-risk call sites can be enough. Stop when each candidate you plan to present has file paths and a clear statement of the knowledge those places repeat. If the evidence is weak, recommend waiting.

## Classify and present candidates

Choose the smallest move that removes the repeated knowledge:

- **Delete** useless indirection or behavior-free tests.
- **Inline** an abstraction that costs callers more than it hides.
- **Merge** pieces that own one behavior and change together.
- **Deepen** a module so a small interface owns a real workflow.
- **Wait** when too few examples show the right shape.
- **Add a seam** only for real variation, a required boundary, or a realistic local substitute. Read [REFERENCE.md](REFERENCE.md) before proposing one or choosing an unusual dependency or testing strategy.

Present a short, ranked list of the strongest candidates. For each, give the evidence, proposed move, what it removes, main risk, and a reversible first step. Ask which one the user wants to explore. Do not design an interface before the user chooses.

## Design the chosen move

State the behavior to own, the knowledge callers should lose, the constraints and migration risk, and the stable behavior the tests should cover. Read [REFERENCE.md](REFERENCE.md) if the dependencies or tests need its guidance.

For a clear delete, inline, or merge, give the direct design. Offer two or three designs only when their trade-offs are real. For each design, describe the interface, errors, side effects, and non-obvious rules; what callers no longer need to know; the dependency and test approach; and failure modes. Show a short caller example when the interface changes.

Recommend one path. Say why it fits this codebase, what to delete or merge first, which stable behavior tests replace old internal tests, and the smallest reversible first step.

Ask whether the user wants an implementation plan or a local architecture note. Wait for confirmation before changing production code, tests, interfaces, configuration, or durable documentation. Write a note only if the user chooses one, using the template in [REFERENCE.md](REFERENCE.md).
