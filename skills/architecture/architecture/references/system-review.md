# System Architecture Review

Read this for architecture decisions, migrations, scaling concerns, or operational trade-offs.

Inspect the current system, expected workload, constraints, incidents or measurements, contracts, deployment model, and existing decisions. Distinguish verified pressure from hypothetical scale.

Review in this order:

1. **Correctness and failure:** what can break, lose data, violate a contract, or leave partial state?
2. **Safe change:** what are the rollout, compatibility, migration, and rollback paths?
3. **Operations:** how will operators detect, diagnose, contain, and recover from failure?
4. **Capacity:** what changes at 10× load, data volume, tenancy, or team usage, and which limit is evidenced now?
5. **Complexity:** can deletion, simplification, or a proven technology solve the problem before another moving part is added?

Make shared service and API contracts explicit and versioned when compatibility depends on them. Add observability where failures would otherwise be silent or slow to diagnose.

When reliability or operational trade-offs need external evidence, retrieve current guidance from the [AWS Well-Architected Reliability Pillar](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/welcome.html) and relevant [Google SRE books](https://sre.google/books/). Use them as review lenses; use authoritative platform and engine documentation for exact semantics.

Lead with the recommendation. Then give only the highest-impact risks, each with evidence, consequence, and smallest useful next step. Put deeper assumptions, alternatives, rollout, and operating details under named sections. Read [presentation.md](presentation.md) when a component, sequence, before/after, or rollout view would materially improve the decision.

Stop when the reader can approve, reject, or redirect the architecture and can see the material unknowns. Do not turn the review into an implementation plan unless asked.
