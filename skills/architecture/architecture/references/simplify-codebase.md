# Simplify a Codebase

Read this when code structure repeats decisions or adds layers without hiding useful knowledge. Moving files or adding abstractions is not simplification by itself.

A useful module hides decisions callers would otherwise repeat. An abstraction is too thin when using it requires nearly as much knowledge as its implementation. Add a name only when it captures behavior already present.

## Explore

Read the affected code, tests, nearby documentation, and relevant history. Look for repeated rules, ordering, errors, ownership, or coordinated changes; pass-through wrappers; behavior split so no place owns it; helpers extracted only for test access while the workflow remains untested; and performance or operational limits hidden by a layer.

In a broad area, inspect representative paths first and expand only when the same pressure repeats. A pattern usually needs three examples; two high-risk call sites can be enough. Finish exploration when every candidate has file evidence and a precise statement of the knowledge those places repeat. Recommend waiting when the evidence is weak.

## Present candidates

Choose the smallest move that removes the repeated knowledge:

- **Delete** useless indirection or behavior-free tests.
- **Inline** an abstraction that costs callers more than it hides.
- **Merge** pieces that own one behavior and change together.
- **Deepen** a module so a small interface owns a real workflow.
- **Wait** when too few examples reveal the right shape.
- **Add a seam** only for real variation, a required boundary, or a realistic local substitute. Read [seams-tests-and-notes.md](seams-tests-and-notes.md) before proposing one.

Lead with the strongest candidate. For each worthwhile option, give the evidence, move, knowledge removed, main risk, and reversible first step. Use [presentation.md](presentation.md) when a before/after view would make the consolidation materially clearer. Ask which candidate the user wants to explore; do not design an interface yet.

## Design the chosen move

State the behavior to own, knowledge callers should lose, constraints, migration risk, and stable behavior tests. Read [seams-tests-and-notes.md](seams-tests-and-notes.md) if dependencies or tests are not straightforward.

For a clear delete, inline, or merge, give the direct design. Otherwise read [interface-design.md](interface-design.md) and compare only credible alternatives. Recommend one path, what to remove first, which stable behavior tests replace internal tests, and the smallest reversible step.

Stop at the recommendation. Ask whether the user wants implementation or an architecture note. Write a note only if approved, using [seams-tests-and-notes.md](seams-tests-and-notes.md).
