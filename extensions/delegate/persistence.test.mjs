import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { FileRunRepository } from "./persistence.ts";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delegate-runs-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function runRecord(repository) {
  const paths = repository.paths("parent-1", "run-1", "child-1");
  const timestamp = new Date(0).toISOString();
  return {
    schemaVersion: 3,
    id: "run-1",
    parent: { sessionId: "parent-1", leafId: "leaf-1", inputGeneration: 0 },
    recordRef: paths.runFile,
    createdAt: timestamp,
    updatedAt: timestamp,
    delivery: { state: "pending" },
    children: [
      {
        id: "child-1",
        label: "Read",
        task: "Read files",
        state: "queued",
        resolved: {
          model: { provider: "openai", id: "sol" },
          reasoning: "max",
          context: "fresh",
          skills: [],
          tools: ["read", "bash", "edit", "write"],
          output: "text",
        },
        sessionDir: paths.childSessionDir,
        workspace: { kind: "existing", cwd: "/tmp", owner: "external" },
        latestActivity: { kind: "queued", summary: "Queued", observedAt: timestamp },
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, cost: 0 },
      },
    ],
  };
}

test("atomically persists and lists runs under their parent session", async (t) => {
  const root = fixture(t);
  const repository = new FileRunRepository(root);
  const run = runRecord(repository);

  await repository.save(run);
  const listed = await repository.list("parent-1");

  assert.deepEqual(listed, [run]);
  assert.equal(fs.statSync(run.recordRef).mode & 0o777, 0o600);
  assert.equal(fs.statSync(run.children[0].sessionDir).isDirectory(), true);
  assert.deepEqual(fs.readdirSync(path.dirname(run.recordRef)).filter((name) => name.includes(".tmp-")), []);
});

test("loads Slice A and B records through the current schema", async (t) => {
  const root = fixture(t);
  const repository = new FileRunRepository(root);
  const run = runRecord(repository);
  const sliceA = structuredClone(run);
  sliceA.schemaVersion = 1;
  const sliceADir = path.dirname(sliceA.recordRef);
  fs.mkdirSync(sliceADir, { recursive: true });
  fs.writeFileSync(sliceA.recordRef, JSON.stringify(sliceA));

  const sliceB = runRecord(repository);
  sliceB.id = "run-2";
  const sliceBPaths = repository.paths("parent-1", "run-2", "child-1");
  sliceB.recordRef = sliceBPaths.runFile;
  sliceB.children[0].sessionDir = sliceBPaths.childSessionDir;
  sliceB.schemaVersion = 2;
  fs.mkdirSync(path.dirname(sliceB.recordRef), { recursive: true });
  fs.writeFileSync(sliceB.recordRef, JSON.stringify(sliceB));

  const listed = await repository.list("parent-1");
  assert.deepEqual(listed.map((item) => item.schemaVersion), [3, 3]);
  assert.deepEqual(listed[0].children[0].resolved.skills, []);
});

test("reports corrupt records without hiding valid siblings", async (t) => {
  const root = fixture(t);
  const diagnostics = [];
  const repository = new FileRunRepository(root, (message) => diagnostics.push(message));
  const run = runRecord(repository);
  await repository.save(run);

  const corrupt = repository.paths("parent-1", "run-corrupt", "child-corrupt");
  fs.mkdirSync(path.dirname(corrupt.runFile), { recursive: true });
  fs.writeFileSync(corrupt.runFile, "not json");

  const listed = await repository.list("parent-1");
  assert.deepEqual(listed.map((item) => item.id), ["run-1"]);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0], /run-corrupt/);
});

test("rejects run and child paths outside their owned run directory", async (t) => {
  const repository = new FileRunRepository(fixture(t));
  const run = runRecord(repository);
  run.recordRef = "/tmp/somewhere-else/run.json";
  await assert.rejects(repository.save(run), /invalid record path/);

  const childPathRun = runRecord(repository);
  childPathRun.children[0].sessionDir = "/tmp/somewhere-else/child";
  await assert.rejects(repository.save(childPathRun), /invalid session path/);

  const workspacePathRun = runRecord(repository);
  const paths = repository.paths("parent-1", "run-1", "child-1");
  workspacePathRun.children[0].workspace = {
    kind: "temporary",
    sourceCwd: "/tmp/source",
    repoRoot: "/tmp/source",
    relativeCwd: "",
    worktreePath: "/tmp/somewhere-else/worktree",
    branch: "pi-delegate/run-1/child-1",
    baseCommit: "base",
    patchPath: paths.patchFile,
    manifestPath: paths.manifestFile,
    integration: { state: "working" },
  };
  await assert.rejects(repository.save(workspacePathRun), /invalid temporary workspace ownership/);

  workspacePathRun.children[0].workspace.worktreePath = paths.worktreeDir;
  workspacePathRun.children[0].workspace.branch = "pi-delegate/other-run/other-child";
  await assert.rejects(repository.save(workspacePathRun), /invalid temporary workspace ownership/);
});
