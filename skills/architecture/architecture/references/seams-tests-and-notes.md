# Seams, Tests, and Architecture Notes

Read this only when considering a seam or adapter, choosing a non-obvious dependency or testing approach, or writing an approved architecture note.

## Check whether a seam pays for itself

A seam lets behavior vary without changing its caller. An adapter connects one dependency at that seam. Add a seam only when variation is real, a process or deployment boundary requires it, or a realistic local substitute needs it. One production implementation and a fake made only for mocks is usually not enough.

Classify the dependency first:

- **In-process:** computation or local state with no I/O. Keep the workflow together and test its public behavior directly.
- **Local-substitutable:** I/O with a realistic local stand-in, such as an in-memory filesystem, PGLite, local queue, fake clock, or local object storage. Test the real workflow with that stand-in before adding an internal seam.
- **Remote but owned:** an internal service, queue, job, or API. Put a seam at the deployment boundary when needed; keep product logic together and transport in the adapter.
- **True external:** a third-party system. Put the seam at the edge and expose only the product operations needed, not the vendor SDK.

Test through the interface callers use. Assert observable results and durable outputs rather than call order. Replace internal tests once stable behavior is covered, and delete tests that only preserve an obsolete seam. Mock hard external edges or dependencies without a reliable local substitute.

## Architecture note

Write a note only after the user approves it. Use the active vault-native work item's `working/research/YYYY-MM-DD-[slug]-architecture-note.md`; otherwise follow the selected vault's project structure and ask when the destination is unclear.

Keep the note short and durable:

```md
# Architecture Note: [Title]

## Problem
What knowledge is repeated, or what thin abstraction creates coordination cost?

## Evidence
Call sites, tests, or operating behavior that show the pressure.

## Chosen Move
Delete, inline, merge, deepen, wait, or add a seam. Explain what becomes simpler.

## Design
Behavior owned, interface and important rules, caller knowledge removed, errors, side effects, and dependency category.

## Testing and Migration
Stable behavior tests, obsolete tests to remove, substitutes or adapters, reversible migration steps, and risks or reasons to wait.
```
