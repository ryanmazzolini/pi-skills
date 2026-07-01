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

async function findSkillFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findSkillFiles(fullPath));
    } else if (entry.isFile() && entry.name === "SKILL.md") {
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

const skillFiles = await findSkillFiles(skillsDir);
for (const file of skillFiles) validateSkillFile(file);
validatePiLoader();
validateMarketplace(skillFiles);

if (errors.length > 0) {
  console.error(`Skill validation failed (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Validated ${skillFiles.length} skills.`);
