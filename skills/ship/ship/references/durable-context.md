# Durable Context

Read this when Ship creates or locates a durable workflow. The work-item files and live project are operational authority; conversation only helps locate them.

## Preserve existing workflows

Treat a workflow directory supplied by the caller as a locator, not authority. Before reading or writing it, prove that its canonical path is either one relevant existing legacy workflow under an allowed legacy root below, or the canonical work item returned by this workspace's resolved profile. Refuse an unclassified or symlink-escaped supplied path.

Without a verified supplied work item, before creating anything look for one **relevant** existing workflow under:

1. `PI_SKILLS_PLANS_ROOT` when set
2. repository `.plans/` or `.plan/`
3. repository `docs/plans/`

Relevance requires evidence such as the current ticket, work-item slug, explicit conversation pointer, or matching alignment goal. An unrelated legacy directory does not make it the home for new work. Reuse one relevant match in place, ask when several match, and do not migrate or copy it merely to adopt the current convention.

A legacy workflow may use `question.md` instead of `alignment.md`. Keep that filename.

## Resolve a profile for new work

For a new workflow, read [workflow-profiles.md](workflow-profiles.md) and run its workspace resolver against the approved ticket-workspace folder. When the session is inside one of that workspace's repository worktrees, use the enclosing `/worktrees/<work-item-slug>/` folder; without a ticket workspace, use the canonical repository root. Repository location does not imply a profile.

Proceed automatically only when one profile matches. If none or several match, ask the human to select or correct the configuration, then rerun with the explicit profile; explicit selection must still pass Git-root containment. Carry that selected profile through every later workspace/path validation.

Follow the selected vault's `AGENTS.md`, `CONTEXT.md`, and `README.md` instructions when present before reading or creating project material. Use the target validator in [workflow-profiles.md](workflow-profiles.md) immediately before reading each file; do not follow a symlinked instruction file.

## Find or create the work item

New Ship workflows live at:

```text
<vault>/projects/<project>/work/<work-item-slug>/
```

Use one established vault project directory name. Derive the work-item slug from the approved ticket-workspace folder when one exists. For approved ticketless work, use its stable human-recognizable workspace slug; do not invent a date prefix. Project and work-item names must be single safe path segments, with a lowercase hyphenated work-item slug. Ask when either is ambiguous.

Before every vault-native read, creation, or update, run the target validator from [workflow-profiles.md](workflow-profiles.md) against the exact operand. Scope work-item files with `--within projects/<project>/work/<work-item-slug>`; this rejects traversing links, symlinked parents or leaves, and non-regular files. Do not reuse an earlier validation after the filesystem changes.

Read the validated `projects/<project>/index.md` first when it exists. Then search only that project's work-item indexes by the current ticket or approved work-item slug, validating each candidate immediately before reading it and requiring its recorded workspace to match. Never reuse an item from workspace equality alone: several sequential ticketless items may share one repository root. Reuse one identity-and-workspace match and fail rather than guessing when several match. When no ticket or approved slug is known, ask which work item is current.

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

`Current` points to the document a fresh session should read after the index. It must be a canonical relative path inside the work item. Validate its target with the work item as `--within` immediately before reading it. Update the pointer when planning supersedes alignment or a handoff becomes the continuation entry point. This pointer is orientation, not a stage flag.

Keep discarded approaches, retained investigations, prototypes, temporary review aids, and handoffs under `working/`. Fresh sessions read only the vault instructions, project index, work-item index, its current document, and directly linked evidence. Do not ingest `working/` by default.

Keep workflow files current rather than transcript-like. Do not add a separate state file, duplicate repository copy, or another workflow system.
