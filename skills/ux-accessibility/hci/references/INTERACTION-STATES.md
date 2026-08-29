# Interaction States

Use this when reviewing async flows, forms, empty states, destructive actions, or recovery paths.

## Communicate through the flow first

Apply this before the state-specific guidance below. Let status, labels, field values, actions, and layout carry the ordinary state before adding explanatory copy. A requirement to explain an implementation boundary does not justify persistent prose when the control or flow itself communicates the wrong outcome.

Add persistent prose only when it contributes information the surrounding interface cannot carry, such as a material reason, unfamiliar constraint, or verified recovery step. A status chip, heading, or field prefix is still repetition when it only restates the same boundary. For example, prefer **Quantity to put away** and **Remaining quantity** over repeating **Preview** throughout a read-only flow.

Do not invent recovery steps or use a disclaimer to compensate for an action whose label or behavior misstates the flow. Rename, remove, or challenge the misleading action instead. Every visible action must match the state being presented; do not carry an item-correction action into a recommendation or availability state. Preserve specific errors and first-class reasons that help the user understand or act.

Before returning UI text, scan each visible string. Replace service names, internal state, ownership, allocation, persistence, and session language with terms the user encounters in the task. Treat backend messages and existing UI copy as evidence to translate, not text to preserve verbatim.

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

First distinguish an empty surface from one missing value inside an otherwise usable surface. For a missing value, keep the familiar field and layout, use the product's established empty-value convention, and let the nearby status explain the state. Do not repeat the absence in a sentence.

When the surrounding interface cannot carry useful additional information, an empty state may explain why the area is empty and what the user can do next.

Useful empty states include:

- first-use guidance
- filtered/no-results state with clear reset path
- permission or availability explanation
- next best action when creation is expected

State only what the evidence proves. A missing recommendation, prediction, or response does not prove that the underlying option is impossible or unsafe. Translate a material reason into user terms without exposing internal codes, services, ownership boundaries, or source-system wording. For example, a **No recommendation** status beside **Destination —** can communicate the ordinary state without a sentence about which service returned what.

Show a next action only when the product supports it or the workflow evidence verifies it. When no recovery is known, omit it rather than inventing a retry, escalation, or manual process. Avoid generic "No data" copy when the user's next step is knowable.

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
