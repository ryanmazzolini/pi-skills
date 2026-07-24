# Durable Context

Read this when Ship creates or locates a durable workflow. The work-item files and live project are operational authority; conversation only helps locate them.

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

For a new workflow, or after the human asks to consider migrating a relevant repository `.plans/` workflow, read [workflow-profiles.md](workflow-profiles.md) and run its workspace resolver against the approved ticket-workspace folder. When the session is inside one of that workspace's repository worktrees, use the enclosing `/worktrees/<work-item-slug>/` folder; without a ticket workspace, use the canonical repository root. Repository location does not imply a profile.

Proceed automatically only when one profile matches. When configuration is missing, invalid, or incomplete, follow the direct creation or edit flow in [workflow-profiles.md](workflow-profiles.md): preserve existing profiles, write the complete version 1 JSON with ordinary file tools, run doctor with the current workspace, and rerun workspace resolution. Ask the human when the intended profile or paths are unclear. When several profiles match, ask the human to select one, then rerun with the explicit profile; explicit selection must still pass Git-root containment. Carry that selected profile through later workspace and target resolution.

Follow the selected vault's `AGENTS.md`, `CONTEXT.md`, and `README.md` instructions when present before reading or creating project material. Resolve each instruction file through the helper in [workflow-profiles.md](workflow-profiles.md); do not follow a symlinked instruction file.

## Find or create the work item

New Ship workflows and approved migrations live at:

```text
<vault>/projects/<project>/work/<work-item-slug>/
```

Use one established vault project directory name. Derive the work-item slug from the approved ticket-workspace folder when one exists. For approved ticketless work, use its stable human-recognizable workspace slug; do not invent a date prefix. Project and work-item names must be single safe path segments, with a lowercase hyphenated work-item slug. Ask when either is ambiguous.

Resolve each vault-native read, creation, or update target through the helper described in [workflow-profiles.md](workflow-profiles.md). Scope work-item files with `--within projects/<project>/work/<work-item-slug>` so generated paths cannot traverse outside the work item or follow symlink escapes. Resolve the target again after a relevant filesystem or routing change.

Read the resolved `projects/<project>/index.md` first when it exists. Then search only that project's work-item indexes by the current ticket or approved work-item slug, resolving each candidate through the helper and requiring its recorded workspace to match. Never reuse an item from workspace equality alone: several sequential ticketless items may share one repository root. Reuse one identity-and-workspace match and fail rather than guessing when several match. When no ticket or approved slug is known, ask which work item is current.

Create files lazily. A new work item starts with `index.md`; add `alignment.md`, `plan.md`, `review-evidence.md`, or `working/` only when the workflow needs them.

Use this compact index shape:

```md
# [Work item title]

- Project: [vault project name]
- Ticket: [ticket reference or None]
- Profile: [configured profile]
- Workspace: `/absolute/canonical/workspace`
- Current: [Alignment](alignment.md)
```

`Current` points to the document a fresh session should read after the index. It must be a canonical relative path inside the work item. Resolve its target with the work item as `--within` before reading it. Update the pointer when planning supersedes alignment or a handoff becomes the continuation entry point. This pointer is orientation, not a stage flag.

Keep discarded approaches, retained investigations, prototypes, temporary review aids, and handoffs under `working/`. Capture decision-relevant supporting material as it is found: keep synthesized investigation in `working/research/` and unedited source snapshots or outputs worth retaining in `working/raw/`. Treat raw captures as immutable, link useful conclusions from the current workflow document, and omit routine logs or redundant dumps. Fresh sessions read only the vault instructions, project index, work-item index, its current document, and directly linked evidence. Do not ingest `working/` by default.

Keep workflow files current rather than transcript-like. Do not add a separate state file, duplicate repository copy, or another workflow system.
