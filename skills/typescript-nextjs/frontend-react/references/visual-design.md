# Visual Design

Bias correction for LLM styling defaults. Adapted from [taste-skill](https://github.com/Leonxlnx/taste-skill).

## Anti-slop

- No AI-purple/violet or neon gradient accents. Max 1 accent color, saturation < 80%, on a neutral base (zinc/slate); pick one gray temperature and keep it.
- Don't center every hero/heading block. Prefer split, left-aligned, or asymmetric layouts unless the brief is ceremonial.
- Cards only when elevation communicates hierarchy. Group with `border-t`, `divide-y`, or whitespace otherwise; tint any shadow toward the background hue.
- Skeleton loaders shaped like the layout, not generic spinners.
- No emoji as icons or decoration; use the project icon set with one global `strokeWidth`.
- Display type: tighter tracking and leading than the default (`tracking-tight leading-none` territory). Body: `max-w-[65ch]`, relaxed leading.

## Mechanics

- `min-h-[100dvh]` over `h-screen` for full-height sections (iOS Safari viewport jump).
- CSS Grid over flex percentage math (`w-[calc(33%-1rem)]` is a bug farm).
- Animate only `transform` and `opacity`; never `top`/`left`/`width`/`height`.
- Every animation respects `prefers-reduced-motion`.
- Forms: label above input, error text below, consistent `gap-2`.
