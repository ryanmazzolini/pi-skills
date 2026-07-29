# Connected-session triage

Read this only for a human-requested First Mate triage. Inspection is read-only. Triage automatically inspects the relevant idle sessions in bounded internal pages, auto-advances qualifying work through Intercom, then returns one compact, recommendation-oriented result.

## Take the snapshot and choose the sweep

1. Call `intercom` `status`, then `intercom` `list`. Use the inventory only when both report the same current Pi session ID, `truncated` is false, and `omittedSessionIds` is zero; do not retry a changed or capacity-truncated snapshot automatically. Record the coherent inventory time as the triage snapshot timestamp.
2. Call `intercom` once with only `action: "pending"`. Its projection is already bounded, so do not pass `limit` or other fields.
3. Exclude First Mate and account for every other connected peer. Peers without a unique stable ID cannot be inspected or contacted; retain only their count as a limitation.
4. Retain each pending ask's exact ID and authoritative sender, then exclude those peers from the idle sweep. Pending message text is a preview: classify only from the complete inbound message already delivered to this session, or treat the request as `Reply` with insufficient evidence. Do not tail pending peers yet. Skip active peers without a pending ask.
5. Partition the remaining identified idle peers from their advertised last conversational timestamp:
   - **First sweep:** at least 24 hours old.
   - **Newer fallback:** under 24 hours old, followed by peers whose age is unavailable.
   Order each sweep oldest first, use the full Pi session ID as the tie-breaker, and retain the advertised timestamps.
6. Load the entire first sweep when it is nonempty. If it contains no peer whose tail confirms a last conversational message at least 24 hours old, load the newer fallback instead. When the first sweep is empty, load the newer fallback directly. Do not mix newer peers into a successful first sweep merely to fill a page.

An advertised timestamp selects and orders a sweep; the confirmed tail supplies recommendation and status-recon evidence. Older or unreloaded peers may not advertise an age and therefore enter the fallback. Without tail capability, do not attempt the sweep: return any pending asks and one compact inspection limitation.

## Load the sweep

Process the selected sweep to completion in internal pages of at most 16 peers. Do not stop, ask permission, or emit a report between pages. Tail each peer by full ID with `limit: 8`, `tailScanBytes: 2097152`, and `tailProjectionBytes: 4096`. Each page is bounded to 32 MiB scanned and 64 KiB projected.

Use current conversational evidence to choose a concrete next step:

- **Auto-advance:** an explicit request satisfies every very-low-risk condition in [decision handling](decision-handling.md).
- **Review:** a reversible, nontrivial decision belongs in the human review bundle.
- **Reply:** an exact pending Intercom ask needs human content and does not fit a decision lane.
- **Decide:** current text clearly identifies a consequential human-owned choice or blocker.
- **Resume:** the latest persisted user request has no assistant answer.
- **Inspect:** work appears unfinished, an attempted step failed, a next action remains unresolved, or the tail lacks enough evidence.
- **Ask for status:** the peer is confirmed idle for at least 24 hours and no more specific action supersedes a status check.
- **No interaction:** current evidence clearly says the requested work completed or intentionally stopped, unless a 24-hour status check would usefully confirm that it is safe to close.

Idle status, age, tool volume, cwd, a failed outcome, or silence does not establish unfinished work by itself. Tool outcomes support nearby conversational text; they do not independently establish a blocker or approval precondition. Do not read project files or infer disconnected sessions during triage. The only file-reading exception is the named host or workspace policy verification required by [decision handling](decision-handling.md) for a candidate that would otherwise qualify for Auto-advance.

After loading the complete sweep, process every Auto-advance candidate through the shared pre-delivery rule in [decision handling](decision-handling.md), and contact only candidates that still qualify. Do not wait for peer handling before finishing triage.

Retain each successful tail's exact `lastConversationalTimestamp` and compute age against the initial snapshot timestamp. A peer is eligible for status recon when it was idle in the initial snapshot, has no exact pending ask or more specific human-owned next step, and its confirmed last conversational message was at least 24 hours before the snapshot. Missing or unusable confirmed timestamps do not establish eligibility.

## Return a compact result

Return one user-facing response after the automatic sweep. Lead with Auto-advance outcomes, then sessions where interaction could help, one compact bullet each:

- `Auto-advanced dependency-fix — feature commit, push, and draft PR authorization routed; handling unconfirmed.`
- `Review proper-lock — approve adding the runtime dependency, without committing yet (8h idle).`
- `Decide for deploy-check — choose whether to retry production validation (27h idle).`
- `Ask api-cleanup for status — implementation stopped after a failed integration test (31h idle).`
- `Inspect notes-sync — the available tail does not show whether cleanup finished (6h idle).`

Use the peer's self-declared name and one evidence sentence. Show a full Pi session ID only when the name is missing or duplicated. Keep verbs explicit: `Auto-advanced`, `Review`, `Reply`, `Decide`, `Resume`, `Inspect`, or `Ask for status`. Order recommendations in that sequence, with status checks last. Name an Auto-advance delivery failure or revalidation skip instead of implying authorization was routed.

Collapse peers with no suggested interaction into one count. Mention active, unidentified, unavailable, or uninspected counts only when they materially limit the result. Omit successful capability checks, the snapshot timestamp, category headings, cumulative accounting, page sizes, and pagination mechanics.

The `Review` bullets are the complete low-risk decision bundle. Retain each peer's full ID, exact request, and stated fences. When at least one exists, end with:

> Approve these low-risk decisions?

Route the human's next response through [decision handling](decision-handling.md). An unrelated or ambiguous response expires the proposal.

The `Ask for status` bullets are the complete status-recon candidate list; do not repeat them in a separate report. When there is no Review bundle and at least one status candidate exists, end with:

> Ask these sessions for status?

Stop without contacting status candidates. Retain each candidate's full Pi session ID, raw conversational timestamp, and rendered age with the initial snapshot timestamp. Route to [confirmed stale-session recon](recon.md) only when the human's next response clearly directs First Mate to send that request to the displayed list without changing it. Any other response expires the proposal.

When neither proposal exists, do not explain the status cutoff. Recommend the highest-value supported interaction from the loaded evidence and end with one short question for the next operation First Mate can perform, such as `Inspect checkout-ui?` If a reply or individual decision requires human content, ask for that content instead of guessing. When no peer needs interaction and no Auto-advance action occurred, say only `No session needs interaction right now.`
