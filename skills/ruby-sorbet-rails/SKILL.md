---
name: ruby-sorbet-rails
description: Ruby/Rails implementation and review with Sorbet/Tapioca, Rails-native structures, RuboCop, db schema, and GraphQL federation artifact conventions.
---

# Ruby Sorbet Rails

Default skill for Ruby/Rails application work using Sorbet, GraphQL federation, and generated artifacts. Optimize for Rails-native structures, committed generated files, and project-local verification commands.

## Defaults

- Prefer Rails framework features before hand-rolled infrastructure: ActiveStorage for files/blobs, ActiveJob for background work, ActiveModel/ActiveRecord validations and attributes, Rails mailers/cache/configuration, and Rails generators/tasks where the app already uses them.
- Before adding custom persistence, file handling, jobs, schema dumping, or integration glue, scan the app for existing Rails conventions and ask: “is there a Rails primitive or project task for this?”
- Treat generated artifacts as part of the change: commit RBI files, `db/schema.rb` or `db/structure.sql`, and GraphQL schema/federation dumps when they change.
- For Sorbet projects, regenerate RBIs after Gemfile, model/schema, Rails DSL, ActiveStorage, ActiveJob, ActiveModel, or GraphQL type changes; do not leave RBI drift for CI.
- Always run Ruby linting with `bundle exec rubocop -P -a` or the project binstub equivalent `bin/rubocop -P -a` before finalizing Ruby changes.
- Regenerate database schema files after migrations.
- Regenerate GraphQL schema/federation artifacts after GraphQL schema/type/resolver changes; for federation, prefer the project task that writes federated SDL.
- Prefer project binstubs and documented rake tasks over guessed commands; inspect `bin/`, `README.md`, `lib/tasks/`, `sorbet/tapioca/`, and CI config first.

## Common Artifact Workflow

Use project-specific commands when available, but expect this shape:

```sh
# Ruby linting: required for Ruby/Rails changes
bundle exec rubocop -P -a

# Sorbet/Tapioca projects
bin/tapioca gem --all        # after gem/dependency changes, or targeted `bin/tapioca gem <name>`
bin/tapioca dsl              # after Rails DSL/schema/model/framework changes
bundle exec srb tc           # or project typecheck wrapper, e.g. `bin/spoom srb tc`

# Database changes
bin/rails db:migrate         # or project DB-specific migration command
bin/rails db:schema:dump     # when migration did not already update the checked-in schema

# GraphQL federation projects
bin/rails graphql:federation:dump
# or inspect lib/tasks for graphql:schema:* / graphql:federation:* task names
```

## Progressive References

Read only the references that match the task:

- [references/rails-native-structures.md](references/rails-native-structures.md) before introducing custom infrastructure that Rails may already provide.
- [references/sorbet-tapioca.md](references/sorbet-tapioca.md) when touching Sorbet, Tapioca, Gemfile, ActiveRecord models, Rails DSLs, or generated RBI files.

## Validation

Before final response, report which of these were run or why they were not applicable:

- `bundle exec rubocop -P -a` or `bin/rubocop -P -a`
- Sorbet typecheck and Tapioca generation/verification for Sorbet projects
- Rails db schema regeneration for migrations
- GraphQL federation/schema dump for GraphQL projects
- Relevant tests (`bundle exec rspec`, `bin/rspec`, or project wrapper)
