# Local board contract

The local board is a compact execution manifest for a workflow directory. `plan.md` remains the PRP/end-state artifact; `board/index.md` describes the journey as vertical slices.

## Layout

```text
{plans-root}/YYYY-MM-DD-feature-slug/
  plan.md
  board/
    index.md
    cards/
      detailed-slice.md   # optional
```

## Statuses

Default flow:

```text
backlog -> ready -> in-progress -> review -> done
blocked
```

Use `blocked` for slices that cannot move forward until another decision, dependency, or slice is resolved.

## Index file

`board/index.md` is the progressive-disclosure manifest agents read first. It is canonical for simple slices.

```md
# Board

## Statuses

backlog -> ready -> in-progress -> review -> done
blocked

## Next

### bootstrap-tracer-bullet — ready — AFK

End state: A narrow end-to-end path proves the main integration works.
Verification: Automated smoke check passes; manual acceptance confirms the visible behavior.
Blocked by: None
Detail: Inline only

## In progress

_None_

## Ready

### add-main-behavior — ready — AFK

End state: [observable completed outcome]
Verification: [automated/manual/playtest/visual/review proof]
Blocked by: bootstrap-tracer-bullet
Detail: ./cards/add-main-behavior.md

## Backlog

_None_

## Review

_None_

## Done

_None_

## Blocked

_None_
```

Minimum slice fields:

- **End state**: what must be true when the slice is done
- **Verification**: how the outcome will be proven
- **Blocked by**: dependencies or `None`
- **Detail**: `Inline only` or a relative card path

## Optional card files

Create `board/cards/*.md` only when a slice needs more context than belongs in `board/index.md`.

Minimum frontmatter:

```yaml
---
id: add-main-behavior
status: ready
type: AFK # AFK | HITL
priority: medium # low | medium | high | critical
parent: ../index.md
blocked_by:
  - bootstrap-tracer-bullet
user_stories: []
---
```

Minimum body:

```md
# [Slice title]

## Why

Why this slice matters; what risk it reduces or capability it unlocks.

## End State

Observable outcome this slice delivers.

## Acceptance Criteria

- [ ] Criterion the implementer/reviewer can verify

## Verification

- Automated: [commands/checks, if practical]
- Manual / review: [manual QA, playtest, visual review, acceptance review]

## Notes

Context useful to the implementer. Prefer durable behavior and decisions over fragile file-path-heavy instructions.
```

## Rules

- `board/index.md` is always the first board file to read.
- Simple slices can live entirely in `board/index.md`.
- If a card file exists, it is canonical for that slice's detailed context; keep the index summary aligned manually.
- Use stable descriptive slice IDs; do not use numeric IDs that imply total sequence.
- Dependencies describe prerequisites; they do not define a total implementation sequence.
- Keep verification outcome-based. TDD is optional; proof is required.
