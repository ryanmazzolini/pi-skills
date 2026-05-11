# React Components

Use this reference when writing or reviewing TSX components.

## Component Shape

- Keep the render return focused on UI structure, not decision trees.
- Name derived state before JSX when it explains why the UI looks a certain way.
- Extract a child component when a section has its own state, effects, accessibility contract, or 50+ lines of markup.
- Extract a helper function or lookup map when the same visual decision is repeated.
- Keep hook-heavy data orchestration separate from dense view markup when practical.

## Client Component Hygiene

- In Next.js App Router, make the smallest useful component `"use client"`.
- Put browser APIs, hooks, timers, event handlers, and interactive state inside Client Components.
- Keep server-only data fetching, secrets, filesystem access, and backend resources in Server Components or server utilities.
- Avoid turning a whole route client-side just because one child needs interactivity.

## Review Smells

- One component owns fetching, mutation, cache updates, dropdown behavior, copy behavior, and large render branches.
- Callers must remember ARIA labels, disabled rules, validation behavior, or loading choreography.
- The component accepts many style overrides because it is trying to serve unrelated use cases.
- Tests assert implementation details while missing visible states and user interactions.

## Preferred Moves

- Extract a pure presenter when data orchestration obscures markup.
- Extract a small state helper when conditional styling repeats.
- Keep colocated types and helpers near the component until reused by 3+ files.
- Add user-facing tests for visible behavior before adding tests for helper internals.
