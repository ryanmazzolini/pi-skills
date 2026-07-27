# Connected-session triage

Read this only for a human-requested First Mate triage or an immediate response to its retained `Load the next page?` question. Triage is a read-only, oldest-first series of bounded evidence pages. It ends when every page is loaded or the human stops, then may propose exact stale-session recon.

## Take the initial snapshot

1. Call `intercom` `status`, then `intercom` `list`. Use the inventory only when both report the same current Pi session ID, `truncated` is false, and `omittedSessionIds` is zero; do not retry a changed or capacity-truncated snapshot automatically. Record the coherent inventory time as the triage snapshot timestamp.
2. Call `intercom` once with only `action: "pending"`. Its projection is already bounded, so do not pass `limit` or other fields.
3. Exclude First Mate and account for every other connected peer. Put unidentified peers and duplicate live advertisements of one Pi session ID under `Unknown`; do not inspect or contact them.
4. Put every exact pending ask under `Needs attention` without tailing it. Put active peers without a pending ask under `No action` without tailing them.
5. Order the remaining identified idle peers without pending asks by advertised last conversational timestamp, oldest first. Put peers whose age is unavailable after timestamped peers. Use the full Pi session ID as the tie-breaker. Retain this exact queue and the advertised timestamps for the triage series.
6. Load the first page as described below.

An advertised timestamp orders the queue; the confirmed tail supplies classification and recon evidence. Older or unreloaded peers may not advertise one and sort after known ages.

## Load one page

Take at most the next 16 retained peers. Tail each by full ID with `limit: 8`, `tailScanBytes: 2097152`, and `tailProjectionBytes: 4096`. A page is therefore bounded to 32 MiB scanned and 64 KiB projected. Pending asks and active peers do not consume page slots.

Classify each loaded peer using the narrowest supported category:

- **Needs attention:** an unanswered persisted user request, or current text saying work is blocked or awaiting a human decision.
- **May need attention:** current text shows unfinished work, a failed attempted step, or an unresolved next action without a clear human blocker.
- **Unknown:** the tail is unavailable, oversized, malformed, replaced, changed, or truncated past evidence needed to classify it.
- **No action:** current evidence clearly says the requested work completed or intentionally stopped with no unresolved request.

Idle status, age, tool volume, cwd, a failed outcome, or silence does not establish attention by itself. Tool outcomes support nearby conversational text; they do not independently establish a blocker. When two categories remain plausible, choose the less certain one and name the limitation.

Do not read project files, infer disconnected sessions, or contact a peer during triage. Missing tail capability leaves page classifications `Unknown`; the inventory and page order remain useful.

Retain each successful tail's exact `lastConversationalTimestamp`. Compute every displayed age against the initial triage snapshot timestamp. A loaded peer is **stale** when its confirmed last conversational message was at least seven days (168 hours) before that timestamp. A missing or unusable confirmed timestamp does not establish staleness.

## Present pages and continue

On the first page, lead with `Needs attention`, then `May need attention`, `Unknown`, and `No action`. On later pages, report the newly loaded peers under those same categories without repeating earlier entries. Give each reported peer its self-declared name, one useful evidence sentence, and one of these forms:

- `last message 13 days ago`
- `active now`
- `last message age unavailable`

Use sensible smaller units for ages under a day. Show a full Pi session ID only when the name is missing or duplicated. Include the initial snapshot timestamp and cumulative accounting totals: pending asks, active peers skipped, peers loaded, peers limited by capability or invalid identity, and peers not yet loaded.

Do not list every not-yet-loaded peer under `Unknown`. Report one `Not loaded yet` count instead. For example, with 21 queued idle peers, load the oldest 16, report `Not loaded yet: 5`, and ask to load those 5; do not classify them or propose recon yet.

When retained peers remain, show the next page size and the oldest available age at its front, then ask one question:

> Load the next 5 sessions?

Stop without loading them. A clear acceptance in the human's next response loads exactly that retained page without refreshing or reordering the initial snapshot. A clear decline, or an explicit direction to stop loading and finish, ends pagination and proceeds to the recon proposal below. Any other response expires the retained queue and proposal; a later continuation requires a new triage.

## Finish with a recon proposal

After every page is loaded or the human stops pagination, list every recon candidate accumulated from loaded pages. A candidate must have been idle in the initial snapshot, have no exact pending ask, and be stale from its confirmed tail timestamp. Its attention category does not otherwise affect eligibility. Exclude active peers, pending asks, peers with unknown ages, peers not loaded, and peers whose tail changed or failed.

When candidates exist, display the complete candidate list with names and pre-recon ages, then ask:

> Send the status-only recon request to these sessions?

Stop without contacting a peer. Retain each candidate's full Pi session ID, raw conversational timestamp, and rendered age with the initial snapshot timestamp. Route to [confirmed stale-session recon](recon.md) only when the human's next response clearly directs First Mate to send that request to the displayed list without changing it. Any other response expires the proposal.

When there are no candidates, report that no recon is proposed and stop. Suggest Ship only when evidence explicitly shows a cross-session recovery or coordination need. Triage does not create work items.
