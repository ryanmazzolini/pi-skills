# Accessibility Reference

Use this when reviewing UI components, forms, focus behavior, custom controls, or screen-reader support.

## Semantic HTML

Prefer native elements because they bring keyboard, focus, role, and state behavior for free.

- Use `button` for actions, `a` for navigation.
- Use real form controls with associated `label` elements.
- Use headings in document order; do not choose heading levels by visual size alone.
- Use lists, tables, and landmarks when they describe the content structure.

Add ARIA only to fill semantic gaps. ARIA should not replace broken native behavior.

## Keyboard flow

A user should be able to complete the core flow using only the keyboard.

Check that:

- every interactive control is reachable in a logical order
- focused elements are visible and have a visible focus indicator
- custom controls support expected keys, such as Enter, Space, Escape, and arrow keys where appropriate
- focus returns to a sensible place after dialogs, menus, route changes, or destructive confirmations
- there are no keyboard traps

## Focus indicators

Focus indicators must be visible against adjacent colors.

Defaults:

- avoid `outline: none` unless replacing it with an equally visible style
- prefer at least a 2px outline or ring
- preserve browser defaults when the custom design does not improve them

## Forms

Each input needs a durable relationship to its label, help text, and error text.

Check that:

- labels are programmatically associated with inputs
- required fields are indicated in text, not color alone
- errors identify the field, the problem, and the repair
- invalid fields expose state to assistive technology when custom behavior is used
- user input is preserved after validation failure

## Images and icons

- Informative images need meaningful alt text.
- Decorative images should use `alt=""`.
- Icon-only buttons need accessible names.
- Do not rely on color or icon shape alone to communicate status.

## Contrast and perception

Thresholds:

- 4.5:1 for normal text
- 3:1 for large text and meaningful non-text UI indicators
- do not communicate errors, success, or selection through color alone

## Screen-reader sanity checks

For complex or custom UI, inspect what a screen reader user would hear:

- Does the control have the right role and accessible name?
- Is state announced, such as expanded, selected, checked, invalid, or busy?
- Are dynamic updates announced only when useful, not noisily?
- Does reading order match visual/task order?
