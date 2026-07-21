# Pi Session Transfer

Use this handoff to continue the active Pi conversation in a Herdr workspace rooted at its durable ticket folder. The source stays alive until the destination proves it can take over.

## Confirm the handoff

Propose one checkpoint containing:

- the destination Herdr label and cwd
- that `pi --fork` preserves the conversation in a new Pi session
- that the destination session will close the current Herdr pane after verification

Proceed only after the user approves all three. The handoff checkpoint is independent of earlier git worktree approval.

## Record the source

1. Verify the destination directory exists.
2. Run `herdr pane current --current`.
3. Read the source pane ID and `agent_session.value` from the JSON.
4. Verify the pane agent is `pi` and the session value names an existing file.
5. Record the source pane and session path before creating anything.

Inspect `herdr workspace list` for the proposed label. If it already exists, ask for a distinct label or explicit approval to create another workspace with that label. The source is ready when its pane and session path are known and the destination label is unambiguous.

## Start the destination

Preserve whichever pane the user currently has focused throughout these background steps. Follow the skill's focus-preservation rule around every topology mutation.

1. Create the approved workspace without stealing focus:

   ```bash
   herdr workspace create --cwd <ticket-folder> --label <label> --no-focus
   ```

2. Read the workspace and root pane IDs from the response.
3. Shell-escape the source session path and label, then run interactive Pi in the returned pane:

   ```bash
   herdr pane run <destination-pane> "pi --fork <source-session> --name <label>"
   ```

4. Wait up to 30 seconds for the destination agent to become `idle`:

   ```bash
   herdr wait agent-status <destination-pane> --status idle --timeout 30000
   ```

   On timeout, inspect `herdr pane get` and `herdr pane read` before reporting failure.
5. Inspect the destination pane and verify:
   - its agent is `pi`
   - its cwd matches the approved destination
   - its session path exists and differs from the source session

The destination is ready only when all three checks pass. A failed check leaves the source pane open; report the returned destination IDs so the user can inspect or clean them up.

## Transfer ownership

Preserve the user's currently focused pane while submitting a takeover prompt to the destination Pi pane with `herdr pane run`. Include the destination workspace ID, expected cwd, source session path, and source pane ID. Direct the destination session to:

1. verify its own Herdr pane, workspace, cwd, and Pi session path without changing focus
2. preserve the source pane and the user's current focus if any value is wrong
3. only when every value matches, focus the destination pane with `herdr agent focus <destination-pane>` as the final visible handoff
4. close the recorded source pane with `herdr pane close <source-pane>`
5. verify the destination pane remains focused and immediately restore it if closing the source moved focus
6. report takeover to the user and continue from the inherited conversation

Do not focus the source or destination while launching, waiting, inspecting, or submitting the takeover prompt. After submitting that prompt, the source session makes no further mutations. The destination confirms takeover before the focus transition and source cleanup, so an interrupted launch fails safe with the source still running and the user's focus unchanged.

The handoff is complete when the destination has verified the expected workspace, cwd, and a distinct Pi session path, closed the recorded source pane, verified its pane remains focused, and reported takeover to the user.
