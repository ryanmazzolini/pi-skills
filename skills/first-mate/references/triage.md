# Broader inspection and unfinished work

Read this when the request needs comparison across sessions or asks First Mate to move unfinished work forward. Choose the useful subset from the current inventory, pending asks, confirmed tails, and relevant work records. Do not treat every connected session as work to process.

## Choose evidence, not a fixed sweep

Use ordinary `list`, `pending`, and `tail` calls when they answer the question. The existing `intercom` `triage` action is optional when its bounded idle-session sweep would be useful. With role support, it publishes `first-mate`, so use it only while this session is the sole advertised First Mate; handle startup or competing coordinators through the main skill first. Without role support, triage may still collect read-only evidence, cached cards, and summary grants; automatic contact and approval remain unavailable. A missing or cleared label on a role-capable broker is not this exception.

The tool owns selection, read limits, cache validation, and summary grants. Check that its inventory is complete, its current session ID matches this session, and this session remains the sole advertised First Mate before any automatic action. Omitted, changed, or failed evidence is a limitation, not proof that the uninspected work needs no attention. Follow up with targeted inspection when the current request needs it; do not repeat whole sweeps to evade limits.

A triage result does not require processing every returned session or generating every possible summary. Use only evidence relevant to the request. Read [isolated summaries](summaries.md) before using returned cards or grants, and [decision handling](decision-handling.md) before any authorization.

## Resume only clearly unfinished work

Automatic Resume is available during a general First Mate orientation or a request to advance work, not an inspection-only question. Require this session to be the sole advertised First Mate and use fresh identity checks and confirmed peer evidence as described in [peer inspection](peer-inspection.md).

Immediately before automatic Resume, use fresh `list` and `pending` evidence to confirm the owner is idle and there is no unresolved inbound ask from that owner. An immediately returned triage result can supply these checks when its evidence is complete and current. If either check is unavailable, incomplete, or changed, do not Resume. Handle an existing ask through the normal question or decision route instead.

Send the retained full peer ID the fixed instruction below only when its current user request is clearly unfinished and the owner can continue within existing authority without a new human decision. A failed attempt, ambiguous next step, missing context, idle age, or silence is not enough; inspect or present the uncertainty instead.

> Resume the current user request from persisted context. Recheck current state and applicable instructions before acting, preserve normal human approval gates, and stop for any changed precondition or human-owned decision.

Use `send`, not `ask`, merely to resume the owner. Do not expand this into new scope or authority, wait for handling, or poll for progress. Report routing compactly and return to the requested result.

## Present the useful next action

Prioritize by the human's goal and what current evidence supports. Resolve factual questions directly; present uncertain or consequential decisions to the human. Give enough context to understand the project, current state, exact proposed action, and material fences. Ask one focused question when a decision is needed, without requiring cleanup recommendations or unrelated sessions to come first.

If nothing within the requested scope needs attention, say so. Do not invent follow-up work or keep inspecting merely to fill a report.
