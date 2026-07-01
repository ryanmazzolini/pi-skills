---
name: shape-first
description: Use for human-in-the-loop non-trivial code changes: discover existing patterns, model domain shapes, choose an idiomatic boundary, turn that into TODOs, implement, then check drift.
---

# Shape First

Use when a code change is too big to safely jump straight into edits.

This is a checkpoint loop:

```text
discover → shapes → boundary → TODOs → code → drift check
```

After each phase, show the result, recommend the next move, and wait for the user.

## Discover

Read the code path touched by the change.

Produce:

- files and patterns to follow
- existing domain names already used
- constraints that affect the design

Done when you can say where the change should probably live and what existing pattern it should follow.

## Shapes

Turn the request into the smallest domain model needed for this change.

Produce:

- domain nouns involved
- fields, values, states, or lifecycle
- rules or invariants that must hold
- where each shape comes from or is stored
- one concrete example when useful

Use the codebase's normal form: types, structs, classes, schemas, records, props, states, events, plain objects, or test data.

Done when the user can see what data exists, what can change, and what must stay true.

## Boundary

Choose the smallest normal code boundary for this repo.

Produce:

- the function, method, class, module export, route, component props, service object, or similar surface
- inputs, outputs, side effects, and errors
- where it should live
- why this boundary is enough

Use domain names. Do not invent extra abstraction or a language-level interface unless that is already the repo's idiom.

Done when a caller can use the change without knowing its internals.

## TODOs

Turn the approved shapes and boundary into an ordered checklist.

Each TODO should name the file or surface it changes and have a visible completion signal.

Done when every approved shape rule and boundary behavior is covered by a TODO, or intentionally left out.

## Code

Implement the approved TODOs in order.

Reuse existing code first. Keep edits narrow. Run the relevant check.

Done when the TODOs are complete, the check has run, and any skipped check has a reason.

## Drift check

Compare the code to the approved shapes, boundary, and TODOs.

Classify drift:

- no drift: finish
- TODO drift: update TODOs and continue
- boundary drift: return to Boundary
- shape drift: return to Shapes
- scope drift: stop and ask

Recommend one next move and wait for the user.
