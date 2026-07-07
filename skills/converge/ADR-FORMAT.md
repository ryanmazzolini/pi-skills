# ADR Format

ADRs capture durable decisions that are hard to reverse, surprising without context, and the result
of a real trade-off.

## Location and Numbering

- Use `docs/adr/` at the repo root, or the relevant context's `docs/adr/` in a multi-context repo.
- Create the directory lazily, only when the first ADR is needed.
- Use sequential numbering: `0001-short-slug.md`, `0002-short-slug.md`, etc.
- Scan existing ADRs for the highest number and increment by one.

## Template

```md
# {Short title of the decision}

{1-3 sentences: the context, what was decided, and why.}
```

Most ADRs should be that small. The value is recording that a decision was made and why.

## Optional Sections

Only include these when they add genuine value:

- **Status** frontmatter: `proposed`, `accepted`, `deprecated`, or `superseded by ADR-NNNN`
- **Considered options**: rejected alternatives worth remembering
- **Consequences**: non-obvious downstream effects

## When to Offer an ADR

Offer an ADR only when all three are true:

1. **Hard to reverse** — changing later would be meaningfully expensive.
2. **Surprising without context** — a future reader would wonder why this path was chosen.
3. **A real trade-off** — credible alternatives existed and one was chosen for specific reasons.

Skip easy, obvious, or no-alternative decisions.

## Good ADR Subjects

- Architectural shape: monorepo, service boundary, event-sourced write model.
- Integration patterns between contexts: domain events vs synchronous HTTP.
- Lock-in technology choices: database, message bus, auth provider, deployment target.
- Ownership and scope boundaries: which context owns customer data.
- Deliberate deviations from the obvious path: manual SQL instead of an ORM.
- Constraints not visible in code: compliance, partner contracts, latency requirements.
- Non-obvious rejected alternatives that future contributors are likely to revisit.
