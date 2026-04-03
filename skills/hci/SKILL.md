---
name: hci
description: Usability heuristics, WCAG accessibility, responsive design. Use when reviewing or writing UI components, CSS, or discussing UX.
---

# HCI Standards

## Opinionated Defaults

- Semantic HTML first, ARIA only when native elements can't do the job
- Skeleton states over loading spinners
- Actionable error messages over generic ones ("Email format: name@example.com" not "Invalid input")
- Progressive enhancement: works without JavaScript, better with it
- Mobile-first CSS with relative units (rem, %, vw/vh)

## Thresholds

- Color contrast: 4.5:1 normal text, 3:1 large text
- Touch targets: minimum 44x44px
- Focus indicators: visible on all interactive elements (`outline: 2px solid`, not `outline: none`)

## Review Checklist

- Loading/error/success states for all async operations
- Keyboard navigation works through entire flow
- Images have meaningful alt text (or `alt=""` for decorative)
- Form inputs have associated labels
- Destructive actions have confirmation dialogs

## References

- [Nielsen Norman: 10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/)
- [WCAG 2.1 Quick Reference](https://www.w3.org/WAI/WCAG21/quickref/)
