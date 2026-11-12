# Fresh Pi Destination

Use this reference when continuing active work in a fresh Pi session. Read the parent [Herdr skill](../SKILL.md) and the installed core and app manuals before acting. Follow [Start sessions without changing focus](../SKILL.md#start-sessions-without-changing-focus) for every launch, its separate show approval and its post-launch tab naming. This reference adds the handoff contract.

For a standalone review launched by `code-review`, use [Start the assigned review](#start-the-assigned-review) after startup verification when the caller requests immediate review execution. Other transfers keep the readiness-only handoff: the destination reports ready and waits for the user.

## Choose and confirm the destination

Inspect live terminals and visible spaces, tabs and panes without changing focus. Verify the source using its explicit core address, not the human's current selection. Verify that its foreground agent is Pi and establish its existing session-file path from the current Pi runtime, such as its own `PI_SESSION_FILE`, or explicit foreground process arguments. Core metadata need not expose that path. Verify the file rather than guessing the latest session in a shared cwd; a title alone is not proof.

Choose the destination's visible location, name, machine and cwd independently:

- Honor the user's explicit choices. A repository, ticket folder or worktree does not require a separate space, and preparing a worktree does not authorize launching another Pi.
- When the user says to continue in this space, identify it from the source terminal's live app mapping. Otherwise infer an existing space only when exactly one matches the work. Inspect candidates and ask when the destination is ambiguous. A request for a new space blocks this handoff: explain that it requires an existing space and ask the user to choose one before continuing.
- Use the clearest work identity as the tab/session name: an explicit label, ticket ID, tracking issue or work-item slug. Do not require a ticket or invent one just to name a destination. Keep a supplied cwd even when it contains several repositories.
- Check name collisions against both the app and core. Inspect a matching tab's actual terminals before deciding whether it already owns the work. Do not replace a live Pi, duplicate its ownership or send it the work without approval. An existing conversation is not a fresh destination; choose a distinct name or ask how the user wants to continue.

A calling skill's recommendation to create a space does not bypass this restriction. Preserve the supplied work name and cwd when explaining the blocked request; do not create a space or silently choose a different destination.

## Confirm the topology

Lead with the work the user recognizes. For a visible destination, show the applicable fields:

- Space: the approved existing space name.
- New tab: the approved or proposed work-item name.
- Working directory: the explicit cwd.
- Machine: include it when remote.

For a background-only destination, use its terminal name instead of space/tab fields. Apply the parent skill's launch and visibility policy to either destination type.

Obtain missing approval with **Approve this destination?** before creation; do not repeat an already authorized launch.

Recheck the approved destination and source immediately before launch. Stop if their identity, cwd, processes or surrounding topology changed. Shell-escape paths, labels and messages; supply explicit targets rather than relying on the focused resource.

## Launch and verify startup

1. Choose the parent skill's hc launch route for both visible and background-only destinations. Plan an interactive Pi launch without inherited session/resume flags. Ensure this independent continuation can outlive the source: core children normally end with their parent. Use `--outlive-parent` and the parent skill's `pi-tab` template, so Pi finds user tools and the tab survives Pi exiting; only add the `herdr.space` label for an approved new tab. Perform the parent skill's pre-launch focus check.
2. Put a concise startup brief in the launch using its documented initial-task mechanism. Identify the destination as a fresh Pi, not the source or another launcher. Include the expected name, machine/cwd, approved visible location, user outcome, scope, consequential decisions, live branch/worktree state, canonical evidence paths, unresolved decisions and the source address for identification only.
3. Include this boundary: **In your startup turn, do not mutate project work or Herdr topology.** Ask the destination to verify its identity and live state, report its session-file path, report that it is ready, and wait for the user. For an assigned review, explain that the source will send the already authorized task after verifying startup; that task needs no new human approval. Tell the review owner not to launch another session or use subagents.
4. Launch with that brief through `hc`, then perform the parent skill's post-launch focus check and name any approved visible tab using its matched terminal address as described there. Check the result and startup evidence with the installed manual's readiness mechanisms. A created terminal or tab is not proof that Pi started or received the brief. When the result exposes `first_message.sent`, require it to be true before claiming delivery. If delivery is false or uncertain, inspect the exact terminal before deciding whether to send; do not blindly resend or launch a duplicate. Use documented waits, not sleeps or polling loops. Do not bypass a blocked permission dialog.
5. Re-read source and destination after startup. Verify the destination is the intended fresh Pi on the approved machine and in the approved cwd, its app mapping and tab name match any approved visible destination, and the source still exists. Verify the terminal's `parent` and `die_with_parent` through core metadata. If it would end with the source and no supported, approved launch path preserves it, stop and explain the limitation. Verify both actual session files exist and differ; do not infer that from nonempty paths. For local files, the combined check is `test -f <destination-session-path> && test -f <source-session-path>`; use the core manual's remote file tools when either path is on another machine.

On failure, timeout, a blocked state or missing evidence, report which startup check is unverified and keep both sessions open. Apply the parent skill's focus rule even on failure; do not report the destination ready from an expected outcome.

For a readiness-only handoff, stop after reporting the verified destination and source survival. Do not begin project work or submit another task. For an assigned review, continue below only after all startup checks succeed.

## Start the assigned review

Use this branch only when `code-review` requests immediate execution of an already authorized standalone review. It does not authorize other project work or change the default readiness-only handoff.

1. After completing the startup and session-file checks above, submit the caller's exact review task to the verified destination using the core manual's messaging procedure. Identify it as the review owner and include its targets, scope, checkout paths and durable context. Direct it to complete the review in its own session without subagents or another handoff, then stop at the review's human decision point.
2. Send without a completion wait. Check the documented dispatch result and terminal evidence before reporting that the owner received its task; this is not a wait for review completion. Do not use an unsupported wait flag or treat a message queued to a booting agent as verified delivery.
3. Report the review targets, owning destination and verified dispatch, then stop. Do not poll the owner, aggregate its review into the source conversation, change focus or close either session. The owner handles its review, reports, monitors and follow-ups.

If task submission fails or times out, report that stage accurately and leave both sessions open. Do not retry an uncertain submission, launch a duplicate owner, or substitute a subagent or an in-place review.

## Handle later focus and closure requests

A verified handoff grants no permission to focus or close anything. Treat either as a fresh, explicit request:

- **Focus destination:** verify it still exists, focus it once through the app and keep the source open.
- **Close source:** never close the terminal running the current Pi. If the request reaches that source, ask the user to close it manually; do not relay closure through another session. From another session, recheck the exact approved source, its processes, children and app mapping, then perform only the authorized termination or visible closure. Hiding, parking, closing a container and ending a process have different effects; follow the installed manuals and the user's exact scope.

Do not bundle source closure or a later focus change into launch approval.
