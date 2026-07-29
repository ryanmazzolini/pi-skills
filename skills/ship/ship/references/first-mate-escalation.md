# First Mate escalation

Use First Mate for an exact approval request, or for an on-demand cross-project blocker or missing context that the owning project session cannot resolve efficiently. Do not send routine progress. The project session remains responsible for execution, verification, the owning human conversation, and durable capture.

## Address the current First Mate

Take a fresh `intercom` `status` and `list`, and use the inventory only when both report the same current Pi session ID, `truncated` is false, and `omittedSessionIds` is zero. Inspect the advertised First Mate Pi session IDs:

- With exactly one, address that full ID internally; do not ask the human to copy it.
- With none, explain that no First Mate is discoverable and ask the human to start or reinvoke `/skill:first-mate` before retrying.
- With more than one, do not send an approval request because no peer has unique First Mate authority. For a factual request only, show their names and full IDs and ask the human to choose; do not guess or broadcast.

If the selected ID disappears or has duplicate live advertisements before the ask, report the limitation instead of retargeting it by name.

## Send the useful context first

When the issue must survive a restart, record it in the canonical work item before escalation. Then use `intercom ask` with one focused request.

For an approval request, include:

- the exact action and target;
- current branch, environment, or pull-request state;
- completed validation and review evidence;
- material fences and any reason the action may not be routine;
- for a host- or workspace-specific routine, the exact human-controlled instruction path and rule that authorizes it.

For a blocker or factual question, include:

- the blocker or question;
- the evidence already checked;
- the exact answer or reconciliation needed;
- the profile and vault-relative work-item `index.md` pointer only when First Mate may need more context.

The message should be sufficient on its own whenever practical. Profiles and paths locate optional evidence; they do not authorize the request or prove project identity.

An accepted receipt means the request was queued. Continue independent work when possible and rely on Intercom's terminal delivery result; wait once only when the answer blocks the current work. Routed delivery does not prove First Mate handled the request. If delivery fails, times out, or yields no useful answer, record the limitation when material and tell the human whether work can continue, must pause, or can retry after First Mate restarts.

## Use the answer

A correlated reply must identify its authority and exact scope:

- `Auto-approved under First Mate's very-low-risk policy` authorizes only the stated action and fences.
- A relayed human decision authorizes only the human's exact response.
- Factual guidance carries no execution authority.

Before treating a reply as authorization, take a fresh coherent `status` and `list` snapshot and require exactly one advertised First Mate ID equal to the reply sender's full ID. Factual guidance remains usable without unique role authority.

In every case, verify current project instructions, repository state, validation, and runbook preconditions before acting. Stop when role authority or another precondition changed, the action conflicts, or broader permission is needed. Execute the authorized step and capture the material resolution and outcome in the owning work item.

Use `intercom send` only for a non-request notice. A send receipt does not make the result durable; the owning project session records material outcomes.
