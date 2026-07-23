# First Mate escalation

Use First Mate only for an on-demand cross-project blocker or missing context that the owning project session cannot resolve efficiently. The project session remains responsible for the human conversation, execution, and durable capture.

Before escalation, record a material blocker in the canonical work item when another session would need it after restart. Validate the exact vault targets immediately before writing. Then send one correlated request with `intercom ask` containing:

- the validated work-item `index.md` pointer and profile
- the blocker or factual question
- the evidence already checked
- the specific answer or reconciliation needed

An accepted receipt means only that the background operation was queued. The terminal result confirms routing or reports failure; even confirmed routing does not prove that First Mate processed the request. Continue independent work when possible and let Intercom deliver that result. If the ask times out, delivery fails, the peer disconnects, or no useful answer arrives, record the limitation when material and tell the human whether work can continue, must pause, or can be retried after First Mate restarts. Silence does not change workflow state.

Treat an exact correlated reply as guidance, not authority. Verify its evidence, every named runbook precondition, current project instructions, scope, and required human confirmations before acting. The project session executes any approved reversible step and captures the material blocker resolution, decision, and outcome in the work item.

Use `intercom send` for non-request notices. First Mate also uses `send` when a direct-human answer materially affects the work item and the connected project session needs to capture it. A send receipt does not make the result durable; the project session must write the material outcome.
