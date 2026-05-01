# CONTEXT.md Format

Use `CONTEXT.md` to capture project/domain language that should survive across sessions.

## Structure

```md
# {Context Name}

{One or two sentences describing what this context is and why it exists.}

## Language

**Order**:
A customer's request to purchase one or more items.
_Avoid_: Purchase, transaction

**Invoice**:
A request for payment sent to a customer after delivery.
_Avoid_: Bill, payment request

## Relationships

- An **Order** produces one or more **Invoices**.
- An **Invoice** belongs to exactly one **Customer**.

## Example dialogue

> **Dev:** "When a **Customer** places an **Order**, do we create the **Invoice** immediately?"
> **Domain expert:** "No — an **Invoice** is generated once **Fulfillment** is confirmed."

## Flagged ambiguities

- "account" was used to mean both **Customer** and **User** — resolved: these are distinct concepts.
```

## Rules

- Be opinionated: choose the canonical term and list rejected synonyms as aliases to avoid.
- Keep definitions to one sentence. Define what the term is, not what it does.
- Include only terms specific to the project's domain or context.
- Show relationships and cardinality where obvious.
- Group terms under subheadings when natural clusters emerge.
- Flag conflicts explicitly with the chosen resolution.
- Include a short example dialogue that demonstrates the terms interacting naturally.

## Single vs Multi-context Repos

Single-context repos usually have one root `CONTEXT.md`.

Multi-context repos should have a root `CONTEXT-MAP.md` that points to each context's docs:

```md
# Context Map

## Contexts

- [Ordering](./src/ordering/CONTEXT.md) — receives and tracks customer orders
- [Billing](./src/billing/CONTEXT.md) — generates invoices and processes payments

## Relationships

- **Ordering → Billing**: Ordering emits `OrderPlaced`; Billing consumes it to generate invoices.
```

If `CONTEXT-MAP.md` exists, read it first. If neither file exists, create a root `CONTEXT.md` only
when the first term is resolved.
