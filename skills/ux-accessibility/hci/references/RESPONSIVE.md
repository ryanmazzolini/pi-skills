# Responsive Design Reference

Use this when reviewing layout, CSS, mobile behavior, touch interaction, or low-end device experience.

## Mobile-first defaults

Start from the smallest useful layout and enhance upward.

Prefer:

- content-driven breakpoints instead of device-name breakpoints
- fluid spacing and sizing with `rem`, `%`, `min()`, `max()`, and `clamp()`
- one-column task flows before multi-column dashboards
- layout that survives translated or user-generated text

Avoid:

- fixed pixel widths for content containers
- hover-only affordances
- critical controls hidden behind viewport-specific behavior

## Touch targets

Primary interactive targets should be at least 44x44px, with enough spacing to avoid accidental taps.

Check:

- dense icon buttons
- table row actions
- checkboxes and radios with small labels
- controls near screen edges or sticky bars

## Viewport and overflow

The user should not need two-dimensional scrolling to complete ordinary tasks.

Look for:

- horizontal overflow on mobile
- sticky headers/footers covering focused inputs
- modals taller than the viewport
- tables that lose row or column meaning when squeezed

Prefer:

- responsive table alternatives for narrow screens
- sticky regions that respect safe areas and keyboard overlays
- content that scrolls inside the page rather than trapping users inside nested scroll regions

## Performance perception

Responsive UX includes slow networks and low-end devices.

Check:

- large client bundles required for initial content
- layout shifts after images, fonts, or async data load
- expensive animations or scroll handlers
- blocking work before the first meaningful interaction

Prefer:

- server-rendered or static HTML for core content
- reserved media dimensions
- reduced-motion support
- progressive enhancement for optional interactivity

## Input modality

Design for keyboard, touch, mouse, and assistive technology.

- Do not make hover the only way to discover actions.
- Do not make drag the only way to reorder or manipulate content.
- Provide visible focus and active states independent of pointer hover.
- Respect `prefers-reduced-motion` for animations and transitions.
