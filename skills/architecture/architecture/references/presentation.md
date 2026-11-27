# Present Architecture Clearly

Read this when a diagram or comparison would make an architecture review, design, or comparison easier to judge.

Name the decision and approval boundary first. Make the first view stand on its own:

- recommendation or current state;
- smallest diagram or comparison that explains why;
- consequential trade-off or unknown;
- exact question the reader must answer.

Make the artifact drillable rather than dense. Use descriptive headings and links from the first view to evidence, alternatives, source paths, failure behavior, rollout, and operations. Keep implementation detail behind those sections.

Read the `visuals` skill to choose between a table, a Mermaid diagram and inline HTML, and to design and check the result. Keep one reading direction and label relationships with actions or data.

Temporary aids belong in the OS temp directory or the active workflow's approved working area, not the repository. Do not create a durable artifact or competing source of truth without approval.
