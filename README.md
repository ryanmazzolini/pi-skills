# pi-skills

A collection of opinionated [Agent Skills](https://agentskills.io/) I use day-to-day, packaged first for [pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) and also exposed as a Claude Code plugin marketplace. It is shaped around my personal workflow, but feel free to use it, fork it, and adapt anything that is useful.

## Install

### pi

```bash
pi install https://github.com/ryanmazzolini/pi-skills
```

Use `pi config` to enable or disable individual skills after install. For example, disable `humanlayer-thoughts` if you do not use HumanLayer.

### Claude Code

```text
/plugin marketplace add ryanmazzolini/pi-skills
/plugin install rpi@ryan-pi-skills
/plugin install commit@ryan-pi-skills
/plugin install team@ryan-pi-skills
/plugin install typescript-nextjs@ryan-pi-skills
```

The Claude marketplace at [`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json) exposes grouped plugin namespaces backed by the canonical `skills/*` directories. Skill names stay globally unique for pi while Claude commands stay readable, for example `/commit:commit-simple`, `/diffity:diffity-review`, and `/team:tiger-team`.

## Update

```bash
pi update
```

For Claude Code, use `/plugin marketplace update` and `/plugin update`.

## A quick note before you use or fork

This is my personal toolkit first. If parts of it fit your workflow, great — use them, fork them, or adapt them.

A few things to know up front:
- RPI is the canonical durable workflow skill. Use `/rpi` in pi for the extension-backed interface, or `/skill:rpi` for the raw skill. Boards are optional; compact `question.md` + `plan.md` artifacts are enough for many workflows.
- Obsidian vault workflows use the official Obsidian CLI when note links, templates, backlinks, or history matter.
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
| [Obsidian CLI](https://obsidian.md/help/cli) | `obsidian-vault` | Requires Obsidian desktop CLI to be enabled |
| Notion CLI (`ntn`) | `notion-cli` | Installed with mise; requires Notion auth/token setup |
| [agent-browser](https://github.com/vercel-labs/agent-browser) | `agent-browser` | Browser automation CLI |

## Skill families

This README is the map. The family README files have the details.

| Family | Overview | Docs | References |
|--------|----------|------|------------|
| `rpi` | Single-skill durable workflow for alignment questions, PRP-style plans, compact local boards, implementation, QA/verification, and fresh-session handovers | [`skills/rpi/SKILL.md`](./skills/rpi/SKILL.md) | [mattpocock/skills](https://github.com/mattpocock/skills), [HumanLayer context engineering](https://www.humanlayer.dev/blog/advanced-context-engineering), [Agent Skills](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) |
| `diffity/*` | Browser-first diff review, file-tree review, guided tours, and learning workflows | [`skills/diffity/README.md`](./skills/diffity/README.md) | [Diffity](https://www.npmjs.com/package/diffity) |

## Standalone skills

| Skill | Description | References |
|-------|-------------|------------|
| `ticket-worktree` | Create or reuse ticket-oriented worktrees folders for Shortcut or GitHub issue work | — |
| `commit-simple` | Branch, commit, and push changes | — |
| `commit-pr` | Create or update draft pull requests | — |
| `research` | Standalone technical research | — |
| `handoff` | Write a portable temp-dir markdown handoff document for another agent or fresh session | [mattpocock](https://github.com/mattpocock/skills/tree/main/skills/productivity/handoff) |
| `tiger-team` | Orchestrate pi-subagents implementers and reviewers across deterministic ticket worktrees with integration, security scrutiny, and fix loops | [pi-subagents](https://github.com/nicobailon/pi-subagents) |
| `dynamic-workflows` | Create pi-subagents chain workflows with dynamic fanout, model profiles, and acceptance gates | [pi-subagents](https://github.com/nicobailon/pi-subagents) |
| `shortcut` | Interact with Shortcut stories via the `short` CLI | [Shortcut CLI](https://github.com/useshortcut/shortcut-cli) |
| `obsidian-vault` | Use the Obsidian CLI for vault-aware note workflows | [Obsidian CLI](https://obsidian.md/help/cli) |
| `notion-cli` | Use the Notion `ntn` CLI for pages, data sources, and API calls | — |
| `architecture-review` | Architecture review lens for design tradeoffs and operability | — |
| `security-review` | High-signal AppSec review for OWASP-style risks, auth/authz, injection, XSS, SSRF, secrets, CI/CD and GitOps risk, and sensitive data exposure | — |
| `improve-codebase-architecture` | Find deep-module refactor opportunities that improve testability and navigability | [mattpocock](https://github.com/mattpocock/skills/tree/main/improve-codebase-architecture) |
| `simplify-codebase-architecture` | Find pragmatic refactor opportunities by reducing repeated knowledge and deleting shallow abstraction | — |
| `design-an-interface` | Generate multiple interface designs for a module or API and compare tradeoffs | [mattpocock](https://github.com/mattpocock/skills/tree/main/design-an-interface) |
| `grill-me` | Stress-test a plan or design with a one-question-at-a-time interview | [mattpocock](https://github.com/mattpocock/skills/tree/main/grill-me) |
| `grill-with-docs` | Stress-test a plan against code/docs while updating CONTEXT.md and ADRs as decisions crystallize | [mattpocock](https://github.com/mattpocock/skills/tree/main/skills/engineering/grill-with-docs) |
| `converge` | Fast durable alignment loop that writes `question.md` plus acceptance criteria for lightweight planning | — |
| `slice-plan` | Write compact RPI-compatible `plan.md` artifacts with MVP vertical slices from acceptance criteria; board optional | — |
| `ubiquitous-language` | Extract and harden domain terminology into a DDD-style glossary | [mattpocock](https://github.com/mattpocock/skills/tree/main/ubiquitous-language) |
| `frontend-react` | Default React/Next.js/TSX implementation and review guidance with progressive references | [React conditional rendering](https://react.dev/learn/conditional-rendering), [Agent Skills progressive disclosure](https://agentskills.io/specification) |
| `ruby-sorbet-rails` | Ruby/Rails guidance for Rails-native structures, Rails commands/migrations, strict Sorbet/Tapioca RBIs, RuboCop, db schema, and GraphQL federation artifacts | [Sorbet RBI docs](https://sorbet.org/docs/rbi), [Tapioca](https://github.com/Shopify/tapioca), [Rails migrations](https://guides.rubyonrails.org/active_record_migrations.html) |
| `frontend-guidelines` | Frontend defaults for UX, accessibility, and UI tradeoffs | — |
| `frontend-hci-review` | Progressive HCI/product-flow review; starts with friction candidates before design | [`skills/frontend-hci-review/SKILL.md`](./skills/frontend-hci-review/SKILL.md) |
| `godot-gameplay-guidelines` | Gameplay defaults for Godot feel, scenes, and performance | — |
| `context-guidelines` | Context engineering principles for AI config | [Anthropic context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), [HumanLayer CLAUDE.md](https://www.humanlayer.dev/blog/writing-a-good-claude-md) |
| `explain-code` | Code explanations with diagrams and analogies | — |
| `typescript` | TypeScript strict mode conventions | — |
| `nextjs-app-router` | Next.js App Router patterns | — |
| `hci` | Usability, accessibility, responsive design | [`skills/hci/SKILL.md`](./skills/hci/SKILL.md), [WCAG 2.1 Quick Reference](https://www.w3.org/WAI/WCAG21/quickref/) |
| `humanlayer-thoughts` | Persist plans, research, and reviews with HumanLayer thoughts | [HumanLayer](https://humanlayer.dev) |
| `agent-browser` | Thin bridge to the `agent-browser` CLI for browser automation | [agent-browser](https://github.com/vercel-labs/agent-browser) |

## Extensions

| Extension | Description |
|-----------|-------------|
| `rpi` | Adds `/rpi` workflow launch/candidates plus readable `/rpi handover <brief>` fresh sessions |
| `dynamic-workflows` | Adds autonomous `/chain-workflow <task>`, `/chain-workflow wizard`, `/chain-workflow status`, explicit pi-subagents chain-workflow routing, and compact/live chain-workflow status UI |

## Contributing

This repo reflects my personal workflow and is shared in case it is useful. Feel free to borrow ideas, fork it, or open an issue or PR if something small would make it clearer or easier to use.

## License

MIT — see [LICENSE](./LICENSE). Some skills are adapted from third-party MIT-licensed sources; see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
