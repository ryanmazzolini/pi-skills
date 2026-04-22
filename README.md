# pi-skills

An opinionated [pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) skills package I use day-to-day. Personal, not intended to be universally applicable — fork it, keep what's useful, and adapt the rest.

## Install

```bash
pi install https://github.com/ryanmazzolini/pi-skills
```

## Update

```bash
pi update
```

## Caveats before you use or fork

These skills are calibrated to my workflow. In particular:

- Planning skills use durable workflow artifacts under a resolved plans root: `.plans/`, `thoughts/*/plans/`, `docs/plans/`, or `PRPs/`.
- `/plan-next` prefers an explicit `PI_SKILLS_PLANS_ROOT`, then a compatibility `PI_SKILLS_THOUGHTS_PROFILE`, then existing detected roots in that order. If multiple existing roots are available for a new workflow, it lets you choose.
- If no plans root exists yet, `/plan-next` prompts for one before creating the first workflow directory.
- Several skills are thin wrappers around optional third-party CLIs. If you do not use those tools, skip those skills.
- `thin-subagent` is a workflow skill, not a built-in executor. It expects a compatible subagent extension.

## Optional tooling

`pi` is the only base dependency. The tools below are optional and only needed for the matching skills.

| Tool | Used by | Notes |
|------|---------|-------|
| [HumanLayer](https://humanlayer.dev) | `humanlayer-thoughts`, plan workflow sync steps | Needed only if you want `humanlayer thoughts init` / `humanlayer thoughts sync` workflows |
| [Diffity](https://www.npmjs.com/package/diffity) | `diffity-*` | Browser-first diff review, comments, and guided tours |
| [Shortcut CLI](https://github.com/useshortcut/shortcut-cli) | `shortcut` | Requires Shortcut auth/config |
| [agent-browser](https://github.com/vercel-labs/agent-browser) | `agent-browser` | Browser automation CLI |
| `npm:@tintinweb/pi-subagents` | `thin-subagent` | Provides Claude Code-style `Agent`, `get_subagent_result`, and `steer_subagent` tools in pi |

## Skills

| Skill | Description |
|-------|-------------|
| `commit-simple` | Branch, commit, and push changes |
| `commit-pr` | Create or update draft pull requests |
| `plan-question` | Frame the problem and surface the unknowns before research |
| `plan-research` | Research a problem space before planning |
| `plan-design` | Align on current state, target state, and key choices |
| `plan-structure` | Turn aligned design into milestones, slices, and dependencies |
| `plan-create` | Distill workflow artifacts into an implementation plan |
| `plan-implement` | Execute a plan adaptively |
| `plan-progress` | Check progress on a plan |
| `plan-save` | Checkpoint session progress to plan doc |
| `plan-task` | Focused planning for single-concern tasks |
| `plan-verify` | Run verification against a plan |
| `research` | Standalone technical research |
| `shortcut` | Interact with Shortcut stories via the `short` CLI |
| `thin-subagent` | Human-in-the-loop delegated research/review workflow via an installed subagent extension |
| `frontend-guidelines` | Frontend defaults for UX, accessibility, and UI tradeoffs |
| `godot-gameplay-guidelines` | Gameplay defaults for Godot feel, scenes, and performance |
| `architecture-review` | Architecture review lens for design tradeoffs and operability |
| `agent-browser` | Thin bridge to the `agent-browser` CLI for browser automation |
| `context-guidelines` | Context engineering principles for AI config |
| `explain-code` | Code explanations with diagrams and analogies |
| `typescript` | TypeScript strict mode conventions |
| `nextjs-app-router` | Next.js App Router patterns |
| `hci` | Usability, accessibility, responsive design |
| `humanlayer-thoughts` | Persist plans, research, and reviews with HumanLayer thoughts |
| `diffity-diff` | Open Diffity browser diff viewer |
| `diffity-review` | AI code review with high-signal inline Diffity comments |
| `diffity-resolve` | Resolve open Diffity diff comments by making code changes |
| `diffity-tree` | Open Diffity file tree browser |
| `diffity-resolve-tree` | Resolve open Diffity tree comments by making code changes |
| `diffity-tour` | Create guided code tours with step-by-step walkthroughs |
| `diffity-learn` | Interactive project-driven learning with Diffity tours and challenges |

## Extensions

| Extension | Description |
|-----------|-------------|
| `plan-workflow-handoff` | Thin workflow orchestration layer with `/plan-next` for fresh-session staged planning |

## Plan Workflow Handoff

`/plan-next` is a thin handoff layer over the staged plan skills. The workflow state should live in durable markdown artifacts under a workflow directory, not in hidden session state.

Recommended directory layout:

```text
{plans-root}/YYYY-MM-DD-[slug]/
  question.md
  research.md
  design.md
  structure.md
  plan.md
```

Recommended usage:
1. Run `/plan-next <goal>` from a fresh session.
2. Let it create or find the workflow directory.
3. Work conversationally inside the selected stage and write the stage artifact.
4. Run `/plan-next` again to move into a fresh session for the next stage.

Stage mapping:
- Dedicated QRSPI-inspired stages: `plan-question`, `plan-research`, `plan-design`, `plan-structure`
- Final planning + execution stages: `plan-create`, `plan-implement`, `plan-verify`
- Lighter single-concern off-ramp: `plan-task`

Status vs progression:
- Use `/plan-next` to advance to the next fresh-session stage.
- Use `/skill:plan-progress` to inspect `plan.md` without changing sessions or workflow state.

`/plan-start` is not currently added; `/plan-next <goal>` remains the cold-start entry point until testing proves an alias is needed.

## Thin Subagent Setup

`thin-subagent` is a workflow skill, not an execution extension. It expects an installed subagent extension such as:

```bash
pi install npm:@tintinweb/pi-subagents
```

That extension provides the Claude Code-style `Agent`, `get_subagent_result`, and `steer_subagent` tools.

Starter agent presets live in `skills/thin-subagent/agents/`:
- `delegate.md` — generic read-mostly one-off delegation
- `reviewer.md` — read-only code review
- `researcher.md` — focused codebase context gathering

Copy the ones you want into `~/.pi/agent/agents/`:

```bash
cp skills/thin-subagent/agents/*.md ~/.pi/agent/agents/
```

