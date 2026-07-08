# Usability Heuristics

Use these as review lenses, not as a rigid checklist. Tie each issue to a concrete user task and a visible behavior of the surface — UI, API response, CLI output, or error message.

## System status

The user should be able to tell what the system is doing and what changed.

Look for:

- async actions with no pending state
- stale data after mutation
- hidden autosave or background work
- progress that cannot be distinguished from failure

Prefer:

- inline pending indicators near the triggering control
- timestamps or status copy when freshness matters
- optimistic updates only when recovery is clear

## Match the user's language

UI language should reflect the user's domain, not implementation concepts.

Look for:

- labels named after database fields, routes, or internal states
- overloaded terms used differently across screens
- instructions that describe system mechanics instead of user outcomes

Prefer:

- task-oriented labels
- examples beside unfamiliar fields
- consistent terms across navigation, headings, buttons, and errors

## User control and recovery

Users need exits, undo, and recovery paths for risky actions.

Look for:

- destructive actions without confirmation or undo
- modal flows without keyboard escape or clear cancel
- forms that lose entered data after validation or navigation errors

Prefer:

- undo for reversible destructive actions
- confirmation for irreversible destructive actions
- preserving user input across failures

## Consistency and recognition

The interface should reduce memory load by reusing patterns.

Look for:

- similar actions with different labels or placements
- custom controls that behave unlike native controls
- repeated validation rules expressed differently across forms

Prefer:

- common component behavior for repeated interaction patterns
- visible options over hidden commands
- predictable placement for primary, secondary, and destructive actions

## Error prevention and diagnosis

Prevent common mistakes before they happen; make recovery specific when they do.

Look for:

- ambiguous required fields
- constraints revealed only after submit
- generic error banners with no field-level guidance

Prefer:

- input examples, constraints, and format hints before submit
- field-level errors plus summary for long forms
- errors that explain what happened and how to fix it

## Minimal, useful UI

Remove visual and interaction noise that competes with the primary task.

Look for:

- multiple primary buttons in one decision area
- repeated explanatory text that users must reread
- dashboard cards or controls with no clear next action

Prefer:

- one obvious primary action per region
- progressive disclosure for secondary detail
- content hierarchy that mirrors task priority
