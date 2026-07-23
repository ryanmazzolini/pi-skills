# Connected-session triage

Use this only after the human asks First Mate to `triage`. It classifies current session evidence; it does not establish profile or work-item identity.

## Take one bounded snapshot

1. Refresh workflow-profile discovery for orientation. Profile failure does not block session triage.
2. Call `intercom status`, then `intercom list`, and require the list's current broker ID to match status. Do not retry a changed snapshot automatically.
3. Call `intercom` once with only `action: "pending"`; its projection is already bounded, so do not pass `limit` or other fields. An exact pending ask is evidence that its sender needs attention; it is not workflow authority.
4. Exclude First Mate itself. Account for every other connected peer exactly once.
5. Build one classification queue: connected peers with exact pending asks first, then remaining non-active peers, with full broker ID as the tie-breaker. Keep only the first 16; put every excess peer under `Unknown` with the classification-budget limitation.
6. Classify a queued peer with an exact pending ask under `Needs attention` without tailing merely to corroborate the ask.
7. Tail each other queued peer by exact full ID with `limit: 8`, `tailScanBytes: 2097152`, and `tailProjectionBytes: 4096`.
8. Put active peers without a queued pending ask directly under `No action` without tailing them.

The single 16-peer queue limits one triage to at most 16 substantive non-active classifications, 32 MiB scanned, and 64 KiB projected.

Do not read vault files, infer disconnected sessions, or message a peer during classification. A missing tail capability leaves non-active peers `Unknown`; inventory remains useful.

## Classify observed evidence

Use the narrowest supported category:

- **Needs attention:** an exact pending ask; an unanswered persisted user request; or explicit current text saying work is blocked or awaiting a human decision.
- **May need attention:** current text shows unfinished work, a failed attempted step, or an unresolved next action without a clear human blocker.
- **Unknown:** the peer was not inspected; its tail is unavailable, oversized, malformed, replaced, or changed; or truncation removed context needed to classify it.
- **No action:** the peer is active, or current evidence clearly says the requested work completed or intentionally stopped with no unresolved request.

Do not infer attention from idle status, age, tool volume, a failed outcome, cwd, profile availability, or silence alone. Tool and Bash outcomes support nearby text; they do not independently establish a blocker. Every category describes evidence, not project priority or authority.

When evidence supports two categories, choose the less certain one. When evidence is too thin, use `Unknown` and name the limitation.

## Present the report

Lead with `Needs attention`, then `May need attention`, then `Unknown`. Keep `No action` to a count and compact name list. Omit empty actionable sections.

For each actionable or unknown peer, include:

- self-declared name
- full broker ID only when the name is missing or duplicated
- one sentence of evidence or limitation
- age of the last eligible conversational message when available
- `workflow-unbound`

Suggest considering Ship only when the bounded evidence explicitly shows a need for cross-session recovery or coordination. Do not interrupt quick, self-contained work merely because it has several steps, and do not create a work item from triage.

End with accounting totals for connected peers, pending asks classified without tails, tailed peers, active peers skipped, and budget- or capability-limited peers. State that no peer was messaged and that attention classification did not grant workflow authority.
