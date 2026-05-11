# Accessibility for React UI

Use this reference when building forms, custom inputs, comboboxes, dialogs, tables, or keyboard interactions.

## Defaults

- Use native elements first: `button`, `a`, `label`, `input`, `select`, `textarea`, `dialog`, table elements.
- Add ARIA only when native semantics cannot express the behavior.
- Every interactive element needs a visible label or accessible name.
- Disabled, loading, selected, expanded, invalid, and busy states should be exposed visually and semantically where relevant.
- Preserve visible focus indicators and logical tab order.

## Custom Control Pressure Test

Before building a custom combobox, dropdown, modal, menu, tabs, or table interaction, identify:

- keyboard behavior: Tab, Shift+Tab, Enter, Space, Escape, Arrow keys
- focus entry, focus restoration, and outside-click behavior
- screen-reader role, name, value, state, and announcements
- pointer and touch behavior
- empty, loading, error, disabled, and no-results states

If these are not worth owning, use a native control or a proven accessible component.

## Forms

- Associate labels with inputs.
- Put field-level errors near the field and connect them with `aria-describedby` when needed.
- Keep user input after validation errors.
- Make required fields and constraints visible before submission.
- Prefer actionable errors over generic failure text.

## Async UI

- Avoid buttons that appear clickable while work is already in progress.
- Indicate stale, loading, empty, error, and success states near the affected content.
- Do not rely on color alone for status.
