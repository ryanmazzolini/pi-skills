# Domain Language

Read this when domain terms are ambiguous, overloaded, or inconsistent. Build a small glossary from language domain experts use, not implementation names.

## Choose the target

Use the first existing target that fits:

1. `CONTEXT-MAP.md`, asking which bounded context when unclear;
2. the relevant `CONTEXT.md`;
3. `UBIQUITOUS_LANGUAGE.md`;
4. otherwise a new `UBIQUITOUS_LANGUAGE.md` in the working directory.

Preserve an existing file's structure and change only its language sections.

## Clarify the terms

1. Scan the conversation, documentation, code, and existing decisions for domain nouns, verbs, actors, lifecycle states, and relationships.
2. Find one word used for different concepts, several words used for one concept, vague terms, and implementation names masquerading as domain terms.
3. Choose canonical terms. Define each in one sentence, list aliases to avoid, and flag unresolved conflicts with a recommendation.
4. Add relationships and cardinality when they matter. Include one short example dialogue only when it proves the terms work together naturally.
5. Write or update the glossary, then lead the response with the important terminology decisions.

For a new glossary, use:

```md
# Ubiquitous Language

## [Domain area]

| Term | Definition | Aliases to avoid |
|---|---|---|
| **Order** | A customer's request to purchase one or more items. | Purchase, transaction |

## Relationships
- An **Order** belongs to one **Customer**.

## Flagged ambiguities
- “account” referred to both **Customer** and **User**. Use **Customer** for the commercial relationship and **User** for the authenticated identity.
```

Keep only domain-specific terms. Define what a term is, use one term per concept, and update the existing glossary in place on later runs.
