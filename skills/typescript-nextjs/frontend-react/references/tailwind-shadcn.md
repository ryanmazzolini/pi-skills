# Tailwind and shadcn

Use this reference when writing or reviewing Tailwind-heavy TSX, shadcn/ui components, reusable UI primitives, or feature-specific color/theme choices.

## Class Composition

- Use the project's `cn` helper for conditional Tailwind classes, caller-provided `className`, or any class list where Tailwind conflicts may need merging.
- Prefer `cn` object/boolean syntax over template-literal ternaries in `className`.
- Append caller-provided `className` last for reusable components so intentional overrides win.
- Move repeated tone/status class decisions into a named helper, lookup map, or `cva` variant.

```tsx
<div
  className={cn(
    "min-w-0",
    {
      "px-3 py-2 rounded-md": isHighlighted,
      "pt-3": !isHighlighted,
    },
    isHighlighted && highlightClassName,
  )}
/>
```

```tsx
function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("rounded-lg border bg-card", className)} {...props} />;
}
```

## shadcn/ui Defaults

- Prefer existing `components/ui/*` primitives before creating another local control.
- Preserve native element semantics and pass through standard props/ref when wrapping primitives.
- Use `cva` for reusable variant APIs; use a local helper or lookup map for one-off feature states.
- Keep domain-specific variants out of shared UI primitives until reused by multiple product surfaces.

## Tailwind Colors and Tokens

- Do not change global design tokens to solve a feature-specific visual mismatch.
- For feature-specific semantics, use local CSS module/scope variables with semantic names, then consume them through Tailwind arbitrary values.
- For app-wide semantics, propose a design-system/Tailwind `@theme inline` token instead of duplicating colors per feature.
- Store color primitives as OKLCH when the surrounding design system does; keep opacity out of primitive variables and apply Tailwind opacity modifiers at the use site.

```css
.scope {
  --invoice-impact-positive: oklch(0.5234 0.1347 144.17);
  --invoice-impact-surface: oklch(0.9571 0.021 147.64);
}
```

```tsx
<span className="text-[var(--invoice-impact-positive)]/60" />
<div className="bg-[var(--invoice-impact-surface)]" />
```

## Before Finalizing

- Scan changed TSX for `className={\`` and className ternaries; convert conditional class composition to `cn` unless the expression is truly static.
- Check whether a color change is local feature semantics or a global design-system decision.
- Verify caller overrides still work when `className` is passed into a reusable component.
