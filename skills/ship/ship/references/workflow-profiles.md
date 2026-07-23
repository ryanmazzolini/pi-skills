# Workflow Profiles

Ship uses an explicit local profile to route each new durable workflow to one notes vault. Repository location alone does not imply work or personal scope.

## Configuration

The default file is `~/.config/pi-skills/workflows.json`. `PI_SKILLS_WORKFLOW_CONFIG` selects another file. Start from [`../assets/workflows.example.json`](../assets/workflows.example.json).

```json
{
  "version": 1,
  "profiles": {
    "personal": {
      "vault": "~/personal/notes",
      "gitRoots": ["~/personal"]
    }
  }
}
```

Each profile requires:

- `vault`: the existing notes vault that owns new Ship work items
- `gitRoots`: one or more roots allowed to contain that profile's repositories and ticket workspaces; workspace routing needs one matching root available on the current host

Paths may start with `~/`. Keep host-specific paths here rather than in skills or repositories. Do not store credentials in this file.

When the effective configuration path is absent, `/skill:first-mate` can guide optional initial setup. The helper produces a non-mutating proposal from one profile name, an existing vault, and one or more existing Git roots:

```bash
node scripts/workflow-profile.mjs setup \
  --profile personal \
  --vault /absolute/vault \
  --git-root /absolute/git-root
```

The result contains canonical absolute vault and Git-root paths, the effective target, complete JSON content, and a digest binding that content and its resolved parent identity to the target. After showing those exact values and receiving confirmation, rerun the same arguments with `--confirm DIGEST`. On supported POSIX hosts, the helper revalidates inputs, rejects changed proposals or existing targets, detects changed parent identity, creates missing real parent directories, exclusively creates and verifies a user-only file, and validates the exact created bytes and file identity. It preserves any entry that appeared or failed validation. Automatic secure creation is unavailable on Windows; use the reviewed proposal for manual setup instead. Existing invalid or unreadable configuration requires a separate reviewed repair and is never treated as first-use setup.

If setup is deferred or no profile is readable, First Mate remains explicitly `workflow-unbound`. It may inventory connected peers and perform exact human-requested, non-authoritative Intercom coordination against a full ID from a fresh snapshot, but it does not read vault evidence, infer work-item authority, relay decisions, or create durable capture.

## Resolve a workspace

Resolve the script path relative to the `ship` skill directory, then run:

```bash
node scripts/workflow-profile.mjs workspace --cwd /absolute/workspace
```

A unique match returns canonical JSON containing the profile, vault, workspace, and matched Git root. When zero or several profiles match, ask the human to select or correct the configuration. After explicit selection, rerun:

```bash
node scripts/workflow-profile.mjs workspace --cwd /absolute/workspace --profile personal
```

Explicit selection disambiguates only. The workspace must still resolve inside that profile's configured Git roots.

## Resolve profile-scoped readers

A profile-scoped read-only role does not own a project workspace. Resolve one selected profile with:

```bash
node scripts/workflow-profile.mjs profile --profile personal
```

A combined read-only role such as First Mate discovers every readable profile with:

```bash
node scripts/workflow-profile.mjs profiles
```

The combined form returns sorted canonical `profiles` and sorted `unavailable` profile names. Both forms require only readable vaults; temporarily unavailable Git roots do not block profile-scoped startup. Workspace routing uses the available roots, requires one to contain the workspace, and additionally requires the selected vault to be writable. Other configured roots may be unavailable on the current host.

## Validate every vault target

Treat every supplied workflow path, index link, and child filename as a locator rather than authority. Immediately before each vault-native read or write, use `path` to resolve the actual target again.

For workspace-owned access:

```bash
node scripts/workflow-profile.mjs path \
  --cwd /absolute/workspace \
  --profile personal \
  --within projects/pi-skills/work/sample-work \
  --target index.md \
  --mode read
```

`--within` is a canonical vault-relative scope. `--target` is relative to that scope and cannot be absolute, traverse with `..`, or escape through a symlink. Omit `--within` for a vault-root file such as `AGENTS.md`. Repeat `--profile` on every later workspace/path command when the human selected it to resolve an ambiguous workspace; omit it only when automatic workspace resolution remains unique. Use `--mode write` immediately before creating or updating a file; writes require `--cwd` so profile-only readers cannot mutate a vault.

A profile-scoped reader may validate an existing file with `--profile NAME --mode read`. The helper returns the canonical target only after every existing component is a real directory and the leaf is a regular file. A missing write leaf is allowed after its existing parents pass validation.

## Failure behavior

The helper fails without guessing when configuration is missing, invalid, unreadable, or oversized; a selected path is unavailable; vault and workspace overlap; a symlink escapes a configured boundary; a workspace has no unique match; an operand leaves its allowed scope; or explicit selection conflicts with workspace containment. It rejects duplicate options and options that do not apply to the selected command. An unavailable unrelated profile does not prevent explicit use of an available profile or discovery of the other readable profiles.

A profile-discovery failure limits profile-scoped access rather than Intercom itself. Preserve an existing configuration and correct it through a separate reviewed change; do not make first-use setup overwrite it.
