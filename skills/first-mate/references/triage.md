# Connected-session triage

Read this during First Mate startup and for a later human-requested refresh. Triage gathers read-only evidence automatically, advances qualifying work, and returns one compact result. It does not ask whether to begin.

## Load one deterministic sweep

Collect evidence with one `intercom` call using only `action: "triage"`. Do not precede or replace it with separate `status`, `role`, `list`, `pending`, or peer-tail calls.

The action applies the established selection algorithm deterministically:

- Exclude First Mate, pending-ask senders, active peers, unidentified peers, and duplicate stable identities from the idle sweep.
- Inspect idle peers whose advertised conversational age is strictly greater than one hour first, oldest first.
- When no successfully validated tail confirms that age, inspect newer peers followed by peers whose age is unavailable.
- Return at most eight recent conversational messages per selected peer after revalidating identities, persisted-session advertisements, idle status, and local files. Internal pages stay inside this command and do not create model turns.

The advertised timestamp selects and orders a sweep. The confirmed tail supplies recommendation and status evidence. Treat omitted, changed, failed, or truncated evidence as a limitation; do not add a routine deeper-tail pass. Without tail capability, return pending asks and one compact inspection limitation.

Apply the capability and inventory checks in [Start or recover](../SKILL.md#start-or-recover) before acting on the result. Every automatic contact below requires this session to be the sole advertised First Mate. When another First Mate is present, follow [First Mate takeover](takeover.md) instead. Without role support, return findings without automatic contact.

## Choose the next action

Use current conversational evidence to choose the narrowest supported action:

- **Auto-advance:** an explicit request satisfies every very-low-risk condition in [decision handling](decision-handling.md).
- **Review:** a reversible, nontrivial decision belongs in one human review bundle.
- **Reply:** an exact pending Intercom ask needs human content and does not fit a decision lane.
- **Decide:** current text identifies a consequential human-owned choice or blocker.
- **Resume:** the current user request is clearly unfinished and the peer can continue without a new human decision.
- **Inspect:** an attempted step failed, the next action is unclear, or the returned tail lacks enough evidence.
- **Ask for status:** the peer is confirmed idle for at least 24 hours and no more specific action supersedes a read-only status check.
- **No interaction:** current evidence clearly says the requested work completed or intentionally stopped, unless a 24-hour status check would usefully confirm that it is safe to close.

Idle status, age, tool volume, cwd, a failed outcome, or silence does not establish unfinished work by itself. Tool outcomes support nearby conversational text; they do not independently establish a blocker or approval precondition. Do not read project files or infer disconnected sessions during comparative triage. The only file-reading exception is named host or workspace policy verification required by [decision handling](decision-handling.md) for an otherwise qualifying Auto-advance candidate.

## Advance low-risk work

After classifying the complete returned sweep and confirming that this session is the sole advertised First Mate, perform these actions without asking the human first:

- Process every Auto-advance candidate through [decision handling](decision-handling.md) and route candidates that still qualify.
- For each Resume candidate, `send` the retained full peer ID this fixed instruction:

> Resume the current user request from persisted context. Recheck current state and applicable instructions before acting, preserve normal human approval gates, and stop for any changed precondition or human-owned decision.

A `send` starts the recipient turn but does not await a response. Do not use `ask` merely to wake the session.

- Process every Ask-for-status candidate through [automatic stale-session recon](recon.md). Its correlated response is useful, so use `ask`.

Start independent sends and asks in parallel when several peers qualify. Do not wait for peer handling before finishing triage. A routing receipt proves delivery only.

Do not auto-contact Review, Reply, Decide, or Inspect peers. Do not broaden a Resume message into new authority; the owning session continues only its existing user request and retains its normal gates.

## Return one compact result

Lead with automatic outcomes, then peers where human interaction could help, one compact bullet each:

- `Resumed notes-sync — the interrupted request was routed back to the idle session; handling unconfirmed.`
- `Requested status from api-cleanup — idle 31h after a failed integration test.`
- `Decide for deploy-check — choose whether to retry production validation (27h idle).`

Use the peer's self-declared name and one evidence sentence. Show a full Pi session ID only when the name is missing or duplicated. Name a failed or skipped delivery instead of implying it routed. Collapse peers with no suggested interaction into one count. Mention active, unidentified, unavailable, or uninspected counts only when they materially limit the result. Omit successful capability checks, snapshot timestamps, pagination mechanics, and cumulative accounting.

The `Review` bullets are the complete low-risk decision bundle. Retain each full peer ID, exact request, and stated fences, then ask one question:

> Approve these low-risk decisions?

Route the human's next response through [decision handling](decision-handling.md). An unrelated or ambiguous response expires the proposal.

When a Reply or Decide item needs human content, ask for that content directly. Otherwise do not end with a permission question. When no peer needs interaction and no automatic action occurred, say only `No session needs interaction right now.`
