# Board stage

Use when `plan.md` chooses a compact local board or when status tracking, blockers, parallel work, or long handoffs need more structure than `plan.md`.

Load `contracts/board.md` before writing the board.

## Rules

- `plan.md` remains the PRP/end-state artifact; `board/index.md` is the execution manifest.
- Each slice is a narrow vertical outcome, not a horizontal layer.
- Define the slice by end state and verification, not by implementation method.
- Mark slices `AFK` or `HITL`.
- Make blockers explicit.
- Use stable descriptive slice IDs; do not use numeric IDs that imply total sequence.
- Keep `board/index.md` compact and readable every time.
- Create `board/cards/*.md` only for slices that need more detail than fits in the index.

## Process

1. Read `plan.md`, then optional `structure.md` only if it exists and seems relevant.
2. Create `board/` and optionally `board/cards/` beside `plan.md`.
3. Draft 3-7 normal-feature slices unless the work is clearly smaller/larger.
4. Put simple slices directly in `board/index.md`.
5. For complex slices, write a detail file under `board/cards/` and link it from the slice's `Detail:` field.
6. Do not run an index generator; maintain the compact index directly.

## Output

Write `{workflow-dir}/board/index.md` using the contract shape:

```md
# Board

## Statuses

backlog -> ready -> in-progress -> review -> done
blocked

## Next

### [slice slug] — ready — [AFK/HITL]

End state: [observable completed outcome]
Verification: [automated/manual/playtest/visual/review proof]
Blocked by: [None or slice IDs]
Detail: [Inline only or ./cards/[slug].md]
```

## Check-in

Ask the user to review slice granularity, current priority, blockers, AFK/HITL classification, and verification expectations. If a fresh implementation context would help, ask conversationally before suggesting `/rpi handover <brief>`.
