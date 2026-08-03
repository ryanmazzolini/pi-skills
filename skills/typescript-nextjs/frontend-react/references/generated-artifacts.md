# Generated Frontend Artifacts

Use when changing GraphQL, OpenAPI, schema-derived, or other generated frontend code.

## Establish the contract

- Inspect package scripts, generator configuration, generated-file headers, and repository guidance before choosing commands.
- Identify the canonical inputs, the expected generated outputs, and the project root from which generation runs.
- Change the schema, document, or generator configuration that owns the output; treat generated files as outputs rather than hand-edited source.

## Regenerate safely

- Use the repository's supported generation command and review the generated diff for unexpected churn or missing symbols.
- A scoped generator is safe only when it preserves the complete contract of every output it rewrites. Do not replace a shared generated file with output from one operation or schema fragment.
- Keep generated outputs and their canonical inputs in the same change when the repository tracks both.

## Handle blocked generation

When unrelated baseline errors block generation, confirm that they also occur without the current change when practical. Then choose one explicit path:

1. Repair the baseline when that work is in scope.
2. Use a project-supported scoped output that cannot truncate or invalidate shared artifacts.
3. Stop and report the exact blocker, affected output, and reproduction command.

Do not imitate generated output by hand to bypass a failing generator.

## Validate the result

Targeted checks can speed iteration, but they do not replace the repository's required final validation. Follow [Ship's review gate](../../../ship/ship/references/review-gate.md): run or reuse the applicable repository-level generation, typecheck, test, and build evidence once for its integrated target, and use focused checks for intermediate delivery changes. Distinguish a pass from an introduced failure or a reproduced baseline failure in the final report.
