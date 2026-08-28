---
name: "firefox-tab-triage"
description: "Triage tabs in personal and secondary Firefox profiles."
disable-model-invocation: true
---

# Firefox Tab Triage

Use Browser Control MCP to triage both Firefox profiles. Treat each profile independently so the same URL may remain open in both.

## Profiles

- `browser-control-personal`
- `browser-control-secondary`

Discover each server's current tool names before use. If either server has not been configured, read the [setup guide](README.md). If a configured server cannot connect, skip that profile, continue with the other, and state why it was skipped.

## When invoked without arguments

Inspect both profiles without closing anything. Find:

- duplicate tabs;
- tabs for closed pull requests;
- tabs for approved open pull requests not created by the authenticated GitHub user.

Report the number of tabs matching each rule and the total number of unique matching tabs after accounting for overlap. Then ask whether to close those tabs.

Treat `cleanup`, `run cleanup`, or another direct instruction to apply these three rules as approval to close every matching tab. Refresh both profiles and GitHub state before closing; do not reuse matches from an earlier inspection.

## Safety

Tab closure is destructive.

- A question is read-only. Show the proposed rule and candidate count, then wait for explicit approval.
- If the user directly asks to close tabs under a clear rule, that request is approval for that rule.
- Refresh the complete tab list immediately before selecting candidates.
- Never close a tab whose match or external status cannot be verified.
- Do not read page content unless the task requires it. Tab titles and URLs are enough for routine triage.
- Keep secrets, authenticated page content, and unrelated tab details out of the response.

Apply an approved rule to both profiles unless the user names one profile. Perform independent MCP calls per profile; one profile failing must not block the other.

## Duplicate tabs

Normalize URLs before comparing them within one profile:

1. Remove the fragment.
2. Remove trailing slashes except the root slash.
3. Preserve the scheme, host, path, and query string.

Keep the tab with the lowest tab ID and close the rest. Do not deduplicate across profiles.

## GitHub pull requests

Recognize GitHub URLs shaped like `https://github.com/<owner>/<repo>/pull/<number>` including review, fragment, commit, files, and `/changes` variants. Treat variants for the same repository and pull request number as one pull request.

Use the authenticated `gh` CLI to verify current GitHub state. Determine the current user with `gh api user --jq .login`; do not assume a login.

For common cleanup rules:

- **Closed PRs:** close every tab for a PR whose current state is closed.
- **Approved PRs not created by me:** close every tab only when the PR is open, its current `reviewDecision` is `APPROVED`, and its author differs from the authenticated GitHub user.
- Preserve open PRs created by the authenticated user unless the user gives another rule.
- Preserve PR tabs when GitHub lookup fails or returns an ambiguous result.

Query each unique PR once, then map the result back to all matching tab IDs.

## Completion

After closing tabs:

1. Verify the remaining tab count in each affected profile.
2. Report the number closed per profile and in total.
3. Summarize the applied rule and any skipped or unverifiable candidates.
4. Avoid listing unrelated remaining tabs.
