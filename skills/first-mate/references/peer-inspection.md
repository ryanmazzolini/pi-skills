# Peer inspection and contact

Read this when selecting sessions, inspecting evidence, or contacting an owner for the current request. Inspection never starts a source-session turn.

## Select the peer

Use a complete, coherent `status` and `list` inventory to resolve the requested session to its full Pi session ID. Reuse the current inventory when it is still applicable. A name or cwd is a locator, not proof of identity or ownership. If names collide, show the matching full IDs and ask the human to choose; never retarget a retained ID by name.

Before contact, refresh `status` and `list` unless the immediately returned inventory already serves this operation. Require the same current session ID, a complete inventory, and exactly one live advertisement for the retained peer ID. A disappeared or duplicate identity stops delivery. Preserve the intended message and offer fresh selection rather than retrying automatically.

## Read enough evidence

Start with a small confirmed tail of the selected ID. If older evidence matters, use `tail` with `to` and `paginate: true`, then continue with `cursor` alone. Preserve session and entry IDs for citations; `textRange` identifies partial messages. An established cursor stays on the captured branch and can continue after the source disconnects. It is not an immutable transcript or a substitute for a current check before contact or approval.

Stop when the question is answered or `nextCursor` is null. If a cursor expires, a source changes, or a read fails, state the limitation. Do not silently switch sources or treat missing text as proof that something did not happen. Use the tool's existing safety limits rather than imposing smaller scan ceilings that can hide recent conversation behind large records.

Read relevant project files when they can materially improve the answer. Confirm the located workspace exists and read its repository instructions first. Follow an explicit work-item pointer through [project evidence](project-evidence.md); stay within that repository or work item rather than searching unrelated roots or every workflow profile. Read only enough current evidence to answer the question.

Summarize the evidence directly when that suffices. Read [isolated summaries](summaries.md) only when using cached cards or the grant-based tool. Distinguish last-known session state from verified current project state.

## Contact only when needed and authorized

Before asking for status or context, check a recent tail and any relevant durable pointer. If those answer the question, use the evidence rather than waking the owner. Human-requested notices and exact replies can proceed after identity verification without a redundant status inquiry. Missing evidence alone does not authorize contact: explain the remaining question and obtain approval unless an exact inbound ask or the [decision](decision-handling.md) or [Resume](triage.md) policy already covers it.

Use `send` for a one-way message the recipient should process, `ask` when a correlated reply is useful, and `reply` for one exact inbound ask. Use its exact ask ID; call `pending` when disambiguation is needed. Send and ask both start a recipient turn. A routing receipt proves delivery, not handling; continue independent work instead of polling or acknowledging routine updates.

Before relaying approval, apply [decision handling](decision-handling.md), preserving whether authority came from First Mate policy or an exact human decision. Skip delivery if identity, request, scope, or preconditions changed. A failed delivery is not permission to broaden the message or select another owner.
