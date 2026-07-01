---
name: "hci"
description: Usability heuristics, WCAG accessibility, responsive design. Use when reviewing or writing UI components, CSS, forms, interaction states, or discussing UX.
---

# HCI Standards

Use this skill for practical usability, accessibility, responsive design, and interaction-state defaults.
Prefer native browser behavior and observable user outcomes over custom interaction code.

Read references only when the task needs the detail:

- [references/HEURISTICS.md](references/HEURISTICS.md) for usability heuristics and review questions
- [references/ACCESSIBILITY.md](references/ACCESSIBILITY.md) for WCAG-oriented checks, keyboard flow, focus, forms, and screen readers
- [references/INTERACTION-STATES.md](references/INTERACTION-STATES.md) for loading, error, empty, success, and destructive-action states
- [references/RESPONSIVE.md](references/RESPONSIVE.md) for mobile-first layout, touch targets, and adaptive behavior

## Opinionated Defaults

- Semantic HTML first; ARIA only when native elements cannot express the behavior.
- Skeleton, optimistic, or useful partial states over generic loading spinners.
- Actionable error messages over generic ones: "Email format: name@example.com" not "Invalid input".
- Progressive enhancement: the core flow should work without JavaScript when practical and improve with it.
- Mobile-first CSS with relative units (`rem`, `%`, `vw`, `vh`) and content-driven breakpoints.

## Thresholds

- Color contrast: 4.5:1 normal text, 3:1 large text or non-text UI indicators.
- Touch targets: minimum 44x44px for primary interactive targets.
- Focus indicators: visible on all interactive elements; do not remove outlines without an accessible replacement.

## Fast Review Checklist

- Loading, error, empty, and success states exist for async flows.
- Keyboard navigation can complete the flow without traps or hidden controls.
- Images have meaningful alt text, or `alt=""` when decorative.
- Form inputs have associated labels and field-level errors.
- Destructive actions have confirmation, undo, or clear recovery.

## References

- [Nielsen Norman: 10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/)
- [WCAG 2.1 Quick Reference](https://www.w3.org/WAI/WCAG21/quickref/)
