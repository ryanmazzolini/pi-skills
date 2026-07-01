# Create PRP stage

Use when alignment is sufficient to describe the end state. This stage writes the durable PRP — the implementation-ready prompt/plan — to `plan.md` for compatibility with existing RPI workflows.

## Rules

- Build from `question.md` and any optional artifacts; do not rely on chat memory alone.
- Keep `plan.md` end-state and handover oriented, not a noisy progress log.
- Present key options before committing to a PRP when tradeoffs matter.
- Use HITL judgment before committing to a PRP that changes shared contracts, architecture, rollout, or execution ownership.
- Include code snippets only when they are high-signal examples, preferred idioms, or resolved contracts.
- Mark snippets as guidance unless they encode a decision the user explicitly made.
- Resolve or ask about material open questions before finalizing the PRP.
- Choose an execution tracker: compact local board, no board for small work, or deferred/shared tracker.

## HITL Checkpoint

Before writing or materially changing `plan.md` when tradeoffs matter, summarize the intended PRP in chat:

- end state and why it matters
- selected approach and why
- major interfaces or contracts the PRP relies on
- suggested vertical slices
- execution tracker recommendation
- user decisions still needed

Ask one focused question with a recommended answer, then write/update the PRP after the user responds.

## Output

Write `{workflow-dir}/plan.md`:

````md
---
source: {repo basename}
date: YYYY-MM-DD
type: prp
goal: [one sentence]
---

# [Feature / Workflow Name]

**Status**: PRP drafted | **Goal**: [one sentence outcome]
**Workflow**: {workflow-dir}/

## Artifacts

- Alignment log: ./question.md
- Research: ./research.md (optional)
- Design: ./design.md (optional)
- Structure: ./structure.md (optional)
- Board: ./board/index.md (if used)

## Problem

[The problem from the user's perspective.]

## End State

[What must be true when this is done. Describe observable behavior and important system qualities.]

## Success Scenarios / User Stories

- As a [actor], I want [capability], so that [benefit].

## Resolved Decisions

- [Decision]: [choice] — [why]

## Architecture / Interfaces

[Important boundaries, contracts, module shapes, domain terms, or testing seams.]

## Assumptions

- [Assumption to verify]

## Out of Scope

- [Explicit non-goal]

## Implementation Guidance

[High-signal guidance only. Avoid brittle step-by-step scripts.]

### Example shape / Preferred idiom

```language
// Optional snippet. Label as "example" unless this exact contract is a resolved decision.
```

## Suggested Vertical Slices

### [Slice name]

- End state: [observable outcome]
- Verification: [automated/manual/playtest/visual/review proof]
- Type: [AFK | HITL]
- Blocked by: [dependencies or None]

## Verification Strategy

### Automated

- [commands/checks, if practical]

### Manual / Review

- [manual QA, playtest, visual review, acceptance review]

## Execution Tracker

[compact local board | no board for small work | deferred/shared tracker] — [why]

## Notes

[Durable context that does not belong elsewhere.]
````

After writing, summarize the PRP and ask whether to create/update `board/index.md` or hand off to a fresh session focused on the next artifact.
