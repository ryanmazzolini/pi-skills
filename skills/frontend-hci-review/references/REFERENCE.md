# Reference

Read [LANGUAGE.md](LANGUAGE.md) for vocabulary. Use the `hci` skill references for detailed accessibility, heuristic, interaction-state, and responsive standards.

## Pay-Rent Tests

Use these tests before proposing a UI refactor, shared component, or flow redesign.

### Task completion test

Name the user task and the point where the current UI makes completion harder. If you cannot describe the task impact, the issue may be taste rather than HCI friction.

### State visibility test

List the states a user must distinguish to act correctly: loading, empty, error, success, stale, disabled, selected, expanded, invalid, or completed. If those states are hidden or ambiguous, expose them.

### Semantic burden test

List what each caller must know to implement the interaction accessibly. If callers repeatedly manage labels, roles, focus, keyboard behavior, validation, and error mapping, the pattern may need an owning component or helper.

### Recovery test

Ask what happens after failure, cancellation, destructive action, invalid input, lost connectivity, or accidental navigation. Prefer designs that preserve user work and make the next action clear.

### Consistency test

Look for the same task expressed with different labels, button placement, validation timing, dialogs, or async feedback. Three ordinary inconsistencies are a strong signal; two high-risk flows can be enough.

### Responsiveness test

Check whether the core flow works on small screens, touch input, keyboard input, low-end devices, slow networks, and reduced-motion settings.

### Component ownership test

Before adding a shared component, ask what user-facing rule it will own. A component pays rent when it hides repeated interaction, accessibility, validation, state, or responsive behavior. A visual wrapper that still requires callers to know every rule is shallow.

## Improvement Moves

### Clarify

Use when users cannot tell what something means or what to do next.

Examples:

- ambiguous labels or headings
- implementation terms exposed to users
- missing helper text for unfamiliar constraints
- weak visual hierarchy around the primary action

### Expose state

Use when users cannot tell what the system is doing or whether an action succeeded.

Examples:

- save action with no pending or success feedback
- stale content after mutation
- empty area with no explanation
- disabled button without a visible reason

### Restore semantics

Use when custom UI breaks native expectations.

Examples:

- clickable `div` instead of button
- custom select/menu without keyboard support
- modal that does not manage focus
- icon-only button without an accessible name

### Reduce interaction cost

Use when the flow asks users to do unnecessary work.

Examples:

- repeated entry of the same information
- constraints discovered only after submit
- unnecessary confirmation for reversible actions
- form data lost after validation failure

### Unify pattern

Use when repeated interaction rules are implemented inconsistently.

Examples:

- many forms with different error display behavior
- many mutations with different pending/success feedback
- repeated dialog focus-management code
- repeated table empty/loading/error states

### Improve responsiveness

Use when layout, input modality, or performance perception blocks the task.

Examples:

- horizontal overflow on mobile
- tiny touch targets
- hover-only controls
- layout shift hiding the user's target

### Wait or measure

Use when the UI feels awkward but evidence is thin.

Examples:

- competing redesign ideas without user/task evidence
- one-off inconsistency in an experimental screen
- visual preference with no completion, accessibility, or recovery impact

## Testing and Verification

Prefer checks that survive internal rewrites.

- Test through user-visible behavior and accessible queries when possible.
- Prefer role/name/state assertions over DOM structure assertions.
- Add keyboard-path tests for custom controls and critical flows.
- Add form tests that cover validation, preservation of input, and recovery.
- Use visual regression or screenshots for layout states when behavior tests cannot capture the risk.
- Keep manual checks for screen readers, reduced motion, responsive layout, and real-device touch behavior when automation is insufficient.
- Delete shallow tests that only preserve old component seams after higher-value behavior tests exist.

## UX Note Template

Use this only when the decision needs to survive beyond the immediate change.

```md
# UX Note: [Title]

## Task

What user task or flow is affected?

## Problem

What friction, ambiguity, inaccessible behavior, or recovery gap exists today?

## Evidence

- Screens, components, tests, analytics, support reports, or code paths showing the issue
- Repeated interaction rules or inconsistencies
- Accessibility or responsive findings

## Proposed Move

Choose one: clarify, expose state, restore semantics, reduce interaction cost, unify pattern, improve responsiveness, or wait/measure.

Describe what changes and what becomes easier for users and callers.

## UI Contract

Describe the durable behavior:

- labels and visible hierarchy
- loading, empty, error, success, disabled, and stale states
- keyboard and focus behavior
- accessible names, roles, and states
- validation, side effects, and recovery
- responsive and input-modality expectations

## Implementation Strategy

- Small reversible steps
- Components, copy, CSS, or flow code to delete/merge/standardize
- Migration risks

## Verification

- Behavior tests to add
- Accessibility checks to run
- Responsive/manual checks needed
- Old shallow tests to delete

## Risks

Why this might be the wrong fix, or what should be measured before going further.
```
