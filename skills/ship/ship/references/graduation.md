# Graduation

Graduate when the approved benefit is complete or the user explicitly closes it. A direct change without durable workflow files needs only a normal result report; do not create a work item solely to graduate it.

For a vault-native work item, close the existing item rather than copying a reduced summary elsewhere. Resolve `index.md` through [workflow-profiles.md](workflow-profiles.md), then record what a future session needs:

```md
## Result

[Human or caller benefit delivered in one or two sentences.]

### Lasting decisions

- [Only decisions useful after delivery.]

### Where it lives

- [Repository, pull request, release, document, or other durable pointer.]
```

A completed delivery plan graduates when every required delivery change is complete or the human explicitly removes the remainder. A roadmap milestone records its result in its own index, then returns to the parent roadmap so Ship can derive newly ready milestones. Close the roadmap only when every intended milestone has a result or the human deliberately closes or removes the remainder.

Keep `Current` pointed at the most useful continuation or result document. Keep task history, review evidence, validation detail, and abandoned paths in their existing files. Do not delete, move, archive, or duplicate the work item during graduation.

Leave a relevant legacy workflow in place and record completion using its established form. Do not create a vault copy solely for graduation.

Treat a requested public or cross-project summary as a separate artifact with its own destination and human approval. Do not add independent review by default.
