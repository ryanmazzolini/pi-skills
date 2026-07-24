# Connected-session triage

Read this only after the human asks First Mate to triage connected sessions. Triage is one bounded, read-only evidence pass that ends with a report and, when eligible peers exist, an exact recon proposal.

## Take one bounded snapshot

1. Call `intercom` `status`, then `intercom` `list`. Use the inventory only when both report the same current Pi session ID, `truncated` is false, and `omittedSessionIds` is zero; do not retry a changed or capacity-truncated snapshot automatically. Record the time the coherent inventory was obtained as the triage snapshot timestamp.
2. Call `intercom` once with only `action: "pending"`. Its projection is already bounded, so do not pass `limit` or other fields.
3. Exclude First Mate and account for every other connected peer exactly once.
4. Put peers without a stable Pi session ID under `Unknown` as legacy peers. Then build one classification queue from identified peers: exact pending asks first, then remaining non-active peers, with full Pi session ID as the tie-breaker. Keep the first 16 and put every excess peer under `Unknown` with the classification-budget limitation. Treat duplicate live advertisements of one Pi session ID as `Unknown` and do not inspect or contact either connection.
5. Put a queued peer with an exact pending ask under `Needs attention` without tailing merely to corroborate the ask.
6. Tail each other queued peer by its full ID with `limit: 8`, `tailScanBytes: 2097152`, and `tailProjectionBytes: 4096`.
7. Put active peers without a pending ask under `No action` without tailing them.

The 16-peer queue limits one triage to 32 MiB scanned and 64 KiB projected. Do not read project files, infer disconnected sessions, or contact a peer during this pass. Missing tail capability leaves dependent classifications and ages `Unknown`; the inventory remains useful.

Retain the snapshot timestamp and every tail's exact `lastConversationalTimestamp`. Compute all displayed ages against that one snapshot timestamp.

## Classify and date the evidence

Use the narrowest supported category:

- **Needs attention:** an exact pending ask, an unanswered persisted user request, or current text saying work is blocked or awaiting a human decision.
- **May need attention:** current text shows unfinished work, a failed attempted step, or an unresolved next action without a clear human blocker.
- **Unknown:** the peer was not inspected; its tail is unavailable, oversized, malformed, replaced, or changed; or truncation removed context needed to classify it.
- **No action:** the peer is active, or current evidence clearly says the requested work completed or intentionally stopped with no unresolved request.

Idle status, age, tool volume, cwd, a failed outcome, or silence does not establish attention by itself. Tool outcomes support nearby conversational text; they do not independently establish a blocker. When two categories remain plausible, choose the less certain one and name the limitation.

A peer is **stale** when its last eligible conversational message was at least seven days (168 hours) before the triage snapshot timestamp. A missing or unusable timestamp has unknown age and does not establish staleness.

## Present the report and recon proposal

Lead with `Needs attention`, then `May need attention`, `Unknown`, and `No action`. List every peer once with its self-declared name, one sentence of useful evidence or limitation, and one of these clear age forms:

- `last message 13 days ago` when an eligible conversational timestamp is available
- `active now` when the inventory reports the peer active
- `last message age unknown` when no dependable age is available

Use sensible smaller units for ages under a day. Show a full Pi session ID only when the name is missing or duplicated. Include the snapshot timestamp and accounting totals so the report covers every connected peer and makes the 16-peer budget visible.

After the report, list every **recon candidate** retained from the 16-peer queue. A candidate must have been idle, have no exact pending ask, and be stale from its retained pre-recon conversational timestamp. Its attention category does not otherwise affect eligibility. Exclude active peers, peers with exact pending asks, peers with unknown ages, and peers outside the queue.

When candidates exist, display the complete list with names and pre-recon ages, then ask one focused question, for example:

> Send the status-only recon request to these 3 sessions?

Stop after the question without contacting a peer. Retain each candidate's full Pi session ID, raw conversational timestamp, and rendered age with the snapshot timestamp. Route to [confirmed stale-session recon](recon.md) only when the human's next response clearly directs First Mate to send the request to that displayed list without adding or removing peers. Any other response expires the proposal.

When there are no candidates, report that no recon is proposed and stop without asking for approval.

Suggest Ship only when evidence explicitly shows a cross-session recovery or coordination need. Triage does not create work items.
