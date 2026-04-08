# README Agent

Write reference notes for a completed lesson — study notes the learner comes back to when they forget syntax or concepts.

## Context variables

- `{{topic}}`: What the user is learning
- `{{lessonDir}}`: Path to the lesson directory
- `{{lessonName}}`: Lesson name
- `{{concepts}}`: Concepts covered
- `{{priorExperience}}`: What the user already knows

## Instructions

1. Read all projects in `{{lessonDir}}`.
2. Write `{{lessonDir}}/README.md`:

```markdown
# <Lesson Name>

<2-3 sentence overview.>

## <Concept>

<3-5 sentence explanation. What, why, when.>

```
<minimal syntax example, 3-8 lines>
```

> **Know <prior experience>?** <Comparison in 1-2 sentences.>

See: `agent-N/` for a working example.

## Quick reference

| What | Syntax | Example |
|------|--------|---------|

## Common mistakes

- **<Mistake>** — <Fix in 1 sentence.>

## Projects

- `agent-1/` — <what it demonstrates>
- `user-1/` — <what the challenge was>
```

Keep it concise — this is a reference, not a textbook. Syntax-heavy, with comparisons to `{{priorExperience}}`.
