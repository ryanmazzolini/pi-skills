# Broader inspection and unfinished work

Read this when the request needs comparison across sessions or asks First Mate to move unfinished work forward. Choose the useful subset from the current inventory, pending asks, confirmed tails, and relevant work records. Do not treat every connected session as work to process.

## Choose evidence, not a fixed sweep

Start from `list`: it shows each session's status, role, cwd, and last conversational time. Choose the sessions relevant to the request, read each with a small `tail`, and use `pending` for unresolved asks. There is no need to read every connected session.

Before any automatic action, check that the inventory is complete, its current session ID matches this session, and this session remains the sole advertised First Mate. Omitted, changed, or failed evidence is a limitation, not proof that the uninspected work needs no attention. Follow up with targeted inspection when the current request needs it.

Summarize from the tails and work records you read. Read [decision handling](decision-handling.md) before any authorization.

## Resume only clearly unfinished work

Automatic Resume is available during a general First Mate orientation or a request to advance work, not an inspection-only question. Require this session to be the sole advertised First Mate and use fresh identity checks and confirmed peer evidence as described in [peer inspection](peer-inspection.md).

Immediately before automatic Resume, use fresh `list` and `pending` evidence to confirm the owner is idle and there is no unresolved inbound ask from that owner. If either check is unavailable, incomplete, or changed, do not Resume. Handle an existing ask through the normal question or decision route instead.

Send the retained full peer ID the fixed instruction below only when its current user request is clearly unfinished and the owner can continue within existing authority without a new human decision. A failed attempt, ambiguous next step, missing context, idle age, or silence is not enough; inspect or present the uncertainty instead.

> Resume the current user request from persisted context. Recheck current state and applicable instructions before acting, preserve normal human approval gates, and stop for any changed precondition or human-owned decision.

Use `send`, not `ask`, merely to resume the owner. Do not expand this into new scope or authority, wait for handling, or poll for progress. Report routing compactly and return to the requested result.

## Present the useful next action

Prioritize by the human's goal and what current evidence supports. Resolve factual questions directly; present uncertain or consequential decisions to the human. Give enough context to understand the project, current state, exact proposed action, and material fences. Ask one focused question when a decision is needed, without requiring cleanup recommendations or unrelated sessions to come first.

If nothing within the requested scope needs attention, say so. Do not invent follow-up work or keep inspecting merely to fill a report.
