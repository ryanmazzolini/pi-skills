# Connected-session triage

Read this only after the human asks First Mate to triage connected sessions. This is a bounded comparison of current session evidence; deeper inspection happens only after the human selects or confirms one peer.

## Take one bounded snapshot

1. Call `intercom` `status`, then `intercom` `list`. Use the inventory only when both report the same current broker ID; do not retry a changed snapshot automatically.
2. Call `intercom` once with only `action: "pending"`. Its projection is already bounded, so do not pass `limit` or other fields.
3. Exclude First Mate and account for every other connected peer exactly once.
4. Build one classification queue: peers with exact pending asks first, then remaining non-active peers, with full broker ID as the tie-breaker. Keep the first 16 and put every excess peer under `Unknown` with the classification-budget limitation.
5. Put a queued peer with an exact pending ask under `Needs attention` without tailing merely to corroborate the ask.
6. Tail each other queued peer by its full ID with `limit: 8`, `tailScanBytes: 2097152`, and `tailProjectionBytes: 4096`.
7. Put active peers without a pending ask under `No action` without tailing them.

The 16-peer queue limits one triage to 32 MiB scanned and 64 KiB projected. Do not read project files, infer disconnected sessions, or message a peer during this comparative pass. Missing tail capability leaves dependent classifications `Unknown`; the inventory remains useful.

## Classify the evidence

Use the narrowest supported category:

- **Needs attention:** an exact pending ask, an unanswered persisted user request, or current text saying work is blocked or awaiting a human decision.
- **May need attention:** current text shows unfinished work, a failed attempted step, or an unresolved next action without a clear human blocker.
- **Unknown:** the peer was not inspected; its tail is unavailable, oversized, malformed, replaced, or changed; or truncation removed context needed to classify it.
- **No action:** the peer is active, or current evidence clearly says the requested work completed or intentionally stopped with no unresolved request.

Idle status, age, tool volume, cwd, a failed outcome, or silence does not establish attention by itself. Tool outcomes support nearby conversational text; they do not independently establish a blocker. When two categories remain plausible, choose the less certain one and name the limitation.

## Present one useful next step

Lead with `Needs attention`, then `May need attention`, then `Unknown`. For each listed peer, give its self-declared name and one sentence of evidence or limitation; include message age only when useful. Show a full broker ID only when the name is missing or duplicated. Keep `No action` to a count and compact name list. Before stopping, confirm that the reported categories account for every connected peer.

Recommend the first useful deeper-inspection candidate in this order: `Needs attention`, `May need attention`, then an `Unknown` peer when another inspection could resolve its limitation. Do not recommend an active or `No action` peer. Retain that peer's full ID and ask one concrete question using its name, for example:

> `payments-refactor` has the clearest unresolved signal. Inspect it further?

An immediate `yes` selects that retained ID for read-only inspection. If no evidence supports a useful follow-up, say that no peer warrants deeper inspection from this snapshot.

Suggest Ship only when the evidence explicitly shows a cross-session recovery or coordination need. Do not create a work item merely because a peer has several steps remaining.
