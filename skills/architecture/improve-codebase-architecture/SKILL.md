---
name: improve-codebase-architecture
description:
  Explore a codebase for architectural improvement opportunities, focusing on deep modules,
  testability, and AI-navigable boundaries. Use when improving architecture, finding refactor
  candidates, consolidating tightly coupled modules, or reducing shallow-module seams.
license: MIT; adapted from mattpocock/skills
---

# Improve Codebase Architecture

Explore a codebase for architectural friction, discover opportunities to deepen shallow modules, and
draft refactor RFCs that improve testability and navigability.

A **deep module** has a small interface hiding a large implementation. Deep modules let callers and
tests interact with stable boundaries instead of many fragile internal seams.

Read [REFERENCE.md](REFERENCE.md) when classifying dependencies, designing testing strategy, or
drafting the RFC.

## Rules

- Let exploration friction guide the investigation. Where you struggle to understand a concept,
  future humans and agents probably will too.
- Prefer consolidating tightly coupled responsibilities over adding new abstraction layers.
- Optimize for boundary tests that replace shallow internal tests.
- Do not implement the refactor during this skill.
- Do not create GitHub issues, branches, commits, or PRs without asking the user first.

## Process

### 1. Explore the codebase

Explore organically. Do not follow only rigid metrics. Look for places where:

- understanding one concept requires bouncing across many small files
- modules are so shallow that their interface is nearly as complex as their implementation
- pure functions appear to be extracted mainly for testability, while bugs hide in orchestration
- tightly coupled modules create integration risk in the seams between them
- tests assert implementation details instead of public behavior
- code is hard to explain because the real boundary is implicit rather than named

If subagents are available, use them as focused scouts for independent exploration. Otherwise do the
exploration directly.

### 2. Present candidates

Present a numbered list of deepening opportunities. For each candidate, include:

- **Cluster**: modules, concepts, or workflows involved
- **Why they are coupled**: shared types, call patterns, lifecycle ownership, or co-owned concepts
- **Dependency category**: one of the categories in [REFERENCE.md](REFERENCE.md)
- **Test impact**: what existing tests would be replaced by boundary tests
- **Likely value**: why this candidate matters

Do not propose the final interface yet. Ask:

```text
Which of these would you like to explore?
```

### 3. Frame the chosen problem

After the user picks a candidate, explain the problem space:

- constraints any new interface must satisfy
- dependencies the module must rely on
- behavior the module should own
- details it should hide
- a rough illustrative code sketch if useful

Make clear that the sketch is grounding context, not a final proposal.

### 4. Design multiple interfaces

Generate at least three meaningfully different interface designs. If subagents are available,
delegate each design with a different constraint:

- **Minimal surface**: 1-3 entry points max
- **Flexible surface**: supports varied callers and extension points
- **Common-case surface**: makes the primary caller path trivial
- **Ports & adapters surface**: use when dependencies cross owned service boundaries

Each design should include:

1. interface signature or contract
2. usage example showing caller code
3. complexity hidden internally
4. dependency strategy from [REFERENCE.md](REFERENCE.md)
5. trade-offs

Present designs sequentially, then compare them in prose.

### 5. Recommend an approach

Give a strong recommendation. The user wants judgment, not only a menu.

Include:

- the design you recommend
- why it best fits the current codebase
- whether a hybrid of designs is better
- what risks remain

Ask the user whether to proceed with an RFC for that direction.

### 6. Draft a refactor RFC

If the user agrees, draft a local RFC using the template in [REFERENCE.md](REFERENCE.md). Prefer a
path like:

```text
.plans/YYYY-MM-DD-[slug]-architecture-rfc/architecture-rfc.md
```

or another project-appropriate docs/plans location if the user requests a tracked artifact.

The RFC should be durable and not overly tied to file paths that may drift.

### 7. Optional GitHub issue

After drafting the RFC, ask whether to create a GitHub issue. If the user says yes, use the
available GitHub tooling and share the URL.
