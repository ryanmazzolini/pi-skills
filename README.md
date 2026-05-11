# pi-skills

A collection of opinionated [pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) skills I use day-to-day. It is shaped around my personal workflow, but feel free to use it, fork it, and adapt anything that is useful.

## Install

```bash
pi install https://github.com/ryanmazzolini/pi-skills
```

## Update

```bash
pi update
```

## A quick note before you use or fork

This is my personal toolkit first. If parts of it fit your workflow, great — use them, fork them, or adapt them.

A few things to know up front:
- RPI is the canonical durable workflow skill. Use `/rpi` in pi for the extension-backed interface, or `/skill:rpi` for the raw skill.
- Related skills are grouped together in the repo where it makes sense, especially under `skills/diffity/*`.
- Some skills are thin wrappers around optional third-party CLIs. If you do not use those tools, you can skip those skills.
- RPI workflows use durable markdown artifacts instead of hidden session state. See [`skills/rpi/SKILL.md`](./skills/rpi/SKILL.md) for the entrypoint.

## Optional tooling

`pi` is the only base dependency. The tools below are optional and only needed for the matching skills.

| Tool | Used by | Notes |
|------|---------|-------|
| [HumanLayer](https://humanlayer.dev) | `humanlayer-thoughts`, optionally `rpi` | Needed only if you want `humanlayer thoughts init` / `humanlayer thoughts sync` workflows |
| [Diffity](https://www.npmjs.com/package/diffity) | `diffity/*` | Browser-first diff review, comments, guided tours, and learning workflows |
| [Shortcut CLI](https://github.com/useshortcut/shortcut-cli) | `shortcut` | Requires Shortcut auth/config |
| [agent-browser](https://github.com/vercel-labs/agent-browser) | `agent-browser` | Browser automation CLI |

## Skill families

This README is the map. The family README files have the details.

| Family | Overview | Docs | References |
|--------|----------|------|------------|
| `rpi` | Single-skill durable workflow for question, research, design, planning, local boards, implementation, verification, and fresh-session handoffs | [`skills/rpi/SKILL.md`](./skills/rpi/SKILL.md) | [HumanLayer context engineering](https://www.humanlayer.dev/blog/advanced-context-engineering), [QRSPI](https://alexlavaee.me/blog/from-rpi-to-qrspi/), [Agent Skills](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) |
| `diffity/*` | Browser-first diff review, file-tree review, guided tours, and learning workflows | [`skills/diffity/README.md`](./skills/diffity/README.md) | [Diffity](https://www.npmjs.com/package/diffity) |

## Standalone skills

| Skill | Description | References |
|-------|-------------|------------|
| `commit-simple` | Branch, commit, and push changes | — |
| `commit-pr` | Create or update draft pull requests | — |
| `research` | Standalone technical research | — |
| `shortcut` | Interact with Shortcut stories via the `short` CLI | [Shortcut CLI](https://github.com/useshortcut/shortcut-cli) |
| `architecture-review` | Architecture review lens for design tradeoffs and operability | — |
| `improve-codebase-architecture` | Find deep-module refactor opportunities that improve testability and navigability | [mattpocock](https://github.com/mattpocock/skills/tree/main/improve-codebase-architecture) |
| `simplify-codebase-architecture` | Find pragmatic refactor opportunities by reducing repeated knowledge and deleting shallow abstraction | — |
| `design-an-interface` | Generate multiple interface designs for a module or API and compare tradeoffs | [mattpocock](https://github.com/mattpocock/skills/tree/main/design-an-interface) |
| `grill-me` | Stress-test a plan or design with a one-question-at-a-time interview | [mattpocock](https://github.com/mattpocock/skills/tree/main/grill-me) |
| `grill-with-docs` | Stress-test a plan against code/docs while updating CONTEXT.md and ADRs as decisions crystallize | [mattpocock](https://github.com/mattpocock/skills/tree/main/skills/engineering/grill-with-docs) |
| `ubiquitous-language` | Extract and harden domain terminology into a DDD-style glossary | [mattpocock](https://github.com/mattpocock/skills/tree/main/ubiquitous-language) |
| `frontend-react` | Default React/Next.js/TSX implementation and review guidance with progressive references | [React conditional rendering](https://react.dev/learn/conditional-rendering), [Agent Skills progressive disclosure](https://agentskills.io/specification) |
| `frontend-guidelines` | Frontend defaults for UX, accessibility, and UI tradeoffs | — |
| `frontend-hci-review` | Find frontend usability, accessibility, responsive, and interaction-state improvement opportunities | [Agent Skills progressive disclosure](https://agentskills.io/specification) |
| `godot-gameplay-guidelines` | Gameplay defaults for Godot feel, scenes, and performance | — |
| `context-guidelines` | Context engineering principles for AI config | [Anthropic context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), [HumanLayer CLAUDE.md](https://www.humanlayer.dev/blog/writing-a-good-claude-md) |
| `explain-code` | Code explanations with diagrams and analogies | — |
| `typescript` | TypeScript strict mode conventions | — |
| `nextjs-app-router` | Next.js App Router patterns | — |
| `hci` | Usability, accessibility, responsive design | — |
| `humanlayer-thoughts` | Persist plans, research, and reviews with HumanLayer thoughts | [HumanLayer](https://humanlayer.dev) |
| `agent-browser` | Thin bridge to the `agent-browser` CLI for browser automation | [agent-browser](https://github.com/vercel-labs/agent-browser) |

## Extensions

| Extension | Description |
|-----------|-------------|
| `rpi` | Adds `/rpi` workflow launch/candidates plus readable `/rpi handoff <brief>` fresh sessions |

## Contributing

This repo reflects my personal workflow and is shared in case it is useful. Feel free to borrow ideas, fork it, or open an issue or PR if something small would make it clearer or easier to use.

## License

MIT — see [LICENSE](./LICENSE). Some skills are adapted from third-party MIT-licensed sources; see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
