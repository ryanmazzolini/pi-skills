# Automatic stale-session recon

Read this when the current deterministic triage result identifies Ask-for-status candidates. Status recon is a bounded, read-only automatic action; it does not require another human confirmation.

## Ask for status

Ask only candidates that meet every condition:

- The triage tail was successfully validated.
- The peer remained idle in that snapshot.
- No pending ask or more specific action supersedes status recon.
- The confirmed last conversational message was at least 24 hours before the triage timestamp.

Missing, changed, failed, or unusable timestamps do not establish eligibility.

Ask every candidate in parallel by its retained full Pi session ID:

> Read-only status check. In at most three bullets, give the current state or outcome; remaining work, blockers, and any uncommitted changes; then the recommended next step and whether this session is safe to close. Mention a durable handoff only if one exists. Do not edit files or notes, run mutating commands, commit, clean up, or close anything.

Each `ask` re-resolves the exact stable ID before routing and awaits a correlated response asynchronously. Do not substitute another peer, retarget by name, or expand beyond the validated triage candidates.

Report one compact initial result such as `Requested status from api-cleanup and deploy-check.` Name skipped or failed requests only when the human can act on the limitation. Do not wait or poll before returning the rest of the triage result.

## Reconcile asynchronous replies

Reconcile terminal outcomes and replies delivered to this session, or provide an update when the human requests one. Use one compact bullet per peer: current state, then the recommended next step. Mention an uncommitted change, blocker, or durable handoff only when present. Aggregate peers that remain unanswered.

A safe-to-close answer is evidence for the human, not cleanup authority. Leave project changes, cleanup, and session closure to the human or owning session. Stop after reconciling delivered replies; do not poll, schedule recon, or turn it into an unattended job.
