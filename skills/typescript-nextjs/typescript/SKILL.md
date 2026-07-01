---
name: typescript
description: TypeScript strict mode patterns and conventions. Use when working with TypeScript code.
---

# TypeScript Patterns

## Strict Mode

Enable `strict: true` and `noUncheckedIndexedAccess: true` in tsconfig.

## Preferences

- `unknown` over `any` for untyped data
- Props interfaces colocated in component files
- Shared types in `lib/types/` only when reused across 3+ components
- No explicit return types on React components

## Validation

- `tsc --noEmit` passes with no errors
- No `@ts-ignore` or `@ts-expect-error` without explanation
