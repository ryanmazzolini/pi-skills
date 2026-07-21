---
name: "shape-first"
description: "Shape a non-trivial code change with human checkpoints before implementation. Use when it is unsafe to jump straight from the request to edits."
---

# Shape First

A **shape** is the data this change needs and the rules that data must follow, written in the repository's usual form. A **boundary** is the smallest normal code entry point callers use while the implementation stays hidden.

Work in this order:

```text
discover → experience → shapes → boundary → TODOs → code → drift check
```

At each checkpoint, show only what the user needs to confirm, recommend one next move, and wait. Start the next step after confirmation. Reuse confirmed work unless new evidence conflicts with it. If the work uncovers scope outside confirmed Now, stop for a scope decision.

## Discover

Inspect the affected code, tests, documentation, and existing alignment. Identify patterns to follow, domain names already in use, and constraints that affect the change.

Done when the likely home for the change and the existing pattern it should follow are clear.

## Experience

Reuse a walkthrough already confirmed during alignment. Reopen only the part contradicted by new evidence. If every user- and caller-facing interaction stays the same, state what must remain unchanged.

Otherwise, describe one Now walkthrough in user or caller language:

- who starts, where, and for what outcome
- the smallest successful path, including choices, feedback, waiting, and completion
- how they leave, resume, retry, and recover
- what differs from today's experience

For UI work, describe what the person sees and can do. For an API, CLI, event, or library, describe what the caller sends, receives, retries, and handles. Leave proposed types, schemas, and internal statuses for later.

Done when the user confirms the complete Now flow or the unchanged experience.

## Shapes

Model only the data and rules needed for the approved experience. Use existing domain language and the repository's normal types, records, states, events, schemas, props, fixtures, or similar structures.

Show:

- domain nouns and required fields or values
- states, lifecycle, and rules that must remain true
- where the data comes from or is stored
- which experience step each shape supports
- one ordinary example when it makes a rule clearer

Done when the user can see what exists, what may change, what must remain true, and why each shape is needed now.

## Boundary

Choose the smallest repo-native entry point through which a caller can complete the approved experience. Use domain names. State its inputs, outputs, side effects, errors, location, and why it is enough.

When creating or changing a module boundary or public API, apply [`design-an-interface`](../design-an-interface/SKILL.md) before recommending one option. Prefer existing patterns. Add an abstraction only when the current change requires it and simpler repo-native options do not work.

Done when callers can complete the flow without knowing the implementation and every part of the boundary traces to a current need.

## TODOs

Turn the approved shapes and boundary into an ordered checklist. Each TODO names the file or code surface it changes and an observable completion signal, such as caller behavior, a test, or a repository check.

Done when every approved shape requirement and boundary behavior is covered or explicitly left out.

## Code

Before editing, apply [`simplest-sufficient-change`](../simplest-sufficient-change/SKILL.md) to the approved TODOs. If the simplest sufficient option changes the approved experience, shapes, or boundary, return to that checkpoint.

Implement the confirmed TODOs in order. Keep edits narrow and run the repository's relevant checks. Report whether they passed and name every skipped check with its reason.

Done when every TODO's completion signal is met and the checks pass, or a concrete blocker is reported.

## Drift check

Compare the implementation with the approved experience, shapes, boundary, and TODOs:

- **no drift:** recommend finishing
- **TODO drift:** return to TODOs, update and confirm them, then resume Code
- **boundary drift:** return to Boundary
- **shape drift:** return to Shapes
- **experience drift:** return to Experience
- **scope drift:** stop and ask whether the added scope belongs in Now

Recommend one return path or finish, then wait for the user.
