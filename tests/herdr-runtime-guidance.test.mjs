import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const skill = await readFile(new URL("../skills/herdr/SKILL.md", import.meta.url), "utf8");
const transfer = await readFile(new URL("../skills/herdr/references/pi-session-transfer.md", import.meta.url), "utf8");

// These check the written contract, not a model's execution of the workflow.
test("Herdr routes process and visible-layout work to installed manuals", () => {
  assert.match(skill, /Programs and agents:\*\* read `hc --skill`/);
  assert.match(skill, /What the person sees:\*\* read `herdr-app --skill`/);
  assert.match(skill, /If the request affects both programs and their visible containers, read both manuals/);
  assert.match(skill, /Follow the relevant manual's `--help`, command discovery and linked guides/);
  assert.doesNotMatch(skill + transfer, /herdr (?:workspace|tab|pane|agent)\b/);
  assert.doesNotMatch(skill + transfer, /test "\$\{HERDR_ENV|Requires HERDR_ENV/);
});

test("source identity is a verified explicit core address, not human focus", () => {
  assert.match(skill, /\$HC_TERMINAL_ID.*calling terminal's address, not a pane ID/);
  assert.match(skill, /hc get "\$HC_TERMINAL_ID"/);
  assert.match(skill, /do not rely on an omitted target selecting it/);
  assert.match(skill, /If it is absent or cannot be verified, do not guess the source/);
  assert.match(skill, /calling terminal need not be the focused pane/);
  assert.match(skill, /Correlate app panes with core terminal addresses before acting/);
});

test("session startup uses core without granting permission to show or focus its destination", () => {
  assert.match(skill, /Starting a background worker does not authorize showing a new tab or split/);
  assert.match(skill, /Starting a session or worker must never change the person's focus/);
  assert.ok(skill.includes('hc run --bg --outlive-parent --name <name> --cwd <cwd> --label herdr.space=<space-id> pi "<brief>"'));
  assert.match(skill, /Do not use `tab\.new`, `space\.new` or `terminal\.open` to start sessions/);
  assert.match(skill, /App creation\/showing commands require an explicit request to see the destination/);
  assert.match(skill, /deliberately overrides the installed app manual's agent-launch examples/);
  assert.match(skill, /still launch with `hc`, then focus that exact terminal once through the app/);
  assert.match(skill, /A request merely to start work does not authorize showing or focusing it/);
  assert.match(skill, /Focus only in response to a current, explicit request/);
  assert.match(skill, /do not record and later restore focus/);
  assert.match(skill, /Creating or focusing a destination does not authorize closing its source/);
});

test("closure distinguishes ticket resolution, terminal lifetime and UI containers", () => {
  assert.match(skill, /Do not treat an agent's `done` status as proof that its ticket is resolved/);
  assert.match(skill, /window closure and parking can leave programs alive/);
  assert.match(skill, /tab, pane or space closure can end terminals and their children/);
  assert.match(skill, /Approval to hide something is not approval to terminate it/);
  assert.match(skill, /Keep saved investigations and worktrees unless their deletion was separately approved/);
  assert.match(skill, /Do not launch an app or core, or stop, restart or update either, without approval/);
});

test("fresh continuations preserve lifetime, readiness and uncertain-delivery safeguards", () => {
  assert.match(transfer, /independent continuation can outlive the source: core children normally end with their parent/);
  assert.match(transfer, /When the result exposes `first_message.sent`, require it to be true/);
  const prepareBrief = transfer.indexOf("2. Put a concise startup brief");
  const launchWithBrief = transfer.indexOf("4. Launch with that brief");
  assert.ok(prepareBrief !== -1 && launchWithBrief > prepareBrief, "prepare the initial brief before launching");
  assert.match(transfer, /If delivery is false or uncertain, inspect the exact terminal/);
  assert.match(transfer, /Use documented waits, not sleeps or polling loops/);
  assert.match(transfer, /Verify both actual session files exist and differ/);
  assert.match(transfer, /current Pi runtime, such as its own `PI_SESSION_FILE`/);
  assert.match(transfer, /Verify the terminal's `parent` and `die_with_parent` through core metadata/);
  assert.match(transfer, /Choose the parent skill's hc launch route for both visible and background-only destinations/);
  assert.match(transfer, /Use `--outlive-parent`/);
  assert.match(transfer, /core manual's remote file tools when either path is on another machine/);
  assert.match(transfer, /Apply the parent skill's launch and visibility policy to either destination type/);
  assert.doesNotMatch(skill + transfer, /herdr\.tab=|space\/tab labels/);
  assert.doesNotMatch(transfer, /obtain approval for that effect|installed app manual's launch procedure/);
});

test("caller-supplied destinations retain a confirmation contract without a false focus promise", () => {
  assert.match(transfer, /## Confirm the topology/);
  assert.match(transfer, /A calling skill's recommendation to create a space does not bypass this restriction/);
  assert.match(transfer, /Preserve the supplied work name and cwd when explaining the blocked request/);
  assert.match(transfer, /do not create a space or silently choose a different destination/);
  assert.match(transfer, /- Space:/);
  assert.match(transfer, /- New tab:/);
  assert.match(transfer, /- Working directory:/);
  assert.match(transfer, /Approve this destination\?/);
  assert.match(transfer, /A request for a new space blocks this handoff/);
  assert.match(transfer, /only add the `herdr\.space` label for an approved new tab/);
});

test("visible destination tabs are named by the returned terminal identity, not focus or defaults", () => {
  assert.match(skill, /the core terminal's name does not name its app tab/);
  assert.match(skill, /use `herdr-app ls` to find the tab containing the exact terminal address returned by `hc`/);
  assert.ok(skill.includes('herdr-app do tab.rename --id <tab-id> --name <work-item>'));
  assert.match(skill, /not the currently focused tab, tab position or numeric default name/);
  assert.match(skill, /If the mapping is missing or ambiguous, report the naming step as blocked/);
  assert.match(skill, /Check `herdr-app status` again after renaming/);
  assert.ok(transfer.includes('[Start sessions without changing focus](../SKILL.md#start-sessions-without-changing-focus)'));
  assert.match(transfer, /for every launch, its separate show approval and its post-launch tab naming/);
  assert.match(transfer, /name any approved visible tab using its matched terminal address/);
  assert.match(transfer, /its app mapping and tab name match any approved visible destination/);
  assert.doesNotMatch(skill + transfer, /Focus behavior of this hc route is unverified|its unverified focus behavior|Verify it on the first real, authorized launch/);
});

test("real launches check focus without restoring it or retrying to test it", () => {
  assert.match(skill, /Read `herdr-app status` before and after each real launch/);
  assert.match(skill, /If focus changed, report the observation and leave focus as it is now; do not move it back/);
  assert.match(skill, /If status is unavailable, report that the focus check is unavailable/);
  assert.match(skill, /Do not retry a launch to test focus or fall back to app creation commands/);
  assert.match(skill, /Do not launch disposable sessions on the person's window to test focus/);
  assert.match(transfer, /Perform the parent skill's pre-launch focus check/);
  assert.match(transfer, /Launch with that brief through `hc`, then perform the parent skill's post-launch focus check/);
  assert.match(transfer, /Apply the parent skill's focus rule even on failure/);
});

test("independent continuations outlive their source but ordinary workers stay parent-bound", () => {
  assert.match(skill, /For an independent continuation in an approved existing space, use this launch shape/);
  assert.match(skill, /`--outlive-parent` is for independent continuations, not ordinary task-bound workers/);
  assert.match(skill, /Keep ordinary workers unlabeled and omit `--outlive-parent` so they end with their parent/);
});

test("new-space handoffs stop instead of creating an extra tab or substituting a destination", () => {
  assert.match(skill, /If the requested space does not exist, stop before launch/);
  assert.match(skill, /This handoff procedure requires an existing space/);
  assert.match(skill, /ask the user to choose one/);
  assert.match(skill, /Do not create a new space or add an initial shell tab as part of session startup/);
  assert.match(skill, /do not substitute another destination without the user's decision/);
  assert.match(transfer, /A request for a new space blocks this handoff/);
  assert.match(transfer, /- Space: the approved existing space name/);
  assert.doesNotMatch(skill + transfer, /create and show the new space|then launch Pi with `hc`|explicitly proposed new name|separate create-and-show approval/);
});

test("ticket cleanup preserves the calling session rather than handing off its closure", () => {
  assert.match(skill, /perform that cleanup in the calling terminal/);
  assert.match(skill, /Protect its shell, Pi process and current cleanup command chain/);
  assert.match(skill, /relay closure through another session/);
  assert.match(skill, /ready for manual closure/);
  assert.match(transfer, /never close the terminal running the current Pi/);
  assert.match(transfer, /do not relay closure through another session/);
});
