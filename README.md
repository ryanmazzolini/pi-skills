# pi-skills

This package is my setup for working with coding agents, primarily for [pi](https://pi.dev/). It is also available as a Claude Code plugin marketplace.

## Quick start

### pi

```bash
pi install https://github.com/ryanmazzolini/pi-skills
```

Use `pi config` to choose which skills are enabled. Run `pi update --extensions` when you want the latest version.

### Claude Code

Add the marketplace, then install whichever families you want:

```text
/plugin marketplace add ryanmazzolini/pi-skills
/plugin install ship@ryan-pi-skills
/plugin install commit@ryan-pi-skills
```

See [the marketplace manifest](./.claude-plugin/marketplace.json) for every family. Commands are namespaced, so Ship is `/ship:ship`. Update with `/plugin marketplace update` and `/plugin update`.

## What to expect

- [`ship`](./skills/ship/ship/SKILL.md) routes work through the lightest useful path: direct implementation by default, focused alignment or delivery planning when needed, and milestone roadmaps only for work that benefits from durable coordination.
- New Ship workflows use durable Markdown instead of hidden session state and live under `projects/<project>/work/<work-item>/` in the vault selected by `~/.config/pi-skills/workflows.json`. LLMs can create or edit the complete routing file directly and check it with the workflow-profile doctor. Relevant existing `.plans`, `.plan`, `docs/plans`, and `PI_SKILLS_PLANS_ROOT` workflows are reused in place. See [workflow profiles](./skills/ship/ship/references/workflow-profiles.md) for configuration and diagnosis.
- Most skills are guidance, not a subscription to every tool I happen to like. Optional integrations only matter when you use their matching skills.

## What’s in the box

_Note: I've adapted most of these skills from other people's skills to suit my needs. See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)._

### Shipping work

| Skill | What it helps with |
|---|---|
| [`ship`](./skills/ship/ship/SKILL.md) | Route direct changes, alignment, delivery plans, and milestone roadmaps |
| [`ship-coach`](./skills/ship/ship-coach/SKILL.md) | Ship real work through guided practice and feedback |
| [`align`](./skills/ship/align/SKILL.md) | Settle consequential human decisions for one target outcome |
| [`prototype`](./skills/ship/prototype/SKILL.md) | Build a throwaway artifact to answer one experiential design question |
| [`delivery-plan`](./skills/ship/delivery-plan/SKILL.md) | Plan dependent delivery changes for one approved benefit |
| [`ticket-workspace`](./skills/ticket-workspace/ticket-workspace/SKILL.md) | Create or reuse workspaces with one git worktree per PR |
| [`ticket-workspace-cleanup`](./skills/ticket-workspace/ticket-workspace-cleanup/SKILL.md) | Stop confirmed workspace-local processes and safely remove completed ticket workspaces |
| [`handoff`](./skills/handoff/SKILL.md) | Write a Markdown handoff for another agent or fresh session |
| [`commit-simple`](./skills/commit/commit-simple/SKILL.md) | Prepare branches, commits, and pushes |
| [`commit-pr`](./skills/commit/commit-pr/SKILL.md) | Create or update a pull request |

### Architecture and decisions

| Skill | What it helps with |
|---|---|
| [`research`](./skills/research/research/SKILL.md) | Answer technical questions with bounded, decision-focused evidence |
| [`architecture-review`](./skills/architecture/architecture-review/SKILL.md) | Review design trade-offs, rollout risk, and operations |
| [`design-an-interface`](./skills/architecture/design-an-interface/SKILL.md) | Compare meaningfully different designs for a module or API |
| [`shape-first`](./skills/architecture/shape-first/SKILL.md) | Settle data, rules, and local boundaries before implementation |
| [`simplest-sufficient-change`](./skills/architecture/simplest-sufficient-change/SKILL.md) | Choose the earliest repo-native solution that fully meets the need |
| [`simplify-codebase-architecture`](./skills/architecture/simplify-codebase-architecture/SKILL.md) | Remove repeated decisions and needless layers |
| [`ubiquitous-language`](./skills/architecture/ubiquitous-language/SKILL.md) | Build a domain glossary and flag muddy terminology |

### Coding and review

| Skill | What it helps with |
|---|---|
| [`diagnosing-bugs`](./skills/debugging/diagnosing-bugs/SKILL.md) | Diagnose hard, flaky, environment-specific, or performance bugs |
| [`security-review`](./skills/security/security-review/SKILL.md) | Find proven, exploitable security problems in code and delivery paths |
| [`explain-code`](./skills/explain/explain-code/SKILL.md) | Explain code with diagrams and analogies |
| [`typescript`](./skills/typescript-nextjs/typescript/SKILL.md) | Apply strict TypeScript patterns and conventions |
| [`nextjs-app-router`](./skills/typescript-nextjs/nextjs-app-router/SKILL.md) | Work with modern Next.js App Router patterns |
| [`frontend-react`](./skills/typescript-nextjs/frontend-react/SKILL.md) | Implement and review accessible React and Next.js interfaces |
| [`hci`](./skills/ux-accessibility/hci/SKILL.md) | Improve any human-facing surface with usability and accessibility guidance |
| [`frontend-hci-review`](./skills/ux-accessibility/frontend-hci-review/SKILL.md) | Audit frontend flows, responsive behavior, and interaction states |
| [`ruby-sorbet-rails`](./skills/ruby-sorbet-rails/ruby-sorbet-rails/SKILL.md) | Work in Rails with Sorbet, Tapioca, RuboCop, and native conventions |
| [`godot-gameplay-guidelines`](./skills/godot/godot-gameplay-guidelines/SKILL.md) | Build and review Godot 4.7 gameplay with a tight feedback loop |

### Notes, reports, and learning

| Skill | What it helps with |
|---|---|
| [`obsidian-vault`](./skills/notes/obsidian-vault/SKILL.md) | Use Obsidian-aware features for safe vault changes |
| [`inbox-wiki`](./skills/notes/inbox-wiki/SKILL.md) | Turn vault inbox captures into raw sources and durable notes |
| [`vault-cleanup`](./skills/notes/vault-cleanup/SKILL.md) | Audit and repair vault structure without ingesting the inbox |
| [`daily-report`](./skills/notes/daily-report/SKILL.md) | Build evidence-based reports from Git, GitHub, and Shortcut activity |
| [`notion-cli`](./skills/notes/notion-cli/SKILL.md) | Read and change Notion through the `ntn` CLI |
| [`teach`](./skills/productivity/teach/SKILL.md) | Learn through short lessons, practice, and feedback |
| [`writing-great-skills`](./skills/productivity/writing-great-skills/SKILL.md) | Write compact skills that produce reliable work |
| [`context-guidelines`](./skills/ai-authoring/context-guidelines/SKILL.md) | Apply context-engineering principles to AI configuration |

### Agents, automation, and integrations

| Skill | What it helps with |
|---|---|
| [`first-mate`](./skills/first-mate/SKILL.md) | Orient, triage, and coordinate safely across connected Pi sessions |
| [`agent-coordination`](./skills/agent-coordination/SKILL.md) | Choose configured models and reasoning levels for delegated work |
| [`scheduled-jobs`](./skills/scheduled-jobs/SKILL.md) | Inspect and operate reviewed recurring local jobs |
| [`shortcut`](./skills/shortcut/shortcut/SKILL.md) | Work with Shortcut stories through the `short` CLI |
| [`agent-browser`](./skills/agent-browser/agent-browser/SKILL.md) | Automate browsers and Electron apps |
| [`herdr`](./skills/herdr/SKILL.md) | Control Herdr or hand a Pi conversation to another workspace |

## First Mate

Start First Mate with `/skill:first-mate` when you want a compact view of your open Pi sessions. It reports how many peers it can see and stays idle until you ask it to triage, inspect a session, contact one, or help with a focused blocker.

Triage inspects sessions idle for at least 24 hours first. When none are confirmed, it falls back to newer sessions. It processes bounded pages automatically, collapses sessions that need no interaction, and returns clear next steps only for sessions worth your attention.

First Mate can sanity-check an owning session's current request and automatically authorize very-low-risk preparation such as a feature-branch commit, ordinary feature push, or draft PR. It bundles reversible decisions that still need judgment for one human response and keeps consequential choices individual. First Mate relays authority through Intercom; it does not change project files, commit work, deploy, close sessions, or perform cleanup itself.

A Pi session keeps the same Intercom identity across reloads and reconnects, while its First Mate role remains runtime-scoped. Intercom keeps notices and send/reply outcomes passive so they do not start acknowledgment loops; explicit asks still start a turn. Message bubbles show compact previews and use Pi's configured tool-expansion shortcut for full content. First Mate is available only in Pi, not the Claude marketplace. If another session can no longer find it after restarting or reconnecting Pi, run `/skill:first-mate` again.

## Optional tooling

[pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) and Node.js 24 or newer are the package-wide requirements. The `node` executable must be available on `PATH`; it runs package scripts, the `intercom` broker, and installed scheduled-job snapshots. `daily-report` also needs Git, configured repositories, and a writable vault. Everything else is à la carte:

- [GitHub CLI](https://cli.github.com/) adds GitHub evidence to `daily-report`.
- [Shortcut CLI](https://github.com/useshortcut/shortcut-cli) powers `shortcut` and can add Shortcut evidence to `daily-report`.
- [Obsidian CLI](https://obsidian.md/help/cli) powers vault-aware note workflows and must be enabled in Obsidian desktop.
- Notion CLI (`ntn`) powers `notion-cli`.
- [agent-browser](https://github.com/vercel-labs/agent-browser) powers browser automation.
- [Herdr](https://herdr.dev/) is only needed for Herdr-managed sessions.

The scheduler uses launchd on macOS, systemd user timers on Linux, or `crontab` as a warned fallback.

## Also included

Pi gets a few extras that are not skills:

- `delegate` runs child agents in the background and adds an Agent Desk for inspecting and controlling them.
- `intercom` provides local peer messaging, capability-gated bounded read-only tails, and an ephemeral First Mate presence role.
- `editor-links` turns file paths into links that open in Zed through a local bridge.
- `scheduled-jobs` adds the human-only `/scheduler` interface.
- `daily-report` and `scheduled-jobs` are also available as command-line tools.

## Contributing

Found an issue? Issues and small PRs are welcome. See [`AGENTS.md`](./AGENTS.md) for repository conventions, then run `npm test` for the full local check.

## License

MIT — see [LICENSE](./LICENSE). Some skills are adapted from third-party MIT-licensed sources; see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
