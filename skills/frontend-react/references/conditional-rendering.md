# Conditional Rendering

Use this reference when JSX or `className` logic has multiple states.

## Rules of Thumb

- Use `&&` for show-or-hide markup when the left side is a boolean expression.
- Use a ternary for a simple two-way visual choice.
- Use an early return for whole-component states such as loading, unauthenticated, not found, or unrecoverable error.
- Use named variables, helper functions, lookup maps, or child components for 3+ states.
- Do not nest ternaries inside JSX or `className` expressions.

## Extract When

- A condition has more than two branches.
- The same condition controls text, color, icon, disabled state, and helper copy.
- A reviewer must mentally trace state to understand why the UI looks a certain way.
- The branch depends on product concepts, permissions, async state, or responsive mode.

## Useful Patterns

### Named derived state

```tsx
const isCompletedStep = index < currentIndex;
const isCurrentStep = index === currentIndex;
const stepTone = getParseStepTone({ isCompletedStep, isCurrentStep, variant });

return <span className={stepTone.className}>{step.label}</span>;
```

### Lookup map for finite visual states

```tsx
const STATUS_COPY = {
  idle: "Upload an invoice",
  parsing: "Parsing invoice…",
  error: "Could not parse invoice",
  done: "Ready to review",
} satisfies Record<ParseStatus, string>;
```

### Helper for styling decisions

```tsx
function parseStepClassName(state: ParseStepViewState): string {
  if (state.isDone) return state.variant === "modal" ? "text-green-600" : "text-success-text";
  if (state.isCurrent) return state.variant === "modal" ? "text-secondary-background font-medium" : "text-neutral-text font-medium";
  return state.variant === "modal" ? "text-gray-400" : "text-neutral-text-subtle";
}
```

A helper may still contain branches. The point is to give the decision a name and keep JSX readable.

## Before Finalizing

Search changed TSX for nested `?` / `:` chains. If present, extract until the returned JSX reads like UI structure instead of a decision tree.
