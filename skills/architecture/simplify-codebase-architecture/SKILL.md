---
name: simplify-codebase-architecture
description:
  Find pragmatic refactor opportunities by reducing repeated knowledge, deleting shallow abstraction,
  and adding seams only when the code has earned them. Use when simplifying architecture,
  questioning abstractions, consolidating tightly coupled code, or making tests less mock-heavy.
---

# Simplify Codebase Architecture

Make the program simpler to understand and change. The goal is not more layers, more interfaces, or
more "clean" shapes. The goal is fewer concepts a maintainer must hold in their head while preserving
the behavior the product needs.

A refactor makes code semantically smaller when fewer places need to know the same rule, invariant,
ordering constraint, lifecycle decision, or error-handling behavior.

Read [LANGUAGE.md](LANGUAGE.md) for vocabulary. Read [REFERENCE.md](REFERENCE.md) when judging
whether an abstraction pays rent, classifying dependencies, or drafting a refactor note.

## Principles

- Prefer evidence-led simplification over pattern-led redesign.
- Prefer deleting, inlining, or merging proven complexity before adding a new seam.
- Accept some duplication while the shape is still unclear. Compress only after repeated knowledge is
  visible.
- A useful module hides decisions that callers would otherwise repeat. A pass-through module does
  not earn its keep.
- Treat the interface as everything callers must know: types, ordering, invariants, errors,
  configuration, performance, and side effects.
- Add new concepts or nomenclature only when the name lets maintainers stop carrying concrete
  details in their heads. A good name compresses existing behavior; it does not invent a category the
  code has not earned.
- Add a seam only when behavior actually varies, an I/O boundary forces it, or a realistic local
  substitute is needed at an existing boundary. A seam with one real adapter is probably speculation.
- Prefer tests that exercise stable behavior through the module interface over tests that mock
  internal choreography.
- Stop if the best answer is "do nothing yet." Not every rough edge deserves architecture work.
- Stop and confirm with the user before changing production code, tests, module structure, public
  interfaces, configuration, or durable docs.

## Process

### 1. Explore for pressure

Read the code, tests, nearby docs, and recent change history when useful. Let the investigation be
led by places where understanding or changing the code requires unnecessary work.

Look for evidence such as:

- the same decision, invariant, error handling, or ordering rule repeated across call sites
- concepts split across many files where no file owns the whole behavior
- wrappers whose interface is nearly as complicated as their implementation
- tests that mock internal choreography instead of verifying user-visible outcomes
- pure functions extracted mainly for test access while bugs live in orchestration
- changes that require coordinated edits across several modules that always move together
- abstractions named after patterns rather than domain behavior
- performance or operational constraints hidden by abstraction: hot paths, data volume, allocation,
  latency, retries, resource ownership, concurrency, or failure modes

For broad or unfamiliar codebases, sample a few representative paths first; only expand the search if
the evidence points to repeated pressure.

### 2. Classify what the code wants

For each suspicious cluster, decide which move would make the code semantically smaller:

- **Delete**: remove pass-through modules, indirection, or tests that add no behavior.
- **Inline**: move code back to the caller when the abstraction is thinner than the call-site burden.
- **Merge**: combine tightly coupled pieces behind one module when callers repeat its decisions.
- **Deepen**: create or reshape a module so a small interface hides a real workflow.
- **Wait**: leave duplication alone when there are not enough examples to see the right shape.
- **Seam**: introduce an adapter only for genuine variability, cross-process boundaries, external
  systems, or realistic local substitutes.

Use the dependency categories in [REFERENCE.md](REFERENCE.md) before proposing seams or adapters.

### 3. Present candidates

Present a short numbered list of the highest-value opportunities. Write each candidate as a concise
review note, not boilerplate. Make the code evidence, simplifying move, expected deletion or
reduction, risk, and reversible first step easy to see. Use bullets only where they improve scanning.

Do not propose a final interface yet. Ask:

```text
Which of these would you like to explore?
```

### 4. Design the chosen move

After the user picks a candidate, frame the problem before designing:

- behavior the module should own
- knowledge callers should stop needing
- dependencies and their category from [REFERENCE.md](REFERENCE.md)
- constraints that make the straightforward solution hard
- migration risk and what can be done incrementally

When the tradeoff is real, produce two or three meaningfully different designs, not a large menu. For
an obvious delete, inline, or merge, say so and keep it direct.

Useful design angles:

- **Direct module**: merge behavior with minimal new structure.
- **Deep workflow**: expose one small entry point that owns a full sequence of decisions.
- **Explicit seam**: use only when a dependency boundary or real variability demands it.

For each design include:

1. interface contract, including non-obvious invariants and errors
2. short caller example
3. what callers no longer need to know
4. dependency and testing strategy
5. trade-offs and failure modes

### 5. Recommend one path

Give a strong recommendation. Prefer the smallest change that removes the most repeated knowledge.

Include:

- which design to choose
- why it beats the alternatives in this codebase
- what to delete or merge first
- what tests should replace old tests
- a reversible first step

Ask whether the user wants an implementation plan or local architecture note before writing durable
docs or changing code.

### 6. Optional architecture note

If the user agrees, draft a concise local note using the template in [REFERENCE.md](REFERENCE.md).
Prefer a project-appropriate planning location such as:

```text
.plans/YYYY-MM-DD-[slug]-simplification-note/simplification-note.md
```

Keep the note durable: describe ownership, behavior, and migration strategy more than fragile file
paths.
