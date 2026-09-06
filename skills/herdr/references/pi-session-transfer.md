# Fresh Pi Destination

Use this workflow to continue active work in a fresh Pi session. Put the destination in a named tab inside an existing Herdr workspace when the work belongs to that workspace. Create a workspace only when the user chooses a new Herdr workspace. The source stays open and human focus does not change.

A Herdr tab contains one or more panes. Use the work item's human-recognizable name as the tab label; do not describe this as naming a pane.

## Infer the destination

Infer the Herdr workspace, tab label, and cwd independently. A Herdr workspace groups workstreams; each tab represents one workstream. Its cwd may be a shared checkout, an individual worktree, or a ticket folder containing several worktrees. A ticket folder does not require its own Herdr workspace. A ticket, branch, worktree, and ticket folder are optional inputs, not prerequisites.

Before inferring or proposing a destination, verify `HERDR_ENV=1`, run `herdr --help`, then read the relevant command-group help. Read the source with `herdr pane current --current`. Verify that it is a Pi pane with an existing session path, and retain its pane and workspace IDs. List the live workspaces before proposing any destination, including an explicitly requested new workspace. This detects a conflicting label and records the topology that approval applies to.

Prefer evidence in this order:

1. Honor the user's explicit choice of a new or existing Herdr workspace. A calling skill may pass along that choice, but preparing a ticket folder or worktree is not a request for a new Herdr workspace. Keep the supplied label and cwd independently of that choice.
2. When the user places the work in the calling Herdr workspace, such as “continue this review here,” use the workspace returned by `herdr pane current --current`. A reference to the current repository alone does not select the calling workspace.
3. Otherwise match the work's project or activity to live workspace labels and pane evidence. A workspace such as `reviews` may group work across repositories. Use the user's work context rather than assuming every workspace represents one repository.
4. When repository identity helps resolve the destination, compare its canonical name and path with workspace labels and the repository identities of panes returned by `herdr pane list`. For a linked Git worktree, use its shared repository or remote name rather than the worktree folder name. A ticket folder containing several worktrees need not itself be a repository. Do not select an arbitrary child repository to decide its Herdr workspace or replace the requested cwd with that child. If the work context and live topology do not identify one destination, ask rather than assuming the calling workspace or creating one.
5. Infer the tab label from the clearest work identity already present. Prefer an explicit tab or work-item name, `gh-<number>` for the main GitHub issue in a review, the Monday item ID for an AI workflow task, or another stable work-item ID. For a GitHub review with a supplied main issue number, do not require its repository, title, or an issue lookup only to name the tab. Without an explicit tab or work label, use `<work-item>` for a ticket folder at `<root>/worktrees/<work-item>` or a worktree inside it, not the repository name. When that work-item slug starts with `sc-<number>-`, keep the full slug as the default label and describe the work in the confirmation as Shortcut story `SC-<number>`. A project name alone does not identify the work. Otherwise derive a short recognizable label from the user's request.
6. Use the requested project or worktree directory as cwd. When continuing work already represented by the calling pane, default to that pane's cwd. The cwd need not be a Git repository.

Use an inferred existing workspace only when exactly one candidate matches. Prefer an exact workspace-label match over path or repository-name matches. If no workspace matches, retain the explicit work label when one was supplied; otherwise retain the inferred work label. Keep the requested or inferred cwd while asking the user to choose between a named existing workspace and creating a new workspace. Use the work label as the proposed tab label for an existing workspace or the proposed workspace label for a new one; do not replace it with the repository name or present new-workspace creation as the only proposal. If several workspaces match, inspect the panes for every candidate before responding. Use existing pane-list evidence when it covers every candidate; otherwise run `herdr pane list --workspace <workspace-id>` for each one. Show each candidate’s ID, label, and relevant pane cwd values, then ask which exact workspace to use. Do not silently choose or create one.

When a requested new workspace label already exists, report its ID and stop. Ask whether to use that existing workspace through the tab flow or choose a distinct workspace label.

Before proposing a new tab, list the destination workspace's tabs. When an inferred `gh-<number>` label is taken, append a short work description from the context already supplied, such as `gh-72-retry-fix`. Check that this label is unused in the destination workspace, then propose it through the normal destination confirmation. Leave the existing tab untouched; do not require a repository or issue lookup just to name the new tab. If the context does not suggest a recognizable suffix or the suffixed label is also taken, ask the user for another label. Do not apply this fallback to an explicitly supplied tab or work label.

For other label collisions, always run `herdr tab get <tab-id>` and `herdr pane list --workspace <workspace-id>`, then correlate panes by tab ID. Do not infer pane or agent state only from the tab summary, and do not ask the user how to proceed until this correlation is complete. Report the matching tab ID and each correlated pane's ID, agent, and shell state. Do not create a duplicate or replace a running agent. Ask whether to use that tab or choose another label. Reuse a tab only after verifying an exact pane at an interactive shell prompt and receiving approval; an existing Pi session is not a fresh destination.

## Confirm the topology

Lead with one sentence that identifies the work in terms the user recognizes. For a GitHub review with a supplied tracking issue, say: “I’ll start a fresh Pi for the review tracked by GitHub issue #<number>.” For a review without a tracking issue, use the recognizable-work fallback below; do not invent an issue or require one. For Shortcut work, say: “I’ll start a fresh Pi for Shortcut story `SC-<number>`.” For a change named by its worktree folder, say: “I’ll start a fresh Pi for the `<work-item>` change.” Otherwise say: “I’ll start a fresh Pi for <work the user recognizes>.” Do not substitute the project or workspace name for a more specific work-item identity.

For a new tab in an existing workspace, follow with exactly these bullets:

- Workspace: `<label>`
- New tab: `<label>`
- Working directory: `<cwd>`

For a new workspace, follow with these bullets:

- New workspace: `<label>`
- Working directory: `<cwd>`

If the user explicitly supplied a tab label for the new workspace, insert a `New tab` bullet between them with the supplied tab label as its value. This approves naming the workspace's initial tab, not creating another tab. Otherwise leave its default label unchanged.

Do not add other bullets. Keep each bullet label as plain text and format only its value as inline code. The cwd may instead be a clickable Markdown link whose label is inline code. Keep Herdr IDs, source details, continuation-brief details, and background-operation details out of a concrete destination proposal. State focus only with the exact sentence below. Include IDs only when the user must distinguish ambiguous candidates or diagnose a failure.

Immediately after the final bullet, put this exact sentence in its own paragraph: “Your current focus and Pi session will remain unchanged.” Do not insert other text between the bullets and this sentence.

Then ask exactly: “Approve this destination?” A concrete destination proposal contains only the lead sentence, the specified bullets, the focus/session sentence, and this question.

Use bullets rather than a table so long paths remain readable in narrow terminal panes. Treat a general “yes” as approval only for the stated creation. Focusing the destination and closing the source are separate future actions.

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

     If the approved proposal includes an explicit tab label, name the returned initial tab before starting Pi:

     ```bash
     herdr tab rename <tab-id> <tab-label>
     herdr tab get <tab-id>
     ```

     Verify that this tab belongs to the new workspace and has the approved label. Do not create an extra tab. If naming or verification fails, stop before starting Pi, report the created IDs, and leave both the source and destination open without changing focus.

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
6. Derive the destination agent name as `pi_` plus the first 28 lowercase hexadecimal characters of the destination pane ID's SHA-256 hash. For example, `w10:p1` becomes `pi_d152398ef54bbb3aa1ac11ed8f95`. Use the same complete name for both `herdr agent get` and `herdr agent start`; do not change its content or length between commands. Treat the exact `agent_not_found` result from `herdr agent get <agent-name>` as available. If it returns a live agent, leave the destination workspace, tab, and panes open, do not start Pi, and stop with their IDs. Stop and report any other lookup error.
7. Collapse the initial message's whitespace to one line because `herdr agent start` rejects multiline agent arguments, then shell-escape the Pi session label and message. Start Pi without inherited session flags:

   ```bash
   herdr agent start <agent-name> --kind pi --pane <destination-pane> -- \
     --name <label> <initial-message>
   herdr agent wait <destination-pane> --timeout 120000
   ```

   Always run `herdr agent wait` after `agent start`, even when `agent start` already reports `idle`. Continue only when `agent wait` returns `idle` or `done`.
8. After `herdr agent wait` returns `idle` or `done`, re-read both `herdr pane get <destination-pane>` and `herdr pane get <source-pane>`. Reads taken before `herdr agent start` do not satisfy this verification. Then run this exact combined file check as a separate command:

   ```bash
   test -f <destination-session-path> && test -f <source-session-path>
   ```

   A nonempty session path in pane JSON does not prove the file exists. Do not report the destination ready unless the combined file check succeeds. Verify that:
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
