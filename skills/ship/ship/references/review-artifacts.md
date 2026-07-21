# Review Artifacts

A review artifact is a temporary aid for one human decision. Put it in the workflow directory. `plan.md` remains the source of truth; the aid must not become another plan or status system.

## Match the artifact to the question

First name the review question and what approval would cover. Then choose the smallest form that makes the answer easier to judge:

- interface behavior: mockup, prototype, annotated screenshot, or state storyboard
- system structure: context, component, deployment, dependency, or entity diagram
- runtime behavior: sequence, flow, state, or decision diagram
- change over time: before/after view, migration map, timeline, or rollout stages
- alternatives: a side-by-side comparison of consequences
- delivery shape: slice map, dependency graph, or PR/worktree layout
- mostly prose: a short brief or annotated `plan.md`
- several distinct questions: a few linked views; use slides only when each view stands alone

Do not default to slides, dashboards, tables, or diagrams. If plain Markdown is clear enough, create nothing else.

## Make the decision easy to judge

- Put the recommendation or current state first.
- Include only evidence needed to approve, reject, or redirect it.
- Show consequences without reproducing implementation detail.
- Label assumptions, unknowns, alternatives, and hard-to-reverse choices.
- End with the exact question the human must answer.

Use the format that gives the needed fidelity: Markdown, HTML/CSS, inline SVG, Mermaid, Excalidraw, a product mockup, or a project-native prototype. Prefer a self-contained local artifact unless the project toolchain is needed for fidelity.

Before presenting it, check that:

- the medium fits the question
- the point is clear at a glance
- claims trace to alignment or plan decisions
- unfinished areas remain visible
- the approval boundary is explicit
- color is not the only signal
- diagrams have a text explanation
- reading and focus order are clear
