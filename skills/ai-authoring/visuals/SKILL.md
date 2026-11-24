---
name: "visuals"
description: "Choose and build a visual for an answer: a table, a Mermaid diagram, or an inline HTML chart, diagram or mockup. Use when an explanation, comparison, design or review has components, a flow, changing state, quantities or a layout that a picture shows better than prose, and before writing any HTML visual."
---

# Visuals

Show the shape of an answer when prose would leave the reader to assemble it. One visual answers one question.

## Decide whether to add one

Add a visual without being asked when the answer has a shape. Match the form to the shape:

- components and how they connect, or a flow with branches or more than three steps: a Mermaid diagram
- state that changes over time, or a before and after: a Mermaid state or sequence diagram, or inline HTML when stepping through it helps
- quantities, trends or proportions: a chart as inline HTML. A table of numbers does not replace the chart.
- options compared on the same criteria: a Markdown table
- a proposed screen or layout: an inline HTML mockup

Skip the visual when a sentence or a short list already says it.

State the conclusion in a sentence before the visual. Make sure the prose around it carries the meaning for a reader who cannot see the picture.

## Choose between Mermaid and HTML

Prefer inline HTML over Mermaid when what it adds carries meaning:

- colour for categories or status
- size and position at true proportion
- hover or expand for detail
- controls to step through state or switch between scenarios

Before falling back from HTML, run a tool search for a tool that renders HTML in the chat. These tools often load on demand, so they are missing from the starting tool list. Without one, use Mermaid when the chat renders it, or a compact text sketch.

Use a spatial canvas such as tldraw or Excalidraw only when the reader needs to rearrange the elements. Keep a portable export or a text explanation beside it.

## Design an HTML visual

Design each visual for its question instead of filling in a template. Take cues from Information is Beautiful: one clear idea, labels on the marks and little decoration.

- Give each concept one colour and reuse it in every view. Pair colour with a label or shape, so colour is never the only signal.
- When size shows a quantity, derive it from measured values. Say how you measured and whether a figure is an estimate.
- Reuse familiar notation: `+` and `−` lines for what arrives and leaves, and the same layout for before and after so only the differences stand out.
- Add only the controls that help answer the question. Keep them keyboard-accessible and label them in words.
- Mark illustrative inputs and assumptions, so the visual does not imply that it ran the real system.
- Follow the render tool's own rules for theme colours, width and height.

Use D3 when scales, layouts or interaction need computing. Hand-written SVG or CSS is enough for simple shapes.

- **Inline visual:** load D3 from a CDN at a pinned version, such as `https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js`. Inline frames can block scripts loaded from local files.
- **Saved page:** paste the contents of [`assets/d3.min.js`](assets/d3.min.js) (D3 7.9.0) into a `<script>` tag, so the page opens offline.

## Check it before showing it

Check every number, label and displayed state against the code or evidence. Then render the visual and look at it. Use the render tool's preview when it has one; otherwise use the `agent-browser` skill or a headless screenshot. Fix overlapping or clipped labels and wrong values, then render again. Give each new screenshot a new filename, because viewers cache images. Exercise each control and check for console errors. Say what you could not check.

## Keep it or discard it

Show the visual in the chat. Save it to a file only when the reader will reuse it or it is a deliverable. Make a saved page one self-contained file with inline CSS, JavaScript and SVG, so it opens with no build step and no external assets. Put that file outside the repository under discussion: in the caller's work-item directory when one is supplied, otherwise in the OS temp directory. Report its path with one line on what it shows.

For a commit, commit range or pull request walkthrough, use [`change-walkthrough`](../../review/change-walkthrough/SKILL.md) instead of building a page here.
