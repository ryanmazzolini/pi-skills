---
name: "frontend-hci-review"
description: Review frontend flows for usability, accessibility, responsive design, and states such as loading or errors. Use when auditing UX quality or user-facing flows.
---

# Frontend HCI Review

Find pragmatic frontend improvements that make a product easier to understand, operate, and recover from. Optimize for lower user friction, clearer state, stronger accessibility, and fewer interaction rules that callers must rediscover.

Read [references/LANGUAGE.md](references/LANGUAGE.md) for shared vocabulary. Read [references/REFERENCE.md](references/REFERENCE.md) for pay-rent tests, improvement moves, design guidance, verification, and the UX note template. Use `hci` for detailed accessibility, interaction-state, heuristic, and responsive standards.

## Principles

- Prefer evidence-led UX improvement over taste-led redesign.
- Optimize for task completion before visual polish or component purity.
- Prefer native semantics and browser behavior before custom interaction code.
- Make loading, error, empty, success, and disabled states explicit where users make decisions.
- Consolidate repeated interaction rules only after the pattern is visible.
- Stop if the best answer is "measure first" or "do nothing yet."

## Flow

### 1. Explore friction

Read the UI code, routes, components, tests, design notes, and recent history when useful. Look for places where users must guess, wait, recover, re-enter data, remember rules, or work around the interface.

Good evidence includes missing async states, fragile custom controls, late validation, lost input, inconsistent labels or layouts, mobile overflow, keyboard traps, unclear screen-reader semantics, and repeated accessibility/state choreography.

For broad codebases, sample representative flows first. Expand only where evidence points to repeated friction.

### 2. Classify the smallest useful move

Use [references/REFERENCE.md](references/REFERENCE.md) to choose one move:

- **Clarify** labels, hierarchy, affordances, helper text, or terminology.
- **Expose state** for loading, error, empty, success, disabled, stale, or progress states.
- **Restore semantics** with native HTML or correct ARIA/focus/keyboard behavior.
- **Reduce interaction cost** by removing steps, preserving input, improving defaults, or easing recovery.
- **Unify pattern** for repeated validation, forms, dialogs, tables, or async feedback.
- **Improve responsiveness** for layout, touch, input modality, or perceived performance.
- **Wait or measure** when evidence is thin.

### 3. Present candidates

Return a short numbered list of the highest-value opportunities. Use this concise format:

```text
[Move] Friction — evidence — first step
```

Add risk or accessibility notes only when they materially affect the decision. Do not propose a final component API or redesign yet. End with:

```text
Which of these would you like to explore?
```

## If the user picks a candidate

Frame the task, behavior the UI should own, state/accessibility contract, responsive constraints, migration risk, and smallest reversible path. For non-obvious tradeoffs, compare 2-3 designs: native/minimal fix, shared pattern, or flow model. Recommend one path and ask before writing durable docs or changing production code.
