#!/usr/bin/env node

import { createHash } from "node:crypto";
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

function readableProfiles(home, profiles) {
  const available = [];
  const unavailable = [];
  for (const [name, raw] of [...profiles].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) {
    try {
      available.push(normalizeProfile(name, raw, home, { writableVault: false, gitRoots: false }));
    } catch (error) {
      if (!(error instanceof WorkflowProfileError)) throw error;
      unavailable.push(name);
    }
  }
  return { version: 1, profiles: available, unavailable };
}

export function resolveReadableProfiles(options) {
  const { home, profiles } = loadOptions(options);
  return readableProfiles(home, profiles);
}

function canonicalCreationTarget(rawTarget) {
  let current = rawTarget;
  const missing = [];
  while (true) {
    try {
      const stat = fs.lstatSync(current);
      if (missing.length === 0) {
        throw new WorkflowProfileError("Workflow configuration already exists and was preserved.");
      }
      const canonical = fs.realpathSync(current);
      if (!fs.statSync(canonical).isDirectory()) {
        throw new WorkflowProfileError("Workflow configuration parent must be a directory.");
      }
      return path.join(canonical, ...missing);
    } catch (error) {
      if (error instanceof WorkflowProfileError) throw error;
      if (error?.code !== "ENOENT") throw new WorkflowProfileError("Workflow configuration path is unavailable.");
      const parent = path.dirname(current);
      if (parent === current) throw new WorkflowProfileError("Workflow configuration path has no available parent.");
      missing.unshift(path.basename(current));
      current = parent;
    }
  }
}

function configParentFingerprint(target) {
  const parent = path.dirname(target);
  const root = path.parse(parent).root;
  const parts = [];
  let current = root;
  const rootStat = fs.lstatSync(root, { bigint: true });
  parts.push(`${root}:${rootStat.dev}:${rootStat.ino}`);
  let missing = false;
  for (const segment of path.relative(root, parent).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (missing) {
      parts.push(`${current}:missing`);
      continue;
    }
    try {
      const stat = fs.lstatSync(current, { bigint: true });
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new WorkflowProfileError("Workflow configuration parent must contain only real directories.");
      }
      parts.push(`${current}:${stat.dev}:${stat.ino}`);
    } catch (error) {
      if (error instanceof WorkflowProfileError) throw error;
      if (error?.code !== "ENOENT") throw new WorkflowProfileError("Workflow configuration parent is unavailable.");
      missing = true;
      parts.push(`${current}:missing`);
    }
  }
  return parts.join("\0");
}

function setupInputs(options) {
  const env = options.env ?? process.env;
  const homeValue = options.home ?? env.HOME;
  if (!homeValue) throw new WorkflowProfileError("Cannot prepare workflow configuration without a home directory.");
  const home = path.resolve(requireBoundedString(homeValue, "Home directory"));
  const profileName = options.profileName;
  if (!profileName || !PROFILE_NAME.test(profileName)) {
    throw new WorkflowProfileError(`Invalid workflow profile name: ${JSON.stringify(profileName)}`);
  }
  const vault = requireBoundedString(options.vault, "Profile vault");
  const gitRoots = options.gitRoots;
  if (!Array.isArray(gitRoots) || gitRoots.length === 0 || gitRoots.length > MAX_ROOTS) {
    throw new WorkflowProfileError(`Profile Git roots must contain 1-${MAX_ROOTS} paths.`);
  }
  const roots = gitRoots.map((root, index) => requireBoundedString(root, `Profile Git root ${index + 1}`));
  const canonicalVault = canonicalDirectory(vault, "Profile vault", home, fs.constants.R_OK | fs.constants.X_OK);
  const canonicalRoots = [...new Set(roots.map((root, index) =>
    canonicalDirectory(root, `Profile Git root ${index + 1}`, home, fs.constants.R_OK | fs.constants.X_OK)))];
  const target = canonicalCreationTarget(resolveConfigPath(options.configPath, env, home));
  const content = `${JSON.stringify({
    version: 1,
    profiles: { [profileName]: { vault: canonicalVault, gitRoots: canonicalRoots } },
  }, null, 2)}\n`;
  if (Buffer.byteLength(content, "utf8") > MAX_CONFIG_BYTES) {
    throw new WorkflowProfileError(`Proposed workflow configuration exceeds ${MAX_CONFIG_BYTES} bytes.`);
  }
  const parentFingerprint = configParentFingerprint(target);
  const digest = createHash("sha256")
    .update(target)
    .update("\0")
    .update(content)
    .update("\0")
    .update(parentFingerprint)
    .digest("hex");
  return { home, target, content, digest, parentFingerprint };
}

function captureSafeConfigParents(target) {
  const parent = path.dirname(target);
  const root = path.parse(parent).root;
  const identities = [];
  let current = root;
  for (const segment of path.relative(root, parent).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      const stat = fs.lstatSync(current, { bigint: true });
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new WorkflowProfileError("Workflow configuration parent must contain only real directories.");
      }
    } catch (error) {
      if (error instanceof WorkflowProfileError) throw error;
      if (error?.code !== "ENOENT") throw new WorkflowProfileError("Workflow configuration parent is unavailable.");
      try {
        fs.mkdirSync(current, { mode: 0o700 });
      } catch (mkdirError) {
        if (mkdirError?.code !== "EEXIST") throw new WorkflowProfileError("Workflow configuration parent could not be created.");
      }
    }
    const verified = fs.lstatSync(current, { bigint: true });
    if (verified.isSymbolicLink() || !verified.isDirectory()) {
      throw new WorkflowProfileError("Workflow configuration parent must contain only real directories.");
    }
    identities.push({ path: current, dev: verified.dev, ino: verified.ino });
  }
  return identities;
}

function requireUnchangedConfigParents(identities) {
  for (const identity of identities) {
    let current;
    try {
      current = fs.lstatSync(identity.path, { bigint: true });
    } catch {
      throw new WorkflowProfileError("Workflow configuration parent changed during creation.");
    }
    if (
      current.isSymbolicLink()
      || !current.isDirectory()
      || current.dev !== identity.dev
      || current.ino !== identity.ino
    ) {
      throw new WorkflowProfileError("Workflow configuration parent changed during creation.");
    }
  }
}

function readDescriptor(descriptor, size) {
  const content = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    const count = fs.readSync(descriptor, content, offset, size - offset, offset);
    if (count === 0) break;
    offset += count;
  }
  if (offset !== size) throw new WorkflowProfileError("Workflow configuration created bytes could not be verified.");
  return content;
}

function configProposal(inputs) {
  return {
    version: 1,
    action: "create-workflow-config",
    target: inputs.target,
    digest: inputs.digest,
    content: inputs.content,
  };
}

export function prepareWorkflowConfig(options) {
  return configProposal(setupInputs(options));
}

export function createWorkflowConfig(options) {
  if ((options.platform ?? process.platform) === "win32") {
    throw new WorkflowProfileError("Secure workflow configuration creation is unavailable on Windows; create and review the file manually.");
  }
  if (typeof fs.constants.O_NOFOLLOW !== "number") {
    throw new WorkflowProfileError("Secure workflow configuration creation is unavailable on this platform.");
  }
  const inputs = setupInputs(options);
  const proposal = configProposal(inputs);
  if (typeof options.confirmDigest !== "string" || !/^[a-f0-9]{64}$/.test(options.confirmDigest)) {
    throw new WorkflowProfileError("Workflow configuration creation requires the reviewed proposal digest.");
  }
  if (options.confirmDigest !== proposal.digest) {
    throw new WorkflowProfileError("Workflow configuration proposal changed; review and confirm a fresh proposal.");
  }
  if (configParentFingerprint(proposal.target) !== inputs.parentFingerprint) {
    throw new WorkflowProfileError("Workflow configuration parent changed; review and confirm a fresh proposal.");
  }
  const parentIdentities = captureSafeConfigParents(proposal.target);
  let descriptor;
  try {
    descriptor = fs.openSync(
      proposal.target,
      fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW,
      0o600,
    );
    fs.fchmodSync(descriptor, 0o600);
    fs.writeFileSync(descriptor, proposal.content, "utf8");
    fs.fsyncSync(descriptor);

    const created = fs.fstatSync(descriptor, { bigint: true });
    const expectedBytes = Buffer.byteLength(proposal.content, "utf8");
    if (!created.isFile() || created.size !== BigInt(expectedBytes) || (created.mode & 0o777n) !== 0o600n) {
      throw new WorkflowProfileError("Workflow configuration created identity or permissions could not be verified.");
    }
    requireUnchangedConfigParents(parentIdentities);
    const advertised = fs.lstatSync(proposal.target, { bigint: true });
    if (advertised.isSymbolicLink() || advertised.dev !== created.dev || advertised.ino !== created.ino) {
      throw new WorkflowProfileError("Workflow configuration path changed during creation.");
    }

    const createdBytes = readDescriptor(descriptor, expectedBytes);
    const expectedContent = Buffer.from(proposal.content, "utf8");
    if (!createdBytes.equals(expectedContent)) {
      throw new WorkflowProfileError("Workflow configuration created bytes do not match the reviewed proposal.");
    }
    let parsed;
    try {
      parsed = JSON.parse(createdBytes.toString("utf8"));
    } catch {
      throw new WorkflowProfileError("Workflow configuration created bytes are not valid JSON.");
    }
    const discovered = readableProfiles(inputs.home, parseProfileValue(parsed));

    requireUnchangedConfigParents(parentIdentities);
    const finalPath = fs.lstatSync(proposal.target, { bigint: true });
    if (finalPath.isSymbolicLink() || finalPath.dev !== created.dev || finalPath.ino !== created.ino) {
      throw new WorkflowProfileError("Workflow configuration path changed during validation.");
    }
    return { ...proposal, created: true, profiles: discovered.profiles, unavailable: discovered.unavailable };
  } catch (error) {
    if (descriptor === undefined && (error?.code === "EEXIST" || error?.code === "ELOOP")) {
      throw new WorkflowProfileError("Workflow configuration now exists; it was preserved and requires a fresh review.");
    }
    const message = error instanceof Error ? error.message : String(error);
    if (descriptor !== undefined) {
      throw new WorkflowProfileError(`Workflow configuration was created but validation failed: ${message}`);
    }
    if (error instanceof WorkflowProfileError) throw error;
    throw new WorkflowProfileError("Workflow configuration could not be created safely; any created entry was preserved for review.");
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
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
    profiles: new Set(["--config"]),
    path: new Set(["--cwd", "--profile", "--config", "--target", "--within", "--mode"]),
    setup: new Set(["--profile", "--vault", "--git-root", "--confirm", "--config"]),
  };
  const allowed = allowedOptions[command];
  if (!allowed) {
    throw new WorkflowProfileError("Usage: workflow-profile.mjs workspace [--cwd PATH] [--profile NAME] [--config PATH] | profile --profile NAME [--config PATH] | profiles [--config PATH] | path (--cwd PATH [--profile NAME] | --profile NAME) --target PATH --mode read|write [--within PATH] [--config PATH] | setup --profile NAME --vault PATH --git-root PATH [--git-root PATH...] [--confirm DIGEST] [--config PATH]");
  }
  const options = {};
  const seen = new Set();
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) throw new WorkflowProfileError(`Unknown option: ${argument}`);
    if (!allowed.has(argument)) throw new WorkflowProfileError(`${argument} is not valid for ${command}.`);
    if (seen.has(argument) && !(command === "setup" && argument === "--git-root")) {
      throw new WorkflowProfileError(`Duplicate option: ${argument}`);
    }
    seen.add(argument);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new WorkflowProfileError(`${argument} requires a value.`);
    index += 1;
    if (argument === "--cwd") options.cwd = value;
    else if (argument === "--profile") options.profileName = value;
    else if (argument === "--config") options.configPath = value;
    else if (argument === "--target") options.target = value;
    else if (argument === "--within") options.within = value;
    else if (argument === "--mode") options.mode = value;
    else if (argument === "--vault") options.vault = value;
    else if (argument === "--git-root") options.gitRoots = [...(options.gitRoots ?? []), value];
    else options.confirmDigest = value;
  }
  if (command === "profile" && !options.profileName) throw new WorkflowProfileError("profile requires --profile NAME.");
  if (command === "path" && !options.target) throw new WorkflowProfileError("path requires --target PATH.");
  if (command === "path" && !options.mode) throw new WorkflowProfileError("path requires --mode read|write.");
  if (command === "path" && options.cwd === undefined && options.profileName === undefined) {
    throw new WorkflowProfileError("path requires --cwd for workspace access or --profile for profile-scoped reads.");
  }
  if (command === "setup" && (!options.profileName || !options.vault || !options.gitRoots?.length)) {
    throw new WorkflowProfileError("setup requires --profile NAME, --vault PATH, and at least one --git-root PATH.");
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
        : command === "profiles"
          ? resolveReadableProfiles(options)
        : command === "path"
          ? resolveVaultPath(options)
          : options.confirmDigest
            ? createWorkflowConfig(options)
            : prepareWorkflowConfig(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
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
