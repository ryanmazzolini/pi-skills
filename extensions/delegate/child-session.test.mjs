import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { childOutputGuidance, childSessionModelRuntime, createChildResourceLoader, createRuntimeTools, recoverStructuredResult, resolveChildResources, resolvedSkillIdentity } from "./child-session.ts";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delegate-resources-test-"));
  const agentDir = path.join(root, "agent");
  const project = path.join(root, "project");
  const cwd = path.join(project, "src");
  fs.mkdirSync(cwd, { recursive: true });
  fs.mkdirSync(agentDir, { recursive: true });
  fs.writeFileSync(path.join(agentDir, "AGENTS.md"), "# User rules\n\n- Keep changes small.\n");
  fs.writeFileSync(path.join(agentDir, "SYSTEM.md"), "AMBIENT USER SYSTEM OVERRIDE\n");
  fs.writeFileSync(path.join(project, "AGENTS.md"), "# Project rules\n\n- Run tests.\n");
  fs.writeFileSync(path.join(project, "SYSTEM.md"), "AMBIENT PROJECT SYSTEM OVERRIDE\n");

  const extensionDir = path.join(project, ".pi", "extensions");
  fs.mkdirSync(extensionDir, { recursive: true });
  fs.writeFileSync(path.join(extensionDir, "ambient.ts"), "export default function () { throw new Error('must not load'); }\n");

  for (const name of ["selected", "ambient"]) {
    const skillDir = path.join(project, ".agents", "skills", name);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), `---\nname: ${name}\ndescription: ${name} skill\n---\n\n${name}.\n`);
  }

  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { agentDir, cwd };
}

test("child sessions reuse the parent model runtime", () => {
  const modelRuntime = { getAuth() {} };
  const modelRegistry = { runtime: modelRuntime };

  assert.equal(childSessionModelRuntime(modelRegistry), modelRuntime);
  assert.throws(
    () => childSessionModelRuntime({}),
    /Parent Pi model runtime is unavailable/,
  );
});

test("child resources keep AGENTS.md while excluding ambient resources", async (t) => {
  const { cwd, agentDir } = fixture(t);
  const { loader } = await createChildResourceLoader(cwd, agentDir);

  assert.equal(loader.getExtensions().extensions.length, 0);
  assert.equal(loader.getSystemPrompt(), undefined);
  assert.deepEqual(loader.getSkills().skills, []);
  assert.deepEqual(loader.getPrompts().prompts, []);
  assert.deepEqual(loader.getThemes().themes, []);

  const context = loader.getAgentsFiles().agentsFiles;
  assert.equal(context.some((file) => file.path.endsWith("agent/AGENTS.md")), true);
  assert.equal(context.some((file) => file.path.endsWith("project/AGENTS.md")), true);
  assert.match(loader.getAppendSystemPrompt().join("\n"), /delegate_attention/);

  const { loader: temporaryLoader } = await createChildResourceLoader(cwd, agentDir, [], ["Do not commit temporary changes."]);
  assert.match(temporaryLoader.getAppendSystemPrompt().join("\n"), /Do not commit temporary changes/);
});

test("selected skills are resolved exactly without exposing ambient siblings", async (t) => {
  const { cwd, agentDir } = fixture(t);
  const { loader, resolvedSkills } = await createChildResourceLoader(cwd, agentDir, ["selected"]);

  assert.deepEqual(loader.getSkills().skills.map((skill) => skill.name), ["selected"]);
  assert.deepEqual(resolvedSkills.map((skill) => skill.name), ["selected"]);
  await assert.rejects(
    () => createChildResourceLoader(cwd, agentDir, ["missing"]),
    /Unknown delegated skill: missing/,
  );
});

test("temporary worktrees preserve project skill identity across root relocation", () => {
  const child = {
    workspace: {
      kind: "temporary",
      repoRoot: "/source/repo",
      worktreePath: "/agent/runs/worktree",
    },
  };
  const expected = resolvedSkillIdentity(child, { name: "project-skill", filePath: "/source/repo/.agents/skills/project-skill/SKILL.md" }, false);
  const actual = resolvedSkillIdentity(child, { name: "project-skill", filePath: "/agent/runs/worktree/.agents/skills/project-skill/SKILL.md" }, true);
  assert.equal(expected, actual);
  assert.notEqual(
    resolvedSkillIdentity(child, { name: "user-skill", filePath: "/other/user-skill/SKILL.md" }, false),
    resolvedSkillIdentity(child, { name: "user-skill", filePath: "/other/different/SKILL.md" }, true),
  );
});

test("structured child guidance requires the final tool without conflicting text instructions", () => {
  assert.match(childOutputGuidance({ schema: { type: "object" } }), /call delegate_final exactly once/);
  assert.match(childOutputGuidance({ schema: { type: "object" } }), /Do not return the result as assistant text/);
  assert.match(childOutputGuidance("text"), /Return a concise final answer/);
});

test("recovers only exact schema-valid structured assistant text", () => {
  const output = {
    schema: {
      type: "object",
      properties: {
        answer: { type: "string" },
        count: { type: "integer" },
      },
      required: ["answer", "count"],
      additionalProperties: false,
    },
  };

  assert.deepEqual(
    recoverStructuredResult(output, '{"answer":"done","count":2}'),
    { answer: "done", count: 2 },
  );
  assert.deepEqual(
    recoverStructuredResult(output, '  {"answer":"done","count":2}\n'),
    { answer: "done", count: 2 },
  );

  for (const text of [
    'Result: {"answer":"done","count":2}',
    '```json\n{"answer":"done","count":2}\n```',
    '{"answer":"done"}',
    '{"answer":"done","count":"2"}',
    '{"answer":"done","count":2,"extra":true}',
    '{not json}',
  ]) {
    assert.equal(recoverStructuredResult(output, text), undefined);
  }
});

test("runtime-owned terminal tools are sequential and stop mixed tool batches", async () => {
  let capture = {};
  let stops = 0;
  const attentionTools = createRuntimeTools("text", () => capture, () => { stops++; });
  assert.equal(attentionTools[0].executionMode, "sequential");
  const attentionResult = await attentionTools[0].execute("call", {
    kind: "clarification",
    question: "Which version?",
    context: "Two exist",
  });
  await Promise.resolve();
  assert.equal(attentionResult.terminate, true);
  assert.deepEqual(capture.attention, { kind: "clarification", question: "Which version?", context: "Two exist" });
  assert.equal(stops, 1);

  capture = {};
  const structuredTools = createRuntimeTools(
    { schema: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"] } },
    () => capture,
    () => { stops++; },
  );
  assert.equal(structuredTools[1].executionMode, "sequential");
  const finalResult = await structuredTools[1].execute("call", { answer: "done" });
  await Promise.resolve();
  assert.equal(finalResult.terminate, true);
  assert.deepEqual(capture.structured, { answer: "done" });
  assert.equal(stops, 2);
});

test("tool resolution defaults to normal coding tools and rejects unknown tools", async (t) => {
  const { cwd, agentDir } = fixture(t);
  const defaults = await resolveChildResources(cwd, {}, agentDir);
  assert.deepEqual(defaults.tools, ["read", "bash", "edit", "write"]);

  const selected = await resolveChildResources(cwd, { skills: ["selected"], tools: ["grep", "find", "ls"] }, agentDir);
  assert.deepEqual(selected.skills.map((skill) => skill.name), ["selected"]);
  assert.deepEqual(selected.tools, ["grep", "find", "ls"]);
  await assert.rejects(
    () => resolveChildResources(cwd, { tools: ["delegate"] }, agentDir),
    /Unknown delegated tool: delegate/,
  );
});
