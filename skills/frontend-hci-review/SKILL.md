---
name: frontend-hci-review
description: Investigate frontend code and product flows for usability, accessibility, responsive, and interaction-state improvement opportunities. Use when reviewing UI quality, reducing user friction, auditing forms or flows, or planning HCI-focused frontend refactors.
---

# Frontend HCI Review

Find pragmatic frontend improvements that make the product easier to understand, operate, and recover from. The goal is not prettier UI or more components. The goal is lower user friction, stronger accessibility, clearer system state, and fewer interaction rules that callers and users must rediscover.

Read [references/LANGUAGE.md](references/LANGUAGE.md) for vocabulary. Read [references/REFERENCE.md](references/REFERENCE.md) when classifying a finding, choosing the smallest useful move, or drafting a UX note. Use the `hci` skill for detailed accessibility, interaction-state, heuristic, and responsive standards.

## Principles

- Prefer evidence-led UX improvement over taste-led redesign.
- Optimize for successful task completion before visual polish or component purity.
- Prefer native semantics and browser behavior before custom interaction code.
- Make loading, error, empty, success, and disabled states explicit where users make decisions.
- Reduce user memory load with consistent labels, visible constraints, and predictable placement.
- Consolidate repeated interaction rules only after the pattern is visible in more than one place.
- Treat the UI contract as everything a user or caller must know: labels, states, keyboard behavior, validation, errors, layout, timing, and side effects.
- Stop if the best answer is "measure first" or "do nothing yet." Not every awkward screen deserves a refactor.
- Stop and confirm with the user before changing production code, tests, component structure, public UI contracts, configuration, or durable docs.

## Process

### 1. Explore for user friction

Read the UI code, routes, components, tests, design notes, and recent change history when useful. Let the investigation be led by places where a user must guess, wait, recover, remember, or work around the interface.

Look for evidence such as:

- async flows without useful loading, error, empty, success, or stale-data states
- custom controls that recreate native behavior poorly
- forms that reveal constraints too late or lose user input after errors
- destructive actions without undo, confirmation, or clear recovery
- similar actions, labels, validations, or layouts implemented inconsistently
- mobile layouts with overflow, tiny targets, hover-only actions, or hidden primary controls
- keyboard paths that skip controls, trap focus, or hide focus indicators
- screen-reader names, roles, states, or reading order that diverge from the visual task
- components that force callers to remember accessibility, validation, or state choreography
- tests that assert implementation details while missing user-visible behavior

For broad or unfamiliar codebases, sample a few representative flows first. Expand only where evidence points to repeated user friction.

### 2. Classify the improvement

For each suspicious cluster, decide which move would improve the user experience with the least conceptual overhead:

- **Clarify**: improve labels, hierarchy, affordances, helper text, or terminology.
- **Expose state**: add or reshape loading, error, empty, success, disabled, progress, or stale states.
- **Restore semantics**: replace fragile custom interaction with native HTML or correct ARIA behavior.
- **Reduce interaction cost**: remove steps, preserve input, improve defaults, or make recovery easier.
- **Unify pattern**: consolidate repeated validation, form, dialog, table, or async-state behavior.
- **Improve responsiveness**: fix layout, touch, input-modality, or perceived-performance problems.
- **Wait or measure**: leave the UI alone until there is enough evidence to choose the right fix.

### 3. Present candidates

Present a short numbered list of the highest-value opportunities. Write each as a concise review note, not boilerplate.

For each candidate include:

- **User friction**: what a user cannot understand, complete, or recover from easily
- **Evidence**: screens, components, tests, or call sites showing the issue
- **Heuristic**: the HCI/accessibility principle involved
- **Move**: clarify, expose state, restore semantics, reduce cost, unify pattern, improve responsiveness, or wait
- **Risk**: product, accessibility, regression, or migration risk
- **First step**: a reversible investigation or small change

Do not propose a final component API or redesign yet. Ask:

```text
Which of these would you like to explore?
```

### 4. Design the chosen move

After the user picks a candidate, frame the problem before designing:

- task the user is trying to complete
- behavior the UI or component should own
- knowledge callers and users should stop needing
- states and accessibility behavior that must be part of the contract
- responsive and input-modality constraints
- migration risk and what can be changed incrementally

When the tradeoff is real, produce two or three meaningfully different designs, not a large menu. For an obvious copy, semantic HTML, or state fix, say so and keep it direct.

Useful design angles:

- **Native/minimal fix**: smallest change using semantic HTML, copy, CSS, or local state.
- **Shared pattern**: component or helper owns repeated interaction, accessibility, or validation behavior.
- **Flow model**: reshape the user journey or state machine so the task has clearer stages and recovery.

For each design include:

1. UI contract, including non-obvious states, keyboard behavior, validation, and errors
2. short caller or markup example when useful
3. what users and callers no longer need to know
4. accessibility, responsive, and testing strategy
5. trade-offs and failure modes

### 5. Recommend one path

Give a strong recommendation. Prefer the smallest change that removes the most user friction and repeated interaction knowledge.

Include:

- which design to choose
- why it beats the alternatives in this codebase
- what to delete, merge, or standardize first
- what tests or manual checks should replace shallow tests
- a reversible first step

Ask whether the user wants an implementation plan or local UX note before writing durable docs or changing code.

### 6. Optional UX note

If the user agrees, draft a concise local note using the template in [references/REFERENCE.md](references/REFERENCE.md). Prefer a project-appropriate planning location such as:

```text
thoughts/{profile}/research/YYYY-MM-DD-[slug]-frontend-hci-note.md
```

Keep the note durable: describe task, states, accessibility behavior, and migration strategy more than fragile file paths.
