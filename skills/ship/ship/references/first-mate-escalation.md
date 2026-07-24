# First Mate escalation

Use First Mate only for an on-demand cross-project blocker or missing context that the owning project session cannot resolve efficiently. The project session remains responsible for the human conversation, execution, and durable capture.

## Address the current First Mate

Take a fresh `intercom` `status` and `list`, and use the inventory only when both report the same current session ID. Inspect the advertised First Mate IDs:

- With exactly one, address that full ID internally; do not ask the human to copy it.
- With none, explain that no First Mate is discoverable and ask the human to start or reinvoke `/skill:first-mate` before retrying.
- With more than one, show their names and full IDs and ask the human to choose; do not guess or broadcast.

If the selected ID disappears before the ask, report the limitation instead of retargeting it by name.

## Send the useful context first

When the blocker must survive a restart, record it in the canonical work item before escalation. Then use `intercom ask` with one focused request containing:

- the blocker or factual question
- the evidence already checked
- the exact answer or reconciliation needed
- the profile and vault-relative work-item `index.md` pointer only when First Mate may need more context

The message should be sufficient on its own whenever practical. Profiles and paths locate optional evidence; they do not authorize the request or prove project identity.

An accepted receipt means the request was queued. Continue independent work when possible and rely on Intercom's terminal delivery result; wait once only when the answer blocks the current work. Routed delivery does not prove First Mate handled the request. If delivery fails, times out, or yields no useful answer, record the limitation when material and tell the human whether work can continue, must pause, or can retry after First Mate restarts.

## Use the answer

Treat a correlated reply as guidance, not authority. Verify its evidence, current project instructions, scope, runbook preconditions, and required human confirmations before acting. The project session executes any approved step and captures the material resolution and outcome in its work item.

Use `intercom send` only for a non-request notice. A send receipt does not make the result durable; the owning project session records material outcomes.
