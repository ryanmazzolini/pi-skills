# Review Artifacts

A review artifact is a temporary aid for one human decision. Put it under the vault-native work item's `working/` directory, applying the vault-target checks in [workflow-profiles.md](workflow-profiles.md) before writing with ordinary file tools, or beside a verified legacy workflow that remains in place. `plan.md` remains the source of truth; the aid must not become another plan or status system.

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

Do not default to slides or dashboards. Add a table or diagram when the answer has a shape that prose would leave the reviewer to assemble. If plain Markdown is clear enough, create nothing else.

## Make the decision easy to judge

- Put the recommendation or current state first.
- Include only evidence needed to approve, reject, or redirect it.
- Show consequences without reproducing implementation detail.
- Label assumptions, unknowns, alternatives, and hard-to-reverse choices.
- End with the exact question the human must answer.

Make the artifact drillable instead of dense. The first view should stand alone; link from it to named sections for evidence, alternatives, source paths, risks, rollout, or other details the reviewer may need.

Read the `visuals` skill to choose between a table, a Mermaid diagram and inline HTML, and to design and check the result. Use a project-native prototype only when the project toolchain is needed for fidelity.

Before presenting it, check that:

- the medium fits the question
- the point is clear at a glance
- claims trace to alignment or plan decisions
- unfinished areas remain visible
- the approval boundary is explicit
- color is not the only signal
- diagrams have a text explanation
- reading and focus order are clear
