# Review Artifacts

A **review artifact** is a temporary aid for human understanding and approval. `plan.md` remains the source of truth; put the artifact in the workflow directory and keep only what helps the review.

## Shape follows the question

Start by writing the review question and the approval boundary. Then choose the smallest representation that makes the answer easier to judge:

- Interface behavior → mockup, prototype, annotated screenshot, or state storyboard
- System structure → context, component, deployment, dependency, or entity-relationship diagram
- Runtime behavior → sequence diagram, flow graph, state machine, or decision tree
- Change over time → before/after view, migration map, timeline, or rollout stages
- Alternatives → side-by-side comparison focused on consequences
- Delivery shape → slice map, dependency graph, or PR/worktree topology
- Mostly prose → concise brief or annotated `plan.md`
- Several independent review questions → a small set of linked views; use slides only when each view is meaningfully discrete

Do not default to slides, dashboards, tables, or diagrams. The information's shape chooses the medium.

## Build for the decision

1. Show the recommendation or current state early.
2. Include only the evidence needed to approve, reject, or redirect it.
3. Match detail to the decision: enough to expose consequences, not enough to reproduce the implementation.
4. Label assumptions, unknowns, and irreversible choices.
5. End with the exact question the human must answer before work continues.

Use the tools and format that fit: markdown, HTML/CSS, inline SVG, Mermaid, Excalidraw, product mockups, or project-native prototypes. Prefer a self-contained local artifact unless the project toolchain provides necessary fidelity.

## Quality gate

Before presenting it, check:

- **Representation fit:** the medium matches the review question.
- **Glance test:** the point and current recommendation appear within a few seconds.
- **Traceability:** claims and visuals map back to decisions or slices in `question.md` and `plan.md`.
- **Honesty:** alternatives, uncertainty, and unfinished areas are visible.
- **Accessibility:** color is not the only signal; diagrams have a text explanation; reading and focus order are clear.
- **Approval:** the user can tell exactly what they are being asked to review.

If plain markdown passes these checks, generate nothing else.
