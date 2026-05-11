---
name: frontend-react
description: Use when writing, reviewing, or refactoring frontend React, Next.js, or TypeScript TSX code, especially components, JSX, hooks, forms, conditional rendering, className logic, client/server boundaries, accessibility, custom inputs, loading/error states, or PR review feedback.
---

# Frontend React

Default skill for React/Next.js frontend implementation and review. Optimize for readable UI structure, explicit states, accessible interactions, and small framework-specific decisions.

## Defaults

- Prefer readable JSX over clever JSX.
- Keep returned JSX mostly declarative; move decision logic into named variables, helpers, lookup maps, or child components.
- Use inline ternaries only for simple two-way choices.
- If JSX has nested ternaries, 3+ visual states, or branching `className` logic, extract the decision.
- Prefer native HTML semantics and browser behavior before custom controls.
- Make loading, empty, error, disabled, and success states explicit where users make decisions.
- In Next.js App Router, default to Server Components; use Client Components only for interactivity, hooks, or browser APIs.
- Before finalizing generated frontend code, scan for reviewer-hostile JSX: nested ternaries, hidden state machines, oversized components, inaccessible custom controls, and missing async states.

## Progressive References

Read only the references that match the task:

- [references/react-components.md](references/react-components.md) when authoring, reviewing, or refactoring TSX components.
- [references/conditional-rendering.md](references/conditional-rendering.md) when JSX or `className` logic has multiple states.
- [references/nextjs-app-router.md](references/nextjs-app-router.md) when changing server/client boundaries, routing, data loading, server actions, or route states.
- [references/accessibility.md](references/accessibility.md) when building forms, custom inputs, dialogs, comboboxes, tables, or keyboard interactions.
- [references/review-checklist.md](references/review-checklist.md) before finalizing generated frontend code or addressing PR review feedback.

## Related Skills

- Use `hci` for deeper usability, accessibility, responsive, and interaction-state standards.
- Use `frontend-hci-review` for a broader product-flow review before proposing UI refactors.
- Use `typescript` for strict TypeScript typing conventions beyond React component structure.
