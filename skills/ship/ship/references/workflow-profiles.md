# Workflow Profiles

Host-local profiles map project workspaces to the notes vault that owns their durable work. Read the routing data and check filesystem paths with ordinary file tools. Profiles locate material; they do not grant authority or isolate it.

## Read or edit the configuration

Use `PI_SKILLS_WORKFLOW_CONFIG` when set. Otherwise use `$XDG_CONFIG_HOME/pi-skills/workflows.json`, defaulting to `~/.config/pi-skills/workflows.json` when `XDG_CONFIG_HOME` is unset. Expand only `~` itself or a leading `~/` using the user's home directory; other leading-tilde syntax is unsupported. Resolve relative paths against the current working directory.

Read an existing file before editing it. Keep version 1 JSON within 64 KiB, with 1–32 named profiles in a `profiles` object. Names contain 1–64 ASCII letters, digits, `_` or `-`, starting with a letter or digit. Each profile contains a `vault` path and a `gitRoots` array of 1–32 paths. Paths are non-empty strings without NUL characters, at most 4096 UTF-8 bytes each:

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

Keep host-specific paths here rather than in skills or repositories. Do not store credentials in this file. Malformed JSON or profile structure needs correction before routing. Preserve profiles outside the requested change. Create or repair the file directly when the intended routing is established; ask when the profile or paths are unclear.

## Select a vault for a workspace

1. Resolve the workspace and configured paths to canonical filesystem locations, expanding home-relative paths first. A Git root is usable when it is an existing readable directory. An unavailable optional root does not hide another usable root.
2. Find every profile with a usable Git root containing the canonical workspace. Compare directory boundaries: `/repos/app` is not inside `/repos/apple`. Several matching roots within one profile still count as one profile match.
3. Use the unique matching profile. If none or several match, ask the human to correct the routing or select a profile; do not infer one from a repository name or choose the longest root across profiles. An explicitly selected profile must still contain the workspace within one of its usable Git roots.
4. Confirm that the selected vault is an existing readable directory, and writable before a write. Resolve a configured vault alias to its canonical directory. Refuse a vault and workspace that are equal or contain one another.

Keep the selected profile and canonical vault with the work-item context. Recheck selection after a routing or relevant filesystem change. An unavailable unrelated profile does not prevent using the selected profile.

## Read an explicitly named profile

A read-only caller with an explicit profile and vault-relative pointer may resolve that profile's vault without a workspace or available Git roots. This supports optional evidence lookup such as a First Mate escalation. Require a known profile and a readable vault; do not broaden the search when either is unavailable. Profile-only lookup does not authorize writes.

## Check a vault target

Apply these checks to instruction files, work-item indexes, `Current` pointers, artifacts and other vault material before using ordinary file tools:

- Interpret the target relative to the selected canonical vault, or to the established work-item directory for work-item files. Require canonical relative paths: no absolute paths, `.` or `..` segments, empty segments or backslash separators.
- Keep the resulting path inside both the vault and its requested scope. Check existing parents and the leaf; do not traverse symlinks below the canonical vault or follow a symlinked file. Parents must be directories and an existing file target must be a regular file.
- For a read, require an existing file. For a new write target, verify its existing parents before creating missing directories or the file. Writes require the workspace/profile validation above, not just a named-profile lookup.
- Recheck after a relevant routing or filesystem change. If a target escapes its scope, is unavailable or cannot be verified, stop and ask for the smallest correction instead of trying another vault.

These checks catch routing mistakes; they are not an atomic filesystem or authorization boundary. Keep existing approval, ownership and legacy-workflow rules in force.
