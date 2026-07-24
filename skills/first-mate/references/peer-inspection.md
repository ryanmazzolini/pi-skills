# Peer inspection and contact

Read this when the human explicitly asks to inspect, tail, send, ask, or reply to one connected peer. A direction to send triage's fixed status request to its displayed candidate list routes to [confirmed stale-session recon](recon.md); do not reinterpret that direction as one-peer inspection.

## Select and revalidate the peer

Keep full Pi session IDs internal during ordinary use:

- A supplied name selects its full ID when that name is unique in the latest coherent inventory.
- Without a usable current inventory, take a fresh `status` and `list` and map an unambiguous name to its full ID.
- When names collide, show the matching full IDs and ask the human to choose one.
- A peer without a stable ID is a legacy peer. Select it only for one explicit operation by an unambiguous name in the fresh inventory; do not retain the name for later triage, recon, or follow-up routing.

Immediately before the operation, take a fresh `status` and `list`. Require both to report the same current Pi session ID, require `truncated` to be false and `omittedSessionIds` to be zero, and require the selected full peer ID to remain present exactly once. A fresh snapshot used to resolve a direct named request also satisfies this check. If the current Pi session changed or the selected peer disappeared or has duplicate live advertisements, do not retry or retarget by name. Preserve the requested operation or message, state that it did not happen, and offer a fresh selection.

## Inspect read-only evidence

For deeper inspection, tail the selected full ID with `limit: 16`, `tailScanBytes: 4194304`, and `tailProjectionBytes: 16384`. Treat unavailable, replaced, malformed, or truncated context as an evidence limitation.

Read relevant project files only when they can materially improve the answer:

- Treat the peer's current self-declared cwd as a locator, not proof of project identity. Confirm that it exists and read its repository instructions before selecting files.
- Follow an explicit work-item pointer through [project evidence](project-evidence.md).
- Stay within the located repository or work item. Do not scan unrelated roots or search every workflow profile.
- Read only enough current evidence to answer the inspection question, and run only read-only commands.

Return the useful finding and next choice. Mention that project files were not checked only when that limits confidence.

## Contact explicitly

Ordinary contact requires the human to request the operation and supply the content or question. The narrow exception is the human's next-response direction to send triage's fixed status request to its displayed candidate list. It authorizes only that retained set under [confirmed stale-session recon](recon.md), not different content, new peers, or another operation.

Use:

- `tail` for read-only recent context
- `send` for a notice that needs no answer
- `ask` for a question where a reply is useful but not immediately blocking
- `reply` for one exact inbound ask; use its exact ask ID, and call `pending` without extra fields when disambiguation is needed

An accepted `send`, `ask`, or `reply` receipt means queued. Report the terminal outcome as routed or failed, and call peer handling unconfirmed until later evidence shows otherwise. Continue independent work after a background operation when possible; wait once only when its answer blocks the current request.

Contact may exchange facts, status, questions, or recovery instructions. Return human-owned decisions in this session instead of relaying them. If delivery fails or the target disconnects, preserve the content and offer a fresh selection rather than retrying automatically.
