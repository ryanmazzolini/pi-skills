# Specialized Feedback Loops

Load the matching section when the bug is flaky, environment-specific, performance-related, requires human action, or an ordinary automated command is not enough. Return to the full loop in `SKILL.md` once one command can go red on the exact symptom and later turn green after the fix.

## Constructing a loop

Try the cheapest seam that reaches the real symptom:

1. A failing unit, integration, or end-to-end test.
2. A curl or HTTP script against a development server.
3. A CLI command over fixture input with an asserted output or snapshot.
4. A headless browser script that asserts DOM, console, or network behavior.
5. A replay of a captured request, payload, trace, or event log.
6. A throwaway harness containing only the service or call chain needed by the bug.
7. A property or fuzz loop for input-dependent failures.
8. An automated bisection harness for commits, versions, configurations, or datasets.
9. A differential loop that sends one input through known-good and failing states.
10. A structured human-in-the-loop script as the last resort.

The chosen loop must assert the exact failure, not merely complete without crashing. Cache or bypass unrelated setup until it runs in seconds where practical.

## Flaky bugs

Optimize for a high, measured reproduction rate. Run the trigger repeatedly—start with 100 iterations—then add concurrency or stress, narrow timing windows, inject controlled delays, and pin seeds and clocks. Record the parameters and failure count so the pre-fix and post-fix results are comparable. A pinned 50% failure rate is actionable; keep improving a 1% signal before diagnosing.

## Environment-specific bugs

Build the smallest matrix that distinguishes the failing and passing environments. Keep the input fixed and vary one candidate at a time, such as timezone, locale, runtime or dependency version, configuration, data shape, or deployed revision. The loop is ready when one command yields named failing and passing verdicts, or when missing access has been reported as the blocker.

## Performance bugs

Define the symptom as a measured threshold or regression on a named workload. Warm up where needed, take enough repeated samples to separate signal from noise, and preserve the same inputs and environment for comparison. Use a profiler, query plan, allocation measurement, or automated bisection to localize cost; broad debug logging can distort the result. Measure first, change one cause, then rerun the identical baseline and broader performance checks.

## Human-required reproduction

When a click or physical action cannot be automated, copy and tailor [`scripts/hitl-loop.template.sh`](scripts/hitl-loop.template.sh). The agent runs the script; the human follows precise prompts; captured answers provide the verdict. Keep the prompts limited to observable actions and the exact symptom, and replace this path with automation if the investigation reveals an accessible seam.
