# Frontend React Review Checklist

Use before finalizing generated frontend code or addressing PR review feedback.

## Readability

- Returned JSX reads as UI structure, not a decision tree.
- No nested ternaries in JSX or `className` expressions.
- Multi-branch UI states are named with variables, helpers, maps, or child components.
- Components over 150 lines have a clear reason to stay together.
- Repeated labels, validations, class decisions, or async-state rules are not copy-pasted.

## React and Next.js

- `"use client"` appears only where hooks, events, or browser APIs require it.
- Effects synchronize with external systems; they are not used for ordinary render-time derivations.
- Derived values are computed from props/state rather than mirrored into extra state.
- Links use links; buttons perform actions.
- Route-level loading and error boundaries exist where user decisions depend on async work.

## Accessibility and UX States

- Loading, empty, error, disabled, and success states are explicit.
- Forms have labels, constraints, and field-level errors.
- Custom controls have keyboard behavior and ARIA state, or are replaced with native controls.
- Focus indicators are visible.
- Touch targets are large enough for primary actions.

## Tests and Validation

- Tests cover user-visible behavior and important states, not only helper implementation.
- Type checking and framework build pass for the changed area.
- Manual review includes keyboard-only navigation for new custom interactions.
