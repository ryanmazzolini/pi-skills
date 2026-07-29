# Connected-session triage

Read this only for a human-requested First Mate triage. Triage is read-only. It automatically inspects the relevant idle sessions in bounded internal pages, then returns one compact, recommendation-oriented result.

## Take the snapshot and choose the sweep

1. Call `intercom` `status`, then `intercom` `list`. Use the inventory only when both report the same current Pi session ID, `truncated` is false, and `omittedSessionIds` is zero; do not retry a changed or capacity-truncated snapshot automatically. Record the coherent inventory time as the triage snapshot timestamp.
2. Call `intercom` once with only `action: "pending"`. Its projection is already bounded, so do not pass `limit` or other fields.
3. Exclude First Mate and account for every other connected peer. Peers without a unique stable ID cannot be inspected or contacted; retain only their count as a limitation.
4. Surface every exact pending ask without tailing it. Skip active peers without a pending ask.
5. Partition the remaining identified idle peers from their advertised last conversational timestamp:
   - **First sweep:** at least 24 hours old.
   - **Newer fallback:** under 24 hours old, followed by peers whose age is unavailable.
   Order each sweep oldest first, use the full Pi session ID as the tie-breaker, and retain the advertised timestamps.
6. Load the entire first sweep when it is nonempty. If it contains no peer whose tail confirms a last conversational message at least 24 hours old, load the newer fallback instead. When the first sweep is empty, load the newer fallback directly. Do not mix newer peers into a successful first sweep merely to fill a page.

An advertised timestamp selects and orders a sweep; the confirmed tail supplies recommendation and status-recon evidence. Older or unreloaded peers may not advertise an age and therefore enter the fallback. Without tail capability, do not attempt the sweep: return any pending asks and one compact inspection limitation.

## Load the sweep

Process the selected sweep to completion in internal pages of at most 16 peers. Do not stop, ask permission, or emit a report between pages. Tail each peer by full ID with `limit: 8`, `tailScanBytes: 2097152`, and `tailProjectionBytes: 4096`. Each page is bounded to 32 MiB scanned and 64 KiB projected.

Use current conversational evidence to choose a concrete next step:

- **Reply:** an exact pending Intercom ask needs a human answer.
- **Decide:** current text clearly identifies a human-owned choice or blocker.
- **Resume:** the latest persisted user request has no assistant answer.
- **Inspect:** work appears unfinished, an attempted step failed, a next action remains unresolved, or the tail lacks enough evidence.
- **Ask for status:** the peer is confirmed idle for at least 24 hours and no more specific human action supersedes a status check.
- **No interaction:** current evidence clearly says the requested work completed or intentionally stopped, unless a 24-hour status check would usefully confirm that it is safe to close.

Idle status, age, tool volume, cwd, a failed outcome, or silence does not establish unfinished work by itself. Tool outcomes support nearby conversational text; they do not independently establish a blocker. Do not read project files, infer disconnected sessions, or contact a peer during triage.

Retain each successful tail's exact `lastConversationalTimestamp` and compute age against the initial snapshot timestamp. A peer is eligible for status recon when it was idle in the initial snapshot, has no exact pending ask or more specific human-owned next step, and its confirmed last conversational message was at least 24 hours before the snapshot. Missing or unusable confirmed timestamps do not establish eligibility.

## Return a compact result

Return one user-facing response after the automatic sweep. Lead with the sessions where interaction could help, one compact bullet each:

- `Decide for deploy-check — choose whether to retry production validation (27h idle).`
- `Ask api-cleanup for status — implementation stopped after a failed integration test (31h idle).`
- `Inspect notes-sync — the available tail does not show whether cleanup finished (6h idle).`

Use the peer's self-declared name and one evidence sentence. Show a full Pi session ID only when the name is missing or duplicated. Keep recommendation verbs explicit: `Reply`, `Decide`, `Resume`, `Inspect`, or `Ask for status`. Order recommendations by those verbs, with status checks last.

Collapse peers with no suggested interaction into one count. Mention active, unidentified, unavailable, or uninspected counts only when they materially limit the result. Omit successful capability checks, the snapshot timestamp, category headings, cumulative accounting, page sizes, and pagination mechanics.

The `Ask for status` bullets are the complete status-recon candidate list; do not repeat them in a separate report. When at least one exists, end with one question:

> Ask these sessions for status?

Stop without contacting them. Retain each candidate's full Pi session ID, raw conversational timestamp, and rendered age with the initial snapshot timestamp. Route to [confirmed stale-session recon](recon.md) only when the human's next response clearly directs First Mate to send that request to the displayed list without changing it. Any other response expires the proposal.

When there are no status-recon candidates, do not explain the cutoff or say that no recon is proposed. Recommend the highest-value supported interaction from the loaded evidence and end with one short question for the next operation First Mate can perform, such as `Inspect checkout-ui?` If a reply or decision requires human content, ask for that content instead of guessing. When no peer needs interaction, say only `No session needs interaction right now.`
