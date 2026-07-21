# Deeper Frontend Review

Read this only when the chosen fix may add shared interaction behavior, redesign a flow, needs detailed verification, or needs a lasting UX note.

## Before a larger change

- **Name the task and problem.** Point to where the current flow makes completion harder. Treat unsupported findings as preferences, not problems.
- **List important states.** Include any loading, empty, error, success, stale, disabled, selected, expanded, invalid, or completed states people must distinguish.
- **Check native behavior.** Prefer native controls. If a custom control remains, it must provide the expected name, role, state, keyboard behavior, and focus behavior.
- **Protect recovery.** Check failure, cancellation, destructive actions, invalid input, lost connectivity, and accidental navigation. Preserve work when possible and make the next action clear.
- **Prove repetition.** Three ordinary inconsistencies, or two high-risk flows, are enough to consider shared behavior.
- **Check relevant environments.** Consider small screens, touch, keyboard input, slow networks, low-end devices, and reduced motion.
- **Give shared code a job.** State the user-facing rule a component or helper will own. A visual wrapper is not useful if every caller must still recreate the hard behavior.

If these checks do not support the change, measure first.

## Verify the chosen change

Test what people can see and do rather than the code's internal shape.

- Prefer accessible role, name, and state assertions over DOM structure.
- Cover keyboard paths for custom controls and critical flows.
- For forms, cover validation, retained input, and recovery.
- Use screenshots or visual regression when behavior tests cannot show layout risk.
- Manually check screen readers, reduced motion, responsive layout, and real-device touch when automation cannot cover them.
- Remove tests that only preserve old component seams after stronger behavior tests cover the risk.

## Record a lasting decision

When the decision must outlive the immediate change, record only:

- the user task and evidence of the problem
- the chosen behavior, including important states, accessibility, validation, recovery, and responsive expectations
- the smallest rollout path, migration risk, and verification
- any reason to measure or revisit the decision
