---
name: "writing-for-agents"
description: "Write reliable instructions for agents. Use when creating or editing AGENTS.md, CLAUDE.md, skills, prompts, or documents agents load as context."
license: "MIT; adapted from mattpocock/skills"
---

# Writing for Agents

Treat agent-facing writing as a behavior contract. Make the intended process predictable without prescribing work the agent can discover or decide safely.

Before revising an existing document, inspect the live environment and recent history. Name the behavior each section protects. Preserve, change, or remove it deliberately, especially approval boundaries, stopping points, optional branches, and handoffs.

After the behavior contract is correct, apply [`clear-writing`](../clear-writing/SKILL.md) when drafting or rewriting reader-facing prose. It improves clarity without replacing the constraints above.

## Define the contract

State the outcome, relevant context, hard constraints, success criteria, and stopping conditions. Use concrete decision criteria instead of vague caution. Reserve `must`, `always`, and `never` for invariants. Say what the agent may do autonomously and what requires approval.

Prescribe a procedure when the procedure itself matters, such as tool routing, validation, safety, or a human checkpoint. Otherwise describe the destination and let the agent choose an efficient path.

## Build an information hierarchy

Keep instructions needed on every run in the active document. Put uncommon cases, long reference material, and branch-specific rules behind a context pointer that says exactly when to read them. Keep critical constraints inline.

Treat the repository and runtime as sources of truth. Do not cache commands, file layouts, or configuration that the agent can inspect cheaply unless the lookup has a real trap or cost.

Keep each meaning in one place. Put reusable policy in configuration, task-specific continuation material in its durable work item, and disposable traces in the session or a temporary directory. Co-locate a rule with its conditions and caveats. Use a small number of canonical examples only when they clarify an ambiguous choice or required output.

## Make behavior checkable

Separate ordered steps from reference material. Give every step a completion criterion that lets the agent distinguish done from not done and demands enough legwork for a trustworthy result.

Use a short familiar term when it reliably calls up the intended behavior. Pair strong words such as “exhaustive” or “relentless” with their scope and stopping point. Prefer positive instructions; keep prohibitions for hard boundaries and say what to do instead.

Separate thorough internal work from the concise user-facing result. Lead the final response with the recommendation or outcome and include only the evidence needed to act.

## Prune and verify

Remove contradictions, duplication, stale detail, no-op advice, and examples that only restate a rule. Use deterministic checks for mechanical requirements and instructions for judgment.

Test the document on representative work. Confirm that every remaining instruction changes intended behavior, important conditions and handoffs remain intact, context pointers fire on the right branch, and no material regression appears. For model-specific advice, retrieve current provider guidance instead of relying on general prompt lore.

When the document is a skill, read [SKILL-MECHANICS.md](SKILL-MECHANICS.md) before choosing its invocation, description, references, or split boundaries.
