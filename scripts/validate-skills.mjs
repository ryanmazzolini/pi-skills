#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { loadSkillsFromDir, parseFrontmatter } from "@earendil-works/pi-coding-agent";

const root = process.cwd();
const skillsDir = path.join(root, "skills");
const marketplacePath = path.join(root, ".claude-plugin", "marketplace.json");
const errors = [];

function fail(message) {
  errors.push(message);
}

async function findFiles(dir, matches) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findFiles(fullPath, matches));
    } else if (entry.isFile() && matches(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

function frontmatterLines(text, file) {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== "---") {
    fail(`${file}: missing opening frontmatter delimiter`);
    return [];
  }

  const end = lines.findIndex((line, index) => index > 0 && line === "---");
  if (end === -1) {
    fail(`${file}: missing closing frontmatter delimiter`);
    return [];
  }

  return lines.slice(1, end);
}

function isQuoted(value) {
  const trimmed = value.trim();
  return (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"));
}

function validateRawYamlFootguns(file, lines) {
  for (const line of lines) {
    const match = line.match(/^([a-zA-Z0-9_-]+):\s+(.+)$/);
    if (!match) continue;

    const [, key, value] = match;
    if (key === "name" && !isQuoted(value)) {
      fail(`${file}: quote frontmatter value for "name"`);
      continue;
    }
    if (key === "disable-model-invocation") continue;
    if (isQuoted(value)) continue;

    if (/:\s/.test(value) || /\s#/.test(value)) {
      fail(`${file}: quote frontmatter value for "${key}"; unquoted YAML scalars with colon-space or comments are fragile`);
    }
  }
}

function validateSkillFile(file) {
  const text = readFileSync(file, "utf8");
  const lines = frontmatterLines(text, file);
  validateRawYamlFootguns(file, lines);

  let frontmatter;
  try {
    ({ frontmatter } = parseFrontmatter(text));
  } catch (error) {
    fail(`${file}: invalid frontmatter: ${error.message}`);
    return;
  }

  const parent = path.basename(path.dirname(file));
  if (typeof frontmatter.name !== "string" || frontmatter.name.length === 0) {
    fail(`${file}: frontmatter.name must be a non-empty string`);
  } else if (frontmatter.name !== parent) {
    fail(`${file}: frontmatter.name "${frontmatter.name}" must match parent directory "${parent}"`);
  } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(frontmatter.name)) {
    fail(`${file}: frontmatter.name must be lowercase kebab-case`);
  }

  if (typeof frontmatter.description !== "string" || frontmatter.description.trim().length === 0) {
    fail(`${file}: frontmatter.description must be a non-empty string`);
  } else if (frontmatter.description.length > 1024) {
    fail(`${file}: frontmatter.description exceeds 1024 characters`);
  }
}

function validatePiLoader() {
  const result = loadSkillsFromDir({ dir: skillsDir, source: "repo" });
  for (const diagnostic of result.diagnostics) {
    fail(`${diagnostic.path ?? "skills"}: ${diagnostic.message}`);
  }
}

function validateMarketplace(skillFiles) {
  if (!existsSync(marketplacePath)) return;

  let marketplace;
  try {
    marketplace = JSON.parse(readFileSync(marketplacePath, "utf8"));
  } catch (error) {
    fail(`${marketplacePath}: invalid JSON: ${error.message}`);
    return;
  }

  const skillFileSet = new Set(skillFiles.map((file) => path.resolve(file)));

  for (const plugin of marketplace.plugins ?? []) {
    const source = path.resolve(root, plugin.source ?? "");
    if (!existsSync(source) || !statSync(source).isDirectory()) {
      fail(`${marketplacePath}: plugin "${plugin.name}" source does not exist: ${plugin.source}`);
      continue;
    }

    for (const skillRef of plugin.skills ?? []) {
      const skillFile = path.resolve(source, skillRef, "SKILL.md");
      if (!skillFileSet.has(skillFile)) {
        fail(`${marketplacePath}: plugin "${plugin.name}" references missing skill ${path.join(plugin.source, skillRef, "SKILL.md")}`);
      }
    }
  }
}

// Returns [lineNumber, target] for relative inline links, images and reference
// definitions, skipping fenced code blocks and inline code spans.
function relativeLinkTargets(text) {
  const found = [];
  let inFence = false;
  text.split(/\r?\n/).forEach((rawLine, index) => {
    if (/^\s*(```|~~~)/.test(rawLine)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const line = rawLine.replace(/(`+).*?\1/g, "");
    const targets = [
      ...[...line.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+["'(][^)]*)?\)/g)].map((match) => match[1]),
      ...[...line.matchAll(/^\s*\[[^\]]+\]:\s*<?([^\s>]+)>?/g)].map((match) => match[1]),
    ];
    for (const target of targets) {
      if (/^([a-z][a-z0-9+.-]*:|#|\/)/i.test(target)) continue;
      found.push([index + 1, target.split("#")[0]]);
    }
  });
  return found;
}

// True when a link climbs above its skill folder at any point, even if it
// comes back in, because that path only works in the repo layout.
function leavesSkill(file, skillRoot, target) {
  let depth = path.relative(skillRoot, path.dirname(file)).split(path.sep).filter(Boolean).length;
  for (const part of target.split("/")) {
    if (part === "..") depth -= 1;
    else if (part && part !== ".") depth += 1;
    if (depth < 0) return true;
  }
  return false;
}

function owningSkillRoot(file, skillRoots) {
  return skillRoots
    .filter((skillRoot) => file === skillRoot || file.startsWith(skillRoot + path.sep))
    .sort((a, b) => b.length - a.length)[0];
}

// This repo groups skills under namespace folders, but some machines install
// every skill folder at one level (for example ~/.agents/skills/<name>/). Every
// link that leaves its skill folder must resolve in both layouts.
function validateCrossSkillLinks(skillFiles, markdownFiles) {
  const skillRoots = skillFiles.map((file) => path.dirname(file));
  const rootByName = new Map();
  for (const skillRoot of skillRoots) {
    const name = path.basename(skillRoot);
    const existing = rootByName.get(name);
    if (existing) {
      fail(`${path.relative(root, skillRoot)}: skill name "${name}" is also used by ${path.relative(root, existing)}; the two collide where skills install flat`);
    } else {
      rootByName.set(name, skillRoot);
    }
  }
  const flatRoot = path.join(path.sep, "flat", "skills");

  const resolvesWhenFlat = (file, skillRoot, target) => {
    const flatFile = path.join(flatRoot, path.basename(skillRoot), path.relative(skillRoot, file));
    const resolved = path.resolve(path.dirname(flatFile), target);
    const [name, ...rest] = path.relative(flatRoot, resolved).split(path.sep);
    const targetRoot = rootByName.get(name);
    return targetRoot !== undefined && existsSync(path.join(targetRoot, ...rest));
  };

  for (const file of markdownFiles) {
    const skillRoot = owningSkillRoot(file, skillRoots);
    if (!skillRoot) continue;

    for (const [lineNumber, target] of relativeLinkTargets(readFileSync(file, "utf8"))) {
      // Links that stay inside the skill include sample paths in templates; leave them alone.
      if (!leavesSkill(file, skillRoot, target)) continue;
      const where = `${path.relative(root, file)}:${lineNumber}`;
      if (!existsSync(path.resolve(path.dirname(file), target))) {
        fail(`${where}: link "${target}" does not resolve`);
      } else if (!resolvesWhenFlat(file, skillRoot, target)) {
        fail(`${where}: link "${target}" breaks where skills install flat, with every skill folder at one level. Name the other skill instead of linking to it`);
      }
    }
  }
}

const skillFiles = await findFiles(skillsDir, (name) => name === "SKILL.md");
const markdownFiles = await findFiles(skillsDir, (name) => name.endsWith(".md"));
for (const file of skillFiles) validateSkillFile(file);
validatePiLoader();
validateMarketplace(skillFiles);
validateCrossSkillLinks(skillFiles, markdownFiles);

if (errors.length > 0) {
  console.error(`Skill validation failed (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Validated ${skillFiles.length} skills.`);
