# Present Architecture Clearly

Read this only when prose or a small inline sketch cannot make an architecture review, design, or comparison easy to judge.

Name the decision and approval boundary first. Make the first view stand on its own:

- recommendation or current state;
- smallest diagram or comparison that explains why;
- consequential trade-off or unknown;
- exact question the reader must answer.

Make the artifact drillable rather than dense. Use descriptive headings and links from the first view to evidence, alternatives, source paths, failure behavior, rollout, and operations. Keep implementation detail behind those sections.

Use plain Markdown for a table, before/after view, or tiny linear flow. Prefer Mermaid for multi-node sequence, state, branch, or relationship diagrams when the output surface renders it. When Mermaid is unavailable, preserve the same view as a compact text sketch. For spatial detail Mermaid cannot express legibly, prefer one self-contained HTML file with inline CSS and SVG: no build step, external assets, or CDN. Keep one reading direction, label relationships with actions or data, use text as well as color, and give every diagram a prose interpretation.

Use tldraw or another spatial canvas only when the reviewer needs to rearrange elements, explore placement, or collaborate spatially and the tool is available. Preserve a portable export or text explanation with the decision evidence.

Temporary aids belong in the OS temp directory or the active workflow's approved working area, not the repository. Do not create a durable artifact or competing source of truth without approval.
