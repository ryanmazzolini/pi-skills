# Seams, Tests, and Architecture Notes

Read this only when considering a seam or adapter, choosing a dependency or testing approach that is not straightforward, or writing an approved local architecture note.

## Check whether a seam pays for itself

A seam lets behavior vary without changing its caller. An adapter is the code that connects one dependency at that seam. Add a seam only when variation is real, a process or deployment boundary requires it, or a realistic local substitute needs it. One production implementation and a fake made only for mocks is usually not enough.

Classify the dependency before choosing the boundary:

- **In-process:** computation or local state with no I/O. Keep the workflow together and test its public behavior directly.
- **Local-substitutable:** I/O with a realistic local stand-in, such as an in-memory filesystem, PGLite, local queue, fake clock, or local object storage. Test the real workflow with that stand-in before adding an internal seam.
- **Remote but owned:** an internal service, queue, job, or API. Put a seam at the deployment boundary when needed; keep product logic together and transport in the adapter.
- **True external:** a third-party system. Put the seam at the edge and expose only the product operations needed, not the vendor SDK.

Test through the interface callers use. Assert observable results and durable outputs rather than call order. Replace old internal tests once that behavior is covered, and delete tests that only preserve an obsolete seam. Mock only hard external edges or dependencies without a reliable local substitute.

## Local architecture note

Use this only after the user approves a local note. Prefer a project-appropriate planning path such as `.plans/YYYY-MM-DD-[slug]-simplification-note/simplification-note.md`. Describe durable ownership and migration, not fragile file layouts.

```md
# Architecture Note: [Title]

## Problem

What knowledge is repeated, or what thin abstraction creates coordination cost?

## Evidence

- Call sites or tests that repeat decisions
- Pieces that change together
- Seams or mocks that hide the wrong behavior

## Chosen Move

Delete, inline, merge, deepen, wait, or add a seam. Explain what becomes simpler.

## Design

Describe the behavior owned, interface and important rules, caller knowledge removed, errors and side effects, and dependency category.

## Testing and Migration

Name the stable behavior tests, old tests to remove, any substitute or adapter, small reversible migration steps, and risks or reasons to wait.
```
