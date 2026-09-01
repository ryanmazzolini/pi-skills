# Review Artifacts

A review artifact is a temporary aid for one human decision. Put it under the vault-native work item's `working/` directory, resolving its target through the helper in [workflow-profiles.md](workflow-profiles.md) before writing, or beside a verified legacy workflow that remains in place. `plan.md` remains the source of truth; the aid must not become another plan or status system.

## Match the artifact to the question

First name the review question and what approval would cover. Then choose the smallest form that makes the answer easier to judge:

- interface behavior: mockup, prototype, annotated screenshot, or state storyboard
- system structure: context, component, deployment, dependency, or entity diagram
- runtime behavior: sequence, flow, state, or decision diagram
- change over time: before/after view, migration map, timeline, or rollout stages
- alternatives: a side-by-side comparison of consequences
- delivery shape: milestone map, dependency graph, or PR/worktree layout
- mostly prose: a short brief or annotated `plan.md`
- several distinct questions: a few linked views; use slides only when each view stands alone

Do not default to slides, dashboards, tables, or diagrams. If plain Markdown is clear enough, create nothing else.

## Make the decision easy to judge

- Put the recommendation or current state first.
- Include only evidence needed to approve, reject, or redirect it.
- Show consequences without reproducing implementation detail.
- Label assumptions, unknowns, alternatives, and hard-to-reverse choices.
- End with the exact question the human must answer.

Make the artifact drillable instead of dense. The first view should stand alone; link from it to named sections for evidence, alternatives, source paths, risks, rollout, or other details the reviewer may need.

Use plain Markdown for a table, before/after view, or tiny linear flow. Prefer Mermaid for multi-node sequence, state, branch, or relationship diagrams when the output surface renders it. When Mermaid is unavailable, preserve the same view as a compact text sketch. For spatial detail Mermaid cannot express legibly, prefer one self-contained HTML file with inline CSS and SVG so it opens without a build, external asset, or CDN. Use tldraw, Excalidraw, or another spatial canvas only when the reviewer needs to rearrange elements, explore placement, or collaborate spatially and the tool is available. Preserve a portable export or text explanation. Use a project-native prototype only when the project toolchain is needed for fidelity.

Before presenting it, check that:

- the medium fits the question
- the point is clear at a glance
- claims trace to alignment or plan decisions
- unfinished areas remain visible
- the approval boundary is explicit
- color is not the only signal
- diagrams have a text explanation
- reading and focus order are clear
