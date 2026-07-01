# Reference

Read [LANGUAGE.md](LANGUAGE.md) for vocabulary.

## Pay-Rent Tests

Use these tests before proposing an abstraction.

### Semantic size test

A refactor makes code semantically smaller when fewer places need to know the same rule, invariant,
ordering constraint, lifecycle decision, or error-handling behavior. Prefer changes that remove
caller knowledge over changes that only rearrange files.

### Deletion test

Imagine deleting the module.

- If the program becomes simpler and little behavior is lost, delete or inline it.
- If its rules reappear across many callers, the module was hiding useful knowledge.

### Caller burden test

List what a caller must know to use the module correctly. If that list is almost the same as reading
the implementation, the module is shallow.

### Repetition test

Look for the same decision repeated in enough places to show pressure: validation order, retry
policy, error mapping, permission checks, data normalization, lifecycle ownership, or transaction
shape. Three or more ordinary repetitions are a strong signal; two high-risk call sites can be
enough.

### Variation test

Ask what actually varies in production or realistic tests. If there is only one real behavior and one
fake created solely for a mock, a seam may be premature.

### Naming test

Add new concepts or nomenclature only when the name lets maintainers stop carrying concrete details
in their heads. Prefer names that compress behavior already present in the code.

## Dependency Categories

Classify dependencies before choosing a testing and seam strategy.

### 1. In-process

Pure computation, in-memory state, deterministic transforms, or local orchestration with no I/O.
Usually deepen by merging behavior behind one module and testing the public interface directly.

### 2. Local-substitutable

I/O with a realistic local stand-in: in-memory filesystem, PGLite, local queue, fake clock, or local
object storage. Prefer testing the deep module with the stand-in rather than exposing internal seams.

### 3. Remote but owned

Internal services, queues, jobs, or APIs owned by the same organization. Use a seam when deployment
forces one. Keep product logic in one place; keep transport logic in adapters. Tests can use an
in-memory or local adapter when that proves the behavior better than mocks.

### 4. True external

Third-party services and systems you do not control. Put the seam at the edge of your code. Wrap the
external dependency in the smallest interface that reflects what your product needs, not everything
the vendor SDK can do.

## Testing Strategy

Prefer tests that survive internal rewrites.

- Test through the module interface that callers use.
- Assert observable behavior and durable outputs, not internal call order.
- Replace shallow internal tests once higher-value module tests exist.
- Use local substitutes when they make tests realistic and fast enough.
- Mock only at hard external edges or when no reliable local substitute exists.
- Delete tests that only preserve old seams after the behavior is covered elsewhere.

## Architecture Note Template

Use this only when the decision needs to survive beyond the immediate change.

```md
# Architecture Note: [Title]

## Problem

What repeated knowledge, coordination cost, or shallow abstraction exists today?

## Evidence

- Call sites or tests showing repeated decisions
- Modules that always change together
- Mocks or seams that hide the wrong behavior

## Proposed Move

Choose one: delete, inline, merge, deepen, wait, or seam.

Describe what changes and what becomes simpler.

## Interface

If a module remains or is created, describe the full interface:

- entry points
- invariants and ordering
- errors and side effects
- configuration and performance expectations

## Dependency Strategy

Name the dependency category:

- **In-process**
- **Local-substitutable**
- **Remote but owned**
- **True external**

Explain how the design avoids unnecessary seams.

## Testing Strategy

- New behavior tests to add
- Old shallow tests to delete
- Local substitutes or adapters needed

## Migration

Small reversible steps:

1. ...
2. ...
3. ...

## Risks

Why this might be the wrong compression, or why waiting may be better.
```
