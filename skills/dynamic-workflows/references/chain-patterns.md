# pi-subagents Chain Patterns

## Static context → plan → implement → review

Use `.chain.md` when the shape is fixed.

```md
---
name: scout-plan-review
description: Gather context, plan, implement, then review.
---

## scout
phase: Context
label: Map relevant files
as: context
output: context.md
outputMode: file-only

Analyze the codebase for: {task}

## planner
phase: Planning
label: Build implementation plan
as: plan
reads: context.md
output: plan.md
outputMode: file-only
progress: true

Create a focused implementation plan from {outputs.context}

## worker
phase: Implementation
label: Apply approved plan
as: implementation
reads: plan.md
output: implementation.md
outputMode: file-only
progress: true

Apply the plan. Escalate any unapproved product or architecture decision.

## reviewer
phase: Validation
label: Review implementation
reads: implementation.md
output: review.md
outputMode: file-only

Review the post-implementation diff for correctness, tests, and unnecessary complexity.
```

Run with:

```text
/run-chain scout-plan-review -- <task>
```

## Configurable model routing

Model routing is optional. If the user has a model profile, resolve role names from `.pi/dynamic-workflows.json` or `~/.pi/agent/dynamic-workflows.json`; otherwise omit `model` and inherit Pi defaults.

Example profile:

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

Example resolved chain step, when `models.cheapScan` is configured:

```json
{
  "agent": "scout",
  "phase": "Discovery",
  "label": "Cheap target discovery",
  "model": "openai/gpt-5.5:low",
  "task": "Find simple targets for: {task}. Return structured output only.",
  "as": "targets",
  "outputSchema": { "type": "object" }
}
```

If a profile value is missing, `inherit`, or matches the session default, leave `model` unset on that step.

## Dynamic read-only audit

Use this for codebase-wide discovery without edits.

```json
{
  "name": "dynamic-audit",
  "description": "Find targets, audit each target, synthesize findings.",
  "chain": [
    {
      "agent": "scout",
      "phase": "Discovery",
      "label": "Find audit targets",
      "as": "targets",
      "task": "Find up to 12 audit targets for: {task}. Return structured output only.",
      "outputSchema": {
        "type": "object",
        "properties": {
          "items": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "key": { "type": "string" },
                "path": { "type": "string" },
                "reason": { "type": "string" }
              },
              "required": ["key", "path", "reason"]
            }
          }
        },
        "required": ["items"]
      }
    },
    {
      "expand": {
        "from": { "output": "targets", "path": "/items" },
        "item": "target",
        "key": "/key",
        "maxItems": 12
      },
      "parallel": {
        "agent": "reviewer",
        "phase": "Audit",
        "label": "Audit {target.key}",
        "task": "Audit {target.path}. Reason: {target.reason}. Do not modify files; return evidence-backed findings.",
        "outputMode": "file-only",
        "output": "audits/{target.key}.md"
      },
      "collect": { "as": "audits" },
      "concurrency": 4
    },
    {
      "agent": "planner",
      "phase": "Synthesis",
      "label": "Prioritize findings",
      "task": "Synthesize {outputs.audits}. Group true positives, false positives, risks, and recommended next steps."
    }
  ]
}
```

## Dynamic planning fanout → single writer → validation fanout

Use this when edits are needed but multiple writers would be risky.

```json
{
  "name": "dynamic-safe-fix",
  "description": "Discover targets, fan out read-only planners, apply fixes with one writer, then validate.",
  "chain": [
    {
      "agent": "scout",
      "phase": "Discovery",
      "label": "Find fix targets",
      "as": "targets",
      "task": "Find up to 10 target areas for: {task}. Return structured output only.",
      "outputSchema": {
        "type": "object",
        "properties": {
          "items": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "key": { "type": "string" },
                "path": { "type": "string" },
                "reason": { "type": "string" }
              },
              "required": ["key", "path", "reason"]
            }
          }
        },
        "required": ["items"]
      }
    },
    {
      "expand": {
        "from": { "output": "targets", "path": "/items" },
        "item": "target",
        "key": "/key",
        "maxItems": 10
      },
      "parallel": {
        "agent": "planner",
        "phase": "Per-target planning",
        "label": "Plan {target.key}",
        "task": "Plan the smallest safe fix for {target.path}. Reason: {target.reason}. Do not edit files.",
        "outputMode": "file-only",
        "output": "plans/{target.key}.md"
      },
      "collect": { "as": "targetPlans" },
      "concurrency": 4
    },
    {
      "agent": "worker",
      "phase": "Implementation",
      "label": "Apply accepted fixes",
      "as": "implementation",
      "task": "Apply only safe fixes from these plans. You are the only writer for this worktree. Plans: {outputs.targetPlans}",
      "output": "implementation.md",
      "outputMode": "file-only",
      "progress": true,
      "acceptance": {
        "criteria": ["Fix the approved issues without widening scope"],
        "evidence": ["changed-files", "commands-run", "diff-summary", "residual-risks"],
        "maxFinalizationTurns": 3
      }
    },
    {
      "expand": {
        "from": { "output": "targets", "path": "/items" },
        "item": "target",
        "key": "/key",
        "maxItems": 10
      },
      "parallel": {
        "agent": "reviewer",
        "phase": "Validation",
        "label": "Validate {target.key}",
        "task": "Validate the post-worker diff for {target.path}. Start from implementation summary: {outputs.implementation}. Do not edit files.",
        "outputMode": "file-only",
        "output": "validation/{target.key}.md"
      },
      "collect": { "as": "validation" },
      "concurrency": 4
    },
    {
      "agent": "planner",
      "phase": "Final report",
      "label": "Synthesize validation",
      "task": "Summarize implementation and validation results. Call out blockers, residual risks, and exact verification commands still needed."
    }
  ]
}
```
