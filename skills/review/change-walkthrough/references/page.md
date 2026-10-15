# The page and the renderer

Read this when a rendered page looks wrong, when a guide field does not show up where expected, or when changing the renderer.

## Layout

- `scripts/walkthrough.mjs` is one dependency-free Node script. `facts` runs `sem diff A..B --json` for the changed entities, extracts both trees with `git archive` and runs `sem graph <dir> --json` on each for the call edges, then computes line diffs, import checks and the rest. `render` fills `scripts/page.html`, inlining `scripts/vendor/d3.min.js` and `scripts/vendor/prism.min.js` so the page is one offline file.
- Vendored libraries and their sources are listed in `scripts/vendor/README.md`. D3 draws the map's arcs; Prism tokenises the diffs.
- The script checks `sem --version` against the version it was tested with and stops with an install or update hint otherwise. sem's JSON shapes (`diff`: `changes[]` with `entityId`, `changeType`, `beforeContent`, `afterContent`, line fields; `graph`: `entities[]` and `edges[]` with `refType`) are the coupling point if a sem release changes them.

## What the page shows from each input

| Shown | Source |
|---|---|
| Header: title, commit link, `#N` PR link, files, `+`/`−` | `guide.title`, `facts.range` (`web` is derived from the origin remote), `guide.pr`, `facts.stats` |
| Nav: intent, one row per step with a risk dot and change count, validation line | `guide.intent`, `guide.steps`; unknown change ids are listed in the footer |
| Map: system boxes with files and entity blocks, actor pills, arcs | `guide.systems` (longest prefix match on `facts.changes[].file`), every change with changed lines, `guide.steps[].map` |
| Block width and fill | lines changed; green share added, red share removed; new entities brighter green, deleted struck. Members (`property` changes inside another change) fold into the parent's block with a `+N` count and are named in its tooltip |
| Step: title, why, `!` notes, call tree, cards | `guide.steps[]`; notes link to the card named in `watch[].change` |
| Card head: glyph, name, type, `file:lines` link, calls gained or lost, unchanged callers | `facts.changes[]`; the 3px bar colour is the entity's system |
| Diff rows | the change's own hunks; a hunk inside another change shows once, on the inner card, with a pointer row on the outer one |
| Row shade | importance band from the row's tokens; hover a row for its reason |
| Minimap on the right edge | every changed row of the step, alpha by band, blue for the current edit |

Links: `#cN` hashes drive navigation, so the browser's Back works. `path/to/file.ts:123` (or `:120-130`) inside guide text becomes a blob link at `head`; a bare `file.ts:123` links only when the basename is unique among changed and called files.

Known limit: when a function and a type member share a name inside the same parent, sem can resolve a call to the member. The tree link then lands on the member's card. Say which one you mean in the note.

## Importance bands

Each changed row is scored from its Prism tokens, then mapped to four bands (100, 78, 58, 38 percent of the row colour):

| Score | Rule |
|---|---|
| 1.0 | a control-flow keyword: `if`, `return`, `throw`, `for`, `await`, `match`, `raise`… |
| 0.9 | a call to an I/O or process name: `spawn`, `fetch`, `existsSync`, `realpathSync`, `sendJson`… |
| 0.7 | any other call |
| 0.5 | a declaration keyword or `=` |
| 0.3 | import, export, builtin or type-only line |
| 0.2 | literal-only or bare name |
| 0.1 | comment only |
| 0.05 | punctuation only |

Two boosts: a line that names an entity this change adds or removes goes up 0.2; a line containing an identifier from a `!` note on that card goes to 1.0. The lists live in `page.html` under `FLOW`, `IO` and `DECL`. Tree-sitter classes from `facts` are the fallback if the token rules mislead on real reviews.

## facts.json keys

Read this only when the summary is not enough.

- `range`: `base`, `head`, `subject`, `web` (origin remote as an https URL, or null).
- `stats`: `filesChanged`, `linesAdded`, `linesRemoved`, `entitiesChanged`, plus graph sizes.
- `files[]`: `path`, `added`, `removed`.
- `changes[]`: `id`, `kind`, `type` (`function`, `method`, `class`, `type`, `property`, `test`, `test_suite`, or `orphan` for module-level code), `name`, `oldName`, `file`, `lines`, `oldLines`, `cosmetic`, `test`, `code`, `headId`, `baseId`, `diff` (rows of `[mark, oldLine, newLine, text]`), `callees.added|removed|kept[]` and `callersOutsideChange[]` (edges of `{id, checked, importedFrom?, external?}`).
- `entities`: entity id to `{name, type, file, line}`, for resolving edge ids.
- `timingsMs`: extraction timings.
- `sem`: the sem version string the facts came from.

## Facts the page corrects for

- A call is `checked` when both ends share a file or the caller's file imports the callee's, resolved from JS/TS import statements. Anything else is a name match; the tree marks it `?`. Rust, Python, Go and Java cross-file calls are always name matches.
- A name match whose name really imports a `node:` builtin or a package is `external` and hidden everywhere.
- sem records a call with type arguments such as `readJsonBody<T>(req)` as a type reference. The script counts a type reference to a function or method as a call, so those callers show. A function passed as a value rather than called is still not an edge; when the graph shows no callers for something you know is used, say so in a note.

## Changing the renderer

Edit `scripts/page.html` or `scripts/walkthrough.mjs` and re-render existing output with the saved `facts.json` and `guide.json`; nothing needs building. Check the result in a browser at 1280×800 and at 390 wide, with the console open.
