---
name: "shortcut"
description: "Interact with Shortcut stories via the `short` CLI. Use when viewing, searching, drafting, commenting on, or updating stories, including titles, descriptions, acceptance criteria, details, and references."
---

# Shortcut

Wraps the [`short`](https://github.com/useshortcut/shortcut-cli) CLI. Assume it is installed; if missing, stop and tell the user to run `npm i -g @useshortcut/shortcut-cli && short install`.

## Common commands

- View story: `short story <id> -q`
- Update title: `short story <id> -t "<title>"`
- Update description: `short story <id> -d "<description>"`
- Add comment: `short story <id> -c "text"`
- Update state: `short story <id> -s "<state>"`
- Update owners / labels / estimate: `-o`, `-l`, `-e`
- Search by text: `short search -t "<query>"`
- Search by operator: `short search <operators>` (e.g. `owner:%self% state:"In Development"`)
- Open in browser: `short story <id> -O`

Prefer `-q` to suppress loading output when piping or parsing.

## Write team-readable stories

Before drafting or changing story text, apply [`clear-writing`](../../ai-authoring/clear-writing/SKILL.md). A Shortcut story is a team-facing description of what needs to become true, not an investigation log, implementation plan, or continuation record.

Use this shape by default and omit sections that add no value:

```md
## Problem

[Briefly explain who experiences what and why it matters.]

## Outcome

[Describe what becomes possible or correct.]

## Acceptance criteria

- [Observable result or necessary boundary.]

## Details

- **[Label]:** [Useful context, evidence, constraint, or reader-accessible link.]

[Preserve existing attribution when present.]
```

Keep **Problem** to one brief paragraph that states the point. Put incident chronology, long examples, and supporting service mechanics in **Details**. Add another sentence when it materially improves understanding, but do not make the reader work through the investigation before reaching the outcome. Keep **Outcome** concise, usually one sentence.

### Acceptance criteria

Write at the surface the story's readers will accept. Product and operational stories normally describe what an actor sees, can do, or is protected from; put service and planner mechanics in **Details**. For example, write “Unavailable destinations remain unavailable,” not “Preserve the planner result.” API, backend, and infrastructure stories may describe caller-visible contracts or operational results. Use implementation names only when that named artifact or contract is itself part of the outcome.

Prefer three to six criteria. Each criterion should express one short, independently checkable result that a reader can understand at a glance. Use one clause. A criterion containing a multi-value field list is not scannable. If it contains an inline list, several preconditions, exceptions, or an explanation of why, keep the result in the criterion and move that context to **Details**.

For example:

```md
- [x] Configurable cased items show the pallet-information form.
- [ ] Missing pallet setup preserves valid case details.

## Details

- **Pallet form:** With valid case conversion, show cases and eaches plus Cases / layer, Layers / pallet, and Cases / pallet inputs.
- **Data boundary:** Preserve case details only when pallet information is the sole problem. Identity, quantity, and unit-configuration errors still suppress them.
```

If more than six criteria remain, check whether related outcomes can be grouped cleanly or the story should split. More than six is allowed when every criterion remains distinct and useful, but do not return the description as publication-ready. Show the proposed criteria, explain why they should remain separate, and get the user's approval for the exception. Do not combine separate outcomes, mix different completion states, or hide requirements in **Details** merely to reduce the count.

Acceptance criteria describe behavior, not research, implementation tasks, or how the behavior will be tested. Test coverage, contract tests, manual review, and verification steps belong in the pull request, delivery plan, or linked evidence unless producing that verification artifact is the story's actual outcome. A specific technical constraint may appear in **Details** when it helps readers judge the result.

### Details and references

Use short labeled bullets for context that helps readers understand, implement, or verify the story: a representative incident, exact UI text or values, important boundaries, relevant ownership or implementation constraints, and shared evidence.

Do not turn **Details** into a work log or repeat the same evidence across sections. Keep only what helps the reader understand the problem, acceptance boundary, or next action. Exclude open investigation tasks and speculative implementation directions; include them only after they become settled constraints that materially shape the story. Instructions such as “begin with,” “inspect,” or “prefer X unless” are investigation or implementation directions, not story details.

Artifact references must use URLs the intended readers can open. Prefer Shortcut stories, GitHub permalinks or pull requests, Notion pages, shared designs, and shared dashboards. Convert related artifact IDs to URLs when practical. Never publish home-directory paths, local repository paths, Obsidian vault paths, or personal work-note locations as references. When useful evidence exists only locally, summarize the conclusion and ask where the detail should be published. A task or incident identifier may remain as plain evidence when it helps teammates investigate; it is not a substitute for a shared reference.

### Rewriting existing stories

For a dense existing story, privately inventory its material behaviors and checkbox states, important facts and boundaries, reader-useful labels or identifiers, accessible links, and attribution before condensing it. A simple story does not need an exhaustive inventory.

Preserve meaning rather than every phrase. Keep exact UI text when it defines the problem, desired behavior, or reproduction; otherwise clear paraphrasing is fine. Preserve checkbox truth for retained behavior. A combined criterion is checked only when all behavior it covers was checked; otherwise leave it unchecked and flag an ambiguous mapping. Omit task or test-plan criteria and their status without treating that as lost behavioral completion. Remove old investigation instructions and speculative implementation recommendations unless they are confirmed constraints that still shape acceptance. Preserve existing attribution.

## From the current branch or path

Branch names and ticket worktree folders often embed the story id (e.g. `feat/sc-62230/...`, `rm/ch12345/...`, `~/git/worktrees/sc-62230-short-description/repo`). To look up the story:

1. Check the current path for a `sc-<digits>` or `ch<digits>` worktree folder segment.
2. If needed, run `git rev-parse --abbrev-ref HEAD` and inspect the branch name.
3. Extract the first `sc-<digits>` or `ch<digits>` group; the digits are the story id.
4. Run `short story <id> -q`.

`short story --from-git` only works for the `<mention>/ch<id>/<title>` branch format, so parse manually when branches use other conventions.

## Rules

Before showing or publishing story text, confirm that:

- the main point and useful result are clear without reading **Details**;
- **Problem** and **Outcome** are concise for the story's complexity;
- incident chronology and supporting service mechanics are in **Details**, not a second problem report;
- each acceptance criterion is one scannable clause at the right acceptance surface;
- no criterion contains a multi-value field or exception list, an explanatory clause, or verification detail that belongs in **Details**;
- product criteria describe visible behavior rather than preserving a planner or backend result;
- the criteria are easy to scan, usually three to six, without hidden requirements;
- a draft with more than six criteria explains why and awaits explicit approval;
- acceptance criteria describe behavior rather than research, implementation, or verification work;
- task IDs, fact inventories, and service traces appear in **Details**, not **Problem**;
- **Details** clarifies the story instead of containing open investigation tasks, speculative directions, or progress narration;
- references are reader-accessible and contain no personal or local paths;
- a rewrite preserves material facts, behavioral completion, and attribution.

- Do not update any Shortcut field or add a comment without confirming the exact change first. For a title, description, or comment, show the complete proposed text. A direct request containing the exact action and value counts as confirmation.
- Quote multi-word arguments such as titles, descriptions, states, labels, and comments.
- For bulk or destructive updates, show the plan and ask before executing.
