# Local board contract

The local board is a tool-agnostic execution queue for a workflow directory. `plan.md` remains the destination/spec; the board describes the journey as small vertical slices.

## Layout

```text
{plans-root}/YYYY-MM-DD-feature-slug/
  plan.md
  board/
    index.md
    cards/
      001-bootstrap-tracer-bullet.md
      002-add-main-behavior.md
```

## Statuses

Default flow:

```text
backlog -> ready -> in-progress -> review -> done
blocked
```

Use `blocked` for cards that cannot move forward until another decision, dependency, or card is resolved.

## Card files

Each card is a markdown file under `board/cards/`. Card files are canonical.

Minimum frontmatter:

```yaml
---
id: 001
title: Bootstrap tracer bullet
status: ready
type: AFK # AFK | HITL
priority: medium # low | medium | high | critical
parent: plan.md
blocked_by: []
user_stories: []
---
```

Minimum body:

```md
## Why

Why this slice matters; what risk it reduces or capability it unlocks.

## What to build

End-to-end behavior this slice delivers.

## Acceptance criteria

- [ ] Observable outcome the implementer can verify

## Notes

Context useful to the implementer. Prefer durable behavior and decisions over fragile file-path-heavy instructions.
```

## Index file

`board/index.md` is the progressive-disclosure manifest agents read first. It mirrors card frontmatter plus the first paragraph under `## Why`.

```md
# Board

## Statuses
backlog -> ready -> in-progress -> review -> done
blocked

## Cards

| ID | Status | Type | Priority | Blocked by | Title | Why |
|----|--------|------|----------|------------|-------|-----|
| 001 | ready | AFK | high | [] | Bootstrap tracer bullet | Proves the end-to-end path early |
```

Rules:

- Card files remain canonical.
- `index.md` is an overview, not a replacement for cards.
- Agents read full card bodies only for selected cards.
- Regenerate or repair `index.md` from card files when frontmatter changes.
