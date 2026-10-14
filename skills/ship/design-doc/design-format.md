# Design Format

Use one `design.md` for the decision, not the delivery plan. This outline is the complete default structure, not a form to expand.

````md
# [Outcome] design

> **Status:** Draft for review
> **Recommendation:** [Proposed direction in one or two sentences.]
> **Review:** [The choice the human should challenge before implementation.]

## Future state

[In roughly 150 words or fewer, describe the useful result in actor or caller language. Use one concrete example to show the normal path and the most important failure or recovery behavior. Add a material non-goal only when needed.]

## [Proposed costly choice stated in domain language]

[State the recommendation and why it matters. Say what approved behavior, contract, migration, or substantial implementation work would be invalidated if this choice were wrong, and the invariant or trade-off it must preserve.]

[Add only the supporting facts and shape, such as a labeled repository-native fragment or a small diagram, needed to judge this choice.]

## Review focus

- **Uncertainty:** [Any remaining uncertainty, why evidence has not settled it, and whether it blocks approval. Omit when none remains.]
- **Inputs:** [Links to the few authoritative decisions or evidence used.]
- **Promote after delivery:** [Tests, contracts, ADRs, or documentation that should become lasting authority.]
````

Add another decision heading only when it independently has a reversal cost grounded in the approved scope and current system. Where the current system or an approved artifact already settles how something is stored, owned, or behaves, that is supporting material, not a decision. Keep settled requirements, routine local edits, and hypothetical future needs inside the supporting explanation or shape.

Prefer the shortest complete design. Use 1,200 words of prose as a default ceiling, not a target. Before presenting the draft, remove:

- unsupported claims about the existing system and precision the evidence does not justify, such as exact numbers, timings, breakpoints, or extra components;
- decision headings for settled requirements or routine implementation;
- repeated examples or shapes;
- optional sections whose qualifying condition is absent;
- exhaustive file, test, task, and alternative inventories.

Do not remove a material invariant, failure path, supporting constraint, or migration transition merely to shorten the document. Do not reproduce PR/FAQ or alignment scaffolding.
