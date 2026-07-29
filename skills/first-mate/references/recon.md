# Confirmed stale-session recon

Read this only when the human's next response clearly directs First Mate to send the fixed status request to the exact candidate list displayed by the latest triage. Recon is limited to that retained set. If the direction is later, changes the list, or the retained snapshot data is unavailable, run a new triage instead.

## Revalidate the retained candidates

Refresh `intercom` `status` and `list` once, and require both to report the same current Pi session ID with `truncated` false and `omittedSessionIds` equal to zero. On an identity mismatch or capacity-truncated inventory, send no asks and report that recon did not run.

Revalidate each retained full candidate ID against that one fresh inventory. Keep only IDs present exactly once and idle. Skip an absent, duplicated, or newly active ID; if the old name appears under another ID, treat the peer as changed and skip it. Do not substitute a new peer, add another candidate, retarget by name, retry the refresh, or expand beyond the triage snapshot.

Preserve each retained raw conversational timestamp and rendered pre-recon age. Asking creates a new conversational message and must not replace that baseline.

## Ask for status only

Ask all remaining candidates in parallel, without waiting for one reply before starting another. Target each retained full ID with the same request:

> Read-only status check. In at most three bullets, give the current state or outcome; remaining work, blockers, and any uncommitted changes; then the recommended next step and whether this session is safe to close. Mention a durable handoff only if one exists. Do not edit files or notes, run mutating commands, commit, clean up, or close anything.

Report one compact receipt such as `Status requested from api-cleanup and deploy-check.` Name skipped or failed requests individually only when the human can act on the limitation. Stop after the initial receipts; do not wait or poll for terminal routing outcomes or replies.

## Reconcile asynchronous replies

Reconcile only terminal outcomes and replies delivered to this session, or provide an update when the human requests one. Use one compact bullet per peer: current state, then the recommended next step. Mention an uncommitted change, blocker, or durable handoff only when present. Aggregate peers that remain unanswered.

A safe-to-close answer is evidence for the human, not cleanup authority. Do not move notes, edit project state, commit, close sessions, kill processes, or take another cleanup action automatically. Do not poll indefinitely, schedule recon, turn it into an unattended background job, or add peers outside the retained triage snapshot.
