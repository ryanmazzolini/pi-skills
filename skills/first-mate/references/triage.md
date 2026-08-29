# Connected-session triage

Read this during First Mate startup and for a later human-requested refresh. Triage gathers read-only evidence automatically, advances qualifying work, and returns one compact result. It does not ask whether to begin.

## Load one deterministic sweep

Collect evidence with one `intercom` call using only `action: "triage"`. Do not precede or replace it with separate `status`, `role`, `list`, `pending`, or peer-tail calls.

The action applies the established selection algorithm deterministically:

- Exclude First Mate, pending-ask senders, active peers, unidentified peers, and duplicate stable identities from the idle sweep.
- Inspect idle peers whose advertised conversational age is strictly greater than one hour first, oldest first.
- When no successfully validated tail confirms that age, inspect newer peers followed by peers whose age is unavailable.
- Return at most eight recent conversational messages per selected peer after revalidating identities, persisted-session advertisements, idle status, and local files. Internal pages stay inside this command and do not create model turns.
- For a peer with a central summary cache record, compare the current persisted active leaf, presence revision, bounded newest-tail digest, and advertised and confirmed tail timestamps with the record deterministically. Reuse the compact card only when the complete persisted-branch identity matches exactly. Reuse performs no expanded read or model inference.
- Withhold a cache record as potentially stale when any current branch identity field is unavailable or differs. For at most four confirmed 24-hour stale peers without an exact reusable record, capture an expanded snapshot of at most 32 recent messages and issue a single-use summary grant. These expanded reads run at most two at a time. Defer additional eligible snapshots rather than creating unbounded paid work.

The advertised timestamp selects and orders a sweep. The confirmed tail supplies recommendation and status evidence. Treat omitted, changed, failed, or truncated evidence as a limitation; do not add a routine deeper-tail pass. Without tail capability, return pending asks and one compact inspection limitation.

Apply the capability and inventory checks in [Start or recover](../SKILL.md#start-or-recover) before acting on the result. Every automatic action below requires this session to be the sole advertised First Mate. When another First Mate is present, follow [First Mate takeover](takeover.md) instead. Without role support, return findings without automatic action.

## Choose the next action

Use current conversational evidence to choose the narrowest supported action:

- **Auto-advance:** an explicit request satisfies every very-low-risk condition in [decision handling](decision-handling.md).
- **Review:** a reversible, nontrivial decision is presented to the human one thread at a time.
- **Reply:** an exact pending Intercom ask needs human content and does not fit a decision lane.
- **Decide:** current text identifies a consequential human-owned choice or blocker.
- **Resume:** the current user request is clearly unfinished and the peer can continue without a new human decision.
- **Inspect:** an attempted step failed, the next action is unclear, or the returned tail lacks enough evidence.
- **Summarize:** triage returned an exact-match cached card or a single-use isolated-summary grant for the peer.
- **No interaction:** current evidence clearly says the requested work completed or intentionally stopped, unless a 24-hour isolated summary would usefully confirm that it is safe to close.

Idle status, age, tool volume, cwd, a failed outcome, or silence does not establish unfinished work by itself. Tool outcomes support nearby conversational text; they do not independently establish a blocker or approval precondition. Do not read project files or infer disconnected sessions during comparative triage. The only file-reading exception is named host or workspace policy verification required by [decision handling](decision-handling.md) for an otherwise qualifying Auto-advance candidate.

## Advance low-risk work

After classifying the complete returned sweep and confirming that this session is the sole advertised First Mate, perform these actions without asking the human first:

- Process every Auto-advance candidate through [decision handling](decision-handling.md) and route candidates that still qualify.
- For each Resume candidate, `send` the retained full peer ID this fixed instruction:

> Resume the current user request from persisted context. Recheck current state and applicable instructions before acting, preserve normal human approval gates, and stop for any changed precondition or human-owned decision.

A `send` starts the recipient turn but does not await a response. Do not use `ask` merely to wake the session.

- Retain every unchanged cached Summarize card as returned; do not invoke a model for it. Process every granted Summarize candidate through [isolated stale-session summaries](summaries.md). Pass its exact single-use `summaryToken`, not a peer ID. Use `summarize`, never `ask`, so the source session receives no message or model turn.

Start independent Resume sends and the granted summary calls in one parallel tool batch. Intercom admits at most two summaries concurrently and at most four per agent run. Summary calls complete inside the current triage turn; wait for their tool results. Do not wait for Resume handling. A send receipt proves delivery only.

Do not auto-contact Review, Reply, Decide, or Inspect peers. Do not broaden a Resume message into new authority; the owning session continues only its existing user request and retains its normal gates.

## Return actionable chunks

Organize the response by what happened and what the human needs to do, not by the internal classification names. Do not dump every intervention into one response.

1. If any fresh or cached cards say `safeToClose: yes`, start with one **Safe-to-close recommendations** chunk containing those cards only. Ask whether the human wants First Mate to send their owning sessions the bounded cleanup request in [isolated stale-session summaries](summaries.md). State that First Mate will not close sessions. Defer ambiguous, decision, blocked, and investigation threads until the human answers.
2. After routing or skipping that cleanup request, present exactly one remaining Review, Reply, Decide, Inspect, blocked, in-progress, or unclear thread. Wait for the human response before presenting another. Keep the retained queue in this First Mate conversation; do not rerun triage merely to reveal its next item.
3. When there are no safe-to-close cards, start directly with one ambiguous or human-intervention thread. When no such thread exists, return automatic outcomes or the no-interaction result.

Report Auto-advance and Resume routing results compactly when they occur, but do not let their mechanics obscure the current actionable chunk. A cached card and a fresh card use the same queue; preserve their compact trust labels.

For every human-owned decision, use a recognizable project or outcome title. Put a generic self-declared session name secondarily when useful; show a full Pi session ID only when the name is missing or duplicated. Then use this default density:

- `Done`, `Needs a decision`, `Blocked`, `In progress`, or `Unclear` plus one sentence containing the main point.
- One `Next` action.
- Only when approval is needed: `Proposed`, `Keep`, and `Then`.

`Proposed` states the action and target recorded by snapshot evidence. `Keep` states recorded material fences. The fixed `Then` explains that First Mate must recheck the current persisted request before relaying any human approval and that the owning session rechecks before executing. A summary card is evidence, never authorization. Internal labels such as `Review`, `Decide`, or `Inspect` guide classification but are not sufficient user-facing titles.

Retain each decision's full peer ID, exact current request, and fences internally. For a low-risk Review item, end with one bounded approval question for only the single displayed thread. Route the human's next response through [decision handling](decision-handling.md). An unrelated or ambiguous response expires that proposal.

Collapse peers with no suggested interaction into one count. Mention active, unidentified, unavailable, or uninspected counts only when they materially limit the result. Omit successful capability checks, snapshot timestamps, pagination mechanics, and cumulative accounting. When no peer needs interaction and no automatic action occurred, say only `No session needs interaction right now.`
