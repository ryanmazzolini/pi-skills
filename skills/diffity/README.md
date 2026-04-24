# Diffity skills

The `skills/diffity/` directory contains browser-first workflows built around [Diffity](https://www.npmjs.com/package/diffity).

Use this family when a browser is a better surface than terminal output: visual diff review, file comments, guided code tours, or learning flows.

## Requirement

These skills assume Diffity is installed and available on your path:

```bash
npm install -g diffity
```

## Skills in this family

| Skill | Purpose |
|-------|---------|
| [`diffity-diff`](./diffity-diff/SKILL.md) | Open Diffity for a diff so you can inspect changes in the browser |
| [`diffity-review`](./diffity-review/SKILL.md) | Review the current diff and leave only high-signal inline comments |
| [`diffity-resolve`](./diffity-resolve/SKILL.md) | Resolve open diff comments by making the requested code changes |
| [`diffity-tree`](./diffity-tree/SKILL.md) | Open the file tree browser to browse and comment on any file |
| [`diffity-resolve-tree`](./diffity-resolve-tree/SKILL.md) | Resolve open comments from the Diffity tree browser |
| [`diffity-tour`](./diffity-tour/SKILL.md) | Create a guided code tour that answers a question or explains a feature |
| [`diffity-learn`](./diffity-learn/SKILL.md) | Run an interactive learning workflow using Diffity tours, challenges, and review loops |

## Common flows

### Review a diff

1. Run `/skill:diffity-diff` to open the diff in the browser.
2. Leave comments manually in Diffity, or run `/skill:diffity-review` for an AI review.
3. Run `/skill:diffity-resolve` to address open threads.

### Browse and comment on the tree

1. Run `/skill:diffity-tree` to open the repo visually.
2. Leave comments on files in the browser.
3. Run `/skill:diffity-resolve-tree` to address them.

### Explain or teach with Diffity

- Use `/skill:diffity-tour` to build a guided code walkthrough.
- Use `/skill:diffity-learn` for a longer project-based learning loop with tours, challenges, and review.

## Notes

- These skills are centered on the browser workflow rather than raw terminal output.
- `diffity-learn` is the heaviest workflow in the family and uses prompt files under [`diffity-learn/prompts/`](./diffity-learn/prompts/).
