---
name: humanlayer-thoughts
description: Persist plans, research, and reviews using HumanLayer thoughts conventions. Use when saving durable notes, initializing thoughts, or explaining the thoughts layout.
---

# HumanLayer Thoughts

## Rules

- Write durable notes to `thoughts/` with frontmatter containing `source`, `date`, and `type`
- Filename format: `YYYY-MM-DD-{slug}.md` (lowercase, hyphenated)
- After writing or updating notes, run `humanlayer thoughts sync`

## Directory Layout

```text
thoughts/
├── {profile}/
│   ├── plans/
│   ├── research/
│   └── reviews/
├── global/{profile}/
└── searchable/        # read-only, auto-generated
```

## Initialize Thoughts

If `thoughts/` is missing, initialize it:

```bash
repo=$(basename "$PWD")
mkdir -p ~/thoughts/repos/"$repo"
humanlayer thoughts init --directory "$repo"               # default profile
humanlayer thoughts init --directory "$repo" --profile NAME # named profile
```

## File Template

```markdown
---
source: {repo basename or "global"}
date: YYYY-MM-DD
type: {plan|research|review}
---

# {Title}
```
