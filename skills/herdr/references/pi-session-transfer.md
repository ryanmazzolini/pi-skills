# Fresh Pi Handoff

Use this workflow to continue active work in a Herdr workspace rooted at its durable ticket folder. Success is a verified fresh Pi session with a concise continuation brief. The source stays open and human focus does not change.

## Confirm the destination

State the destination label and cwd. Explain that the destination will be a fresh Pi session oriented by a continuation brief, while the source pane and current focus remain unchanged. Ask for approval to create that background handoff.

Treat a general “yes” as approval only for the background handoff. Focusing the destination and closing the source are separate future actions.

## Create the destination

1. Verify the destination directory exists.
2. Read the source pane and Pi session with `herdr pane current --current`. Verify the agent is `pi` and its session path exists. The source is not implicitly focused.
3. Check `herdr workspace list` for the proposed label. When it matches an existing workspace, ask whether to reuse that exact workspace ID or choose another label. Reuse it only after verifying its cwd and an exact pane at an interactive shell prompt; otherwise stop and ask to create a distinct workspace.
4. For a new workspace, create it without focus and read its workspace and root pane IDs:

   ```bash
   herdr workspace create --cwd <ticket-folder> --label <label> --no-focus
   ```

   For approved reuse, keep the verified workspace and shell-pane IDs instead of running `workspace create`.
5. Build one concise initial user message for the destination. Begin with: “You are a fresh destination Pi session in Herdr, not the source session. The workspace already exists; do not recreate it or repeat the handoff.” Include:
   - expected destination workspace, pane, and cwd;
   - the user's current outcome and most recent request;
   - approved scope and consequential decisions;
   - completed work and live branch or worktree state;
   - canonical work-item or evidence paths to read, when they exist;
   - the next approved action and unresolved human decisions; and
   - the source pane ID only to identify it if the human later makes a separate topology request.

   Direct the destination to verify its own identity and live state without changing focus, report that it is ready, and wait for the user. It must not mutate the project or topology in its startup turn. Prefer pointers to canonical durable records over copying long context.
6. Create a bounded agent name as `pi_` plus the first 28 lowercase hexadecimal characters of the destination pane ID's SHA-256 hash. For example, `w10:p1` becomes `pi_d152398ef54bbb3aa1ac11ed8f95`. Treat the exact `agent_not_found` result from `herdr agent get <agent-name>` as available. If it returns a live agent, leave the destination workspace and panes open, do not start Pi, and stop with their IDs. Stop and report any other lookup error.
7. Collapse the initial message's whitespace to one line because `herdr agent start` rejects multiline agent arguments, then shell-escape the Pi session label and message. Start Pi without inherited session flags:

   ```bash
   herdr agent start <agent-name> --kind pi --pane <destination-pane> -- \
     --name <label> <initial-message>
   herdr agent wait <destination-pane> --timeout 120000
   ```

   Read the returned status. Continue only for `idle` or `done`.
8. Verify with `herdr pane get <destination-pane>` that:
   - the agent is `pi`;
   - cwd matches the approved destination;
   - its session path exists and differs from the source; and
   - the source pane still exists.

Do not call a focus command during creation or verification. If the human changes focus while this runs, leave it where they put it. For `blocked`, timeout, or any failed check, inspect `herdr agent get` and `herdr agent read` when available, report that the destination is not ready, and leave both panes unchanged.

Stop after reporting the verified destination and that the source remains open. The background handoff is complete.

## Handle later topology requests

A verified handoff grants no permission to focus or close anything. Handle either action only as a fresh, explicit human request:

- **Focus destination:** Confirm it still exists, focus it once, and keep the source open.
- **Close source:** If the request reaches the verified destination Pi, it rechecks both panes and closes only the named source pane. It does not change focus unless the human separately asks. If the request reaches the source Pi, stop and tell the human to close that pane manually; never relay closure or cleanup through `herdr agent prompt` or another Pi session.

Do not bundle either action into the initial handoff confirmation or pre-authorize it in the destination's startup message.
