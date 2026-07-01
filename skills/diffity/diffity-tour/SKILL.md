---
name: "diffity-tour"
description: Create a guided code tour that walks through the codebase to answer a question or explain a feature. Opens in the browser with step-by-step navigation and highlighted code.
disable-model-invocation: true
---

# Tour

Create a narrated, step-by-step walkthrough of the codebase that answers the user's question. The tour opens in Diffity's browser UI with a sidebar showing the narrative alongside highlighted code.

## CLI reference

```
diffity agent tour-start --topic "<text>" [--body "<text>"] --json
diffity agent tour-step --tour <id> --file <path> --line <n> [--end-line <n>] --body "<text>" [--annotation "<text>"] --json
diffity agent tour-done --tour <id> --json
diffity list --json
```

## Process

### 1. Ensure Diffity is running

Run `diffity list --json`. If no tree instance is running for the current repo, start one:
`diffity tree --no-open` (in the background). Wait briefly, then verify with `diffity list --json`.

### 2. Research

Before creating any steps, deeply understand the answer:
- Read the relevant source files. Follow the code path from entry point to completion.
- Identify the key locations that tell the story.
- Plan a logical sequence of 3-10 steps that builds understanding progressively.

Scale the tour to the question:
- Focused question → 3-6 steps following one code path
- Feature question → 6-10 steps covering key flows
- System question → 8-15 steps at architectural level
- Concept question → find real examples in the codebase, teach from simple to complex

### 3. Create the tour

**Start the tour:**
```
diffity agent tour-start --topic "<3-6 word title>" --body "<intro>" --json
```

The intro (step 0) fills the full explanation panel. Write a thorough architectural overview:
- key components involved and their responsibilities
- how they connect (data flow, call chains)
- a summary flow using bold text (e.g. **CLI args → parser → API → render**)
- config dependencies if relevant

**Add steps** in order:
```
diffity agent tour-step --tour <id> --file <path> --line <start> --end-line <end> --body "<narrative>" --annotation "<short label>" --json
```

For each step:
- `--annotation`: 3-6 word chapter heading
- `--body`: rich markdown narrative. Explain *why* the code exists, not just what it does. Connect each step to the previous one with a transition sentence.
- Use `code` for symbols. Use goto links for cross-references: `` [`fn`](goto:path:line) ``
- Use `[label](focus:startLine-endLine)` sub-highlights for steps covering 30+ lines
- Include mermaid diagrams only where they genuinely clarify

**Add a conclusion step** (annotation: "Putting It Together") that summarizes the flow, highlights key design decisions, and points out extension points.

**Finish:**
```
diffity agent tour-done --tour <id> --json
```

### 4. Open in browser

Get the port from `diffity list --json`, then:
```
open "http://localhost:<port>/tour/<tour-id>"
```

Reply briefly: the tour is ready, check the browser.
