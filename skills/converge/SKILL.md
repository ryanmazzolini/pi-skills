---
name: "converge"
description: Align on a plan or feature in a few batched questions, recording decisions and acceptance criteria in question.md. Use when the user wants to be "grilled" on a plan or align before building.
---

# Converge

Reach shared understanding in as few turns as possible, then preserve it in a durable `question.md` that `slice-plan` can turn into `plan.md`.

Most alignment uncertainty lives in 2-3 load-bearing decisions. Resolve everything else by reading docs/code or by stating an assumption the user can veto.

## Artifact contract

Prefer an existing RPI workflow directory. If none is given, use the RPI plans-root convention from `../rpi/SKILL.md`; `.plans/YYYY-MM-DD-slug/` is the default when no project convention exists.

Write/update:

```text
{workflow-dir}/
  question.md   # alignment log, decisions, assumptions, acceptance criteria
  plan.md       # created later by slice-plan
  qa.md         # optional verification findings later
  board/        # optional; do not create during converge
```

Keep `question.md` compact enough to read at the start of a fresh session. It is a decision log, not a transcript. Prefer user outcomes over implementation mechanics where that preserves accuracy.

## Read the docs first

Before asking anything, read what the project already knows. Expect this layout:

```text
/
├── CONTEXT.md          ← domain glossary + current state
├── CONTEXT-MAP.md      ← present only in multi-context repos
└── docs/adr/           ← architecture decisions, numbered
    ├── 0001-*.md
    └── 0002-*.md
```

If `CONTEXT-MAP.md` exists, read it first to identify the relevant bounded context. In multi-context repos also check `src/<context>/CONTEXT.md` and `src/<context>/docs/adr/`. If any of these don't exist, say so in one line and continue — the user can redirect. They get created lazily, only when a term or decision actually crystallizes.

When your output names a domain concept, use the term as CONTEXT.md defines it. If a term conflicts with the glossary, call it out: "Your glossary defines 'cancellation' as X, but you seem to mean Y — which is it?" If the concept isn't in the glossary yet, either you're inventing language the project doesn't use, or there's a real gap worth a new entry.

## Spend questions where they buy the most

Treat the plan as a search space. Before asking, estimate two things about each open decision:

- **Entropy** — how evenly the plausible answers split the remaining design space. A decision you can already guess is near-zero entropy; don't spend a question on it.
- **Reversal cost** — how expensive it is to undo. Data shapes, public contracts, and core model decisions are expensive; surface details like copy, thresholds, and presentation are cheap.

Ask only decisions that are **high-entropy AND high-reversal-cost**. State everything else as an assumption.

## The loop

Each turn:

1. **Resolve by inspection first.** If CONTEXT.md, ADRs, code, tests, README files, or earlier conversation answer it, use that.
2. **Rank open decisions** by entropy × reversal cost. Low on either axis → stated assumption, not a question.
3. **Ask 1-3 questions**, batched, each one that meaningfully halves the remaining space. Give your recommended answer for each so the user corrects rather than composes.
4. **State assumptions explicitly**, flagged so the user can veto cheaply.
5. **Update `question.md` after meaningful answers** so the alignment survives a fresh session.
6. **Stop** when no open decision clears both bars. Residual low-stakes ambiguity is cheaper to discover while building than to interview out.

Prefer questions that cleanly bisect the space over ones that fan into many bespoke branches.

## Turn format

```text
**From the docs / codebase:** <anything you resolved yourself — 1 line each, or omit>

**Questions** (answer or correct my recommendation):
1. <question> — *I'd recommend: <answer>, because <one clause>*
2. ...

**Assuming unless you object:**
- <assumption> (low-risk: <why cheap to reverse>)
```

## `question.md` format

When alignment converges, make sure `{workflow-dir}/question.md` has this shape:

```md
---
source: {repo basename}
date: YYYY-MM-DD
type: question-log
goal: [one sentence]
---

# [Workflow Title] — Alignment Log

## Goal

[Reader-relevant main point: what will be true or possible when this works.]

## From Docs / Code

- [Relevant fact discovered by inspection; include technical detail only when it affects decisions.]

## Question Log

### Q1 — [decision name]

Question: [question asked]
Recommended answer: [recommendation given]
User answer: [accepted/revised/rejected answer]
Decision: [resolved decision, if any]

## Resolved Decisions

- [Decision]: [choice] — [why]

## Acceptance Criteria

- [Observable behavior. Start with the actor, action, or outcome when relevant, then include technical detail needed to verify it.]

## Assumptions

- [Assumption to verify or cheaply reverse.]

## Open Questions

- [Question or none.]

## Suggested Plan Direction

[Short handoff note for slice-plan: likely MVP outcome first, then scope boundaries and verification expectations.]
```

## Acceptance criteria

Use plain testable statements: one observable behavior per line. No "the system shall" ceremony. Prefer active voice where the actor matters. Avoid vague quality words like "seamless", "robust", or "intuitive" unless the criterion also says how to observe them.

Good:

```text
- Submitting the import form validates the CSV header before the job queues.
- A row that fails validation rejects the whole file and reports the first failing row.
- While an import job runs, its status shows as "processing".
- Uploaded files are retained for 24 hours after completion.
```

Each line should map to a test, manual check, playtest, visual review, or acceptance review. These feed straight into `slice-plan`.

## Durable language and decisions

After the user resolves something worth keeping:

- **New or sharpened domain term** → add/update CONTEXT.md using `./CONTEXT-FORMAT.md`.
- **High-reversal-cost decision with a real trade-off** → write an ADR using `./ADR-FORMAT.md`.

Skip durable docs for easily reversed or unsurprising choices. The durable artifact for every converge session is `question.md`; CONTEXT.md and ADRs are only for knowledge future sessions should not rediscover.
