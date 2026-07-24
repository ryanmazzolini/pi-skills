# Workflow Profiles

Ship uses host-local workflow profiles to route a project workspace to the notes vault that owns its durable work. Profiles are routing data, not authorization or isolation.

## Create or edit the configuration

The default file is `~/.config/pi-skills/workflows.json`. `PI_SKILLS_WORKFLOW_CONFIG` selects another file. An LLM may create or edit the complete version 1 JSON with ordinary file tools. Read an existing file first and preserve profiles the user did not ask to change.

```json
{
  "version": 1,
  "profiles": {
    "work": {
      "vault": "~/work-notes",
      "gitRoots": ["~/git"]
    },
    "personal": {
      "vault": "~/personal/notes",
      "gitRoots": ["~/personal"]
    }
  }
}
```

Each profile requires an existing writable `vault` and one or more `gitRoots`. Paths may start with `~/`. Keep host-specific paths here rather than in skills or repositories, and do not store credentials in this file.

After creating or editing the file, resolve the script from the installed Ship skill directory and run doctor:

```bash
node "<ship-skill-dir>/scripts/workflow-profile.mjs" doctor
node "<ship-skill-dir>/scripts/workflow-profile.mjs" doctor --cwd /absolute/workspace
```

Use `--config PATH` with either command when the environment does not select the intended file. Doctor is read-only and emits JSON. Malformed configuration, an unavailable or unwritable vault, a profile with no usable Git root, or a failed current-workspace route returns a nonzero exit. Additional unavailable roots and overlapping roots are warnings; an available root may still keep the profile usable. Correct deterministic errors and rerun doctor. Ask the user when the intended profile, vault, or ambiguous route is unclear.

## Resolve a workspace

Resolve the script path relative to the Ship skill directory, then run:

```bash
node "<ship-skill-dir>/scripts/workflow-profile.mjs" workspace --cwd /absolute/workspace
```

A unique match returns canonical JSON containing the profile, vault, workspace, and matched Git root. When zero or several profiles match, ask the human to select or correct the configuration. After explicit selection, rerun:

```bash
node "<ship-skill-dir>/scripts/workflow-profile.mjs" workspace \
  --cwd /absolute/workspace \
  --profile personal
```

Explicit selection disambiguates only. The workspace must still resolve inside that profile's configured Git roots. Overlapping roots are allowed because some repositories may need explicit selection.

## Resolve a profile-scoped read

A read-only caller that already has an explicit profile can resolve its vault without a project workspace:

```bash
node "<ship-skill-dir>/scripts/workflow-profile.mjs" profile --profile personal
```

This supports optional evidence lookup such as a First Mate request with an explicit vault-relative work-item pointer. It does not grant authority or permit vault writes.

## Resolve a vault target

Use `path` to turn a model- or document-supplied vault-relative path into a deterministic target under the selected profile:

```bash
node "<ship-skill-dir>/scripts/workflow-profile.mjs" path \
  --cwd /absolute/workspace \
  --profile personal \
  --within projects/pi-skills/work/sample-work \
  --target index.md \
  --mode read
```

`--within` scopes the target to one canonical vault-relative directory. The helper rejects absolute paths, traversal, symlink escapes, and non-file read targets. A missing write target is allowed after its existing parents pass resolution. Omit `--within` for a vault-root file such as `AGENTS.md`.

Workspace-owned reads and writes use `--cwd`; writes require it. A profile-scoped caller may use `--profile NAME --mode read` without a workspace. Repeat an explicitly selected profile when resolving later workspace-owned targets so overlapping roots do not become ambiguous again.

Run target resolution close to the filesystem operation so the returned path reflects current routing. It catches deterministic path mistakes; it is not an atomic filesystem or authorization boundary.

## Failure behavior

Malformed JSON or profile structure invalidates the whole document. Filesystem availability is diagnosed per profile: an unavailable optional root does not hide another usable root, but an unavailable vault or zero usable roots makes that profile inoperable on the current host.

The helper fails rather than guessing when a profile is unknown, a workspace has no unique route, vault and workspace overlap, or a target leaves its allowed scope. Preserve an existing configuration during repair, change only the intended profiles, and rerun doctor afterward.
