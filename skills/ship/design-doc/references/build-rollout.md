# Build and Rollout

Read this only after inspected evidence establishes a specific sequence, compatibility window, migration, or rollout transition that would be unsafe or costly to get wrong. Faster feedback, ordinary implementation dependencies, test order, and convenient PR boundaries do not qualify.

Add `## Build and rollout` after the decision sections. Name the qualifying hazard first. Then show:

1. the thinnest end-to-end behavior that crosses the risky boundary;
2. its observable check;
3. only the material transitions needed to reach the approved state.

For a data or compatibility transition, preserve the required order, such as expand, mixed-version operation, backfill, verification, enforcement, and cleanup. Include detection, stopping or rollback, recovery, and ownership only where they make the transition safe and reviewable.

Do not turn this section into a file list, test inventory, dependency graph, PR plan, or implementation checklist. When several PRs, releases, worktrees, or dependency edges need coordination, leave those boundaries to a separate delivery plan.
