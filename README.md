# pi-skills

A collection of opinionated [Agent Skills](https://agentskills.io/) I use day-to-day, packaged first for [pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) and also exposed as a Claude Code plugin marketplace. It is shaped around my personal workflow, but feel free to use it, fork it, and adapt anything that is useful.

## Install


### pi

```bash
pi install https://github.com/ryanmazzolini/pi-skills
```

Use `pi config` to enable or disable individual skills after install.

### Claude Code

```text
/plugin marketplace add ryanmazzolini/pi-skills
/plugin install ship@ryan-pi-skills
/plugin install commit@ryan-pi-skills
/plugin install productivity@ryan-pi-skills
/plugin install team@ryan-pi-skills
/plugin install typescript-nextjs@ryan-pi-skills
```

The Claude marketplace at [`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json) points directly at canonical skill directories; grouped families use `skills/<namespace>/<skill>`. Skill names stay globally unique for pi while Claude commands stay readable, for example `/commit:commit-simple` and `/team:tiger-team`.

## Update

```bash
pi update
```

For Claude Code, use `/plugin marketplace update` and `/plugin update`.

## Validation

```bash
npm run validate:skills
```

Checks `SKILL.md` frontmatter, pi skill-loader diagnostics, and Claude marketplace skill references.

## A quick note before you use or fork

This is my personal toolkit first. If parts of it fit your workflow, great — use them, fork them, or adapt them.

A few things to know up front:
- Tick is the canonical durable-work router. It fires on its own for multi-session work and advances vault context → `align` → `slice-plan` → confirmed ready work → review → a high-level vault distillate.
- Obsidian vault workflows use the official Obsidian CLI when note links, templates, backlinks, or history matter.
- Claude-exposed skill families are grouped under `skills/<plugin>/<skill>`; standalone skills stay under `skills/<skill>`.
- Some skills are thin wrappers around optional third-party CLIs. If you do not use those tools, you can skip those skills.
- Tick workflows use durable markdown artifacts instead of hidden session state. They default to local `.plans/` workflow directories; set `PI_SKILLS_PLANS_ROOT` when a project needs a different durable artifact root. See [`skills/ship/tick/SKILL.md`](./skills/ship/tick/SKILL.md) for the entrypoint.

## Optional tooling

`pi` is the package-wide base dependency. `daily-report` also requires Git; the tools below are optional and only needed for matching skills or report sources.

| Tool | Used by | Notes |
|------|---------|-------|
| [GitHub CLI](https://cli.github.com/) | `daily-report` | Optional source; requires GitHub authentication |
| [Shortcut CLI](https://github.com/useshortcut/shortcut-cli) | `shortcut`, `daily-report` | Optional for daily reports; requires Shortcut auth/config |
| [Obsidian CLI](https://obsidian.md/help/cli) | `obsidian-vault`, `inbox-wiki`, `vault-cleanup` | Requires Obsidian desktop CLI to be enabled |
| Notion CLI (`ntn`) | `notion-cli` | Installed with mise; requires Notion auth/token setup |
| [agent-browser](https://github.com/vercel-labs/agent-browser) | `agent-browser` | Browser automation CLI |

## Skill families

This README is the map. The family README files have the details.

| Family | Overview | Docs | References |
|--------|----------|------|------------|
| `ship` | Durable-work family: `align` requirements and shape, build a dependency-shaped plan, then `tick` through confirmed checkpoints | [`skills/ship/tick/SKILL.md`](./skills/ship/tick/SKILL.md) | [`skills/ship/tick/references/review-artifacts.md`](./skills/ship/tick/references/review-artifacts.md) |

## Standalone skills

| Skill | Description | References |
|-------|-------------|------------|
| `ticket-workspace` | Create or reuse ticket workspaces — one folder per ticket, one git worktree per PR (stacked or multi-repo) | — |
| `ticket-workspace-cleanup` | User-invoked cleanup for completed ticket workspace folders after git-state checks | — |
| `commit-simple` | Branch, commit, and push changes | — |
| `commit-pr` | Create or update draft pull requests | — |
| `research` | Standalone technical research | — |
| `teach` | Build a durable teaching workspace with missions, lessons, references, resources, and learning records | [mattpocock](https://github.com/mattpocock/skills/tree/main/skills/productivity/teach) |
| `writing-great-skills` | User-invoked reference for writing predictable, low-context-load skills | [mattpocock](https://github.com/mattpocock/skills/tree/main/skills/productivity/writing-great-skills) |
| `handoff` | Write a date-stamped `.plans/` handoff document for another agent or fresh session | [mattpocock](https://github.com/mattpocock/skills/tree/main/skills/productivity/handoff) |
| `tiger-team` | Orchestrate pi-subagents implementers and reviewers across deterministic ticket worktrees with integration, security scrutiny, and fix loops | [pi-subagents](https://github.com/nicobailon/pi-subagents) |
| `dynamic-workflows` | Create pi-subagents chain workflows with dynamic fanout, model profiles, and acceptance gates | [pi-subagents](https://github.com/nicobailon/pi-subagents) |
| `shortcut` | Interact with Shortcut stories via the `short` CLI | [Shortcut CLI](https://github.com/useshortcut/shortcut-cli) |
| `daily-report` | Generate and reconcile OKF-compatible activity reports from local Git plus optional GitHub and Shortcut evidence | [OKF v0.1](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) |
| `inbox-wiki` | Triage vault inbox captures into immutable raw sources and durable notes with human approval | — |
| `vault-cleanup` | Audit and optionally repair vault metadata, links, assets, indexes, and legacy structure without inbox intake | — |
| `obsidian-vault` | Use the Obsidian CLI for vault-aware note workflows | [Obsidian CLI](https://obsidian.md/help/cli) |
| `notion-cli` | Use the Notion `ntn` CLI for pages, data sources, and API calls | — |
| `architecture-review` | Architecture review lens for design tradeoffs and operability | — |
| `security-review` | High-signal AppSec review for OWASP-style risks, auth/authz, injection, XSS, SSRF, secrets, CI/CD and GitOps risk, and sensitive data exposure | — |
| `simplify-codebase-architecture` | Find pragmatic refactor opportunities: delete shallow abstraction, merge coupled code, deepen modules | [mattpocock improve-codebase-architecture](https://github.com/mattpocock/skills/tree/main/improve-codebase-architecture) |
| `design-an-interface` | Generate multiple interface designs for a module or API and compare tradeoffs | [mattpocock](https://github.com/mattpocock/skills/tree/main/design-an-interface) |
| `shape-first` | Human-in-the-loop coding loop for domain shapes, boundaries, TODOs, implementation, and drift checks | [ThePrimeagen](https://youtu.be/Aie0nYktsNA) |
| `diagnosing-bugs` | Diagnosis loop for hard bugs: build a tight red-capable feedback loop before hypothesising | [mattpocock diagnosing-bugs](https://github.com/mattpocock/skills/tree/main/skills/engineering/diagnosing-bugs) |
| `align` | One-question alignment for non-functional requirements, functional behavior, and high-level solution shape; preserves adaptive `alignment.md` context and durable decisions | [mattpocock grill-with-docs](https://github.com/mattpocock/skills/tree/main/skills/engineering/grill-with-docs) |
| `slice-plan` | Turn approved alignment into dependency-shaped `plan.md` artifacts of cold-pickup vertical slices | — |
| `ubiquitous-language` | Extract and harden domain terminology into a DDD-style glossary | [mattpocock](https://github.com/mattpocock/skills/tree/main/ubiquitous-language) |
| `frontend-react` | Default React/Next.js/TSX implementation and review guidance with progressive references | [React conditional rendering](https://react.dev/learn/conditional-rendering), [Agent Skills progressive disclosure](https://agentskills.io/specification) |
| `ruby-sorbet-rails` | Ruby/Rails guidance for Rails-native structures, Rails commands/migrations, strict Sorbet/Tapioca RBIs, RuboCop, db schema, and GraphQL federation artifacts | [Sorbet RBI docs](https://sorbet.org/docs/rbi), [Tapioca](https://github.com/Shopify/tapioca), [Rails migrations](https://guides.rubyonrails.org/active_record_migrations.html) |
| `frontend-hci-review` | Progressive HCI/product-flow review; starts with friction candidates before design | [`skills/ux-accessibility/frontend-hci-review/SKILL.md`](./skills/ux-accessibility/frontend-hci-review/SKILL.md) |
| `godot-gameplay-guidelines` | Gameplay defaults for Godot feel, scenes, and performance | — |
| `context-guidelines` | Context engineering principles for AI config | [Anthropic context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) |
| `explain-code` | Code explanations with diagrams and analogies | — |
| `typescript` | TypeScript strict mode conventions | — |
| `nextjs-app-router` | Next.js App Router patterns | — |
| `hci` | Usability, accessibility, responsive design, and interaction states for human-facing surfaces | [`skills/ux-accessibility/hci/SKILL.md`](./skills/ux-accessibility/hci/SKILL.md), [WCAG 2.1 Quick Reference](https://www.w3.org/WAI/WCAG21/quickref/) |
| `agent-browser` | Thin bridge to the `agent-browser` CLI for browser automation | [agent-browser](https://github.com/vercel-labs/agent-browser) |

## Extensions

| Extension | Description |
|-----------|-------------|
| `dynamic-workflows` | Adds autonomous `/chain-workflow <task>`, `/chain-workflow wizard`, `/chain-workflow status`, explicit pi-subagents chain-workflow routing, and compact/live chain-workflow status UI |
| `editor-links` | Rewrites existing relative/absolute paths in assistant output into clickable links that open in Zed via a localhost bridge (Ghostty only opens http links) |

## Contributing

This repo reflects my personal workflow and is shared in case it is useful. Feel free to borrow ideas, fork it, or open an issue or PR if something small would make it clearer or easier to use.

## License

MIT — see [LICENSE](./LICENSE). Some skills are adapted from third-party MIT-licensed sources; see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
