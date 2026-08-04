---
name: "context-guidelines"
description: Context engineering principles for AI configuration. Use when editing AGENTS.md, skills, agent prompts, or discussing AI configuration.
---

# Context Engineering Principles

Treat AI configuration as a behavior contract, not a documentation dump. Include the smallest set of instructions and context that changes what the agent should do.

For example, replace “Be careful with risky actions” with a concrete boundary: “Read files and run tests without asking. Ask before publishing, deleting data, spending money, or materially expanding scope.”

## Define the behavior

State the desired outcome, relevant context, hard constraints, success criteria, and stopping conditions. Describe the destination and let the model choose an efficient path. Prescribe a procedure when the procedure itself matters, such as tool routing, validation, safety, or approval.

Use specific decision criteria instead of vague guidance. Reserve `must`, `always`, and `never` for true invariants. Define what the agent may do autonomously and which actions require approval. Remove repeated or contradictory instructions before adding more guidance.

## Add guidance deliberately

For a new configuration, start with the smallest useful prompt and add guidance when it encodes a real requirement or corrects an observed failure.

When migrating to a new model, preserve the working configuration as a baseline. Change one instruction group or model setting at a time, then rerun the same representative tasks. Keep a change only when it produces a meaningful improvement.

Use a small number of canonical examples when they clarify an ambiguous rule or demonstrate required behavior. Remove examples that merely restate a rule, no longer match the system, or do not affect results.

## Put context in the right place

- Keep always-loaded files focused on non-standard practices, durable decisions, and boundaries that apply broadly. Omit generic repository overviews and knowledge the model can discover reliably.
- Point to supporting material when the agent can access it. Keep critical constraints in the active instructions rather than hiding them behind a reference.
- Keep on-demand skills scoped to the task they serve. They may be longer than always-loaded context when the detail changes behavior.
- Store reusable policy in configuration, task-specific continuation material in its durable work item, and disposable traces in the session or a temporary directory.

## Prefer reliable enforcement

Use deterministic tools for mechanical rules such as formatting, generated files, and schema validation. Use model instructions for judgment that cannot be expressed reliably as a check.

Treat generated prompts and context files as drafts. Review them for relevance and contradictions, then evaluate them on representative tasks before adoption.

## Verify the change

Retrieve current provider guidance before making model-specific recommendations. Treat general principles as a starting point rather than a substitute for model-specific evaluation.

Before finishing, confirm that each instruction changes an intended behavior, important conditions and handoffs remain intact, and representative checks show no material regression. Report the behavior changed, validation performed, and any uncertainty that affects adoption.
