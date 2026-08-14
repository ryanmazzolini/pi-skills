---
name: "diagnosing-bugs"
description: "Diagnose hard, flaky, environment-specific, or performance bugs. Use when the cause is unclear, local/CI/production behavior differs, or the user asks to diagnose or debug."
license: "MIT; adapted from mattpocock/skills"
---

# Diagnosing Bugs

First establish the requested outcome:

- **Diagnosis only** is the default when the user asks why something failed, asks a question, or says to diagnose or debug it. Inspect files and run existing commands. Do not edit project files or change production systems unless the user separately approves a bounded diagnostic change such as adding instrumentation; that approval does not authorize a fix. Use OS temporary files for disposable local artifacts when possible.
- **Diagnosis and remediation** requires an explicit request to fix the bug or approval after diagnosis. Make only the approved project changes and follow the repository's normal approval boundaries for commits, pushes, and pull requests.

Do not infer remediation authority from a diagnosis request.

Build the smallest tight feedback loop that can go red on the user's exact symptom. Run it before diagnosing or fixing. Let observed evidence drive the diagnosis.

A usable loop has one command you have already run. Record the command and its exact output. It exercises the real bug path, distinguishes the reported failure from nearby failures, and can turn red before the fix and green after it. It should run in seconds, not minutes, where practical. For a flaky bug, use a pinned, measured reproduction rate instead of demanding identical verdicts.

If no such loop is possible, stop. Report what you tried and request the missing environment access, a captured artifact such as a HAR/log/core dump/timestamped recording, or approval for temporary production instrumentation. Resume diagnosis only when evidence can flow back into a loop.

## Localized fast path

Use this path only when an error identifies a narrow violated contract and one command reproduces it:

1. Run the command and capture the exact failure.
2. State the evidenced cause. Switch to the full loop if the cause remains uncertain.
3. For diagnosis only, identify the regression seam and smallest likely fix, then follow the cleanup rule below before reporting the evidence and stopping.
4. For remediation, add or tighten regression coverage at the seam that exercises the real bug pattern. If no correct seam exists, record the gap and retain the reproducer as evidence.
5. For remediation, apply the narrow fix, rerun the original command, then run the repository's expected broader validation.

Diagnosis is complete when the evidence establishes the cause or names the remaining uncertainty and the next evidence needed. Remediation is complete when the exact original failure is green, regression evidence covers it, and broader validation has passed or its blocker is explicit.

## Uncertain-bug full loop

Use the full loop for hard, flaky, environment-specific, or performance bugs. Read nearby `CONTEXT.md` and architecture decision records when they exist. Skip a step only when evidence already fulfills its purpose, and state why.

Read [SPECIALIZED-LOOPS.md](SPECIALIZED-LOOPS.md) when an ordinary automated command cannot expose the bug, or when the bug is flaky, environment-specific, performance-related, or requires a human action.

1. **Build and tighten the loop.** Prefer the narrowest automated command that reaches the real path and asserts the exact symptom. Run it at least once and record the command and exact output. Reduce setup, sharpen the assertion, and control time, randomness, filesystem, network, and other sources of noise. Do not form a causal theory until this red-capable loop exists.

2. **Reproduce and minimize.** Confirm across repeated runs that the loop shows the user's reported error, wrong output, or slow timing—not a nearby failure. Capture that exact symptom. Remove inputs, callers, configuration, data, and steps one at a time, rerunning after each removal. Stop minimizing when every remaining element is load-bearing: removing any one makes the loop green.

3. **Rank hypotheses and checkpoint.** Before testing, write 3–5 ranked hypotheses. Make each falsifiable: name the change or observation that would support or reject it. Show the concise ranked list to the user so domain knowledge can reorder it; if they are unavailable, continue with the stated ranking rather than blocking.

4. **Probe one prediction at a time.** Prefer a debugger or REPL, then targeted instrumentation at boundaries that distinguish the ranked hypotheses. Tag every temporary log with one unique cleanup prefix such as `[DEBUG-a4f2]`. For performance bugs, measure a stable baseline on a named workload and use timing, profiles, query plans, or bisection before changing code. When remediating, compare the same measurement after the fix.

5. **Lock down the bug.** Identify the regression seam that exercises the real bug pattern. Include the actual caller chain only when it matters. If no such test point exists, document the architectural gap instead of proposing a shallow test that would give false confidence. For diagnosis only, do not add the test or apply the fix; continue to cleanup. For remediation, turn the minimized reproducer into a failing test and observe it fail before applying the narrow fix. After the fix, observe the regression test pass and rerun the original, unminimized loop.

6. **Clean up and validate.** Complete the cleanup for the active mode:
   - In either mode, remove all tagged instrumentation and reverse approved temporary diagnostic changes unless the user separately approves retaining them.
   - Distill reusable conclusions, commands, and procedures into the owning project or work-item record.
   - Preserve raw evidence unchanged in its designated raw area when verification or later analysis may need it.
   - Remove artifacts with no continuing diagnostic, regression, reference, or evidentiary value instead of preserving the whole diagnostic workspace.
   - Follow the project's storage and redaction rules for every retained result.
   - Name each retained artifact's purpose, propose its durable location, and retain it only with approval. Verify the durable copy before deleting the temporary artifact.
   - For remediation, verify the original exact symptom is gone, the regression test passes or the seam gap is documented, the performance baseline improved when applicable, and the repository's full expected validation passes. Report any validation blocker explicitly.

## Finish the requested outcome

After diagnosis only, state the confirmed cause and evidence, distinguish any remaining uncertainty, and recommend the smallest next action. Ask whether to apply the fix only when remediation is a useful next step.

After remediation, state the confirmed cause, fix, regression evidence, and validation. Include the cause in a commit or pull request message only when that artifact is separately approved and created. Then ask what would have prevented the bug. If the evidence reveals hidden coupling, tangled callers, or no good test point, recommend the simplification branch of the `architecture` skill with those specifics. Do not let architectural follow-up delay or replace the verified fix.

## Communication

Keep the investigation internally thorough. Keep user updates concise: report the working loop, the ranked-hypothesis checkpoint, and the confirmed cause. Report the fix, regression evidence, and final validation only after remediation. Do not narrate routine searches or every failed probe.
