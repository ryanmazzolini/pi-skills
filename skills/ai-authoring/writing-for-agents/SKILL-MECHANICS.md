# Skill Mechanics

Read this only when creating, revising, splitting, or reviewing a skill.

## Choose invocation deliberately

A model-invoked skill omits `disable-model-invocation`. Its description is always visible to the model, so it must name what the skill does and include one distinct trigger per branch. Keep it only when the model or another skill must find the behavior without the user naming it.

A user-invoked skill sets `disable-model-invocation: true`. Its description is a short human-facing summary. Use this for behavior the user deliberately requests by name. If manual skills become hard to remember, prefer one user-invoked router over making every command model-invoked.

Every `SKILL.md` needs quoted `name` and `description` frontmatter, and the name must match its directory. Follow the repository's local validation and packaging rules rather than copying metadata from another harness.

## Keep the top legible

A skill may contain ordered steps, reference material, or both. Keep the common path and critical boundaries in `SKILL.md`. Move material down only when a branch does not need it on every run, and make the pointer name the condition that should load it.

Use a thin router when several branches share one model-facing trigger but need different instructions. Split a separate model-invoked skill only when it needs an independent trigger. Split a sequence only after clearer completion criteria fail to prevent later steps from pulling attention away from the current one.

## Revise from evidence

For an existing skill, inspect recent fixes and map each section to the behavior it protects. Fix the smallest instruction that explains an observed failure, then rerun realistic work. Remove duplicate, stale, irrelevant, and no-op guidance instead of layering on exceptions.

Before finishing, confirm:

- the invocation choice matches who must find the skill;
- each model-facing trigger represents a distinct branch;
- steps are ordered and have checkable endpoints;
- conditional detail sits behind a reliable pointer;
- internal legwork is thorough while the user-facing result stays concise;
- every remaining line is current and changes behavior;
- the repository's skill validation passes.
