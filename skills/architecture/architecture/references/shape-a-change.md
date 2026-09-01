# Shape a Change

Read this after the requested behavior is clear but the needed data, rules, local interface, or code structure is not. A **shape** is the data the change needs and the rules it must follow in the repository's normal form. An **interface** is the smallest entry point callers use while the implementation stays hidden.

Work through these checkpoints:

```text
discover → experience → shapes → interface → TODOs → code → drift check
```

At each checkpoint, show only what the user needs to confirm, recommend one next move, and wait. Reuse confirmed work unless evidence conflicts. Stop for a scope decision when work outside the approved outcome appears.

## Discover

Inspect affected code, tests, documentation, decisions, and recent history. Identify the likely home, repo patterns, domain names, and constraints. Finish when the likely home and pattern to follow are clear.

## Experience

Reuse a confirmed walkthrough. If every user- and caller-facing interaction stays the same, state what must remain unchanged. Otherwise describe who starts, where, the smallest successful path, choices and feedback, completion, and how they leave, resume, retry, or recover.

For UI work, say what the person sees and can do. For an API, CLI, event, or library, say what the caller sends, receives, retries, and handles. Leave proposed schemas and internal states for later. Finish when the user confirms the target flow or unchanged experience.

## Shapes

Model only data and rules needed for the approved experience. Show domain nouns and required values, lifecycle and invariants, source or storage, which experience step each shape supports, and one ordinary example when useful. Use the repository's normal types, records, states, events, schemas, props, or fixtures.

Finish when the user can see what exists, what changes, what remains true, and why each shape is needed now.

## Interface

Choose the smallest repo-native entry point that completes the approved experience. State inputs, outputs, side effects, errors, location, and why it is enough. Prefer existing patterns. When creating or changing a module boundary or public API, read [interface-design.md](interface-design.md) before recommending one option.

Finish when callers can complete the flow without knowing the implementation and every part of the interface traces to a current need.

## TODOs

Create an ordered checklist. Each item names the file or code surface and an observable completion signal such as caller behavior, a test, or a repository check. Finish when every approved rule and interface behavior is covered or explicitly excluded.

## Code

Before editing, read [simplest-sufficient-change.md](simplest-sufficient-change.md). If the simplest sufficient option changes an approved checkpoint, return there. Implement confirmed TODOs in order, keep edits narrow, and run relevant checks. Report skipped checks with reasons.

Finish when each completion signal is met and checks pass, or report a concrete blocker.

## Drift check

Compare implementation with the approved experience, shapes, interface, and TODOs. Return to the earliest changed checkpoint. Stop for scope drift. When there is no drift, recommend finishing.
