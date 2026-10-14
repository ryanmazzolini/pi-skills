# Boundary Contracts

Read this when a data or component boundary helps the reviewer judge a costly choice.

Show the smallest repository-native schema delta (including migration or index shape), API, event, query, type, or signature that lets the reviewer judge the decision. Verify notation conventions against the live repository or system. Proposed fields and interface members may make a costly choice reviewable even when their spelling is cheap to change. Use the smallest query, policy expression, or algorithm fragment needed when its semantics define the contract. Do not use generic pseudo-code, production-sized bodies, full schemas, or contract dumps.

When an example record makes the choice clearer, show only its relevant fields with coherent, non-sensitive dummy values. Prefer a labeled one-line literal in repository-native syntax. Use a multiline record when it no longer scans clearly, and reuse IDs and values wherever the same instance recurs. Keep instances distinct from schemas.

Do not use Markdown tables for decisions, rules, or one record. Use a narrow table only to compare similar records with the same small field set. Every snippet line counts against the reader's review budget.
