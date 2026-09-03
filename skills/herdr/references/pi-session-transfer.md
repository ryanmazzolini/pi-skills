# Fresh Pi Destination

Use this workflow to continue active work in a fresh Pi session. Put the destination in a named tab inside an existing Herdr workspace when the work belongs to that workspace. Create a workspace only when the work needs a separate workspace. The source stays open and human focus does not change.

A Herdr tab contains one or more panes. Use the work item's human-recognizable name as the tab label; do not describe this as naming a pane.

## Infer the destination

Infer the workspace, tab label, and cwd independently. A ticket, branch, worktree, and ticket folder are optional inputs, not prerequisites.

Before inferring or proposing a destination, verify `HERDR_ENV=1`, run `herdr --help`, then read the relevant command-group help. Read the source with `herdr pane current --current`. Verify that it is a Pi pane with an existing session path, and retain its pane and workspace IDs. List the live workspaces before proposing any destination, including an explicitly requested new workspace. This detects a conflicting label and records the topology that approval applies to.

Prefer evidence in this order:

1. When the user or a calling skill explicitly requires a new or separate workspace, do not infer an existing workspace. Keep the supplied workspace label and cwd.
2. Otherwise use an explicit existing workspace, tab label, or cwd from the user.
3. When the request refers to “here,” the current project, or the calling workspace, use the workspace returned by `herdr pane current --current`.
4. Otherwise identify the destination repository from the requested or current cwd. Compare its canonical repository name and path with exact workspace labels and the repository identities of panes returned by `herdr workspace list` and `herdr pane list`. For a linked Git worktree, use its shared repository or remote name rather than treating the worktree folder as the repository name.
5. Infer the tab label from the clearest work identity already present. Prefer an explicit tab or work-item name, the main GitHub issue number for a review, the Monday item ID for an AI workflow task, or another stable work-item ID. For a repository at `<root>/worktrees/<work-item>/<repo>`, use `<work-item>`, not the repository name. A project name alone does not identify the work. Otherwise derive a short recognizable label from the user's request.
6. Use the requested project or worktree directory as cwd. When continuing work already represented by the calling pane, default to that pane's cwd. The cwd need not be a Git repository.

Use an inferred existing workspace only when exactly one candidate matches. Prefer an exact workspace-label match over path or repository-name matches. If no workspace matches, retain the inferred work label and cwd while asking the user to choose between naming an existing workspace and creating a new workspace with that label and cwd; do not present new-workspace creation as the only proposal. If several match, show their IDs, labels, and relevant pane cwd values and ask which exact workspace to use. Do not silently choose or create one.

When a requested new workspace label already exists, report its ID and stop. Ask whether to use that existing workspace through the tab flow or choose a distinct workspace label.

Before proposing a new tab, list the destination workspace's tabs. If the inferred label already exists, always run `herdr tab get <tab-id>` and `herdr pane list --workspace <workspace-id>`, then correlate panes by tab ID. Do not infer pane or agent state only from the tab summary, and do not ask the user how to proceed until this correlation is complete. Report the matching tab ID and each correlated pane's ID, agent, and shell state. Do not create a duplicate or replace a running agent. Ask whether to use that tab or choose another label. Reuse a tab only after verifying an exact pane at an interactive shell prompt and receiving approval; an existing Pi session is not a fresh destination.

## Confirm the topology

State:

- the existing workspace label and ID, or that a new workspace will be created;
- the new tab or workspace label;
- the destination cwd;
- that a fresh Pi session will receive a concise continuation brief;
- that creation will not change focus; and
- that the source pane will remain open.

Ask for approval to create that exact background destination. Treat a general “yes” as approval only for the stated creation. Focusing the destination and closing the source are separate future actions.

## Create the destination

1. Verify the destination directory exists.
2. Read the source pane and Pi session with `herdr pane current --current`. Verify the agent is `pi` and its session path exists. The source is not implicitly focused.
3. Re-read `herdr workspace list` and the relevant tabs and panes. Stop if the approved destination no longer matches the live topology.
4. Create or reuse the approved shell pane without focus:

   - For an existing workspace, create a tab and read its tab and root pane IDs:

     ```bash
     herdr tab create --workspace <workspace-id> --cwd <cwd> --label <tab-label> --no-focus
     ```

   - For a new workspace, create it and read its workspace, tab, and root pane IDs:

     ```bash
     herdr workspace create --cwd <cwd> --label <workspace-label> --no-focus
     ```

   - For approved reuse, keep the verified workspace, tab, and shell-pane IDs instead of creating anything.
5. Build one concise initial user message for the destination. Begin with: “You are a fresh destination Pi session in Herdr, not the source session. The destination already exists; do not recreate it or repeat the handoff.” Include:
   - expected destination workspace, tab, pane, and cwd;
   - the user's current outcome and most recent request;
   - approved scope and consequential decisions;
   - completed work and live branch or worktree state when they exist;
   - canonical work-item or evidence paths to read when they exist;
   - the next approved action and unresolved human decisions; and
   - the source pane ID only to identify it if the human later makes a separate topology request.

   Include this direct startup boundary: “In your startup turn, do not mutate project work or Herdr topology.” Then direct the destination to verify its own identity and live state without changing focus, report that it is ready, and wait for the user. Prefer pointers to canonical durable records over copying long context.
6. Build a bounded agent name as `pi_` plus the first 28 lowercase hexadecimal characters of the destination pane ID's SHA-256 hash. For example, `w10:p1` becomes `pi_d152398ef54bbb3aa1ac11ed8f95`. Treat the exact `agent_not_found` result from `herdr agent get <agent-name>` as available. If it returns a live agent, leave the destination workspace, tab, and panes open, do not start Pi, and stop with their IDs. Stop and report any other lookup error.
7. Collapse the initial message's whitespace to one line because `herdr agent start` rejects multiline agent arguments, then shell-escape the Pi session label and message. Start Pi without inherited session flags:

   ```bash
   herdr agent start <agent-name> --kind pi --pane <destination-pane> -- \
     --name <label> <initial-message>
   herdr agent wait <destination-pane> --timeout 120000
   ```

   Always run `herdr agent wait` after `agent start`, even when `agent start` already reports `idle`. Continue only when `agent wait` returns `idle` or `done`.
8. Read both `herdr pane get <destination-pane>` and `herdr pane get <source-pane>`, then run:

   ```bash
   test -f <destination-session-path> && test -f <source-session-path>
   ```

   Do not report the destination ready unless this command succeeds. Verify that:
   - the destination agent is `pi`;
   - the destination pane belongs to the approved workspace and tab;
   - destination cwd matches the approved directory;
   - its session path exists and differs from the source; and
   - the source pane and its session path still exist after destination startup.

Do not call a focus command during creation or verification. If the human changes focus while this runs, leave it where they put it. For `blocked`, timeout, or any failed check, inspect `herdr agent get` and `herdr agent read` when available, report that the destination is not ready, and leave both panes unchanged.

Stop after reporting the verified destination and that the source remains open. The background handoff is complete.

## Handle later topology requests

A verified handoff grants no permission to focus or close anything. Handle either action only as a fresh, explicit human request:

- **Focus destination:** Confirm it still exists, focus it once, and keep the source open.
- **Close source:** If the request reaches the verified destination Pi, it rechecks both panes and closes only the named source pane. It does not change focus unless the human separately asks. If the request reaches the source Pi, stop and tell the human to close that pane manually; never relay closure or cleanup through `herdr agent prompt` or another Pi session.

Do not bundle either action into the initial handoff confirmation or pre-authorize it in the destination's startup message.
