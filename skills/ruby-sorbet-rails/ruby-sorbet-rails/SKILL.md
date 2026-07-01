---
name: "ruby-sorbet-rails"
description: Ruby/Rails implementation and review with Sorbet/Tapioca, Rails-native structures, RuboCop, db schema, and GraphQL federation artifact conventions.
---

# Ruby Sorbet Rails

Default skill for Ruby/Rails application work using Sorbet, GraphQL federation, and generated artifacts. Optimize for Rails-native structures, committed generated files, and project-local verification commands.

## Defaults

- Prefer Rails commands, generators, tasks, and framework primitives over hand-editing Rails-owned files or building custom infrastructure.
- Prefer Rails and ActiveRecord defaults/conventions before bespoke persistence, SQL helpers, validation layers, file handling, jobs, or schema glue.
- Add ActiveRecord associations only when the code needs to navigate that relationship; avoid inverse/direct relations added only because a foreign key exists.
- Let the database own storage invariants like varchar limits and upper-bound check constraints; avoid mirrored model constants unless the app needs Rails-style validation errors for a business rule.
- Treat committed/applied migrations as append-only: create a follow-up migration, run migrations, and regenerate schema artifacts.
- In Sorbet projects, use the strongest feasible sigil/type checking, avoid weakening existing sigils, and regenerate RBIs when DSL/schema/dependency changes require it.
- Treat generated artifacts as part of the change: commit RBI files, `db/schema.rb` or `db/structure.sql`, and GraphQL schema/federation dumps when they change.
- Prefer project binstubs and documented tasks over guessed commands; inspect `bin/`, `README.md`, `lib/tasks/`, `sorbet/tapioca/`, and CI config first.

## Progressive References

Read only the references that match the task:

- [references/rails-native-structures.md](references/rails-native-structures.md) before introducing custom infrastructure that Rails may already provide.
- [references/sorbet-tapioca.md](references/sorbet-tapioca.md) when touching Sorbet, Tapioca, Gemfile, ActiveRecord models, Rails DSLs, or generated RBI files.

## Validation

Before final response, report which of these were run or why they were not applicable:

- `bundle exec rubocop -P -a` or `bin/rubocop -P -a`
- Sorbet typecheck and Tapioca generation/verification for Sorbet projects
- Rails migrations/schema regeneration for migrations (`bundle exec rails db:migrate`, schema dump if needed)
- GraphQL federation/schema dump for GraphQL projects
- Full relevant test suites (`bundle exec rspec`, `bin/rspec`, `npm test`, or project wrapper); do not substitute targeted checks for final regression validation.
