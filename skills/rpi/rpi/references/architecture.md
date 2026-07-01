# Architecture Reference

Use this reference when RPI work involves domain modeling, module boundaries, public APIs,
service contracts, or testing strategy.

## Working Style

- Prefer a short back-and-forth with the user at architectural decision points over silently locking
  in a plan.
- Ask one focused question at a time when user judgment is needed.
- Include a recommended answer so the user can accept, reject, or revise it.
- Investigate code/docs first when the answer is discoverable.

## Domain-driven Design

- Use the project's ubiquitous language in plans, interfaces, tests, and docs.
- Separate domain concepts from implementation mechanisms. A domain expert should recognize the
  central nouns, verbs, states, and relationships.
- Identify bounded contexts when the same term means different things in different parts of the
  system.
- Make ownership explicit: which context/module owns each concept, invariant, lifecycle, and source
  of truth.
- Cross bounded contexts through explicit contracts or events; avoid leaking one context's internal
  model into another.

## Deep Modules / Thin Interfaces

A deep module has a small interface hiding substantial implementation complexity. Prefer deep
modules over many shallow helper seams.

Good boundaries usually:

- expose a small, intention-revealing surface
- make the common case easy and hard to misuse
- hide orchestration, persistence details, retries, validation choreography, and third-party quirks
- own a coherent lifecycle or invariant
- can be tested through public behavior rather than internal call sequences

Warning signs:

- understanding one behavior requires bouncing across many tiny files
- callers must know the order of several low-level operations
- tests mock many neighboring helpers instead of asserting observable outcomes
- the proposed interface is almost as complex as the implementation

## Design Interfaces Twice

For meaningful module/API boundaries, compare at least two interface shapes before choosing:

- **Minimal surface**: 1-3 entry points; strong defaults; few extension points.
- **Common-case optimized**: makes the primary caller path trivial.
- **Flexible surface**: useful when real variation is known, but easier to overfit.
- **Ports and adapters**: useful when the domain logic crosses owned network/process boundaries.

For each candidate, consider:

- what the interface exposes
- what complexity it hides
- how callers use it
- how it can be tested at the boundary
- what future changes it makes easier or harder

## Dependency Strategy

Classify important dependencies before finalizing a structure:

1. **In-process**: pure computation or local state; safe to deepen behind one boundary.
2. **Local-substitutable**: I/O with a local stand-in, such as an in-memory filesystem or local DB.
3. **Remote but owned**: internal services or queues; define a port and adapters.
4. **True external**: third-party systems; inject a boundary and mock or fake that boundary in tests.

## Testing Strategy

- Replace shallow internal tests with boundary tests when a deeper module is introduced.
- Test observable behavior through the public interface.
- Keep tests stable across internal refactors.
- Use local substitutes or adapters where possible; mock true external systems at the boundary.
