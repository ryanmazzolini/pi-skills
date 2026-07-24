#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MAX_CONFIG_BYTES = 64 * 1024;
const MAX_PROFILES = 32;
const MAX_ROOTS = 32;
const MAX_PATH_BYTES = 4096;
const PROFILE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export class WorkflowProfileError extends Error {}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireBoundedString(value, label) {
  if (typeof value !== "string" || value.length === 0 || Buffer.byteLength(value, "utf8") > MAX_PATH_BYTES || value.includes("\0")) {
    throw new WorkflowProfileError(`${label} must be a non-empty path of at most ${MAX_PATH_BYTES} UTF-8 bytes.`);
  }
  return value;
}

export function expandHome(value, home, label = "Path") {
  if (value === "~") return home;
  if (value.startsWith("~/")) return path.join(home, value.slice(2));
  if (value.startsWith("~")) throw new WorkflowProfileError(`${label} uses unsupported home-relative syntax.`);
  return value;
}

function resolveConfigPath(configPath, env, home) {
  const configured = configPath ?? env.PI_SKILLS_WORKFLOW_CONFIG;
  if (configured) return path.resolve(expandHome(requireBoundedString(configured, "Configuration path"), home, "Configuration path"));
  const configHome = env.XDG_CONFIG_HOME
    ? path.resolve(expandHome(requireBoundedString(env.XDG_CONFIG_HOME, "XDG_CONFIG_HOME"), home, "XDG_CONFIG_HOME"))
    : path.join(home, ".config");
  return path.join(configHome, "pi-skills", "workflows.json");
}

function canonicalDirectory(value, label, home, accessMode) {
  const expanded = path.resolve(expandHome(requireBoundedString(value, label), home, label));
  let canonical;
  try {
    canonical = fs.realpathSync(expanded);
    if (!fs.statSync(canonical).isDirectory()) throw new Error("not a directory");
    fs.accessSync(canonical, accessMode);
  } catch {
    throw new WorkflowProfileError(`${label} is unavailable.`);
  }
  return canonical;
}

function pathIsInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function requireCanonicalRelativePath(value, label) {
  requireBoundedString(value, label);
  if (path.isAbsolute(value) || value.includes("\\")) {
    throw new WorkflowProfileError(`${label} must be a canonical relative path.`);
  }
  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..") || path.normalize(value) !== value) {
    throw new WorkflowProfileError(`${label} must be a canonical relative path.`);
  }
  return value;
}

function assertWorkspaceDisjoint(vault, workspace) {
  if (pathIsInside(vault, workspace) || pathIsInside(workspace, vault)) {
    throw new WorkflowProfileError("Workflow vault and workspace must be disjoint canonical directories.");
  }
}

function validateVaultTarget(vault, target, mode) {
  const relative = path.relative(vault, target);
  const segments = relative.split(path.sep);
  let current = vault;
  for (const [index, segment] of segments.entries()) {
    current = path.join(current, segment);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if (error?.code === "ENOENT" && mode === "write") return;
      throw new WorkflowProfileError("Vault target is unavailable.");
    }
    if (stat.isSymbolicLink()) throw new WorkflowProfileError("Vault target may not traverse symbolic links.");
    const leaf = index === segments.length - 1;
    if (leaf) {
      if (!stat.isFile()) throw new WorkflowProfileError("Vault target must be a regular file.");
    } else if (!stat.isDirectory()) {
      throw new WorkflowProfileError("Vault target parent must be a directory.");
    }
  }
}

function parseProfileValue(config) {
  if (!isPlainObject(config) || config.version !== 1 || !isPlainObject(config.profiles)) {
    throw new WorkflowProfileError("Workflow profile configuration must contain version 1 and a profiles object.");
  }

  const entries = Object.entries(config.profiles);
  if (entries.length === 0 || entries.length > MAX_PROFILES) {
    throw new WorkflowProfileError(`Workflow profile configuration must contain 1-${MAX_PROFILES} profiles.`);
  }

  const profiles = new Map();
  for (const [name, raw] of entries) {
    if (!PROFILE_NAME.test(name)) throw new WorkflowProfileError("Workflow configuration contains an invalid profile name.");
    if (!isPlainObject(raw)) throw new WorkflowProfileError(`Workflow profile ${JSON.stringify(name)} must be an object.`);
    const vault = requireBoundedString(raw.vault, `${name}.vault`);
    if (!Array.isArray(raw.gitRoots) || raw.gitRoots.length === 0 || raw.gitRoots.length > MAX_ROOTS) {
      throw new WorkflowProfileError(`${name}.gitRoots must contain 1-${MAX_ROOTS} paths.`);
    }
    const gitRoots = raw.gitRoots.map((root, index) => requireBoundedString(root, `${name}.gitRoots[${index}]`));
    profiles.set(name, { vault, gitRoots });
  }
  return profiles;
}

function parseProfiles(configPath) {
  let stat;
  try {
    stat = fs.statSync(configPath);
  } catch {
    throw new WorkflowProfileError("Workflow profile configuration was not found.");
  }
  if (!stat.isFile() || stat.size > MAX_CONFIG_BYTES) {
    throw new WorkflowProfileError(`Workflow profile configuration must be a file no larger than ${MAX_CONFIG_BYTES} bytes.`);
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    throw new WorkflowProfileError("Workflow profile configuration is not valid JSON.");
  }
  return parseProfileValue(config);
}

function normalizeProfile(name, raw, home, options) {
  const vaultMode = fs.constants.R_OK | fs.constants.X_OK | (options.writableVault ? fs.constants.W_OK : 0);
  const vault = canonicalDirectory(raw.vault, `${name}.vault`, home, vaultMode);
  if (!options.gitRoots) return { name, vault };
  return { name, vault, gitRoots: [...new Set(options.gitRoots)] };
}

function loadOptions(options) {
  const env = options.env ?? process.env;
  const homeValue = options.home ?? env.HOME;
  if (!homeValue) throw new WorkflowProfileError("Cannot resolve workflow profiles without a home directory.");
  const home = path.resolve(requireBoundedString(homeValue, "Home directory"));
  const configPath = resolveConfigPath(options.configPath, env, home);
  return { home, configPath, profiles: parseProfiles(configPath) };
}

function requireProfile(profiles, profileName) {
  if (!profileName || !PROFILE_NAME.test(profileName)) {
    throw new WorkflowProfileError(`Invalid workflow profile name: ${JSON.stringify(profileName)}`);
  }
  const profile = profiles.get(profileName);
  if (!profile) throw new WorkflowProfileError(`Unknown workflow profile: ${JSON.stringify(profileName)}`);
  return profile;
}

export function resolveNamedProfile(options) {
  const { home, profiles } = loadOptions(options);
  const raw = requireProfile(profiles, options.profileName);
  return { version: 1, profile: normalizeProfile(options.profileName, raw, home, { writableVault: false, gitRoots: false }) };
}

function doctorFailure(configPath, message) {
  return {
    version: 1,
    status: "error",
    configPath,
    profiles: [],
    diagnostics: [{ level: "error", message }],
  };
}

export function doctorWorkflowProfiles(options = {}) {
  const env = options.env ?? process.env;
  const homeValue = options.home ?? env.HOME;
  if (!homeValue) return doctorFailure(null, "Cannot inspect workflow profiles without a home directory.");

  let home;
  let configPath;
  try {
    home = path.resolve(requireBoundedString(homeValue, "Home directory"));
    configPath = resolveConfigPath(options.configPath, env, home);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return doctorFailure(null, message);
  }

  let configuredProfiles;
  try {
    configuredProfiles = parseProfiles(configPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return doctorFailure(configPath, message);
  }

  const profiles = [];
  const availableRoots = [];
  for (const [name, raw] of [...configuredProfiles].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) {
    const diagnostics = [];
    const vault = { configured: raw.vault, resolved: null, writable: false };
    try {
      vault.resolved = canonicalDirectory(
        raw.vault,
        `${name}.vault`,
        home,
        fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK,
      );
      vault.writable = true;
    } catch (error) {
      diagnostics.push({
        level: "error",
        message: `${name}.vault is unavailable or not writable.`,
      });
    }

    const gitRoots = raw.gitRoots.map((configured, index) => {
      try {
        const resolved = canonicalDirectory(
          configured,
          `${name}.gitRoots[${index}]`,
          home,
          fs.constants.R_OK | fs.constants.X_OK,
        );
        availableRoots.push({ profile: name, root: resolved });
        return { configured, resolved, available: true };
      } catch {
        return { configured, resolved: null, available: false };
      }
    });
    const usableRoots = new Set(gitRoots.filter((root) => root.available).map((root) => root.resolved));
    if (usableRoots.size === 0) {
      diagnostics.push({ level: "error", message: `${name} has no usable Git root.` });
    } else {
      for (const root of gitRoots.filter((candidate) => !candidate.available)) {
        diagnostics.push({
          level: "warning",
          message: `${name} has an additional unavailable Git root: ${JSON.stringify(root.configured)}.`,
        });
      }
    }

    profiles.push({
      name,
      status: diagnostics.some((diagnostic) => diagnostic.level === "error") ? "error" : "ok",
      vault,
      gitRoots,
      diagnostics,
    });
  }

  const diagnostics = [];
  const overlappingProfilePairs = new Set();
  const uniqueRoots = [...new Map(availableRoots.map((entry) => [`${entry.profile}\0${entry.root}`, entry])).values()];
  for (let leftIndex = 0; leftIndex < uniqueRoots.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < uniqueRoots.length; rightIndex += 1) {
      const left = uniqueRoots[leftIndex];
      const right = uniqueRoots[rightIndex];
      if (left.profile === right.profile) continue;
      if (!pathIsInside(left.root, right.root) && !pathIsInside(right.root, left.root)) continue;
      const pair = [left.profile, right.profile].sort();
      const pairKey = pair.join("\0");
      if (overlappingProfilePairs.has(pairKey)) continue;
      overlappingProfilePairs.add(pairKey);
      diagnostics.push({
        level: "warning",
        message: `Git roots for profiles ${JSON.stringify(pair[0])} and ${JSON.stringify(pair[1])} overlap; matching workspaces require explicit profile selection.`,
      });
    }
  }

  let workspace;
  if (options.cwd !== undefined) {
    try {
      const resolved = resolveWorkspaceProfile({ ...options, cwd: options.cwd });
      workspace = {
        status: "ok",
        path: resolved.workspace,
        profile: resolved.profile.name,
        matchedGitRoot: resolved.matchedGitRoot,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      workspace = { status: "error", message };
    }
  }

  const hasErrors = profiles.some((profile) => profile.status === "error") || workspace?.status === "error";
  return {
    version: 1,
    status: hasErrors ? "error" : "ok",
    configPath,
    profiles,
    diagnostics,
    ...(workspace ? { workspace } : {}),
  };
}

export function resolveVaultPath(options) {
  if (options.mode !== "read" && options.mode !== "write") {
    throw new WorkflowProfileError("Vault path mode must be read or write.");
  }
  let context;
  if (options.cwd !== undefined) {
    context = resolveWorkspaceProfile(options);
  } else {
    if (options.mode === "write") throw new WorkflowProfileError("Vault writes require --cwd workspace validation.");
    context = resolveNamedProfile(options);
  }
  const within = options.within === undefined
    ? context.profile.vault
    : path.resolve(context.profile.vault, requireCanonicalRelativePath(options.within, "Vault scope"));
  if (!pathIsInside(context.profile.vault, within)) throw new WorkflowProfileError("Vault scope resolves outside the configured vault.");
  const relativeTarget = requireCanonicalRelativePath(options.target, "Vault target");
  const target = path.resolve(within, relativeTarget);
  if (!pathIsInside(within, target) || !pathIsInside(context.profile.vault, target)) {
    throw new WorkflowProfileError("Vault target resolves outside its allowed scope.");
  }
  validateVaultTarget(context.profile.vault, target, options.mode);
  return { ...context, mode: options.mode, within, target };
}

export function resolveWorkspaceProfile(options) {
  const { home, profiles } = loadOptions(options);
  const workspace = canonicalDirectory(options.cwd, "Workspace", home, fs.constants.R_OK | fs.constants.X_OK);

  if (options.profileName !== undefined) {
    const raw = requireProfile(profiles, options.profileName);
    const gitRoots = [];
    for (const [index, root] of raw.gitRoots.entries()) {
      try {
        gitRoots.push(canonicalDirectory(root, `${options.profileName}.gitRoots[${index}]`, home, fs.constants.R_OK | fs.constants.X_OK));
      } catch {
        // Workspace routing can use another configured root that is available on this host.
      }
    }
    const matches = [...new Set(gitRoots)].filter((root) => pathIsInside(root, workspace)).sort((a, b) => b.length - a.length);
    if (matches.length === 0) {
      throw new WorkflowProfileError(`Workflow profile ${JSON.stringify(options.profileName)} has no available Git root containing workspace ${JSON.stringify(workspace)}.`);
    }
    const profile = normalizeProfile(options.profileName, raw, home, { writableVault: true, gitRoots });
    assertWorkspaceDisjoint(profile.vault, workspace);
    return { version: 1, profile, workspace, matchedGitRoot: matches[0] };
  }

  const matches = [];
  const unavailable = [];
  for (const [name, raw] of profiles) {
    const gitRoots = [];
    let hasUnavailableRoot = false;
    for (const [index, root] of raw.gitRoots.entries()) {
      try {
        gitRoots.push(canonicalDirectory(root, `${name}.gitRoots[${index}]`, home, fs.constants.R_OK | fs.constants.X_OK));
      } catch {
        hasUnavailableRoot = true;
      }
    }
    const roots = [...new Set(gitRoots)].filter((root) => pathIsInside(root, workspace)).sort((a, b) => b.length - a.length);
    if (roots.length > 0) matches.push({ name, raw, gitRoots, matchedGitRoot: roots[0] });
    else if (hasUnavailableRoot) unavailable.push(name);
  }

  if (matches.length === 0) {
    const suffix = unavailable.length > 0 ? ` Unavailable profiles: ${unavailable.sort().join(", ")}.` : "";
    throw new WorkflowProfileError(`No workflow profile matches workspace ${JSON.stringify(workspace)}.${suffix}`);
  }
  if (matches.length > 1) {
    throw new WorkflowProfileError(`Workspace matches multiple workflow profiles: ${matches.map((match) => match.name).sort().join(", ")}. Rerun with --profile after human selection.`);
  }

  const match = matches[0];
  const profile = normalizeProfile(match.name, match.raw, home, { writableVault: true, gitRoots: match.gitRoots });
  assertWorkspaceDisjoint(profile.vault, workspace);
  return { version: 1, profile, workspace, matchedGitRoot: match.matchedGitRoot };
}

function parseArguments(argv) {
  const command = argv[0];
  const allowedOptions = {
    workspace: new Set(["--cwd", "--profile", "--config"]),
    profile: new Set(["--profile", "--config"]),
    doctor: new Set(["--cwd", "--config"]),
    path: new Set(["--cwd", "--profile", "--config", "--target", "--within", "--mode"]),
  };
  const allowed = allowedOptions[command];
  if (!allowed) {
    throw new WorkflowProfileError("Usage: workflow-profile.mjs workspace [--cwd PATH] [--profile NAME] [--config PATH] | profile --profile NAME [--config PATH] | doctor [--cwd PATH] [--config PATH] | path (--cwd PATH [--profile NAME] | --profile NAME) --target PATH --mode read|write [--within PATH] [--config PATH]");
  }
  const options = {};
  const seen = new Set();
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) throw new WorkflowProfileError(`Unknown option: ${argument}`);
    if (!allowed.has(argument)) throw new WorkflowProfileError(`${argument} is not valid for ${command}.`);
    if (seen.has(argument)) throw new WorkflowProfileError(`Duplicate option: ${argument}`);
    seen.add(argument);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new WorkflowProfileError(`${argument} requires a value.`);
    index += 1;
    if (argument === "--cwd") options.cwd = value;
    else if (argument === "--profile") options.profileName = value;
    else if (argument === "--config") options.configPath = value;
    else if (argument === "--target") options.target = value;
    else if (argument === "--within") options.within = value;
    else options.mode = value;
  }
  if (command === "profile" && !options.profileName) throw new WorkflowProfileError("profile requires --profile NAME.");
  if (command === "path" && !options.target) throw new WorkflowProfileError("path requires --target PATH.");
  if (command === "path" && !options.mode) throw new WorkflowProfileError("path requires --mode read|write.");
  if (command === "path" && options.cwd === undefined && options.profileName === undefined) {
    throw new WorkflowProfileError("path requires --cwd for workspace access or --profile for profile-scoped reads.");
  }
  return { command, options };
}

function main() {
  try {
    const { command, options } = parseArguments(process.argv.slice(2));
    const result = command === "workspace"
      ? resolveWorkspaceProfile({ ...options, cwd: options.cwd ?? process.cwd() })
      : command === "profile"
        ? resolveNamedProfile(options)
        : command === "doctor"
          ? doctorWorkflowProfiles(options)
          : resolveVaultPath(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (command === "doctor" && result.status === "error") process.exitCode = 1;
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const message = Buffer.byteLength(rawMessage, "utf8") <= 4096
      ? rawMessage
      : "Workflow profile request failed with an oversized diagnostic.";
    process.stderr.write(`Workflow profile error: ${message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
