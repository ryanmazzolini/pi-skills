# System Architecture Review

Read this for architecture decisions, migrations, scaling concerns, or operational trade-offs.

Inspect the current system, expected workload, constraints, incidents or measurements, contracts, deployment model, and existing decisions. Distinguish verified pressure from hypothetical scale.

## Establish what needs protecting

Identify the important user or caller operations and their existing requirements for availability, latency, and data loss. Different operations may need different guarantees. Use these requirements and the team's cost and operating constraints to judge how much reliability is enough. Do not invent numerical targets; ask about a missing requirement only when it prevents a useful recommendation, otherwise state the assumption and its effect.

## Review the consequential trade-offs

Prioritize correctness and safe change. Use the following questions to investigate the decision, not as required sections in the response:

- **Correctness and failure:** what can break, lose data, cross a trust boundary, violate a contract, or leave partial state?
- **Safe change:** what are the rollout, compatibility, migration, and rollback paths?
- **Operations:** how will operators detect, diagnose, contain, and recover from failure? What expertise or manual intervention does this depend on?
- **Capacity and cost:** which limits are evidenced, what credible workload changes matter, and what would the alternatives cost to run? Use 10× growth as a stress question when useful, not a default design target.
- **Complexity:** can deletion, simplification, or a proven technology solve the problem before another moving part is added?

When changing dependencies or safeguards, examine how failures can combine and what new coupling or operating burden the change introduces. Follow the most consequential plausible failure through detection, containment, and recovery, including dependencies those actions need. Compare the protection gained with the new failure paths; do not assume either adding or removing a safeguard makes the system safer.

Make shared service and API contracts explicit and versioned when compatibility depends on them. Identify observability gaps where failures would otherwise be silent or slow to diagnose. When the recommendation relies on recovery behavior, identify how to verify it under the failure conditions it must handle.

## Retrieve sources when needed

Use these as review lenses when external evidence could change the decision. Read only the relevant sections; use authoritative platform and engine documentation for exact semantics.

- **Reliability needs and their cost:** [Google SRE: Embracing Risk](https://sre.google/sre-book/embracing-risk/) and [AWS: Understanding availability needs](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/understanding-availability-needs.html).
- **Overload or failure spreading through dependencies:** [Google SRE: Addressing Cascading Failures](https://sre.google/sre-book/addressing-cascading-failures/).
- **Interacting failures or added safeguards:** Richard I. Cook's [How Complex Systems Fail](https://how.complexsystems.fail/), especially sections 14–16 on new failure paths, coupling, and system-level safety. Include the role of operator adaptation when human intervention is part of the design.
- **Other material concerns, such as security or resource efficiency:** the relevant [AWS Well-Architected pillar](https://docs.aws.amazon.com/wellarchitected/latest/framework/the-pillars-of-the-framework.html), without requiring a full framework assessment.

## Present the decision

Lead with the recommendation. Then give only the highest-impact risks, each with evidence, consequence, and smallest useful next step. State the consequential trade-off, including risk retained by the recommendation. Put deeper assumptions, alternatives, rollout, and operating details under named sections. Read [presentation.md](presentation.md) when a component, sequence, before/after, or rollout view would materially improve the decision.

Stop when the reader can approve, reject, or redirect the architecture and can see the material unknowns. Do not turn the review into an implementation plan unless asked.
