---
name: "frontend-react"
description: "React/Next.js TSX implementation and review: readable JSX, conditional rendering, client/server boundaries, accessibility, forms, async states, visual design, generated artifacts, and PR feedback."
---

# Frontend React

Default skill for React/Next.js frontend implementation and review. Optimize for readable UI structure, explicit states, accessible interactions, and small framework-specific decisions.

## Defaults

- Prefer readable JSX over clever JSX.
- Keep returned JSX mostly declarative; move decision logic into named variables, helpers, lookup maps, or child components.
- Use inline ternaries only for simple two-way choices.
- If JSX has nested ternaries, 3+ visual states, or branching `className` logic, extract the decision.
- For Tailwind/shadcn class composition, use the project `cn` helper for conditional classes and caller-provided overrides.
- Prefer native HTML semantics before custom controls; use `hci` for deeper interaction details.
- Make loading, empty, error, disabled, and success states explicit where users make decisions.
- In Next.js App Router, default to Server Components; use Client Components only for interactivity, hooks, or browser APIs.
- Before finalizing generated frontend code, scan for reviewer-hostile JSX: nested ternaries, hidden state machines, oversized components, inaccessible custom controls, and missing async states.

## Progressive References

Read only the references that match the task:

- [references/react-components.md](references/react-components.md) when authoring, reviewing, or refactoring TSX components.
- [references/conditional-rendering.md](references/conditional-rendering.md) when JSX or `className` logic has multiple states.
- [references/visual-design.md](references/visual-design.md) when styling new UI or choosing typography, color, layout, or motion.
- [references/tailwind-shadcn.md](references/tailwind-shadcn.md) when working with Tailwind-heavy TSX, shadcn/ui primitives, `cn`, `cva`, or feature-specific colors/tokens.
- [references/nextjs-app-router.md](references/nextjs-app-router.md) when changing server/client boundaries, routing, data loading, server actions, or route states.
- [references/accessibility.md](references/accessibility.md) for React-specific accessibility pressure tests before using the deeper `hci` references.
- [references/generated-artifacts.md](references/generated-artifacts.md) when changing GraphQL, OpenAPI, schema-derived, or other generated frontend code.
- [references/review-checklist.md](references/review-checklist.md) before finalizing generated frontend code or addressing PR review feedback.

## Related Skills

- Use `hci` for deeper usability, accessibility, responsive, and interaction-state standards.
- Use `frontend-hci-review` for a broader product-flow review before proposing UI refactors.
- Use `typescript` for strict TypeScript typing conventions beyond React component structure.
