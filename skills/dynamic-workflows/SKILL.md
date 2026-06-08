---
name: dynamic-workflows
description: Create pi-subagents chain workflows. Use when asked to create a pi-subagents workflow, chain workflow, fanout plan, multi-agent chain, codebase-wide audit, migration workflow, or goal-like verified subagent run.
---

# Dynamic Workflows

Use this skill to turn a broad task into a reusable `pi-subagents` chain workflow, usually saved as `.pi/chains/<name>.chain.json` and run with `/run-chain` or the `subagent` tool. This is distinct from JavaScript workflow runtimes such as `@quintinshaw/pi-dynamic-workflows`.

## Principles

- Build on `pi-subagents`; do not reimplement delegation.
- Prefer a small safe workflow first, then widen fanout after evidence.
- Use `phase`, `label`, and `as` on every meaningful step so status views are readable.
- Use `.chain.md` for static sequential workflows; use `.chain.json` when you need structured output, dynamic fanout, or inline JSON schemas.
- For code-modifying work, prefer read-only fanout → one writer → read-only validation fanout. Do not launch multiple writers into one dirty worktree unless isolated worktrees are explicitly approved.
- Treat model routing as provider-agnostic cost/capability roles, not Claude-family names. If the user prefers GPT/OpenAI, use GPT-first examples and keep exact model IDs easy to swap.
- Default fanout bounds: `maxItems <= 12`, `concurrency <= 4`. Ask before raising either.
- In autonomous mode (`/chain-workflow <task>` or explicit natural-language “create a pi-subagents chain workflow…”), infer setup details yourself. Ask only when a real blocker prevents a safe workflow design.
- Ask before running a generated workflow if it edits files, has broad/high-cost fanout, or changes shared state.

## Workflow Authoring Steps

1. Confirm `pi-subagents` is available. If you have the `subagent` tool, call `subagent({ action: "list" })` before designing the workflow.
2. Inspect enough local context to choose a workflow shape. For external API/library behavior, use web research before freezing the workflow.
3. Infer the workflow name, phases, expected agent count, max fanout, verification, and whether it edits files. State those choices in one compact paragraph instead of asking setup questions.
4. Write the chain file under `.pi/chains/`:
   - Static chain: `.pi/chains/<slug>.chain.md`
   - Dynamic fanout: `.pi/chains/<slug>.chain.json`
5. Include structured `outputSchema` for any step that feeds `expand`.
6. Include verification/review steps before final synthesis.
7. Tell the user how to run it and what it will cost/risk qualitatively.

## Model Routing

Prefer the current Pi default model for ordinary workflows. Add explicit `model` fields when high fanout, adversarial verification, or expensive reasoning makes routing worth the added complexity.

Use roles first, then resolve each role through a configurable model profile. Before adding explicit `model` fields, look for `.pi/dynamic-workflows.json` in the project and `~/.pi/agent/dynamic-workflows.json` for user defaults. Project config wins over user config. If no profile exists, omit `model` fields and inherit Pi/subagent defaults unless the user explicitly asked for model routing.

Supported profile shape:

```json
{
  "models": {
    "cheapScan": "openai/gpt-5.5:low",
    "balanced": "openai/gpt-5.5:medium",
    "serious": "openai/gpt-5.5:xhigh",
    "judge": "openai/gpt-5.5:xhigh"
  }
}
```

| Role | Use for | Config key |
| --- | --- | --- |
| `cheap-scan` | classifiers, target discovery, simple extraction, broad read-only fanout | `models.cheapScan` |
| `balanced-coding` | ordinary planners, reviewers, synthesis, small implementation | `models.balanced` |
| `default-serious` | most normal dynamic-workflow tasks | `models.serious` |
| `strong-judge` | architecture/security review, final arbitration, tournament judging | `models.judge` |

Guidelines:

- Treat the profile values as examples, not package defaults. They may be GPT, Claude, local, or any Pi model ID with an effort suffix.
- If a role value is missing, set to `inherit`, or equal to the session default, omit the `model` field for that step.
- Use cheaper/lower-effort profile roles for high-volume read-only tasks; reserve `serious`/`judge` for implementation, synthesis, adversarial judging, and hard decisions.
- In saved chains, put resolved per-step choices on `model`, e.g. `"model": "openai/gpt-5.5:low"`. If fallback behavior is needed, prefer `subagents.agentOverrides` for the role agent rather than duplicating full agent definitions.
- If model routing materially affects cost/quality and no profile exists, ask one concise question for the model profile. Otherwise inherit Pi defaults.

## Dynamic Fanout Rules

Dynamic fanout must come from structured output, not prose. The producer step should return an object like:

```json
{
  "items": [
    { "key": "src/foo.ts", "path": "src/foo.ts", "phase": "api", "reason": "uses deprecated API" }
  ]
}
```

Then the chain can expand from `/items` with a bounded `maxItems`. Use `key` for stable labels, and collect results with `collect.as` for synthesis.

## Goal-Style Acceptance

When the user says `/goal`, “active goal”, “work until evidence says done”, or asks for proof, encode an `acceptance` object on the relevant child run:

- `criteria`: what must be true
- `evidence`: required proof kinds
- `verify`: runtime commands Pi should execute
- `stopRules`: constraints and escalation points
- `maxFinalizationTurns`: bounded self-review/repair budget

Do not put acceptance on static parallel groups or dynamic aggregate groups; put it on the child template or sequential step that owns a session.

## Patterns

Read [chain-patterns.md](references/chain-patterns.md) when you need concrete `.chain.md` or `.chain.json` examples.

## Output Shape

When finished, report:

- Workflow file path
- Phases and max fanout/concurrency
- Whether it edits files
- How to run it
- Validation/acceptance gates included
- Any remaining decision the user should make before running
