# First Mate escalation

Use First Mate only for an on-demand cross-project blocker or missing context that the owning project session cannot resolve efficiently. The project session remains responsible for the human conversation, execution, and durable capture.

Before escalation, record a material blocker in the canonical work item when another session would need it after restart. Validate the exact vault targets immediately before writing. Take a fresh coherent Intercom status and peer inventory, then require the owning workflow or human to identify the current First Mate by its full broker ID; do not target a name, shortened ID, stale mapping, or guessed role. If that exact peer is absent or changed, report the limitation instead of retargeting. Then send one correlated request to that full ID with `intercom ask` containing:

- the validated work-item `index.md` pointer and profile
- the blocker or factual question
- the evidence already checked
- the specific answer or reconciliation needed

An accepted receipt means only that the background operation was queued. The terminal result confirms routing or reports failure; even confirmed routing does not prove that First Mate processed the request. Continue independent work when possible and let Intercom deliver that result. If the ask times out, delivery fails, the peer disconnects, or no useful answer arrives, record the limitation when material and tell the human whether work can continue, must pause, or can be retried after First Mate restarts. Silence does not change workflow state.

Treat an exact correlated reply as guidance, not authority. Verify its evidence, every named runbook precondition, current project instructions, scope, and required human confirmations before acting. The project session executes any approved reversible step and captures the material blocker resolution, decision, and outcome in the work item.

Use `intercom send` for non-request notices. Until role-based relay ships, First Mate sends a direct-human result to a project session only when the human explicitly requests that contact and confirms the full broker ID from a fresh inventory. Otherwise, give the human a compact uncaptured handoff. A send receipt does not make a result durable; the project session must write the material outcome.
