# Durable Context

Read this when Ship creates or locates durable context for a direct continuation, alignment, delivery plan, or roadmap. The work-item files and live project are operational authority; conversation only helps locate them.

## Preserve existing workflows

Treat a workflow directory supplied by the caller as a locator, not authority. Before reading or writing it, prove that its canonical path is either one relevant existing legacy workflow under an allowed legacy root below, or the canonical work item returned by this workspace's resolved profile. Refuse an unclassified or symlink-escaped supplied path.

Without a verified supplied work item, before creating anything look for one **relevant** existing workflow under:

1. `PI_SKILLS_PLANS_ROOT` when set
2. repository `.plans/` or `.plan/`
3. repository `docs/plans/`

Relevance requires evidence such as the current ticket, work-item slug, explicit conversation pointer, or matching alignment goal. An unrelated legacy directory does not make it the home for new work. Reuse one relevant match in place, ask when several match, and do not migrate or copy it merely to adopt the current convention.

When a relevant legacy repository `.plans/` workflow is found, offer migration while continuing to treat it as the authority in place. If the human wants to consider migration, resolve a workspace profile as described below, determine the canonical vault project destination, and show it before asking for confirmation. Migrate only after the human confirms the destination and disposition of the old copy. If routing is unavailable or migration is declined, keep reusing the legacy workflow in place. Validate the destination before moving it, update references, and retire the old location so one workflow remains authoritative.

A legacy workflow may use `question.md` instead of `alignment.md`. Keep that filename.

## Resolve a profile for new work or migration

For a new workflow, or after the human asks to consider migrating a relevant repository `.plans/` workflow, follow [workflow-profiles.md](workflow-profiles.md) to read the host routing config and select the vault for the approved ticket-workspace folder. When the session is inside one of that workspace's repository worktrees, use the enclosing `/worktrees/<work-item-slug>/` folder; without a ticket workspace, use the canonical repository root. Repository location alone does not select a profile.

Proceed automatically only when one profile matches. If configuration needs correction and the intended routing is established, edit it with ordinary file tools, preserve unrelated profiles, and verify the workspace against the result. Ask when the intended profile or paths are unclear. If several profiles match, ask the human to select one; that profile must still contain the workspace within a usable Git root. Carry the selected profile and canonical vault through later target checks.

Follow the selected vault's `AGENTS.md`, `CONTEXT.md`, and `README.md` instructions when present before reading or creating project material. Apply the vault-target checks in [workflow-profiles.md](workflow-profiles.md) to each instruction file; do not follow a symlinked instruction file.

## Find or create the work item

New Ship workflows and approved migrations live at:

```text
<vault>/projects/<project>/work/<work-item-slug>/
```

Use one established vault project directory name. Derive the work-item slug from the approved ticket-workspace folder when one exists. For approved ticketless work, use its stable human-recognizable workspace slug; do not invent a date prefix. Project and work-item names must be single safe path segments, with a lowercase hyphenated work-item slug. Ask when either is ambiguous.

Apply the vault-target checks in [workflow-profiles.md](workflow-profiles.md) before reading, creating or updating vault material. Keep work-item targets inside `projects/<project>/work/<work-item-slug>` without traversal or symlinks below the canonical vault. Recheck after a relevant filesystem or routing change.

Read the verified `projects/<project>/index.md` first when it exists. Then search only that project's work-item indexes by the current ticket or approved work-item slug, checking each candidate path and requiring its recorded workspace to match. Never reuse an item from workspace equality alone: several sequential ticketless items may share one repository root. Reuse one identity-and-workspace match and fail rather than guessing when several match. When no ticket or approved slug is known, ask which work item is current.

Create files lazily. A new work item starts with `index.md`; add a continuation handoff, `alignment.md`, `plan.md`, `roadmap.md`, `review-evidence.md`, or other `working/` material only when the chosen route needs it.

Use this compact index shape:

```md
# [Work item title]

- Project: [vault project name]
- Ticket: [ticket reference or None]
- Profile: [configured profile]
- Workspace: `/absolute/canonical/workspace`
- Current: [Continuation](working/YYYY-MM-DD-handoff-subject.md)
```

`Current` points to the document a fresh session should read after the index. It may identify a direct handoff, alignment, delivery plan, roadmap, review result, or the index itself for a minimal roadmap milestone. It must be a canonical relative path inside the work item. Check its target against the work-item directory before reading it. Update the pointer when a more useful continuation supersedes it. This pointer is orientation, not a stage flag.

A direct change needs no work item while it remains safely session-local. If it must survive a fresh session or context reset, create only the index and focused handoff described by the `handoff` skill; do not invent alignment or a plan. A roadmap follows [roadmaps.md](roadmaps.md) and creates minimal linked milestone indexes only after the human approves the graph.

Keep discarded approaches, retained investigations, prototypes, temporary review aids, and handoffs under `working/`. Capture decision-relevant supporting material as it is found: keep synthesized investigation in `working/research/` and unedited source snapshots or outputs worth retaining in `working/raw/`. Treat raw captures as immutable, link useful conclusions from the current workflow document, and omit routine logs or redundant dumps. Fresh sessions read only the vault instructions, project index, work-item index, its current document, and directly linked evidence. Do not ingest `working/` by default.

Keep workflow files current rather than transcript-like. Do not add a separate state file, duplicate repository copy, or another workflow system.
