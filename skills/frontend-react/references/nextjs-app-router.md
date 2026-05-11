# Next.js App Router

Use this reference when changing App Router routes, Server/Client Component boundaries, data loading, server actions, or route states.

## Server vs Client Components

Server Components are the default. Use them for:

- data fetching
- backend resources
- sensitive data
- rendering static or request-scoped HTML

Client Components need `"use client"` and should be limited to:

- hooks and local interactive state
- event handlers
- browser APIs
- focus management, timers, observers, and imperative UI behavior

## Preferences

- Prefer Server Component async/await over `useEffect` data fetching.
- Prefer uncontrolled forms with server actions when the interaction fits progressive enhancement.
- Prefer `next/image` over native `<img>`.
- Prefer `next/link` over `router.push` for ordinary navigation.
- Add useful `loading.tsx` and `error.tsx` boundaries for route segments that fetch or mutate important data.

## Review Questions

- Did a tiny interactive widget force a large route or layout to become client-side?
- Are loading, error, not-found, and empty states visible at the route segment where users make decisions?
- Are server-only imports kept out of Client Components?
- Is navigation represented as links when it is navigation?
- Is form behavior still understandable when JavaScript is delayed?

## Validation

- `next build` passes.
- Server/Client boundaries are intentional.
- User-facing loading and error states can be exercised locally or in tests.
