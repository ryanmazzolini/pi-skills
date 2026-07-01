# Interaction States

Use this when reviewing async flows, forms, empty states, destructive actions, or recovery paths.

## Loading and pending

Loading states should answer: what is happening, what can I still do, and what happens next?

Prefer:

- disabling only the control or region that is actually pending
- preserving visible context while data refreshes
- skeletons or partial content when shape is predictable
- progress indicators for long-running actions

Avoid:

- full-page spinners when only one region is loading
- controls that accept duplicate submissions without feedback
- hiding previous content during a background refresh unless stale content is dangerous

## Empty states

Empty states should explain why the area is empty and what the user can do next.

Useful empty states include:

- first-use guidance
- filtered/no-results state with clear reset path
- permission or availability explanation
- next best action when creation is expected

Avoid generic "No data" copy when the user's next step is knowable.

## Error states

Error states should support recovery.

Good errors include:

- what failed in user terms
- whether user work was preserved
- how to retry or fix the issue
- a fallback path when retry is unlikely to help

Use field-level errors for field-specific problems. Use banners or alerts for page-level/system problems.

## Success and completion

Success states should confirm the outcome and clarify the next step.

Consider:

- inline confirmation for small actions
- receipt/details page for consequential actions
- toast only for low-risk background confirmations
- navigation or next-step CTA when the task naturally continues

Do not rely on transient toasts for critical confirmation the user may need later.

## Destructive actions

Destructive actions need proportionate safeguards.

Choose one:

- **Undo** when the action is easy to reverse and immediate recovery is possible.
- **Confirmation** when the action is irreversible, broad, or surprising.
- **Typed confirmation** only for rare, high-impact destruction.

Make destructive actions visually and semantically distinct without making safe actions harder to find.

## Forms and validation

Prefer progressive, helpful validation over punishment after submit.

- Show constraints before they are violated when practical.
- Validate on blur or submit for fields where premature validation is noisy.
- Preserve input after errors.
- Put summary errors at the top of long forms and field errors near fields.
- Keep the submit action available unless disabled state has an explanation.
