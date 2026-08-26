---
name: "frontend-hci-review"
description: Review frontend flows for usability, accessibility, responsive behavior, and states such as loading or errors. Use when auditing a user-facing flow.
---

# Frontend Flow Review

Find the few changes most likely to help people complete a task, understand what is happening, and recover when something goes wrong.

## Review the flow

1. Trace a real user task through the relevant routes, components, tests, design notes, and recent changes. In a broad codebase, sample representative flows and expand only when the evidence repeats.
2. Look for places where people must guess, wait without feedback, repeat work, remember hidden rules, or recover without guidance. Check unclear labels, missing or ambiguous states, late validation, lost input, fragile custom controls, motion that delays repeated or keyboard-driven actions, keyboard or screen-reader gaps, and mobile overflow.
3. Rank findings by their effect on task completion, accessibility, recovery, and how often the problem occurs. Prefer native controls and small fixes over custom behavior or broad redesigns. Recommend measuring or doing nothing when the evidence is weak.
4. Lead with the strongest recommendation. If several findings are worth action, give a short numbered list. For each, state the user problem, evidence, and smallest useful next step. Mention risk only when it changes the decision.
5. Stop at the opportunity level; do not design a component API or full redesign yet. Ask which finding the user wants to pursue.

The smallest useful fix may be clearer copy, visible state, restored native behavior, fewer steps, shared interaction behavior, better small-screen support, or better evidence before changing anything.

## After the user chooses

Describe the desired user outcome, important states such as loading, empty, error, success, disabled, or stale, keyboard and focus behavior, accessible names and roles, validation and recovery, responsive constraints, risk, and the smallest reversible path. Compare alternatives only when the tradeoff is real. Recommend one and ask before changing production code or writing durable documentation.

Read [references/REFERENCE.md](references/REFERENCE.md) only when the chosen fix may add shared interaction behavior, redesign a flow, needs detailed verification, or needs a lasting UX note. Use `hci` when the review needs detailed accessibility, interaction-state, responsive, or motion standards.
