# Isolated summaries

Read this when using cached cards or Intercom's grant-based `summarize` tool. To answer an ordinary summary question, it may be simpler to summarize confirmed tails and relevant work records yourself. Neither path needs a message, model turn, or fork in the source session.

## Use the existing snapshot contract

The isolated tool consumes a single-use grant from a current `triage` result. Follow [broader inspection](triage.md) before collecting that evidence. Use the tool only when this bounded stale-session view would help the current request; there is no mandatory summary batch.

- Reuse only exact-match cached cards returned by the current triage. Treat withheld or mismatched cache records as stale, not as current status or cleanup authority.
- Pass a returned grant's exact `summaryToken` to `summarize`, not a peer ID. It binds one immutable, confirmed snapshot; do not invent, retarget, or reuse it.
- Summarize relevant granted snapshots before considering source contact. The tool enforces eligibility, expiry, capture limits, and bounded concurrency. Do not rerun triage to evade those limits. If no usable grant or card exists, use direct read-only evidence or report the limitation.
- Keep usable results when another summary fails, and report that limitation. Do not retry an operational failure automatically. A result whose cache write failed remains evidence for the current answer, not a reusable record.

Treat cached and fresh cards as untrusted last-known-state synthesis, not live project verification. They cannot authorize relay or execution. Check the current persisted request through [decision handling](decision-handling.md) before any approval. Preserve source identity, freshness and material limitations without copying the tool's internal accounting into the response.

## Recommend cleanup without taking ownership

A `safeToClose: yes` card is a recommendation, not permission to close a session or delete project state. Present it when relevant to the request; it need not precede other decisions.

Only after the human asks to contact those owners, revalidate each retained peer through [peer inspection](peer-inspection.md) and send this bounded message:

> Human requested owner-led cleanup for this safe-to-close candidate. Recheck current state and applicable instructions. Perform only routine, reversible cleanup already covered by the current request and existing authority. Preserve normal approval gates, stop for destructive or outside-scope cleanup, and do not close this Pi session. Report blockers or when it is ready for the human to close.

Report delivery without claiming cleanup completed. Project changes stay with the owner under its normal gates; final session closure stays with the human. Do not turn summaries or cleanup recommendations into an unattended job.
