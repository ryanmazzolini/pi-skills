# Sorbet and Tapioca

Use Tapioca as the normal RBI workflow for Sorbet Rails projects. Commit generated RBI changes with the code that requires them.

## When to Regenerate

- Gemfile/Gemfile.lock changes: regenerate gem RBIs (`bin/tapioca gem <name>` or `bin/tapioca gem --all` when broad changes warrant it).
- ActiveRecord migrations, columns, associations, enums, scopes, or model DSL changes: run migrations/schema dump first, then `bin/tapioca dsl`.
- Rails framework DSL changes: `has_one_attached`, `has_many_attached`, ActiveJob `perform`, ActiveModel attributes, ActionMailbox, etc. need `bin/tapioca dsl`.
- New constants hidden behind optional requires: inspect/update `sorbet/tapioca/require.rb`, then regenerate targeted RBIs.
- New unresolved type errors that require todo coverage: run the project’s Tapioca todo workflow only when that is the established convention.

## Commands

Prefer binstubs if present:

```sh
bin/tapioca gem --all
bin/tapioca dsl
bundle exec srb tc
```

Common project variants:

```sh
bin/spoom srb tc
bundle exec tapioca gem --verify
bundle exec tapioca dsl --verify
```

## Rules of Thumb

- Do not edit generated RBI files manually unless the project has hand-written RBI files in a separate location and the change is intentional.
- Do not commit stale `sorbet/rbi/dsl` or `sorbet/rbi/gems` output; rerun generation after schema/model/framework changes.
- For ActiveRecord RBI correctness, make sure the local schema reflects the migration before running `bin/tapioca dsl`.
- Avoid referencing Tapioca-generated private relation classes from runtime Ruby signatures unless the project already does so deliberately.

## CI Drift Check

If a project has verify commands, run them or mention they remain to be run:

```sh
bin/tapioca gem --verify
bin/tapioca dsl --verify
bundle exec srb tc
```
