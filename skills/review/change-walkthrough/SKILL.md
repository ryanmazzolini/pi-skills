---
name: "change-walkthrough"
description: "Build a single-file HTML walkthrough of a commit, commit range, or pull request: a map of changed entities and boundaries, risk-ordered steps with agent-written notes, call trees, and syntax-highlighted diffs shaded by importance. Use when asked for a walkthrough, guided tour, or visual explanation of a change, and as the companion page for a code review."
---

# Change Walkthrough

Produce one offline HTML page that gets a reviewer oriented in a change faster than the raw diff. A tool extracts the facts; you write the walkthrough; the renderer combines them and checks your references.

The page shows, top to bottom: a map of every changed entity grouped by system and file with boundary crossings drawn as arcs, then one section per step with its reasoning, notes to look closely at, the call tree, and the changed code. `j`/`k` move between edits, `J`/`K` and number keys between steps.

## Requirements

- The `sem` CLI, 0.27.0 or later: `brew install sem-cli`, later `sem config update`. The script says so and stops when it is missing. Extraction stays on the machine unless the repository has opted into sem cloud (`sem cloud enable` or `SEM_CLOUD=1`), in which case `sem diff` uploads the entity diff; keep that off for private work.
- Node 20 or later. The script has no dependencies.
- Two commits. The facts come from an entity-level diff between `base` and `head`. For uncommitted work, review without a page or commit to a scratch branch first.
- Supported code: the 32 languages sem extracts entities from, including TypeScript, JavaScript, Python, Go, Rust, Java, Ruby, C#, Swift and Kotlin. JSON, YAML, GraphQL and Markdown changes get cards but no call tree. Call edges across files are import-checked for TypeScript and JavaScript only; elsewhere they show as name matches.

## Steps

Resolve `scripts/walkthrough.mjs` relative to this skill and call it with `node`. `WT` below stands for `node <that path>`.

1. **Pick the range.** For a pull request, `head` is the PR head and `base` is `git merge-base <target-branch> <head>`. For one commit, `base` is `<sha>~1`. Fetch first if the commits are not local. Read code at a revision, never from the working tree, which may be checked out elsewhere: `git show <head>:<path>` and `git grep <pattern> <head> -- <path>`.

2. **Extract the facts and read the summary.** The facts file is large; the summary is what you read.

   ```sh
   OUT=$($WT outdir <repo> <head>)        # ~/.cache/change-walkthrough/out/<repo>/<head7>
   $WT facts <repo> <base> <head> > "$OUT/facts.json"
   $WT summary "$OUT/facts.json"
   ```

   The summary's first line has the subject, files and line counts. If it reports 0 changes, stop: the change has no supported code entities, so say so and skip the page. Then one line per change:

   ```
   c8   modified function   findCli   integrations/pi/diffect.ts:953-962  +4 -1  calls +findLocalFile  calls -localFile  callers runDiffectTool
   ```

   That is the id you reference from the guide, its kind (added, modified, deleted, moved), type, name, location, lines added and removed, the calls it gained or lost, and its unchanged callers. A `?` after a name means the call was matched by name only. `cosmetic` and `test` flags appear at the end. Read the code itself with `git show`, not from the facts file.

3. **Write the guide** to `$OUT/guide.json`. Start from [`assets/guide.example.json`](assets/guide.example.json), which is a complete guide for a real six-file commit. Read the diff, the commit messages or PR description, and enough surrounding code to know why the change exists. Then:

   - **`title`**: the page heading, usually a tidier version of the commit subject.
   - **`intent`**: two or three short sentences on what the change does for its users. Lead with the consequence.
   - **`pr`**: the pull request URL when there is one. Omit otherwise.
   - **`systems`**: a map of system name to path prefixes, two to four systems. Every changed file should match one; the longest matching prefix wins, so a test file can have its own system beside its folder's. The map groups entities under these.
   - **`steps`**: ordered by risk, highest first. Each has `id`, `title` (outcome-first, under ten words), `risk` (`high`, `medium`, `low`), `why` (two or three sentences: what it did before, what it does now, why that matters), `watch`, `map`, and `changes`.
   - **`changes`**: the facts ids this step covers, in reading order. Entry points first, then what they call. Put a deleted function beside its replacement. When a step's edits all sit inside one large function, order by the hunks and point notes at line numbers; the call tree will not help there. Every id must exist in the facts; the page drops unknown ids and reports them.
   - **`watch`**: the notes a careful reviewer would leave. Each has `change` (the card it belongs to) and `text`: a bold lead stating what could go wrong, then where to look. Write locations as `` `src/a/b.ts:123` `` or `` `src/a/b.ts:120-130` ``, a repo-relative path at `head`; the page links every such path, including files outside the change. A bare `` `b.ts:123` `` links only when no other changed or called file shares the basename. Include real regressions you found, limits of the facts you corrected (a caller the graph missed, a name-only match marked `?`), and tests that prove less than they appear to. Leave out anything the diff already shows.
   - **`map`**: boundary crossings this step changes, or an empty list for a step internal to one system. Each has `from`, `to`, `via` (a short label), and optional `mark`: `+` for a new path, `-` for a closed one, none for unchanged. `from` and `to` are either a system name or an actor outside the repo, such as `Browser page` or `Shell`. Reuse actor names across steps.

   Verify every claim in the guide against the code before rendering: `git show <head>:<path>` for the new side, `git show <base>:<path>` for the old. The walkthrough is only better than the diff if it is right.

   Then read and apply [`clear-writing`](../../ai-authoring/clear-writing/SKILL.md) to the intent, every `why` and every note. Lead with the consequence, use plain words, and cut anything the diff already shows. A reviewer reads this text once, fast.

4. **Render.**

   ```sh
   $WT render "$OUT/facts.json" "$OUT/guide.json" "$OUT/walkthrough.html"
   ```

5. **Check the page.** Open it in a browser when one is available (the `agent-browser` skill works; the page opens on step 1, and `j`, `k` and the number keys move from there) and confirm there are no console errors. With or without a browser, confirm:

   - `render` printed "every reference checks out". Otherwise it lists each problem (an id not in the facts, a missing field, a crossing with no system at either end) and exits non-zero; fix the guide and render again. In the browser, the same line sits at the bottom of the left nav. A count of changes "with no lines of their own" there is normal: those are containers whose hunks all belong to member cards, or fragments with no changed lines. Their names are in that text's tooltip.
   - The last step, "Not in the walkthrough", holds only noise: moved properties, module-level comment fragments, and import blocks whose new names the step's diff already shows in use. Put an import block in a step when it adds a dependency worth seeing. A class card listed there has changed lines outside its members, such as fields; it belongs in the step that changed them. Anything substantive there belongs in a step.
   - The map's systems match the files you expected, and each step's arcs make sense.

6. **Report** the path with an `open` command, one sentence on what the page leads with, and anything you left in "Not in the walkthrough" and why. Keep `facts.json` and `guide.json` beside the page; they let the next session re-render after edits.

## Boundaries

- Never write the page or its inputs inside the reviewed repository. Use the output directory above, or the caller's work-item directory when it names one.
- The page is a deliverable, not review infrastructure. Keep it after the review and report where it is.
- Do not hand-edit `facts.json`; regenerate it. Edit `guide.json` freely and re-render.
- Change the renderer only when asked. Its template, scoring rules and vendored libraries are described in [`references/page.md`](references/page.md).
