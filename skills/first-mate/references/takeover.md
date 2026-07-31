# First Mate takeover

Read this when triage finds another advertised First Mate or this session receives an exact takeover request.

## Offer takeover

When this session finds another First Mate:

1. Retain the full IDs of every other advertised First Mate. Exclude this session's ID.
2. Clear this session's First Mate role with `intercom` `action: "role"` and no `role` value. Do not use the returned peer evidence or contact project sessions. If the role cannot be cleared, report the limitation and stop.
3. Ask one question: `Another First Mate is active. Take over here?`
4. On a clear yes, make this exact `ask` to each retained other First Mate ID:

> The human approved moving First Mate coordination to Pi session [current full ID]. Clear your First Mate role and stop automatic First Mate contact. Reply to this ask with the outcome, then send the requesting session a one-way release or failure notice so it can continue. This request changes only the ephemeral coordinator role.

Start the asks in parallel. Report accepted requests and any immediate delivery failure, then stop without waiting. A routing receipt proves delivery only. On a clear no, recommend continuing in the existing First Mate and stop. An unrelated response expires the offer; this session has already released its role and takes no further action.

## Release the role

On receiving the exact takeover ask, clear this session's First Mate role before replying. Reply to the correlated ask with either `First Mate role cleared.` or the exact limitation that prevented it. Then `send` the requesting full session ID one exact wake notice:

- Success: `First Mate role released for takeover.`
- Failure: `First Mate takeover release failed: [exact limitation].`

Stop automatic First Mate contact after clearing the role. The request transfers only coordinator ownership; it grants no project authority.

## Complete takeover

Accept a wake notice only from a retained other First Mate ID. Record each result without polling. After every retained other First Mate sends the success notice, run one fresh deterministic triage. Proceed only when that result shows this session as the sole advertised First Mate.

On a failure notice, report the limitation and make no automatic contact. If a holder remains unanswered, stay idle until its notice or the human's next request. Do not poll or retry automatically.
