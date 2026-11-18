---
name: "test-design"
description: "Use when writing or changing tests, deciding which automated tests a change needs, or trimming a slow or repetitive test suite. Covers what to test, at which level, and how to cover it with fewer tests."
---

# Test Design

Tests are enough when bugs rarely reach users and the code can be changed without fear. Aim for the smallest set of tests that gives that confidence for the behavior in scope. Low coverage shows where tests are missing; high coverage does not show the tests are good.

Use the repository's existing test framework, helpers, and layout.

## Choose what to test

List the behaviors the change adds or alters, as a caller observes them. Rank them by what a failure costs and how likely the code is to be wrong. Spend most of the effort on the top of that list: money, data loss, permissions, irreversible actions, dense branching, and code with a history of bugs.

For each behavior worth testing, cover these, unless an existing test already catches the same failure:

- the main path, once;
- the boundaries where behavior changes, such as empty, one, many, and each limit;
- the failure paths callers rely on;
- every bug being fixed, with a test that fails before the fix. If no test can reach the bug, keep the reproducer and say so in the result.

Leave out code with no logic of its own: accessors, pass-through wrappers, constants, and framework or library behavior. Leave out what the type checker already guarantees.

Before changing untested code, pin the behavior the change must preserve with tests that pass against the current code. Use the fewest cases that would catch the change breaking that behavior. Name these as pinning current behavior. Do not pin the behavior being changed or fixed. If behavior outside the approved change looks wrong, report it rather than fixing it or leaving it unmentioned.

If a risky behavior goes untested because it is hard to reach, say so in the result rather than testing something easier in its place.

## Choose the level

Put each test at the lowest level where it can fail for the right reason. Keep most tests fast and close to the logic, fewer on wiring such as queries, serialization, and service boundaries, and very few end-to-end, for the journeys that must not break.

A higher-level test proves the pieces connect. It does not repeat each rule a lower test already proves. When a higher-level test catches a bug no lower test caught, add the lower test if the failure can be reproduced at that level.

Test through the interface callers use, and assert results and durable outputs rather than call order. Use real collaborators when they are fast and deterministic, including third-party libraries that run in-process. For other I/O, prefer a realistic local stand-in, such as an in-memory database or a fake clock. Mock only external services and dependencies with no reliable local stand-in. Control time, randomness, and ordering instead of sleeping or retrying.

## Compress

- **Group equivalent inputs.** Inputs the requirement treats the same need one representative, plus the boundaries between groups.
- **Use a table** when cases share setup and assertion shape. Name each row by what it proves.
- **Independent parameters:** vary one at a time from a baseline.
- **Interacting parameters:** use pairwise coverage when the effect of one parameter depends on another, and there are three or more parameters with a few values each. Cover every pair of values at least once, then add any specific combination known to be risky. Generate the set with a tool when it is too large to check by hand.
- **Test every combination** only when the requirement gives each combination its own answer, as a permission matrix does, or a known risk justifies it. A small set is not a reason on its own.
- **Use a property-based test** when a rule holds for all inputs, such as a round trip or an invariant, and the repository already has a library for it.
- **Merge tests** that repeat one setup to assert facets of the same behavior. Keep separate behaviors in separate tests so a failure names what broke.

Stop compressing when a failure would no longer point to its cause. Keep the inputs that matter visible in the test body, not hidden in a shared helper.

For fixed examples, write each expected value as a literal: worked out from the requirement, or observed from the current code when pinning it. For generated inputs, assert the property directly. A test that computes its expected value with the same logic as the code passes when both are wrong.

## Check each test can fail

A test earns its place only if it would fail when the behavior breaks. When the assertion makes that obvious, reasoning is enough. If you can't tell, for example because the assertion goes through a substitute, run it against broken code.

A test for a bug fix must be seen to fail on the reported symptom before the fix, and pass after it. A failure from a typo or broken setup doesn't count. A test that pins current behavior passes by design, so this check does not apply to it.

## Existing tests

Update tests whose behavior the approved change alters. Removing or merging any other existing test needs approval: propose it, naming the test that still fails when the behavior breaks.

## Report

State in a few lines what is covered, what pins current behavior, and what was deliberately left untested and why.
