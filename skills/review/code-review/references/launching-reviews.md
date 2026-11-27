# Launching review threads

Read this when a standalone review is not already assigned to the current thread and the user has not asked for an in-place review. The current thread is then the launching thread.

Create one review thread per related ticket group in the selected workspace:

1. For PRs, read descriptions and linked ticket identities to establish the groups before dispatch. For commits, patches and local diffs, use the supplied work context. Keep the same ticket, an explicit stack, or documented review dependencies together; sharing a repository or author alone is not a reason to group changes. Keep unrelated tickets in separate threads. A target without a linked ticket can form its own group; do not require or invent a ticket. The launching thread gathers routing context, not a second review.
2. Use the host's available workspace/thread tools and runtime instructions. Honor the user's workspace choice, or infer an unambiguous existing workspace. Obtain any missing creation approval; do not repeat approval for explicitly authorized launches. Preserve the source thread and human focus.
3. Give each destination its exact review targets and checkout paths, related ticket context, approved scope, canonical report/evidence paths when available, and this skill. Identify it as the review owner, not another launcher. Preserve explicit launch options. The assigned task includes inspection, validation, reports, PR monitoring and follow-ups as applicable, plus the companion walkthrough only when the user asked for one, but no code changes or publication without their applicable approval.
4. Verify that each destination thread exists and has received its assigned task before reporting dispatch. The owner performs the review itself, without subagents, and returns the complete result in its own thread.

In Herdr (`HERDR_ENV=1`), a review thread is a named tab running a fresh Pi session. Use the `herdr` skill and the fresh-session procedure in its `references/pi-session-transfer.md`, including **Start the assigned review** after startup verification.

If the host does not expose thread creation or verification, explain the limitation and ask whether to review in the current thread. Do not invent host commands or silently substitute an in-place review or subagent.

The launching thread reports which targets belong to each destination, then stops. Do not wait for review completion, poll owners for progress, or collect their reviews into the launching thread. Each owner keeps its evidence, report, PR monitors and subsequent review conversation.
