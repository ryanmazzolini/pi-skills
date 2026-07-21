---
name: "writing-great-skills"
description: "Write or revise a skill into clear, compact instructions that produce reliable work."
disable-model-invocation: true
license: "MIT; adapted from mattpocock/skills"
---

# Writing Great Skills

Write only what changes the agent's behavior. Keep the skill short enough to follow while doing the work.

Before rewriting an existing skill, inspect its current behavior and recent fixes. Afterward, confirm that every behavior worth keeping still has a clear instruction.

## Recipe

1. **Name the behavior.** State what the skill should make the agent do. Give it a clear, memorable name.
2. **Say when it applies.** Choose invocation deliberately:
   - A model-invoked skill has a description that is always available to the model. State what the skill does and list only distinct triggers. Use model invocation only when the model or another skill must find the skill on its own.
   - A user-invoked skill sets `disable-model-invocation: true`. Its description is a short human-facing summary, not a trigger list. Other skills cannot load it. If manual skills become hard to remember, add one user-invoked index skill that names them and when to use each.
3. **Give the shortest useful path.** Put required actions in order. For every action, say what success looks like and where to stop. A stopping point sets both timing and depth: require all the work needed for a trustworthy result, such as accounting for every changed file.
4. **Put details where they are needed.** Keep instructions needed on every run in `SKILL.md`. Put uncommon cases, long reference material, and branch-specific detail in clearly named linked files. Each link must say when to read it. Keep related rules together.
5. **Control the final response.** State what the agent should investigate or verify internally, then separately state the concise user-facing result: lead with the recommendation or result and include only the evidence needed to act. When reviewing a skill, recommend the smallest useful change first and report only problems that affect behavior.
6. **Test every instruction.** Use the skill on realistic work. Check that each instruction changes behavior, reaches the needed detail, and has a clear stopping point.
7. **Revise from failures.** Fix the smallest instruction that explains an observed failure, then test again. Remove duplicate, stale, irrelevant, and no-op guidance instead of layering on exceptions.

## Use strong words carefully

A leading word is a short, familiar word that calls up a specific behavior, such as “traceable” or “exhaustive.” Use one when it makes the instruction shorter and clearer.

Pair a strong word with its scope and stopping point. For example, relentless questioning can cover every decision that could change the plan and stop when no such decision remains.

Use positive wording: describe the desired action. Keep prohibitions only for hard boundaries, and pair them with the action to take instead.

## Split only when earned

Keep one skill when its work shares the same trigger and short path. Split it when a distinct behavior needs its own model-facing trigger. If later phases cause the agent to rush, first make the current phase's stopping point clearer. Split the phases only if real runs still rush.

## Revision check

Before finishing, confirm that:

- The invocation choice matches who needs to find the skill.
- Descriptions for model-invoked skills contain distinct triggers, not repeated synonyms.
- Steps are ordered and each has a checkable endpoint.
- Essential guidance is inline; uncommon detail is behind a clear link.
- Internal work is thorough and the user-facing response is concise.
- Every remaining line changes behavior and is current.
