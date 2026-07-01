# Language

Use these terms consistently when discussing frontend HCI review opportunities.

**Flow**
A user-visible sequence for completing a task, such as onboarding, checkout, search, edit, submit, approve, or recover from an error.

**UI contract**
Everything users and callers must be able to rely on: labels, layout behavior, interaction states, keyboard behavior, accessible names/roles/states, validation, errors, side effects, and recovery paths.

**Interaction state**
A visible state that changes what the user can understand or do: loading, pending, disabled, empty, error, success, stale, selected, expanded, invalid, or completed.

**User friction**
Extra work, guessing, waiting, re-entry, memory load, or recovery effort required to complete a task.

**Affordance**
A cue that tells the user what an element does or how to interact with it.

**Progressive disclosure**
Showing the simplest useful information first, then revealing detail when it becomes relevant.

**Semantic control**
A native HTML element or correctly modeled custom control whose role, name, state, keyboard behavior, and focus behavior match user expectations.

**Recovery path**
The way a user gets back to a safe or successful state after an error, cancellation, destructive action, lost connectivity, invalid input, or accidental navigation.

**Pattern ownership**
The place responsible for a repeated interaction rule, such as validation display, dialog focus management, table empty states, or async mutation feedback. Good ownership means callers stop reimplementing the same rule.

**Heuristic**
A practical usability or accessibility principle used to explain why a UI issue matters. A heuristic is evidence framing, not proof by itself.
