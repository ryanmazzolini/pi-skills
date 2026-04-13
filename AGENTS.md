# AGENTS.md

This is a pi skills package. It is installed via `pi install` and should not be edited in place under `~/.pi/agent/git/`.

## Structure

- Each skill lives in `skills/<name>/SKILL.md`
- Extensions live in `extensions/*.ts`
- Skills follow the [Agent Skills standard](https://agentskills.io/specification)
- The `package.json` declares `pi.skills` pointing to `./skills` and `pi.extensions` pointing to `./extensions`

## Conventions

- Skill directory names must be lowercase with hyphens (e.g. `commit-simple`, `plan-create`)
- Every `SKILL.md` requires `name` and `description` frontmatter
- The frontmatter `name` must match the parent directory name
- Descriptions should be specific about what the skill does and when to use it
- Use relative paths to reference scripts or assets within a skill directory

## Adding a Skill

1. Create `skills/<name>/SKILL.md` with frontmatter and instructions
2. Add an entry to the table in `README.md`

## Adding an Extension

1. Create `extensions/<name>.ts`
2. Keep credentials out of the repo; prefer env vars or files under `~/.pi/agent/extensions/`
3. Add an entry to the extensions section in `README.md`
