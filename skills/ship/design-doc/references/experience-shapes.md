# Experience Shapes

Read this only when prose would leave a user-visible state, interaction, responsive behavior, accessibility contract, or recovery path implicit.

First separate behavior already fixed by an authoritative product artifact from the costly choice still under review. Render that settled behavior as supporting evidence; never turn it into another decision heading merely because it is important.

Choose one named review question, then use the smallest artifact that answers it: a state storyboard, mockup, CLI transcript, content example, accessibility outline, or interaction state diagram. Consolidate the normal path, recovery, responsive states, and accessibility behavior into one shape when they describe the same flow.

Start with the action the person is trying to complete and the visible result. Reuse one coherent, non-sensitive example across the normal and recovery paths. Use authoritative inputs for settled copy and product behavior; show proposed changes only where they help judge the choice. Leave a consequential gap unresolved and say whether it blocks approval.

When an authoritative product artifact already defines the surface, link it and state every intentional deviation. Requirements preserved without change belong in the shape, not in separate decision sections.

When the design must match how an existing or reference UI behaves and that behavior is unclear from words, ask for a short screen recording first, following the recording guidance in [`hci`](../../../ux-accessibility/hci/SKILL.md).

A static HTML mockup may communicate a proposed contract when seeing the surface makes review easier. Put it under the work item's `working/mockups/`, keep it self-contained with representative data and no backend, and visually check it before presenting it. Create variants only when comparing them is itself the decision.

Use [`prototype`](../../prototype/SKILL.md) instead when interaction or human observation is needed to settle an experiential uncertainty. A design artifact communicates a proposed contract; a prototype runs an experiment.
