---
name: "frontend-guidelines"
description: Opinionated frontend defaults for UX, accessibility, and UI architecture. Use for broad frontend tradeoffs; use frontend-react when writing or reviewing React, Next.js, or TSX implementation.
---

# Frontend Guidelines

## Priorities

- Optimize for user understanding, accessibility, and perceived speed before developer convenience
- Prefer server-rendered HTML and progressive enhancement before client-side complexity
- Keep interfaces clear about loading, success, and failure states

## Defaults

- Start with semantic HTML and native browser behavior
- Prefer composition and colocation over deep prop chains or generic shared folders
- Add JavaScript only where interactivity materially improves the experience

## Review Questions

- What happens on slow networks and low-end devices?
- What changes for keyboard and screen reader users?
- Can the user still complete the core flow if JavaScript is delayed or unavailable?

## Related Skills

- Use `frontend-react` for React, Next.js, TSX, JSX readability, hooks, forms, and component review
- Use `hci` for accessibility, responsive design, and interaction details
- Use `nextjs-app-router` for deeper Next.js server/client boundaries and server actions
