---
name: "nextjs-app-router"
description: Next.js 14+ App Router patterns and conventions. Use when working with App Router code; pair with frontend-react for TSX component implementation.
---

# Next.js App Router Patterns

Use `frontend-react` first for general React/TSX component authoring and review. Use this skill for Next.js-specific App Router boundaries, route files, and server/client data flow.

## Server vs Client Components

Server Components (default) for: data fetching, backend resources, sensitive data.
Client Components (`"use client"`) only for: interactivity, hooks, browser APIs.

## Preferences

- Uncontrolled forms with server actions over controlled state
- `next/image` over native `<img>`
- `next/link` over `router.push` for navigation
- `loading.tsx` and `error.tsx` boundaries for every route segment

## Anti-Patterns

| Avoid | Use Instead |
|-------|-------------|
| useEffect for data fetching | Server Component async/await |
| Unnecessary `"use client"` | Server Component (default) |
| Controlled form inputs | Uncontrolled with `defaultValue` + server action |
| `router.push` for links | `next/link` |
| Native `<img>` | `next/image` |
| Pages Router patterns | App Router equivalents |

## Validation

- `next build` passes without errors
- Server/Client component boundaries are intentional
