---
name: "design-an-interface"
description:
  Generate multiple meaningfully different interface designs for a module or API and compare
  tradeoffs. Use when designing module boundaries or public APIs, or to "design it twice" before
  implementation.
license: "MIT; adapted from mattpocock/skills"
---

# Design an Interface

Use the "design it twice" principle: the first interface idea is rarely the best. Generate multiple
meaningfully different designs, then compare them before implementation.

## Rules

- Design only the interface shape; do not implement it unless the user explicitly asks afterward.
- Optimize for deep modules: small interfaces that hide substantial complexity.
- Compare designs in prose. Tables are okay for summaries, but the reasoning matters most.
- If subagents are available, use them to generate independent designs with different constraints.

## Process

### 1. Gather requirements

Understand:

- What problem does this module or API solve?
- Who are the callers?
- What are the key operations?
- What constraints exist? Performance, compatibility, existing patterns, rollout, security, or
  testing?
- What should be hidden inside versus exposed?
- What is the common case?

Ask only the minimum questions needed. If the answer is discoverable in the codebase, inspect the
code instead of asking.

### 2. Generate designs

Create at least three designs. Use different constraints such as:

- **Minimal surface**: 1-3 methods or entry points max
- **Flexible surface**: supports many use cases and extension points
- **Common-case optimized**: makes the primary caller path trivial
- **Functional style**: data in/data out with explicit effects
- **Object/service style**: lifecycle or dependency ownership hidden behind an object
- **Ports & adapters**: useful when crossing owned boundaries or external systems

For each design, provide:

1. interface signature, types, methods, or contract
2. usage example showing how callers use it
3. what complexity it hides internally
4. what it makes easy
5. what it makes hard
6. testing implications

### 3. Present designs sequentially

Show each design clearly — name, interface, usage, what it hides, trade-offs — before comparison so
the user can absorb it.

### 4. Compare designs

Compare on:

- interface simplicity
- depth: small surface hiding large implementation
- ease of correct use
- ease of misuse
- fit with current callers
- testing at the boundary
- implementation flexibility
- future extension pressure

Highlight where the designs diverge most.

### 5. Recommend

Give your opinionated recommendation. If the best answer is a hybrid, describe the hybrid interface
explicitly.

End by asking which direction the user wants to take next.
