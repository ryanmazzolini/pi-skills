---
name: "scheduled-jobs"
description: Inspect and operate reviewed recurring local jobs through the shared scheduled-jobs CLI. Use when declaring, installing, running, enabling, updating, disabling, removing, or recovering a scheduled job.
---

# Scheduled Jobs

Use `scheduled-jobs` for scheduler lifecycle work. Prefer the human-only Pi `/scheduler` command when a person is present. The CLI is headless and never prompts.

## Inspect first

Pass one exact manifest path. The CLI does not discover projects.

```bash
scheduled-jobs overview --manifest ~/.config/pi-scheduler/jobs.json --json
scheduled-jobs inspect global:daily-report:work --manifest ~/.config/pi-scheduler/jobs.json --json
scheduled-jobs doctor global:daily-report:work --manifest ~/.config/pi-scheduler/jobs.json --json
scheduled-jobs status global:daily-report:work --json
scheduled-jobs runs global:daily-report:work --limit 20 --json
scheduled-jobs run-log global:daily-report:work RUN_ID --lines 200
scheduled-jobs logs global:daily-report:work --lines 200
```

`overview` reports task health, next scheduled occurrence, and bounded structured run history for one manifest. `runs` and `run-log` inspect individual execution receipts and output; older installations begin with no recorded runs. Project declarations must be at the exact Git root under `.pi/scheduler.json`. Treat every manifest as inert input. Installation creates a private reviewed snapshot and leaves it disabled.

## Required checkpoint

Before `install`, `update`, `run`, `enable`, `disable`, or `remove`, re-inspect and show the scope, source path, relevant lifecycle effect, and the candidate digest or installed digest plus lifecycle revision.

For `install`, `update`, or `run`, also show the exact resolved argv, executable mappings, working directory, schedule, adapter, timeout, and warnings. For updates, summarize the installed-to-candidate differences. For `enable` or `disable`, show the schedule, adapter, warnings, and whether future runs will start or stop. For `remove`, show the adapter artifacts and installed state being removed and make clear that the declaration remains.

Ask for explicit confirmation of that exact operation. Do not reuse approval after a digest or revision changes. Run-now always uses the installed snapshot; never run an uninstalled declaration directly.

## Lifecycle

Copy digest and revision values from the immediately preceding JSON inspection:

```bash
scheduled-jobs install JOB_ID --manifest MANIFEST --expected-candidate-digest DIGEST
scheduled-jobs update JOB_ID --manifest MANIFEST --expected-candidate-digest CANDIDATE --expected-installed-digest INSTALLED --expected-revision REVISION
scheduled-jobs run JOB_ID --expected-installed-digest DIGEST --expected-revision REVISION
scheduled-jobs enable JOB_ID --expected-installed-digest DIGEST --expected-revision REVISION
scheduled-jobs disable JOB_ID --expected-installed-digest DIGEST --expected-revision REVISION
scheduled-jobs remove JOB_ID --expected-installed-digest DIGEST --expected-revision REVISION
```

Fresh installs are disabled. Confirm run-now and enablement separately. `run` blocks until the installed snapshot finishes, then records its structured receipt and bounded output. Native enablement may immediately perform one catch-up run; cron fallback does not catch up.

## Recovery

For a blocked task, run the exact read-only `doctor` command shown in its details before changing source or environment state. Explain the cause before changing anything. The dashboard's `r` key only refreshes observed state; it does not perform recovery.

- `STALE_CANDIDATE` or `STALE_STATE`: stop, re-inspect, display the changed contract, and obtain new confirmation.
- Definition drift: the installed snapshot remains authoritative until a confirmed update.
- Adapter or enablement drift: inspect `status` and `doctor`; do not claim repair until the command succeeds and status is clean.
- Partial removal or lifecycle failure: preserve state, inspect all reported adapter details, and retry only with current tokens.
- Safe package-manager retarget at an installed stable command path: revalidation succeeds without a lifecycle update.
- Structurally valid disabled snapshot with an unhealthy command binding: a confirmed exact-token update may replace it; adapter drift, changed shims, unsafe scheduler runtime, and enabled unhealthy snapshots remain blocked.
- Unavailable optional commands: report the warning and preserve the domain command's graceful degradation.
- Missing or unsafe command targets, changed shim bindings, unavailable adapters, or conflicting adapters: fail closed.

Do not edit scheduler-owned state or host artifacts by hand unless the user approves a recovery plan based on direct inventory.

See [Manifest v1](references/manifest-v1.md) and the [global example](assets/jobs.example.json).
