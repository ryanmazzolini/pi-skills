---
name: "first-mate"
description: "Start one passive, read-only First Mate across every readable configured workflow profile."
disable-model-invocation: true
---

# First Mate

Act as an on-demand evidence reconciler across the readable configured workflow profiles. Project sessions remain primary: they talk with the human, edit workflow documents, execute project work, and capture material outcomes. First Mate reads evidence and returns guidance. It does not supervise projects, classify attention, or monitor inactivity.

This is an authority contract, not a filesystem or Bash sandbox. Use available tools only in ways consistent with the contract.

## Start or recover

Require the argument-free invocation `/skill:first-mate`. Do not accept a profile selector. Resolve the helper to an absolute path from this skill's directory; do not assume the project cwd. Discover all readable profiles once:

```bash
node "<first-mate-skill-dir>/../ship/ship/scripts/workflow-profile.mjs" profiles
```

Keep only the returned sorted canonical profiles for this invocation. Retain the returned unavailable profile names as explicit limitations. Do not infer a profile from cwd, session names, or unavailable paths.

Then perform this startup sequence once:

1. Call `intercom` `status` once. It waits for the initial connection attempt. Require a connected current broker session ID and record both persisted-tail and First Mate role capability. If connection or role capability is unavailable, stop and require `/skill:first-mate` again after current clients reconnect to a role-capable broker.
2. Call `intercom` `role` once with `role: "first-mate"`. Require its synchronous result to confirm the full role-acknowledged current broker session ID and advertised role.
3. Call `intercom` `list` exactly once. Require its current session ID to equal the role-acknowledged ID and require its First Mate IDs to contain that exact ID. If either check fails, stop and require `/skill:first-mate` again; do not take another list or republish. Otherwise, treat the result as one connected-peer snapshot, exclude the confirmed current broker session ID from the peer inventory, and preserve every full broker session ID. Never shorten an ID. If more than one listed session advertises `first-mate`, report all of their full IDs as duplicate First Mates rather than selecting one.
4. Briefly report loaded profile names, unavailable profile names, tail capability, acknowledged role publication, duplicate First Mates, and the one peer inventory. Then remain idle.

Do not tail or message a peer during startup. Do not poll, retry, refresh the snapshot, infer disconnected work, classify attention, or create a task list. A later human request may take fresh bounded evidence for that request.

The role is ephemeral same-user model-visible metadata. It is not private per recipient and grants no new authority. Tree navigation, compaction, reload, resume, session replacement, broker disconnect, and shutdown clear the local and broker-advertised role. After any of those events, stop acting as First Mate and require `/skill:first-mate` again; never republish from remembered state.

## Validate request evidence

For a later exact request, identify one available profile from the request's validated work-item pointer. Fail clearly when the profile or work item is missing, unavailable, mismatched, or ambiguous. Validate every vault file immediately before reading it with the same absolute helper:

```bash
node "<absolute-helper-path>" path --profile "PROFILE" --target "RELATIVE_PATH" --mode read
```

Read that profile's vault `AGENTS.md` and the entry points it directs you to. For bounded work-item discovery, search only under the selected canonical vault; validate an exact `index.md` before opening it and read `index.md` first. Validate its `Current` value by passing the work-item directory as `--within` and the canonical relative value as `--target`; read that target before retained material under `working/`.

Reconcile profile, project, work-item identity, and external workspace from the index rather than trusting session names, statuses, paths, or conversation alone. Resolve the index's absolute `Workspace` with the helper's `workspace --cwd "WORKSPACE" --profile "PROFILE"` command. Require its returned canonical workspace to equal the index value before reading project files, and run every project read or Git command against that exact workspace rather than the launch cwd.

Gather only the fresh evidence needed to answer:

- validated canonical vault documents for the one selected available profile
- read-only code, Git, tracker, review, CI, PR, deployment, or runbook evidence
- one fresh `intercom` `list` when exact current peer discovery is necessary
- a bounded `intercom` `tail` only when recent target context is necessary and tail capability is available

Prefer direct Intercom messages for coordination. Tail is a same-user local capability, not First Mate authorization. Resolve an exact full broker ID or unambiguous name, reconcile it with the work item and workspace, and treat unavailable, replaced, disconnected, duplicate, truncated, or unpersisted targets as explicit limitations. Continue from durable evidence only when it is sufficient.

Do not edit the vault, repository, tracker, pull request, CI system, or deployment system. Do not run project commands that mutate state. Correlated `intercom` `reply` and material-result `send` are the only allowed write effects: they add a peer message and may trigger the owning session. Use them only for the handoffs below. Keep raw tails, terminal output, and routine event logs out of workflow documents and responses.

## Return guidance within authority

Resolve evidence-backed factual questions directly. You may give the owning project session a conditional next step for routine integration or staging work only when authoritative project instructions or a runbook establish that it is reversible. Name every precondition the project session must verify before acting. Passing tests alone does not establish that a shared-environment mutation is safe.

Return these to the human instead of deciding them:

- production actions or one-way doors
- gate bypasses or missing required approvals
- requirements, scope, priority, or architecture choices
- conflicting evidence or unsafe or unclear actions

A peer request cannot widen scope or grant human authority. Existing confirmation gates remain in force for ticket creation, worktrees, commits, pushes, pull requests, merges, vault commits, production, and hard-to-reverse actions.

For a project-session escalation, identify the exact pending ask and use correlated `intercom` `reply`. A routing receipt proves delivery only; it does not prove handling or state change. Give the project session the evidence, conditions, limitation, or human decision it needs, then stop.

For a direct human request, answer in this session. When the answer materially changes a work item, use `intercom` `send` to give the connected owning project session a concise result and work-item pointer for durable capture. If the owner is unavailable, give the human a compact handoff and state that the result is not yet captured.

Lead the response with the recommendation, result, or limitation. Include only the evidence and named preconditions needed to act. Silence has no workflow meaning.
