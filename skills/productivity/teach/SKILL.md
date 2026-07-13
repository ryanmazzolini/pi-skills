---
name: "teach"
description: "Run a durable learning loop with short lessons, practice, and feedback."
disable-model-invocation: true
argument-hint: "What would you like to learn about?"
license: "MIT; adapted from mattpocock/skills"
---

# Teach

Teach one useful next thing, then stop for practice or feedback. A lesson is a tight loop: explain, practice, observe, adjust. Build only what this loop needs.

## Choose the branch

### Start a topic

Ask what concrete outcome the user wants and what they already know. Confirm the workspace location before writing durable files.

When the mission will outlive the session, create `MISSION.md`. Load [`MISSION-FORMAT.md`](MISSION-FORMAT.md) only when creating or revising it.

Completion: the mission and the first tangible learning win are clear.

### Continue learning

Read `MISSION.md` when present, then only the notes, glossary terms, resources, or recent learning records needed to choose the next win.

Completion: one appropriately challenging objective and its evaluation are clear.

### Review the user's work

Inspect the work in its intended context and compare it with the current lesson objective. Identify the 1–3 highest-priority observations and the most important adjustment.

Completion: the strongest evidence and next adjustment are clear.

## Run the tight loop

Enter at the relevant step:

1. Explain only the knowledge needed for the next exercise.
2. Give one concrete practice task tied to the mission.
3. Let the user attempt it.
4. Return 1–3 prioritized observations, explain the most important adjustment, and ask for the next iteration.

Prefer immediate feedback. Use retrieval, spacing, or interleaving when they improve retention, but keep the current exercise small enough to complete.

A teaching turn is complete when the user has one scoped exercise, or their submitted work has actionable feedback. Stop there.

## Research budget

Use an existing trusted resource when one fits. Search externally when a factual claim needs support or the user asks for options. One strong primary source is normally enough for one lesson; add it to `RESOURCES.md` only when the lesson actually uses it.

Load [`RESOURCES-FORMAT.md`](RESOURCES-FORMAT.md) only when creating or pruning `RESOURCES.md`.

## Durable workspace

Create each artifact when the learning loop earns it:

- `MISSION.md` — the outcome steering future lessons.
- `NOTES.md` — stable teaching preferences and reminders.
- `RESOURCES.md` — sources already used or deliberately selected.
- `lessons/NNNN-<slug>.md` — a reusable explanation and exercise using the next sequence number. Use Markdown by default.
- `lessons/NNNN-<slug>.html` — use when interaction, visual layout, or printing materially improves learning.
- `reference/` — fast lookup material that the user is likely to revisit.
- `assets/` — components reused by multiple HTML lessons; the second use earns the shared asset.

Keep the first useful turn in the conversation until durable context earns a file. Start a new durable workspace with only the artifacts the next session will need—often `MISSION.md` and `NOTES.md`.

## Record demonstrated learning

Persistence follows evidence:

- When the user demonstrates non-trivial understanding or corrects a misconception, load [`LEARNING-RECORD-FORMAT.md`](LEARNING-RECORD-FORMAT.md) and write the next numbered record under `learning-records/`.
- When the user can use a specialized term correctly, load [`GLOSSARY-FORMAT.md`](GLOSSARY-FORMAT.md) and add or refine that term in `GLOSSARY.md`.
- When the mission changes, confirm the change before revising `MISSION.md`.

## Host neutrality

Use the current host's available tools. Feature-detect vault or file-management commands before relying on them. After a partial failure, inspect the resulting filesystem state before applying the smallest safe fallback.

Open a durable lesson with the host's normal file opener when available; otherwise report its full path.
