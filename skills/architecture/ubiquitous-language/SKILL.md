---
name: "ubiquitous-language"
description:
  Extract and harden a DDD-style domain glossary, flagging ambiguous or overloaded terms. Use when
  defining domain terms or discussing DDD/domain models.
license: "MIT; adapted from mattpocock/skills"
---

# Ubiquitous Language

Extract and formalize domain terminology into a consistent glossary. Prefer terms a domain expert
would use over implementation names.

## Output Target

Choose the target in this order:

1. If `CONTEXT-MAP.md` exists, read it and ask which bounded context to update when unclear.
2. If a relevant `CONTEXT.md` exists, update that file.
3. If `UBIQUITOUS_LANGUAGE.md` already exists, update it.
4. Otherwise create `UBIQUITOUS_LANGUAGE.md` in the working directory.

When updating an existing file, preserve its overall structure and append or revise only the
language-related sections.

## Process

1. Scan the conversation and any relevant docs/code for domain-relevant nouns, verbs, lifecycle
   states, actors, and relationships.
2. Identify terminology problems:
   - same word used for different concepts
   - different words used for the same concept
   - vague or overloaded terms
   - implementation names masquerading as domain terms
3. Propose canonical terms with opinionated definitions.
4. Write or update the glossary file.
5. Summarize the important changes inline.

## Glossary Format

Use this structure for a new `UBIQUITOUS_LANGUAGE.md`:

```md
# Ubiquitous Language

## [Domain Area]

| Term        | Definition                                               | Aliases to avoid      |
| ----------- | -------------------------------------------------------- | --------------------- |
| **Order**   | A customer's request to purchase one or more items.      | Purchase, transaction |
| **Invoice** | A request for payment sent to a customer after delivery. | Bill, payment request |

## Relationships

- An **Invoice** belongs to exactly one **Customer**.
- An **Order** produces one or more **Invoices**.

## Example dialogue

> **Dev:** "When a **Customer** places an **Order**, do we create the **Invoice** immediately?"
> **Domain expert:** "No — an **Invoice** is generated once **Fulfillment** is confirmed."

## Flagged ambiguities

- "account" was used to mean both **Customer** and **User**. Recommendation: use **Customer** for
  the commercial relationship and **User** for the authenticated identity.
```

For `CONTEXT.md`, use the existing file's style. If no style exists, prefer:

```md
## Language

**Order**: A customer's request to purchase one or more items. _Avoid_: Purchase, transaction
```

## Rules

- Be opinionated: choose the best term and list rejected synonyms as aliases to avoid.
- Keep definitions to one sentence.
- Define what the term is, not what it does.
- Include only domain terms. Skip generic programming concepts unless they have domain-specific
  meaning.
- Show relationships and cardinality where obvious.
- Group terms by natural subdomain or lifecycle when useful; do not force categories.
- Flag conflicts explicitly with a recommendation.
- Write a short example dialogue that demonstrates the terms interacting naturally.

When invoked again, update the existing glossary in place and re-flag unresolved ambiguities.
