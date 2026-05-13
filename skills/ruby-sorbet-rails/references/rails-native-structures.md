# Rails-Native Structures

Prefer Rails primitives when the app already has Rails loaded and the problem matches a framework boundary.

## Biases

- Files/uploads: use ActiveStorage before custom blob tables, path columns, upload services, or ad hoc metadata models.
- Background work: use ActiveJob/project queue adapter before custom async wrappers.
- Domain data: use ActiveRecord associations, validations, enums, scopes, transactions, and migrations before bespoke repositories or SQL helpers.
- Form/input objects: use ActiveModel attributes, validations, naming, and serialization before plain hashes with manual validation.
- Configuration and integrations: use Rails credentials/config/initializers/tasks as the app already does; do not introduce parallel config loaders.
- API serialization/schema work: prefer existing GraphQL Ruby types, mutations, dataloaders, and project schema tasks over custom schema emitters.

## Before Adding Custom Infrastructure

Inspect nearby examples and project setup:

```sh
find app config lib/tasks -maxdepth 3 -type f | grep -E 'storage|active_storage|job|graphql|schema|upload|attachment'
grep -R "has_one_attached\|has_many_attached\|ApplicationJob\|ActiveModel::" app config lib/tasks
```

If Rails has a native structure but the project is not configured for it, pause and ask before adding framework configuration, migrations, queues, storage services, or new operational dependencies.

## Review Smells

- New file/blob lifecycle code without checking ActiveStorage.
- New background thread/worker wrapper without checking ActiveJob/queue conventions.
- New validation/parsing layer that duplicates ActiveModel/ActiveRecord validations.
- New schema dump or SDL writer when `GraphQL::RakeTask` or a federation task exists.
