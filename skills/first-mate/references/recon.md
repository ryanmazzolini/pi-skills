# Confirmed stale-session recon

Read this only when the human's next response clearly directs First Mate to send the fixed status request to the exact candidate list displayed by the latest triage. Recon is limited to that retained set. If the direction is later, changes the list, or the retained snapshot data is unavailable, run a new triage instead.

## Revalidate the retained candidates

Refresh `intercom` `status` and `list` once, and require both to report the same current Pi session ID with `truncated` false and `omittedSessionIds` equal to zero. On an identity mismatch or capacity-truncated inventory, send no asks and report that recon did not run.

Revalidate each retained full candidate ID against that one fresh inventory. Keep only IDs present exactly once and idle. Skip an absent, duplicated, or newly active ID; if the old name appears under another ID, treat the peer as changed and skip it. Do not substitute a new peer, add a newly discovered stale peer, retarget by name, retry the refresh, or expand beyond the triage snapshot.

Preserve each retained raw conversational timestamp and rendered pre-recon age. Asking creates a new conversational message and must not replace that baseline.

## Ask for status only

Ask all remaining candidates in parallel, without waiting for one reply before starting another. Target each retained full ID with the same request:

> Status-only recon; do not change project or note state. Summarize: purpose and current status; completed work; uncommitted or untracked changes; remaining steps, validation, and blockers; existing durable notes and their location; and whether this session is safe to close. Use read-only inspection if needed. Do not edit files or notes, run mutating commands, commit, move notes, close sessions, or perform cleanup.

Report each initial ask receipt with its original form, such as `pre-recon: last message 13 days ago`. Do not recompute that age from a post-ask tail. Stop after reporting the initial receipts; do not wait or poll for terminal routing outcomes or replies.

## Reconcile asynchronous replies

Terminal routing outcomes and replies can arrive after the initial receipts. Reconcile only outcomes and replies delivered to this session, or provide an update when the human requests one. Summarize each peer's purpose and status, completed work, working-tree state, remaining work and blockers, durable notes, and safe-to-close answer. Keep unanswered, failed, and skipped peers visible.

A safe-to-close answer is evidence for the human, not cleanup authority. Do not move notes, edit project state, commit, close sessions, kill processes, or take another cleanup action automatically. Do not poll indefinitely, schedule recon, turn it into an unattended background job, or add peers outside the retained triage snapshot.
