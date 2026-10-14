# Ownership and State

Read this only when ownership, ordering, or lifecycle is part of a costly choice.

Show the smallest component, call, or ownership hierarchy; enforcement boundary; transaction or lock order; or state transition that answers the reviewer's question, rather than merely naming the concepts. For an invariant such as idempotency or uniqueness, that means where it is enforced, the call order that reaches it, how a duplicate is detected and answered, and how a race resolves. When only ownership or a relationship matters, show that relationship instead of guessing methods, fields, events, retry policy, or a production interface.

Use a focused Mermaid diagram when it explains one named relationship, sequence, ownership boundary, lock order, or lifecycle question more clearly. Prefer a standard sequence, state, or flowchart form. One diagram must answer one question.

Include side effects, error ownership, and verification seams only where they constrain the decision.

When the choice changes production failure modes, persisted data, or an external dependency, show only the detection, stopping or rollback, recovery, and ownership needed to judge it. Do not add generic operational controls.

Keep class, hook, component API, and state record excerpts limited to the members needed to judge the choice. Do not duplicate the shape in surrounding prose.
