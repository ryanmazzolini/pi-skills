import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { WorkspaceConflictError } from "./runtime.ts";
import { GitWorkspaceManager } from "./workspace.ts";

function git(cwd, args, options = {}) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...(options.env ?? {}) },
  }).trim();
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delegate-workspace-test-"));
  const repo = path.join(root, "repo");
  const store = path.join(root, "store");
  fs.mkdirSync(repo);
  fs.mkdirSync(store);
  git(repo, ["init", "-b", "main"]);
  git(repo, ["config", "user.name", "Delegate Test"]);
  git(repo, ["config", "user.email", "delegate@example.com"]);
  git(repo, ["config", "core.filemode", "true"]);
  fs.writeFileSync(path.join(repo, "keep.txt"), "before\n");
  fs.writeFileSync(path.join(repo, "rename.txt"), "rename me\n");
  fs.writeFileSync(path.join(repo, "delete.txt"), "delete me\n");
  fs.writeFileSync(path.join(repo, "script.sh"), "#!/bin/sh\necho before\n", { mode: 0o644 });
  fs.mkdirSync(path.join(repo, "locked"));
  fs.writeFileSync(path.join(repo, "locked", "b.txt"), "before locked\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "initial"]);
  const baseCommit = git(repo, ["rev-parse", "HEAD"]);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, repo, store, baseCommit };
}

function preparation(store, suffix = "one") {
  return {
    sourceCwd: path.join(store, "..", "repo"),
    runId: `run-${suffix}`,
    childId: `child-${suffix}`,
    worktreePath: path.join(store, "worktrees", suffix),
    patchPath: path.join(store, "patches", `${suffix}.patch`),
    manifestPath: path.join(store, "patches", `${suffix}.manifest.json`),
  };
}

function workingTreeRevision(repo, indexPath) {
  const env = { GIT_INDEX_FILE: indexPath };
  try {
    git(repo, ["read-tree", "HEAD^{tree}"], { env });
    git(repo, ["add", "-A", "--", "."], { env });
    return git(repo, ["write-tree"], { env });
  } finally {
    fs.rmSync(indexPath, { force: true });
  }
}

function interceptApply(t, root, include) {
  const bin = path.join(root, "bin");
  fs.mkdirSync(bin, { recursive: true });
  const wrapper = path.join(bin, "git");
  fs.writeFileSync(wrapper, `#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const args = process.argv.slice(2);
if (process.env.PI_DELEGATE_TEST_APPLY_INCLUDE && args[0] === "apply" && !args.includes("--check")) {
  const partial = spawnSync(process.env.PI_DELEGATE_REAL_GIT, ["apply", "--include=" + process.env.PI_DELEGATE_TEST_APPLY_INCLUDE, ...args.slice(1)], { stdio: "inherit" });
  process.exit(partial.status === 0 ? 97 : (partial.status ?? 98));
}
const result = spawnSync(process.env.PI_DELEGATE_REAL_GIT, args, { stdio: "inherit" });
process.exit(result.status ?? 99);
`);
  fs.chmodSync(wrapper, 0o755);
  const previous = {
    path: process.env.PATH,
    real: process.env.PI_DELEGATE_REAL_GIT,
    include: process.env.PI_DELEGATE_TEST_APPLY_INCLUDE,
  };
  process.env.PI_DELEGATE_REAL_GIT = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  process.env.PI_DELEGATE_TEST_APPLY_INCLUDE = include;
  process.env.PATH = `${bin}${path.delimiter}${previous.path ?? ""}`;
  t.after(() => {
    if (previous.path === undefined) delete process.env.PATH; else process.env.PATH = previous.path;
    if (previous.real === undefined) delete process.env.PI_DELEGATE_REAL_GIT; else process.env.PI_DELEGATE_REAL_GIT = previous.real;
    if (previous.include === undefined) delete process.env.PI_DELEGATE_TEST_APPLY_INCLUDE; else process.env.PI_DELEGATE_TEST_APPLY_INCLUDE = previous.include;
  });
}

function interceptWorktreeAdd(t, root, mode = "registered") {
  const bin = path.join(root, "worktree-bin");
  fs.mkdirSync(bin, { recursive: true });
  const wrapper = path.join(bin, "git");
  fs.writeFileSync(wrapper, `#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const worktree = args.indexOf("worktree");
if (process.env.PI_DELEGATE_TEST_FAIL_WORKTREE_ADD && worktree >= 0 && args[worktree + 1] === "add") {
  const target = args[worktree + 2];
  if (process.env.PI_DELEGATE_TEST_FAIL_WORKTREE_ADD === "replacement") {
    fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, "valuable.txt"), "preserve me\\n");
    process.exit(95);
  }
  const result = spawnSync(process.env.PI_DELEGATE_REAL_GIT, args, { stdio: "inherit" });
  if (result.status === 0) fs.writeFileSync(path.join(target, "checkout-side-effect.txt"), "dirty after checkout\\n");
  process.exit(result.status === 0 ? 96 : (result.status ?? 98));
}
const result = spawnSync(process.env.PI_DELEGATE_REAL_GIT, args, { stdio: "inherit" });
process.exit(result.status ?? 99);
`);
  fs.chmodSync(wrapper, 0o755);
  const previous = {
    path: process.env.PATH,
    real: process.env.PI_DELEGATE_REAL_GIT,
    fail: process.env.PI_DELEGATE_TEST_FAIL_WORKTREE_ADD,
  };
  process.env.PI_DELEGATE_REAL_GIT = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  process.env.PI_DELEGATE_TEST_FAIL_WORKTREE_ADD = mode;
  process.env.PATH = `${bin}${path.delimiter}${previous.path ?? ""}`;
  t.after(() => {
    if (previous.path === undefined) delete process.env.PATH; else process.env.PATH = previous.path;
    if (previous.real === undefined) delete process.env.PI_DELEGATE_REAL_GIT; else process.env.PI_DELEGATE_REAL_GIT = previous.real;
    if (previous.fail === undefined) delete process.env.PI_DELEGATE_TEST_FAIL_WORKTREE_ADD; else process.env.PI_DELEGATE_TEST_FAIL_WORKTREE_ADD = previous.fail;
  });
}

test("requires a clean Git source and never falls back when worktree creation is blocked", async (t) => {
  const { repo, store } = fixture(t);
  const manager = new GitWorkspaceManager();
  fs.writeFileSync(path.join(repo, "keep.txt"), "dirty\n");
  await assert.rejects(manager.prepare(preparation(store, "dirty")), /must be clean/);
  assert.equal(fs.existsSync(path.join(store, "worktrees", "dirty")), false);

  git(repo, ["checkout", "--", "keep.txt"]);
  const collidingBranch = "pi-delegate/run-collision/child-collision";
  git(repo, ["branch", collidingBranch]);
  await assert.rejects(manager.prepare(preparation(store, "collision")), /branch already exists/);
  assert.notEqual(git(repo, ["branch", "--list", collidingBranch]), "");

  const blocked = preparation(store, "blocked");
  fs.mkdirSync(blocked.worktreePath, { recursive: true });
  await assert.rejects(manager.prepare(blocked), /already exists/);
  assert.equal(git(repo, ["branch", "--list", "pi-delegate/run-blocked/child-blocked"]), "");
});

test("does not run repository checkout hooks for extension-owned worktrees", async (t) => {
  const { repo, store } = fixture(t);
  const marker = path.join(repo, ".git", "post-checkout-ran");
  const hook = path.join(repo, ".git", "hooks", "post-checkout");
  fs.writeFileSync(hook, `#!/bin/sh\nprintf ran > "${marker}"\nexit 23\n`);
  fs.chmodSync(hook, 0o755);
  const manager = new GitWorkspaceManager();
  const workspace = await manager.prepare(preparation(store, "hook-isolated"));

  assert.equal(fs.existsSync(marker), false);
  assert.equal(fs.existsSync(workspace.worktreePath), true);
  await manager.cleanup(workspace);
});

test("cleans registered dirty setup resources after worktree add returns failure", async (t) => {
  const { root, repo, store } = fixture(t);
  const manager = new GitWorkspaceManager();
  const input = preparation(store, "registered-failure");
  interceptWorktreeAdd(t, root);

  await assert.rejects(manager.prepare(input), /worktree add/);
  assert.equal(fs.existsSync(input.worktreePath), false);
  assert.equal(git(repo, ["branch", "--list", "pi-delegate/run-registered-failure/child-registered-failure"]), "");
  assert.doesNotMatch(git(repo, ["worktree", "list", "--porcelain"]), /registered-failure/);
});

test("preserves an unregistered replacement directory after setup failure", async (t) => {
  const { root, repo, store } = fixture(t);
  const manager = new GitWorkspaceManager();
  const input = preparation(store, "replacement-race");
  interceptWorktreeAdd(t, root, "replacement");

  await assert.rejects(
    manager.prepare(input),
    (error) => {
      assert.equal(error instanceof AggregateError, true);
      assert.match(error.errors.map((item) => item.message).join("\n"), /setup path ownership changed/);
      return true;
    },
  );
  assert.equal(fs.readFileSync(path.join(input.worktreePath, "valuable.txt"), "utf8"), "preserve me\n");
  assert.equal(git(repo, ["branch", "--list", "pi-delegate/run-replacement-race/child-replacement-race"]), "");
  assert.doesNotMatch(git(repo, ["worktree", "list", "--porcelain"]), /replacement-race/);
});

test("captures a complete tree revision and applies that exact uncommitted change set", async (t) => {
  const { repo, store, baseCommit } = fixture(t);
  const manager = new GitWorkspaceManager();
  const workspace = await manager.prepare(preparation(store));
  const worktree = workspace.worktreePath;

  fs.writeFileSync(path.join(worktree, "keep.txt"), "after\n");
  fs.renameSync(path.join(worktree, "rename.txt"), path.join(worktree, "renamed.txt"));
  fs.rmSync(path.join(worktree, "delete.txt"));
  fs.writeFileSync(path.join(worktree, "new.txt"), "new file\n");
  fs.writeFileSync(path.join(worktree, "binary.dat"), Buffer.from([0, 1, 2, 3, 255, 0, 4]));
  fs.chmodSync(path.join(worktree, "script.sh"), 0o755);
  fs.symlinkSync("new.txt", path.join(worktree, "new-link"));

  const inspection = await manager.inspect(workspace);
  assert.equal(inspection.kind, "changes");
  assert.ok(inspection.review.summary.filesChanged >= 7);
  assert.notEqual(inspection.review.revision, inspection.review.baseTree);
  assert.equal(fs.existsSync(workspace.patchPath), true);
  assert.equal(fs.existsSync(workspace.manifestPath), true);
  assert.match(fs.readFileSync(workspace.patchPath, "utf8"), /diff --git/);
  const manifest = JSON.parse(fs.readFileSync(workspace.manifestPath, "utf8"));
  assert.equal(manifest.revision, inspection.review.revision);
  assert.ok(manifest.changes.some((line) => line.includes("renamed.txt")));

  assert.equal(fs.readFileSync(path.join(repo, "keep.txt"), "utf8"), "before\n");
  assert.equal(fs.existsSync(path.join(repo, "new.txt")), false);
  const headBeforeApply = git(repo, ["rev-parse", "HEAD"]);
  const review = { ...inspection.review, reviewedAt: new Date(0).toISOString() };
  assert.equal((await manager.inspectDestination(workspace, review)).kind, "base");

  await manager.apply(workspace, review);

  assert.equal((await manager.inspectDestination(workspace, review)).kind, "reviewed");
  assert.equal(git(repo, ["rev-parse", "HEAD"]), headBeforeApply);
  assert.equal(headBeforeApply, baseCommit);
  assert.equal(fs.readFileSync(path.join(repo, "keep.txt"), "utf8"), "after\n");
  assert.equal(fs.existsSync(path.join(repo, "rename.txt")), false);
  assert.equal(fs.readFileSync(path.join(repo, "renamed.txt"), "utf8"), "rename me\n");
  assert.equal(fs.existsSync(path.join(repo, "delete.txt")), false);
  assert.deepEqual(fs.readFileSync(path.join(repo, "binary.dat")), Buffer.from([0, 1, 2, 3, 255, 0, 4]));
  assert.equal(fs.readlinkSync(path.join(repo, "new-link")), "new.txt");
  assert.equal(fs.statSync(path.join(repo, "script.sh")).mode & 0o111, 0o111);
  assert.equal(workingTreeRevision(repo, path.join(store, "destination.index")), inspection.review.revision);
  assert.notEqual(git(repo, ["status", "--porcelain=v1"]), "");

  await manager.cleanup(workspace, inspection.review.revision);
  assert.equal(fs.existsSync(workspace.worktreePath), false);
  assert.equal(git(repo, ["branch", "--list", workspace.branch]), "");
  assert.equal(fs.existsSync(workspace.patchPath), true);
});

test("rolls back earlier paths when Git fails partway through destination writes", async (t) => {
  const { repo, store } = fixture(t);
  const manager = new GitWorkspaceManager();
  const workspace = await manager.prepare(preparation(store, "rollback"));
  fs.writeFileSync(path.join(workspace.worktreePath, "keep.txt"), "agent keep\n");
  fs.writeFileSync(path.join(workspace.worktreePath, "locked", "b.txt"), "agent locked\n");
  const inspection = await manager.inspect(workspace);
  assert.equal(inspection.kind, "changes");

  fs.chmodSync(path.join(repo, "locked"), 0o500);
  try {
    await assert.rejects(
      manager.apply(workspace, { ...inspection.review, reviewedAt: new Date(0).toISOString() }),
      /destination was restored/,
    );
  } finally {
    fs.chmodSync(path.join(repo, "locked"), 0o700);
  }
  assert.equal(fs.readFileSync(path.join(repo, "keep.txt"), "utf8"), "before\n");
  assert.equal(fs.readFileSync(path.join(repo, "locked", "b.txt"), "utf8"), "before locked\n");
  assert.equal(git(repo, ["status", "--porcelain=v1"]), "");
  assert.equal(fs.existsSync(workspace.worktreePath), true);
  await manager.cleanup(workspace, inspection.review.revision);
});

test("deterministically rolls back a partially applied symlink and nested addition", async (t) => {
  const { root, repo, store } = fixture(t);
  const manager = new GitWorkspaceManager();
  const workspace = await manager.prepare(preparation(store, "deterministic-rollback"));
  fs.symlinkSync("missing-target", path.join(workspace.worktreePath, "a-link"));
  fs.mkdirSync(path.join(workspace.worktreePath, "new-dir"));
  fs.writeFileSync(path.join(workspace.worktreePath, "new-dir", "nested.txt"), "nested\n");
  const inspection = await manager.inspect(workspace);
  assert.equal(inspection.kind, "changes");

  interceptApply(t, root, "a-link");
  await assert.rejects(
    manager.apply(workspace, { ...inspection.review, reviewedAt: new Date(0).toISOString() }),
    /destination was restored/,
  );
  assert.equal(fs.existsSync(path.join(repo, "a-link")), false);
  assert.equal(git(repo, ["status", "--porcelain=v1", "--untracked-files=all"]), "");

  process.env.PI_DELEGATE_TEST_APPLY_INCLUDE = "new-dir/nested.txt";
  await assert.rejects(
    manager.apply(workspace, { ...inspection.review, reviewedAt: new Date(0).toISOString() }),
    /destination was restored/,
  );
  assert.equal(fs.existsSync(path.join(repo, "new-dir")), false);
  assert.equal(git(repo, ["status", "--porcelain=v1", "--untracked-files=all"]), "");
  await manager.cleanup(workspace, inspection.review.revision);
});

test("restores non-UTF-8 symlink targets byte-for-byte after partial apply", async (t) => {
  const { root, repo, store } = fixture(t);
  const originalTarget = Buffer.from([0x62, 0x61, 0x64, 0xff]);
  const changedTarget = Buffer.from([0x6e, 0x65, 0x77, 0xfe]);
  fs.symlinkSync(originalTarget, path.join(repo, "a-raw-link"));
  git(repo, ["add", "a-raw-link"]);
  git(repo, ["commit", "-m", "add raw symlink"]);

  const manager = new GitWorkspaceManager();
  const workspace = await manager.prepare(preparation(store, "raw-symlink-rollback"));
  fs.unlinkSync(path.join(workspace.worktreePath, "a-raw-link"));
  fs.symlinkSync(changedTarget, path.join(workspace.worktreePath, "a-raw-link"));
  const inspection = await manager.inspect(workspace);
  assert.equal(inspection.kind, "changes");

  interceptApply(t, root, "a-raw-link");
  await assert.rejects(
    manager.apply(workspace, { ...inspection.review, reviewedAt: new Date(0).toISOString() }),
    /destination was restored/,
  );
  assert.deepEqual(fs.readlinkSync(path.join(repo, "a-raw-link"), { encoding: "buffer" }), originalTarget);
  assert.equal(git(repo, ["status", "--porcelain=v1", "--untracked-files=all"]), "");
  await manager.cleanup(workspace, inspection.review.revision);
});

test("rejects file and directory transitions before destination mutation", async (t) => {
  const { repo, store } = fixture(t);
  const manager = new GitWorkspaceManager();

  const fileToDirectory = await manager.prepare(preparation(store, "file-to-directory"));
  fs.rmSync(path.join(fileToDirectory.worktreePath, "keep.txt"));
  fs.mkdirSync(path.join(fileToDirectory.worktreePath, "keep.txt"));
  fs.writeFileSync(path.join(fileToDirectory.worktreePath, "keep.txt", "nested.txt"), "nested\n");
  fs.writeFileSync(path.join(fileToDirectory.worktreePath, "keep.txt-other"), "sorting decoy\n");
  const first = await manager.inspect(fileToDirectory);
  assert.equal(first.kind, "changes");
  await assert.rejects(
    manager.apply(fileToDirectory, { ...first.review, reviewedAt: new Date(0).toISOString() }),
    /file\/directory transition/,
  );
  assert.equal(fs.readFileSync(path.join(repo, "keep.txt"), "utf8"), "before\n");
  assert.equal(git(repo, ["status", "--porcelain=v1", "--untracked-files=all"]), "");
  await manager.cleanup(fileToDirectory, first.review.revision);

  const directoryToFile = await manager.prepare(preparation(store, "directory-to-file"));
  fs.rmSync(path.join(directoryToFile.worktreePath, "locked"), { recursive: true });
  fs.writeFileSync(path.join(directoryToFile.worktreePath, "locked"), "replacement\n");
  const second = await manager.inspect(directoryToFile);
  assert.equal(second.kind, "changes");
  await assert.rejects(
    manager.apply(directoryToFile, { ...second.review, reviewedAt: new Date(0).toISOString() }),
    /file\/directory transition/,
  );
  assert.equal(fs.readFileSync(path.join(repo, "locked", "b.txt"), "utf8"), "before locked\n");
  assert.equal(git(repo, ["status", "--porcelain=v1", "--untracked-files=all"]), "");
  await manager.cleanup(directoryToFile, second.review.revision);
});

test("preserves reviewed work after stale revision or destination conflict", async (t) => {
  const { repo, store } = fixture(t);
  const manager = new GitWorkspaceManager();
  const workspace = await manager.prepare(preparation(store, "conflict"));
  fs.writeFileSync(path.join(workspace.worktreePath, "new.txt"), "reviewed\n");
  const first = await manager.inspect(workspace);
  assert.equal(first.kind, "changes");

  fs.writeFileSync(path.join(workspace.worktreePath, "new.txt"), "changed after review\n");
  await assert.rejects(manager.assertRevision(workspace, first.review.revision), /changed after review/);
  assert.equal(fs.existsSync(workspace.worktreePath), true);

  const second = await manager.inspect(workspace);
  assert.equal(second.kind, "changes");
  fs.writeFileSync(path.join(repo, "keep.txt"), "human change\n");
  await assert.rejects(
    manager.apply(workspace, { ...second.review, reviewedAt: new Date(0).toISOString() }),
    WorkspaceConflictError,
  );
  assert.equal(fs.readFileSync(path.join(repo, "keep.txt"), "utf8"), "human change\n");
  assert.equal(fs.existsSync(path.join(repo, "new.txt")), false);
  assert.equal(fs.existsSync(workspace.worktreePath), true);

  git(repo, ["checkout", "--", "keep.txt"]);
  await manager.cleanup(workspace, second.review.revision);
});

test("refuses cleanup when persisted workspace ownership fields no longer match Git", async (t) => {
  const { repo, store } = fixture(t);
  const manager = new GitWorkspaceManager();
  const workspace = await manager.prepare(preparation(store, "ownership"));
  const unsafe = { ...workspace, branch: "main" };
  await assert.rejects(manager.cleanup(unsafe), /unsafe temporary branch/);
  assert.equal(fs.existsSync(workspace.worktreePath), true);
  assert.notEqual(git(repo, ["branch", "--list", "main"]), "");

  git(workspace.worktreePath, ["checkout", "--detach"]);
  await assert.rejects(manager.cleanup(workspace), /branch changed/);
  assert.equal(fs.existsSync(workspace.worktreePath), true);
  git(workspace.worktreePath, ["checkout", workspace.branch]);
  fs.writeFileSync(path.join(workspace.worktreePath, "committed.txt"), "must survive\n");
  git(workspace.worktreePath, ["add", "committed.txt"]);
  git(workspace.worktreePath, ["commit", "-m", "unexpected child commit"]);
  await assert.rejects(manager.cleanup(workspace), /branch tip changed|changed from/);
  assert.equal(fs.existsSync(workspace.worktreePath), true);
  git(workspace.worktreePath, ["reset", "--hard", workspace.baseCommit]);
  await manager.cleanup(workspace);
});

test("refuses to delete a temporary branch that was repurposed after worktree removal", async (t) => {
  const { repo, store } = fixture(t);
  const manager = new GitWorkspaceManager();
  const workspace = await manager.prepare(preparation(store, "repurposed"));
  git(repo, ["worktree", "remove", "--force", workspace.worktreePath]);
  const tree = git(repo, ["rev-parse", "HEAD^{tree}"]);
  const valuable = git(repo, ["commit-tree", tree, "-m", "valuable detached commit"]);
  git(repo, ["update-ref", `refs/heads/${workspace.branch}`, valuable, workspace.baseCommit]);

  await assert.rejects(manager.cleanup(workspace), /repurposed branch/);
  assert.equal(git(repo, ["rev-parse", `refs/heads/${workspace.branch}`]), valuable);
});

test("reports an unchanged temporary tree and cleans it without artifacts", async (t) => {
  const { store } = fixture(t);
  const manager = new GitWorkspaceManager();
  const workspace = await manager.prepare(preparation(store, "clean"));
  assert.deepEqual(await manager.inspect(workspace), { kind: "no_changes" });
  await manager.cleanup(workspace);
  assert.equal(fs.existsSync(workspace.worktreePath), false);
  assert.equal(fs.existsSync(workspace.patchPath), false);
});

test("creates and explicitly cleans an empty scratch workspace for a non-Git source", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delegate-scratch-test-"));
  const source = path.join(root, "source");
  const store = path.join(root, "delegate-runs");
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, "input.txt"), "source material\n");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const manager = new GitWorkspaceManager(store);
  const input = {
    sourceCwd: source,
    runId: "run-scratch",
    childId: "child-scratch",
    worktreePath: path.join(store, "parent", "run-scratch", "worktrees", "child-scratch"),
    patchPath: path.join(store, "parent", "run-scratch", "patches", "child-scratch.patch"),
    manifestPath: path.join(store, "parent", "run-scratch", "patches", "child-scratch.manifest.json"),
  };
  const workspace = await manager.prepare(input);

  assert.equal(workspace.kind, "temporary");
  assert.equal("repoRoot" in workspace, false);
  assert.equal(workspace.worktreePath, input.worktreePath);
  assert.match(workspace.directoryIdentity.dev, /^\d+$/);
  assert.match(workspace.directoryIdentity.ino, /^\d+$/);
  assert.deepEqual(fs.readdirSync(workspace.worktreePath), []);
  assert.equal(fs.statSync(workspace.worktreePath).mode & 0o777, 0o700);
  assert.equal(fs.readFileSync(path.join(source, "input.txt"), "utf8"), "source material\n");

  fs.writeFileSync(path.join(workspace.worktreePath, "evidence.log"), "useful evidence\n");
  fs.mkdirSync(path.join(workspace.worktreePath, "raw"));
  fs.writeFileSync(path.join(workspace.worktreePath, "raw", "output.txt"), "captured output\n");
  const movedSource = path.join(root, "moved-source");
  fs.renameSync(source, movedSource);
  assert.deepEqual(await manager.inspectScratch(workspace), {
    entries: ["evidence.log", "raw/", "raw/output.txt"],
    truncated: false,
  });
  const missingIdentity = structuredClone(workspace);
  delete missingIdentity.directoryIdentity;
  await assert.rejects(manager.cleanup(missingIdentity), /no valid persisted identity/);
  await manager.cleanup(workspace);
  assert.equal(fs.existsSync(workspace.worktreePath), false);
  assert.equal(fs.readFileSync(path.join(movedSource, "input.txt"), "utf8"), "source material\n");
});

test("refuses scratch paths outside the configured temporary root and replacement symlinks", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delegate-scratch-safety-test-"));
  const source = path.join(root, "source");
  const store = path.join(root, "delegate-runs");
  const outside = path.join(root, "outside");
  fs.mkdirSync(source);
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, "preserve.txt"), "preserve me\n");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const manager = new GitWorkspaceManager(store);
  const unsafe = {
    sourceCwd: source,
    runId: "run-unsafe",
    childId: "child-unsafe",
    worktreePath: outside,
    patchPath: path.join(store, "patches", "unsafe.patch"),
    manifestPath: path.join(store, "patches", "unsafe.json"),
  };
  await assert.rejects(manager.prepare(unsafe), /outside the delegate temporary root/);
  assert.equal(fs.readFileSync(path.join(outside, "preserve.txt"), "utf8"), "preserve me\n");

  const safe = { ...unsafe, worktreePath: path.join(store, "run", "workspaces", "child") };
  const workspace = await manager.prepare(safe);
  fs.rmSync(workspace.worktreePath, { recursive: true });
  fs.symlinkSync(outside, workspace.worktreePath);
  await assert.rejects(manager.cleanup(workspace), /workspace was replaced/);
  assert.equal(fs.readFileSync(path.join(outside, "preserve.txt"), "utf8"), "preserve me\n");
});

test("refuses scratch inspection and cleanup after the directory is replaced", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delegate-scratch-identity-test-"));
  const source = path.join(root, "source");
  const store = path.join(root, "delegate-runs");
  fs.mkdirSync(source);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const manager = new GitWorkspaceManager(store);
  const workspace = await manager.prepare({
    sourceCwd: source,
    runId: "run",
    childId: "child",
    worktreePath: path.join(store, "run", "worktrees", "child"),
    patchPath: path.join(store, "run", "patches", "child.patch"),
    manifestPath: path.join(store, "run", "patches", "child.json"),
  });
  fs.rmSync(workspace.worktreePath, { recursive: true });
  fs.mkdirSync(workspace.worktreePath);
  fs.writeFileSync(path.join(workspace.worktreePath, "valuable.txt"), "do not delete\n");

  await assert.rejects(manager.inspectScratch(workspace), /identity changed/);
  await assert.rejects(manager.cleanup(workspace), /identity changed/);
  await assert.rejects(new GitWorkspaceManager(store).cleanup(workspace), /identity changed/);
  assert.equal(fs.readFileSync(path.join(workspace.worktreePath, "valuable.txt"), "utf8"), "do not delete\n");
});

test("recovers cleanup after an owned scratch directory is already quarantined", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delegate-scratch-quarantine-recovery-test-"));
  const source = path.join(root, "source");
  const store = path.join(root, "delegate-runs");
  fs.mkdirSync(source);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const manager = new GitWorkspaceManager(store);
  const workspace = await manager.prepare({
    sourceCwd: source,
    runId: "run",
    childId: "child",
    worktreePath: path.join(store, "run", "worktrees", "child"),
    patchPath: path.join(store, "run", "patches", "child.patch"),
    manifestPath: path.join(store, "run", "patches", "child.json"),
  });
  fs.writeFileSync(path.join(workspace.worktreePath, "artifact.txt"), "owned\n");
  const quarantine = `${workspace.worktreePath}.cleanup-${workspace.directoryIdentity.dev}-${workspace.directoryIdentity.ino}`;
  fs.mkdirSync(quarantine);
  fs.renameSync(workspace.worktreePath, path.join(quarantine, "workspace"));

  await new GitWorkspaceManager(store).cleanup(workspace);
  assert.equal(fs.existsSync(workspace.worktreePath), false);
  assert.equal(fs.existsSync(quarantine), false);
});

test("reconciles interrupted empty quarantines without deleting unrelated contents", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delegate-scratch-empty-quarantine-test-"));
  const source = path.join(root, "source");
  const store = path.join(root, "delegate-runs");
  fs.mkdirSync(source);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manager = new GitWorkspaceManager(store);
  const prepare = (suffix) => manager.prepare({
    sourceCwd: source,
    runId: `run-${suffix}`,
    childId: `child-${suffix}`,
    worktreePath: path.join(store, `run-${suffix}`, "worktrees", "child"),
    patchPath: path.join(store, `run-${suffix}`, "patches", "child.patch"),
    manifestPath: path.join(store, `run-${suffix}`, "patches", "child.json"),
  });
  const quarantine = (workspace) => `${workspace.worktreePath}.cleanup-${workspace.directoryIdentity.dev}-${workspace.directoryIdentity.ino}`;

  const beforeMove = await prepare("before-move");
  fs.mkdirSync(quarantine(beforeMove));
  await new GitWorkspaceManager(store).cleanup(beforeMove);
  assert.equal(fs.existsSync(beforeMove.worktreePath), false);
  assert.equal(fs.existsSync(quarantine(beforeMove)), false);

  const afterDelete = await prepare("after-delete");
  fs.rmSync(afterDelete.worktreePath, { recursive: true });
  fs.mkdirSync(quarantine(afterDelete));
  await new GitWorkspaceManager(store).cleanup(afterDelete);
  assert.equal(fs.existsSync(quarantine(afterDelete)), false);

  const withUnrelatedData = await prepare("unrelated");
  fs.rmSync(withUnrelatedData.worktreePath, { recursive: true });
  fs.mkdirSync(quarantine(withUnrelatedData));
  fs.writeFileSync(path.join(quarantine(withUnrelatedData), "valuable.txt"), "preserve me\n");
  await new GitWorkspaceManager(store).cleanup(withUnrelatedData);
  assert.equal(fs.readFileSync(path.join(quarantine(withUnrelatedData), "valuable.txt"), "utf8"), "preserve me\n");
});

test("preserves a replacement moved into the scratch cleanup quarantine", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delegate-scratch-quarantine-replacement-test-"));
  const source = path.join(root, "source");
  const store = path.join(root, "delegate-runs");
  fs.mkdirSync(source);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const manager = new GitWorkspaceManager(store);
  const workspace = await manager.prepare({
    sourceCwd: source,
    runId: "run",
    childId: "child",
    worktreePath: path.join(store, "run", "worktrees", "child"),
    patchPath: path.join(store, "run", "patches", "child.patch"),
    manifestPath: path.join(store, "run", "patches", "child.json"),
  });
  const original = `${workspace.worktreePath}.original`;
  fs.renameSync(workspace.worktreePath, original);
  const quarantine = `${workspace.worktreePath}.cleanup-${workspace.directoryIdentity.dev}-${workspace.directoryIdentity.ino}`;
  const replacement = path.join(quarantine, "workspace");
  fs.mkdirSync(replacement, { recursive: true });
  fs.writeFileSync(path.join(replacement, "valuable.txt"), "do not delete\n");

  await assert.rejects(new GitWorkspaceManager(store).cleanup(workspace), /preserved a replacement/);
  assert.equal(fs.existsSync(original), true);
  assert.equal(fs.readFileSync(path.join(replacement, "valuable.txt"), "utf8"), "do not delete\n");
});

test("refuses scratch cleanup through a replaced ancestor symlink", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delegate-scratch-ancestor-test-"));
  const source = path.join(root, "source");
  const store = path.join(root, "delegate-runs");
  fs.mkdirSync(source);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const manager = new GitWorkspaceManager(store);
  const workspacePath = path.join(store, "run", "workspaces", "child");
  const workspace = await manager.prepare({
    sourceCwd: source,
    runId: "run",
    childId: "child",
    worktreePath: workspacePath,
    patchPath: path.join(store, "run", "patches", "child.patch"),
    manifestPath: path.join(store, "run", "patches", "child.json"),
  });
  fs.writeFileSync(path.join(workspacePath, "original.txt"), "original scratch\n");

  const originalParent = path.join(store, "run", "original-workspaces");
  fs.renameSync(path.dirname(workspacePath), originalParent);
  const replacementParent = path.join(store, "other", "workspaces");
  const replacementChild = path.join(replacementParent, "child");
  fs.mkdirSync(replacementChild, { recursive: true });
  fs.writeFileSync(path.join(replacementChild, "valuable.txt"), "do not delete\n");
  fs.symlinkSync(replacementParent, path.dirname(workspacePath));

  await assert.rejects(manager.cleanup(workspace), /identity changed/);
  assert.equal(fs.readFileSync(path.join(originalParent, "child", "original.txt"), "utf8"), "original scratch\n");
  assert.equal(fs.readFileSync(path.join(replacementChild, "valuable.txt"), "utf8"), "do not delete\n");
});

test("refuses scratch cleanup after the temporary root becomes a symlink, including after restart", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delegate-scratch-root-test-"));
  const source = path.join(root, "source");
  const store = path.join(root, "delegate-runs");
  fs.mkdirSync(source);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const manager = new GitWorkspaceManager(store);
  const workspacePath = path.join(store, "parent", "run", "worktrees", "child");
  const workspace = await manager.prepare({
    sourceCwd: source,
    runId: "run",
    childId: "child",
    worktreePath: workspacePath,
    patchPath: path.join(store, "parent", "run", "patches", "child.patch"),
    manifestPath: path.join(store, "parent", "run", "patches", "child.json"),
  });
  fs.writeFileSync(path.join(workspacePath, "original.txt"), "original scratch\n");

  const originalRoot = path.join(root, "original-delegate-runs");
  fs.renameSync(store, originalRoot);
  const replacementRoot = path.join(root, "replacement-delegate-runs");
  const replacementChild = path.join(replacementRoot, "parent", "run", "worktrees", "child");
  fs.mkdirSync(replacementChild, { recursive: true });
  fs.writeFileSync(path.join(replacementChild, "valuable.txt"), "do not delete\n");
  fs.symlinkSync(replacementRoot, store);

  await assert.rejects(manager.cleanup(workspace), /temporary root was replaced/);
  await assert.rejects(new GitWorkspaceManager(store).cleanup(workspace), /temporary root was replaced/);
  assert.equal(fs.readFileSync(path.join(originalRoot, "parent", "run", "worktrees", "child", "original.txt"), "utf8"), "original scratch\n");
  assert.equal(fs.readFileSync(path.join(replacementChild, "valuable.txt"), "utf8"), "do not delete\n");
});

test("refuses scratch cleanup after the temporary root is replaced by a real directory across restart", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delegate-scratch-root-identity-test-"));
  const source = path.join(root, "source");
  const store = path.join(root, "delegate-runs");
  fs.mkdirSync(source);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const manager = new GitWorkspaceManager(store);
  const workspace = await manager.prepare({
    sourceCwd: source,
    runId: "run",
    childId: "child",
    worktreePath: path.join(store, "parent", "run", "worktrees", "child"),
    patchPath: path.join(store, "parent", "run", "patches", "child.patch"),
    manifestPath: path.join(store, "parent", "run", "patches", "child.json"),
  });
  fs.writeFileSync(path.join(workspace.worktreePath, "original.txt"), "original scratch\n");

  const originalRoot = path.join(root, "original-delegate-runs");
  fs.renameSync(store, originalRoot);
  fs.mkdirSync(workspace.worktreePath, { recursive: true });
  fs.writeFileSync(path.join(workspace.worktreePath, "valuable.txt"), "do not delete\n");

  await assert.rejects(manager.cleanup(workspace), /temporary root identity changed/);
  await assert.rejects(new GitWorkspaceManager(store).cleanup(workspace), /identity changed/);
  assert.equal(fs.readFileSync(path.join(originalRoot, "parent", "run", "worktrees", "child", "original.txt"), "utf8"), "original scratch\n");
  assert.equal(fs.readFileSync(path.join(workspace.worktreePath, "valuable.txt"), "utf8"), "do not delete\n");
});

test("never treats a registered Git worktree as scratch based on persisted fields", async (t) => {
  const { repo, store } = fixture(t);
  const manager = new GitWorkspaceManager(store);
  const workspace = await manager.prepare(preparation(store, "registered-not-scratch"));
  const disguised = {
    kind: "temporary",
    sourceCwd: repo,
    worktreePath: workspace.worktreePath,
    integration: { state: "working" },
  };

  await assert.rejects(manager.cleanup(disguised), /registered Git worktree/);
  assert.equal(fs.existsSync(workspace.worktreePath), true);
  await manager.cleanup(workspace);
});

test("does not fall back to scratch after detecting a Git source", async (t) => {
  const { repo, store } = fixture(t);
  const manager = new GitWorkspaceManager(store);
  fs.writeFileSync(path.join(repo, "keep.txt"), "dirty\n");

  await assert.rejects(manager.prepare(preparation(store, "git-failure")), /must be clean/);
  assert.equal(fs.existsSync(path.join(store, "worktrees", "git-failure")), false);
});
