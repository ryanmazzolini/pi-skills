# Plan skills

The `skills/plan/` directory contains the repo's staged planning workflow.

Use these skills when a task is big enough that the plan should survive across sessions. The workflow writes durable markdown artifacts instead of keeping the important context only in chat. It works best with the `plan-workflow-handoff` extension and its `/plan-next` command, but each skill can also be used directly.

Installed skill names still use the `plan-` prefix:
- `plan-question`
- `plan-research`
- `plan-design`
- `plan-structure`
- `plan-create`
- `plan-implement`
- `plan-verify`
- `plan-progress`
- `plan-save`
- `plan-task`

## Skills in this family

| Skill | Purpose |
|-------|---------|
| [`plan-question`](./plan-question/SKILL.md) | Surface the highest-leverage unknowns and frame the workflow before broader research begins |
| [`plan-research`](./plan-research/SKILL.md) | Research prior art, codebase patterns, related implementations, and risks |
| [`plan-design`](./plan-design/SKILL.md) | Align on current state, target state, and key technical choices |
| [`plan-structure`](./plan-structure/SKILL.md) | Turn an aligned design into slices, milestones, and dependencies |
| [`plan-create`](./plan-create/SKILL.md) | Distill workflow artifacts into an implementation plan |
| [`plan-implement`](./plan-implement/SKILL.md) | Execute the plan adaptively, testing and checking in between milestones |
| [`plan-verify`](./plan-verify/SKILL.md) | Run automated and manual verification against the plan |
| [`plan-progress`](./plan-progress/SKILL.md) | Inspect what is done, what remains, and the suggested next step |
| [`plan-save`](./plan-save/SKILL.md) | Checkpoint current session progress back into `plan.md` |
| [`plan-task`](./plan-task/SKILL.md) | Use a lighter single-concern planning path when the full staged workflow would be overkill |

## Workflow shape

The full staged flow is:

```text
question -> research -> design -> structure -> create -> implement -> verify
```

Supporting skills:
- `plan-progress` helps you check where things stand
- `plan-save` helps you checkpoint before pausing
- `plan-task` is the lighter off-ramp for single-concern work

## Workflow directory layout

The workflow keeps artifacts under a directory like:

```text
{plans-root}/YYYY-MM-DD-[slug]/
  question.md
  research.md
  design.md
  structure.md
  plan.md
```

Not every workflow needs every file right away. This is just the intended shape for the staged path.

## `/plan-next` handoff

The `plan-workflow-handoff` extension adds `/plan-next`, a thin handoff layer over the `plan/*` skills.

Typical usage:
1. Run `/plan-next <goal>` from a fresh session.
2. Let it create or find the workflow directory.
3. Work through the selected stage and write the stage artifact.
4. Run `/plan-next` again to move into a fresh session for the next stage.

Use `/skill:plan-progress` to inspect the plan without changing workflow state.

## Plans root resolution

When creating or continuing workflows, `/plan-next` resolves the plans root in this order:

1. `PI_SKILLS_PLANS_ROOT` if set
2. `thoughts/$PI_SKILLS_THOUGHTS_PROFILE/plans/` if set
3. Existing `.plans/`
4. Existing `thoughts/*/plans/`
5. Existing `docs/plans/`
6. Existing `PRPs/`
7. If none exist, `/plan-next` asks where to create new plan artifacts

When multiple existing roots are present, new workflows prompt for the destination root instead of guessing.

Use `PI_SKILLS_PLANS_ROOT` for the most explicit setup. `PI_SKILLS_THOUGHTS_PROFILE` remains supported for HumanLayer-style thoughts workflows.

## When to use which path

- Use the full staged flow when the problem is fuzzy, cross-cutting, or likely to benefit from durable research and design artifacts.
- Use `plan-task` when the work is focused enough that a slim `plan.md` is enough.
- Use `plan-progress` when you want bearings without changing anything.
- Use `plan-verify` after implementation or when you want a fresh verification pass.

## Related pieces

- Extension: [`extensions/plan-workflow-handoff.ts`](../../extensions/plan-workflow-handoff.ts)
- Optional companion skill: [`skills/humanlayer-thoughts/SKILL.md`](../humanlayer-thoughts/SKILL.md)
