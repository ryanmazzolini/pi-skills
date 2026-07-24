# Peer inspection and contact

Read this when the human confirms a triage recommendation or explicitly asks to inspect, tail, send, ask, or reply to one connected peer.

## Select and revalidate the peer

Keep full broker IDs internal during ordinary use:

- An immediate `yes` after triage selects the full ID retained with that recommendation.
- A supplied name selects its full ID when that name is unique in the latest coherent inventory.
- Without a usable current inventory, take a fresh `status` and `list` and map an unambiguous name to its full ID.
- When names collide, show the matching full IDs and ask the human to choose one.

Immediately before the operation, take a fresh `status` and `list`. Require both to report the same current session ID and require the selected full peer ID to remain present. A fresh snapshot used to resolve a direct named request also satisfies this check. If the broker changed or the selected peer disappeared, do not retry or retarget by name. Preserve the requested operation or message, state that it did not happen, and offer a fresh selection.

## Inspect read-only evidence

For deeper inspection, tail the selected full ID with `limit: 16`, `tailScanBytes: 4194304`, and `tailProjectionBytes: 16384`. Treat unavailable, replaced, malformed, or truncated context as an evidence limitation.

Read relevant project files only when they can materially improve the answer:

- Treat the peer's current self-declared cwd as a locator, not proof of project identity. Confirm that it exists and read its repository instructions before selecting files.
- Follow an explicit work-item pointer through [project evidence](project-evidence.md).
- Stay within the located repository or work item. Do not scan unrelated roots or search every workflow profile.
- Read only enough current evidence to answer the inspection question, and run only read-only commands.

Return the useful finding and next choice. Mention that project files were not checked only when that limits confidence.

## Contact explicitly

A triage recommendation and its `yes` confirmation authorize inspection only. Send a message or create a peer model turn only when the human separately requests the operation and supplies the content or question.

Use:

- `tail` for read-only recent context
- `send` for a notice that needs no answer
- `ask` for a question where a reply is useful but not immediately blocking
- `reply` for one exact inbound ask; use its exact ask ID, and call `pending` without extra fields when disambiguation is needed

An accepted `send`, `ask`, or `reply` receipt means queued. Report the terminal outcome as routed or failed, and call peer handling unconfirmed until later evidence shows otherwise. Continue independent work after a background operation when possible; wait once only when its answer blocks the current request.

Contact may exchange facts, status, questions, or recovery instructions. Return human-owned decisions in this session instead of relaying them. If delivery fails or the target disconnects, preserve the content and offer a fresh selection rather than retrying automatically.
