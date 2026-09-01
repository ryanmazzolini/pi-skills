# Review Data Structures

Read this when a change introduces, replaces, or materially extends a database shape, domain record, state model, collection, index, event, queue payload, cache, or other representation. Follow an established shape directly when the choice is routine and reversible.

## Establish the pressure

Inspect the live representation, callers, tests, data sizes, and recent changes. Identify:

- the common and expensive reads, writes, deletes, lookups, traversals, and ordering needs;
- the canonical owner and source of truth;
- lifecycle, identity, invariants, and invalid states the representation permits;
- expected scale and which limits are measured rather than hypothetical;
- which new requirement makes the current representation awkward.

Finish when the operations and rules that should drive the representation are explicit.

## Compare credible representations

When the choice could compound complexity, compare two or three options that could reasonably win. For each option, show one ordinary operation and the hardest important operation. Compare only decision-relevant differences:

- whether common operations are direct or require scans, joins, rebuilding, or synchronized secondary state;
- where invariants are enforced and whether invalid states remain representable;
- ownership, duplication, and the cost of keeping derived data consistent;
- ordering, identity, and reference stability;
- storage or memory cost, locality, serialization, and migration;
- concurrency and atomicity requirements;
- fit with repository conventions and knowledge exposed to callers.

Use asymptotic complexity where it changes the decision, but include realistic sizes and dominant constants. Do not add a weaker option merely to satisfy the comparison.

Prefer the simplest representation that makes common operations clear, keeps one authoritative value for each fact, and enforces important invariants close to mutation. Green feature tests prove behavior, not that the representation will remain coherent as requirements accumulate.

## Detect structural drift

Reconsider the representation when a feature adds another source of truth, combinations of flags with invalid meanings, repeated scans or conversions, caller-maintained indexes, or special-case synchronization across several paths. Do not hide structural pressure behind more downstream conditionals without comparing a better representation.

Lead with the recommended representation, then show the ordinary example, material invariant, consequential trade-off, and scale assumption. Stop when the reader can approve, reject, or redirect the choice.
