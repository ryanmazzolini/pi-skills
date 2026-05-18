# Optional Test-First Guidance

Use this only when automated behavior tests are the right verification tactic for the current slice. RPI requires proof of the end state; it does not require TDD.

## Rules

- **PUBLIC INTERFACES FIRST**: Test through the API, command, UI, or workflow a user or caller actually depends on.
- **ONE BEHAVIOR AT A TIME**: If using test-first, write one failing test for the next observable behavior, not a full suite upfront.
- **RED BEFORE GREEN**: Run the focused test and confirm it fails for the expected reason before implementing.
- **MINIMUM GREEN**: Add the smallest useful implementation that makes the test pass.
- **REFACTOR WHEN GREEN**: Clean up names, duplication, and shape only after tests pass.
- **RATCHET**: A passing behavior stays passing; fix regressions before starting the next behavior.

## Loop

1. Pick the highest-value unblocked behavior.
2. Write or update one focused test that describes the desired outcome.
3. Run the focused test and confirm the expected failure.
4. Implement the minimum code to pass.
5. Run the focused test, then the relevant broader suite.
6. Refactor only while green.
7. Update the board/card/notes with what changed and what remains.

If the project has no useful automated test harness, use the smallest deterministic verification available and record that limitation.
