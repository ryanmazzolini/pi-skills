# Design Format

Use one `design.md`. Keep only sections that expose a costly-to-reverse choice; omit unused headings rather than writing `N/A`.

````md
# [Outcome] design

> Status: Draft for review
> Recommendation: [The proposed design in one or two sentences.]
> Review: [What the human should challenge before implementation.]

## Product promise

[Future-facing launch paragraph or concrete caller example in user language.]

- **Actor and problem:**
- **Observable success:**
- **Primary walkthrough:**
- **Failure or recovery:**
- **Non-goals:**

## Experience artifact

- **Artifact:** [Relative link to mockup, storyboard, CLI transcript, or API example.]
- **Judge:** [The exact experience question this makes easier to review.]
- **Proposed behavior:** [Markdown summary so later sessions need not load the artifact.]

## System design

- **Current fit:** [Existing components and constraints this design must respect.]
- **Proposed flow:** [Short prose, Mermaid, or sequence steps.]
- **Contracts and data:** [Endpoints, events, schemas, queries, or transformations that matter.]
- **Material risks:** [Security, reliability, compatibility, migration, rollout, or operations.]

## Program design

**File-tree diff**

```text
+ path/to/new-file
~ path/to/changed-file
```

**Key contracts**

```text
[Types and signatures without bodies.]
```

**Important call flow**

```text
entry point
└─ collaborator
   ├─ side effect
   └─ error mapping
```

- **Ownership and state:**
- **Errors and side effects:**
- **Test seams:**
- **Least-confident choice:**

## Vertical build outline

1. **Touchable tracer:** [Thin end-to-end behavior.]
   - **Observe:** [Concrete check a human or caller can perform.]
2. **Next increment:** [Added end-to-end behavior.]
   - **Observe:** [Concrete check.]

Delivery coordination: [None, or why a separate `plan.md` may be useful.]

## Authority and lifecycle

- **Inputs:** [Alignment, research, ADRs, code, tests, or documentation.]
- **Promote after delivery:** [Decisions that belong in tests, contracts, an ADR, or durable docs.]
- **Authority after delivery:** Delivered code and the promoted artifacts above; this design becomes historical evidence.
- **Active read path:** Keep this current during implementation; after delivery point `Current` to the result and leave this file in place.
````
