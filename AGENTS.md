# AGENTS.md

This is a pi skills package. It is installed via `pi install` and should not be edited in place under `~/.pi/agent/git/`.

## Structure

- Canonical skills live under `skills/`; grouped skills use `skills/<namespace>/<skill-name>/SKILL.md`
- Pi-only helpers may remain as `skills/<skill-name>/SKILL.md`
- Extensions live in `extensions/*.ts`
- Skills follow the [Agent Skills standard](https://agentskills.io/specification)
- The `package.json` declares `pi.skills` pointing to `./skills` and `pi.extensions` pointing to `./extensions`
- `.claude-plugin/marketplace.json` exposes Claude Code plugin namespaces by pointing directly at grouped `skills/<namespace>` directories
- Do not add `plugins/` symlink wrappers for pure-skill plugins; only create a plugin directory if it needs Claude-specific assets such as hooks, agents, settings, or executables

## Conventions

- Skill directory names must be lowercase with hyphens (e.g. `commit-simple`, `plan-create`)
- Every `SKILL.md` requires `name` and `description` frontmatter
- The frontmatter `name` must match the parent skill directory name
- Descriptions should be specific about what the skill does and when to use it
- Use relative paths to reference scripts or assets within a skill directory

## Adding a Skill

1. Create `skills/<namespace>/<skill-name>/SKILL.md` with frontmatter and instructions, or `skills/<skill-name>/SKILL.md` for a pi-only helper
2. Add an entry to the table in `README.md`
3. If Claude should expose it, add the skill path to the matching plugin entry in `.claude-plugin/marketplace.json`
4. Add a new marketplace plugin entry only when introducing a new Claude namespace

## Adding an Extension

1. Create `extensions/<name>.ts`
2. Keep credentials out of the repo; prefer env vars or files under `~/.pi/agent/extensions/`
3. Add an entry to the extensions section in `README.md`
