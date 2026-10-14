# Technical Shapes

Read this only after a costly choice exists and prose would make the reviewer invent an implementation constraint.

Choose the narrowest matching guide, then read only that guide:

- Read [boundary-contracts.md](boundary-contracts.md) when the decision depends on a schema, API, event, query, type, signature, or representative record.
- Read [ownership-state.md](ownership-state.md) when it depends on component or call ownership, side effects, an enforcement boundary, transaction or lock order, or a state transition.

Load both only when one costly choice genuinely crosses both boundaries. Do not load another guide to make the document look more complete.

For production migration or rollout ordering, follow the separate condition in [build-rollout.md](build-rollout.md). Ordinary implementation dependencies do not qualify.
