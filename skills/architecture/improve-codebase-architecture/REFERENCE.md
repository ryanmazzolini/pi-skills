# Reference

## Deep Modules

A deep module has a small interface hiding a large implementation. Deep modules are easier to test
at their boundary and easier for humans or agents to navigate because callers do not need to
understand the internal choreography.

Shallow modules have interfaces that are nearly as complex as their implementation. They often
create many seams where integration bugs can hide.

## Dependency Categories

When assessing a candidate for deepening, classify its dependencies.

### 1. In-process

Pure computation, in-memory state, no I/O. Usually safe to deepen directly by merging
responsibilities behind one boundary and testing that boundary.

### 2. Local-substitutable

Dependencies that have local test stand-ins, such as PGLite for Postgres or an in-memory filesystem.
Deepenable when the local stand-in can run in the test suite.

### 3. Remote but owned: Ports & Adapters

Your own services across a network boundary, such as internal APIs, microservices, or queues.

Define a port at the module boundary. The deep module owns the logic; transport is injected. Tests
use an in-memory adapter. Production uses the real HTTP, gRPC, or queue adapter.

Recommendation shape:

> Define a shared interface (port), implement a production adapter and an in-memory test adapter, so
> the logic can be tested as one deep module even though deployment crosses a network boundary.

### 4. True external: Mock boundary

Third-party services you do not control, such as Stripe or Twilio. Mock at the boundary. The
deepened module takes the external dependency as an injected port, and tests provide a mock
implementation.

## Testing Strategy

Core principle: replace, do not layer.

- Replace shallow-module tests with boundary tests once the boundary exists.
- Write tests at the deepened module's public interface.
- Assert observable outcomes, not internal state.
- Keep tests stable across internal refactors.
- Delete redundant tests that only preserve the old shallow seams.

## Refactor RFC Template

```md
# Refactor RFC: [Title]

## Problem

Describe the architectural friction:

- which modules are shallow and tightly coupled
- what integration risk exists in the seams between them
- why this makes the codebase harder to navigate, test, or maintain

## Proposed Interface

Describe the chosen interface design:

- interface signature or contract
- usage example showing how callers use it
- complexity hidden internally

## Dependency Strategy

Name the dependency category and how dependencies are handled:

- **In-process**: merged directly
- **Local-substitutable**: tested with [specific stand-in]
- **Ports & adapters**: port definition, production adapter, test adapter
- **Mock boundary**: injected external dependency and mock in tests

## Testing Strategy

- **New boundary tests to write**: behaviors to verify at the public interface
- **Old tests to delete**: shallow-module tests that become redundant
- **Test environment needs**: local stand-ins or adapters required

## Implementation Recommendations

Durable architectural guidance that is not coupled to fragile file paths:

- what the module should own
- what it should hide
- what it should expose
- how callers should migrate to the new interface

## Out of Scope

- ...
```
