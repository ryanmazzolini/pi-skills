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
    patchPath: path.join(store, "patches", `${suffix}.patch`),
    manifestPath: path.join(store, "patches", `${suffix}.manifest.json`),
  };
}

function envelopePaths(root) {
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, entry.name, "owner.json")))
    .map((entry) => path.join(root, entry.name));
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
  if (result.status === 0 && process.env.PI_DELEGATE_TEST_FAIL_WORKTREE_ADD === "missing") {
    fs.rmSync(target, { recursive: true, force: true });
  } else if (result.status === 0) {
    fs.writeFileSync(path.join(target, "checkout-side-effect.txt"), "dirty after checkout\\n");
  }
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
  const manager = new GitWorkspaceManager(store);
  fs.writeFileSync(path.join(repo, "keep.txt"), "dirty\n");
  await assert.rejects(manager.prepare(preparation(store, "dirty")), /must be clean/);
  assert.equal(fs.existsSync(path.join(store, "worktrees", "dirty")), false);

  git(repo, ["checkout", "--", "keep.txt"]);
  const collidingBranch = "pi-delegate/run-collision/child-collision";
  git(repo, ["branch", collidingBranch]);
  await assert.rejects(manager.prepare(preparation(store, "collision")), /branch already exists/);
  assert.notEqual(git(repo, ["branch", "--list", collidingBranch]), "");

  assert.deepEqual(envelopePaths(store), []);
});

test("does not run repository checkout hooks for extension-owned worktrees", async (t) => {
  const { repo, store } = fixture(t);
  const marker = path.join(repo, ".git", "post-checkout-ran");
  const hook = path.join(repo, ".git", "hooks", "post-checkout");
  fs.writeFileSync(hook, `#!/bin/sh\nprintf ran > "${marker}"\nexit 23\n`);
  fs.chmodSync(hook, 0o755);
  const manager = new GitWorkspaceManager(store);
  const workspace = await manager.prepare(preparation(store, "hook-isolated"));

  assert.equal(fs.existsSync(marker), false);
  assert.equal(fs.existsSync(workspace.worktreePath), true);
  await manager.cleanup(workspace);
});

test("creates Git worktrees in temporary envelopes while the branch remains repository-owned", async (t) => {
  const { repo, store, baseCommit } = fixture(t);
  const manager = new GitWorkspaceManager(store, store, () => "owner-token");
  const workspace = await manager.prepare(preparation(store, "ephemeral-git"));

  assert.equal(workspace.worktreePath, path.join(workspace.envelope.rootPath, "workspace"));
  assert.equal(fs.existsSync(path.join(workspace.envelope.rootPath, "owner.json")), true);
  assert.equal(git(repo, ["rev-parse", workspace.branch]), baseCommit);

  fs.rmSync(workspace.envelope.rootPath, { recursive: true });
  git(repo, ["worktree", "prune", "--expire", "now"]);
  assert.equal(git(repo, ["rev-parse", workspace.branch]), baseCommit);
  git(repo, ["branch", "-D", workspace.branch]);
});

test("treats a workspace from a previous OS temporary root as unavailable without deleting it", async (t) => {
  const { root, repo, store } = fixture(t);
  const manager = new GitWorkspaceManager(store, store, () => "owner-token");
  const workspace = await manager.prepare(preparation(store, "foreign-root"));
  const currentRootManager = new GitWorkspaceManager(path.join(root, "new-temporary-root"), store);

  assert.equal(await currentRootManager.expire(workspace), true);
  assert.equal(fs.existsSync(workspace.worktreePath), true);
  assert.notEqual(git(repo, ["branch", "--list", workspace.branch]), "");
  await manager.cleanup(workspace);
});

test("validates a Git envelope before removing its worktree or branch", async (t) => {
  const { repo, store } = fixture(t);
  const manager = new GitWorkspaceManager(store, store, () => "owner-token");
  const workspace = await manager.prepare(preparation(store, "git-owner-mismatch"));
  fs.appendFileSync(path.join(repo, ".git", "info", "exclude"), "ignored.tmp\n");
  fs.writeFileSync(path.join(workspace.worktreePath, "ignored.tmp"), "preserve me\n");
  fs.writeFileSync(path.join(workspace.envelope.rootPath, "owner.json"), '{"schemaVersion":1,"ownerToken":"other"}\n');

  await assert.rejects(manager.cleanup(workspace), /ownership changed/);
  assert.equal(fs.readFileSync(path.join(workspace.worktreePath, "ignored.tmp"), "utf8"), "preserve me\n");
  assert.notEqual(git(repo, ["branch", "--list", workspace.branch]), "");

  fs.writeFileSync(path.join(workspace.envelope.rootPath, "owner.json"), '{"schemaVersion":1,"ownerToken":"owner-token"}\n');
  await manager.cleanup(workspace);
});

test("restores a quarantined Git envelope when late edits block cleanup", async (t) => {
  const { store } = fixture(t);
  const manager = new GitWorkspaceManager(store, store, () => "owner-token");
  const workspace = await manager.prepare(preparation(store, "late-edit"));
  const initial = await manager.inspect(workspace);
  assert.equal(initial.kind, "no_changes");
  fs.writeFileSync(path.join(workspace.worktreePath, "late.txt"), "keep me\n");

  await assert.rejects(manager.cleanup(workspace), /changed before cleanup/);
  assert.equal(fs.readFileSync(path.join(workspace.worktreePath, "late.txt"), "utf8"), "keep me\n");
  const reviewed = await manager.inspect(workspace);
  assert.equal(reviewed.kind, "changes");

  fs.rmSync(path.join(workspace.worktreePath, "late.txt"));
  await manager.cleanup(workspace);
});

test("prunes an expired Git checkout while removing only its unchanged private branch", async (t) => {
  const { repo, store } = fixture(t);
  const manager = new GitWorkspaceManager(store, store, () => "owner-token");
  const workspace = await manager.prepare(preparation(store, "expired-git"));
  fs.rmSync(store, { recursive: true });

  await manager.cleanup(workspace);
  assert.equal(git(repo, ["branch", "--list", workspace.branch]), "");
  assert.doesNotMatch(git(repo, ["worktree", "list", "--porcelain"]), /expired-git/);
});

test("expired delegate cleanup preserves unrelated missing worktree registrations", async (t) => {
  const { root, repo, store } = fixture(t);
  const manager = new GitWorkspaceManager(store, store, () => "owner-token");
  const workspace = await manager.prepare(preparation(store, "targeted-expiry"));
  const otherPath = path.join(root, "other-worktree");
  const hiddenOtherPath = path.join(root, "hidden-other-worktree");
  git(repo, ["branch", "other-worktree"]);
  git(repo, ["worktree", "add", otherPath, "other-worktree"]);
  fs.writeFileSync(path.join(otherPath, "staged.txt"), "staged\n");
  git(otherPath, ["add", "staged.txt"]);
  fs.renameSync(otherPath, hiddenOtherPath);
  fs.rmSync(workspace.envelope.rootPath, { recursive: true });

  await manager.cleanup(workspace);
  assert.match(git(repo, ["worktree", "list", "--porcelain"]), new RegExp(otherPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  fs.renameSync(hiddenOtherPath, otherPath);
  assert.match(git(otherPath, ["status", "--porcelain"]), /^A  staged\.txt$/m);
  git(repo, ["worktree", "remove", "--force", otherPath]);
  git(repo, ["branch", "-D", "other-worktree"]);
});

test("finishes cleanup after the Git worktree and branch were removed before envelope deletion", async (t) => {
  const { repo, store } = fixture(t);
  const manager = new GitWorkspaceManager(store, store, () => "owner-token");
  const workspace = await manager.prepare(preparation(store, "cleanup-recovery"));
  const quarantine = `${workspace.envelope.rootPath}.cleanup-owner-token`;
  fs.renameSync(workspace.envelope.rootPath, quarantine);
  git(repo, ["worktree", "repair", path.join(quarantine, "workspace")]);
  git(repo, ["worktree", "remove", path.join(quarantine, "workspace")]);
  git(repo, ["branch", "-D", workspace.branch]);

  await new GitWorkspaceManager(store, store).cleanup(workspace);
  assert.equal(fs.existsSync(quarantine), false);
});

test("cleans registered dirty setup resources after worktree add returns failure", async (t) => {
  const { root, repo, store } = fixture(t);
  const manager = new GitWorkspaceManager(store);
  const input = preparation(store, "registered-failure");
  interceptWorktreeAdd(t, root);

  await assert.rejects(manager.prepare(input), /worktree add/);
  assert.deepEqual(envelopePaths(store), []);
  assert.equal(git(repo, ["branch", "--list", "pi-delegate/run-registered-failure/child-registered-failure"]), "");
  assert.doesNotMatch(git(repo, ["worktree", "list", "--porcelain"]), /registered-failure/);
});

test("failed setup removes only its missing worktree registration", async (t) => {
  const { root, repo, store } = fixture(t);
  const otherPath = path.join(root, "setup-other-worktree");
  const hiddenOtherPath = path.join(root, "hidden-setup-other-worktree");
  git(repo, ["branch", "setup-other-worktree"]);
  git(repo, ["worktree", "add", otherPath, "setup-other-worktree"]);
  fs.writeFileSync(path.join(otherPath, "staged.txt"), "staged\n");
  git(otherPath, ["add", "staged.txt"]);
  fs.renameSync(otherPath, hiddenOtherPath);
  interceptWorktreeAdd(t, root, "missing");
  const manager = new GitWorkspaceManager(store);

  await assert.rejects(manager.prepare(preparation(store, "missing-setup")), /worktree add/);
  assert.match(git(repo, ["worktree", "list", "--porcelain"]), new RegExp(otherPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  fs.renameSync(hiddenOtherPath, otherPath);
  assert.match(git(otherPath, ["status", "--porcelain"]), /^A  staged\.txt$/m);
  git(repo, ["worktree", "remove", "--force", otherPath]);
  git(repo, ["branch", "-D", "setup-other-worktree"]);
});

test("preserves an unregistered replacement directory after setup failure", async (t) => {
  const { root, repo, store } = fixture(t);
  const manager = new GitWorkspaceManager(store);
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
  const [preservedEnvelope] = envelopePaths(store);
  assert.ok(preservedEnvelope);
  assert.equal(fs.readFileSync(path.join(preservedEnvelope, "workspace", "valuable.txt"), "utf8"), "preserve me\n");
  assert.equal(git(repo, ["branch", "--list", "pi-delegate/run-replacement-race/child-replacement-race"]), "");
  assert.doesNotMatch(git(repo, ["worktree", "list", "--porcelain"]), /replacement-race/);
});

test("captures a complete tree revision and applies that exact uncommitted change set", async (t) => {
  const { repo, store, baseCommit } = fixture(t);
  const manager = new GitWorkspaceManager(store);
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
  const manager = new GitWorkspaceManager(store);
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
  const manager = new GitWorkspaceManager(store);
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

  const manager = new GitWorkspaceManager(store);
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
  const manager = new GitWorkspaceManager(store);

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
  const manager = new GitWorkspaceManager(store);
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
  const manager = new GitWorkspaceManager(store);
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

  const missingBranch = await manager.prepare(preparation(store, "missing-branch"));
  git(repo, ["update-ref", "-d", `refs/heads/${missingBranch.branch}`]);
  await assert.rejects(manager.cleanup(missingBranch), /branch is missing while its worktree remains/);
  assert.equal(fs.existsSync(missingBranch.worktreePath), true);
  git(repo, ["update-ref", `refs/heads/${missingBranch.branch}`, missingBranch.baseCommit]);
  await manager.cleanup(missingBranch);
});

test("refuses to delete a temporary branch that was repurposed after worktree removal", async (t) => {
  const { repo, store } = fixture(t);
  const manager = new GitWorkspaceManager(store);
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
  const manager = new GitWorkspaceManager(store);
  const workspace = await manager.prepare(preparation(store, "clean"));
  assert.deepEqual(await manager.inspect(workspace), { kind: "no_changes" });
  await manager.cleanup(workspace);
  assert.equal(fs.existsSync(workspace.worktreePath), false);
  assert.equal(fs.existsSync(workspace.patchPath), false);
});

test("creates an empty scratch cwd inside a private temporary envelope", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delegate-scratch-test-"));
  const source = path.join(root, "source");
  const temporaryRoot = path.join(root, "temporary");
  const legacyRoot = path.join(root, "delegate-runs");
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, "input.txt"), "source material\n");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const manager = new GitWorkspaceManager(temporaryRoot, legacyRoot, () => "owner-token");
  const workspace = await manager.prepare({
    sourceCwd: source,
    runId: "run-scratch",
    childId: "child-scratch",
    patchPath: path.join(legacyRoot, "patches", "child.patch"),
    manifestPath: path.join(legacyRoot, "patches", "child.json"),
  });

  assert.equal(workspace.kind, "temporary");
  assert.equal("repoRoot" in workspace, false);
  assert.equal(workspace.worktreePath, path.join(workspace.envelope.rootPath, "workspace"));
  assert.deepEqual(fs.readdirSync(workspace.worktreePath), []);
  assert.equal(fs.statSync(workspace.worktreePath).mode & 0o777, 0o700);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(workspace.envelope.rootPath, "owner.json"), "utf8")), {
    schemaVersion: 1,
    ownerToken: "owner-token",
  });

  fs.writeFileSync(path.join(workspace.worktreePath, "evidence.log"), "useful evidence\n");
  fs.mkdirSync(path.join(workspace.worktreePath, "raw"));
  fs.writeFileSync(path.join(workspace.worktreePath, "raw", "output.txt"), "captured output\n");
  assert.deepEqual(await manager.inspectScratch(workspace), {
    entries: ["evidence.log", "raw/", "raw/output.txt"],
    truncated: false,
  });
  await manager.cleanup(workspace);
  assert.equal(fs.existsSync(workspace.envelope.rootPath), false);
  assert.equal(fs.readFileSync(path.join(source, "input.txt"), "utf8"), "source material\n");
});

test("preserves a replaced or mismatched temporary envelope", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delegate-envelope-safety-test-"));
  const source = path.join(root, "source");
  const temporaryRoot = path.join(root, "temporary");
  fs.mkdirSync(source);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manager = new GitWorkspaceManager(temporaryRoot, temporaryRoot, () => "owner-token");
  const prepare = () => manager.prepare({
    sourceCwd: source,
    runId: "run",
    childId: "child",
    patchPath: path.join(root, "patch.patch"),
    manifestPath: path.join(root, "manifest.json"),
  });

  const mismatched = await prepare();
  fs.writeFileSync(path.join(mismatched.envelope.rootPath, "owner.json"), '{"schemaVersion":1,"ownerToken":"other"}\n');
  fs.writeFileSync(path.join(mismatched.worktreePath, "valuable.txt"), "do not delete\n");
  await assert.rejects(manager.cleanup(mismatched), /ownership changed/);
  assert.equal(fs.readFileSync(path.join(mismatched.worktreePath, "valuable.txt"), "utf8"), "do not delete\n");

  fs.rmSync(mismatched.envelope.rootPath, { recursive: true });
  const replaced = await prepare();
  const original = `${replaced.envelope.rootPath}.original`;
  fs.renameSync(replaced.envelope.rootPath, original);
  fs.mkdirSync(replaced.envelope.rootPath);
  fs.writeFileSync(path.join(replaced.envelope.rootPath, "valuable.txt"), "replacement\n");
  await assert.rejects(new GitWorkspaceManager(temporaryRoot).cleanup(replaced), /invalid ownership metadata/);
  assert.equal(fs.readFileSync(path.join(replaced.envelope.rootPath, "valuable.txt"), "utf8"), "replacement\n");
  assert.equal(fs.existsSync(original), true);
});

test("refuses a replacement envelope even when its owner marker was copied", async (t) => {
  const { root, store } = fixture(t);
  const manager = new GitWorkspaceManager(store, store, () => "owner-token");
  const workspace = await manager.prepare(preparation(path.join(root, "plain-source"), "copied-owner"));
  const original = `${workspace.envelope.rootPath}.original`;
  fs.renameSync(workspace.envelope.rootPath, original);
  fs.mkdirSync(workspace.worktreePath, { recursive: true });
  fs.copyFileSync(path.join(original, "owner.json"), path.join(workspace.envelope.rootPath, "owner.json"));
  fs.writeFileSync(path.join(workspace.worktreePath, "valuable.txt"), "keep me\n");

  await assert.rejects(manager.cleanup(workspace), /envelope identity changed/);
  assert.equal(fs.readFileSync(path.join(workspace.worktreePath, "valuable.txt"), "utf8"), "keep me\n");
  fs.rmSync(workspace.envelope.rootPath, { recursive: true });
  fs.renameSync(original, workspace.envelope.rootPath);
  await manager.cleanup(workspace);
});

test("recovers cleanup after an owned envelope was quarantined", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delegate-envelope-recovery-test-"));
  const source = path.join(root, "source");
  const temporaryRoot = path.join(root, "temporary");
  fs.mkdirSync(source);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manager = new GitWorkspaceManager(temporaryRoot, temporaryRoot, () => "owner-token");
  const workspace = await manager.prepare({
    sourceCwd: source,
    runId: "run",
    childId: "child",
    patchPath: path.join(root, "patch.patch"),
    manifestPath: path.join(root, "manifest.json"),
  });
  const quarantine = `${workspace.envelope.rootPath}.cleanup-owner-token`;
  fs.renameSync(workspace.envelope.rootPath, quarantine);

  await new GitWorkspaceManager(temporaryRoot).cleanup(workspace);
  assert.equal(fs.existsSync(quarantine), false);
});

test("refuses a linked worktree moved into scratch without registration repair", async (t) => {
  const { root, repo, store } = fixture(t);
  const source = path.join(root, "plain-source");
  const externalPath = path.join(root, "external-worktree");
  fs.mkdirSync(source);
  const manager = new GitWorkspaceManager(store, store, () => "owner-token");
  const workspace = await manager.prepare({ ...preparation(store, "moved-registration"), sourceCwd: source });
  git(repo, ["branch", "moved-registration"]);
  git(repo, ["worktree", "add", externalPath, "moved-registration"]);
  fs.writeFileSync(path.join(externalPath, "staged.txt"), "keep staged\n");
  git(externalPath, ["add", "staged.txt"]);
  fs.rmSync(workspace.worktreePath, { recursive: true });
  fs.renameSync(externalPath, workspace.worktreePath);

  await assert.rejects(manager.cleanup(workspace), /registered Git worktree/);
  assert.match(git(workspace.worktreePath, ["status", "--porcelain"]), /^A  staged\.txt$/m);
  git(repo, ["worktree", "repair", workspace.worktreePath]);
  git(repo, ["worktree", "remove", "--force", workspace.worktreePath]);
  git(repo, ["branch", "-D", "moved-registration"]);
  await manager.cleanup(workspace);
});

test("restores a quarantined scratch envelope instead of deleting a registered worktree", async (t) => {
  const { root, repo, store } = fixture(t);
  const source = path.join(root, "plain-source");
  fs.mkdirSync(source);
  const manager = new GitWorkspaceManager(store, store, () => "owner-token");
  const workspace = await manager.prepare({ ...preparation(store, "quarantined-registration"), sourceCwd: source });
  const quarantine = `${workspace.envelope.rootPath}.cleanup-owner-token`;
  fs.rmSync(workspace.worktreePath, { recursive: true });
  git(repo, ["branch", "quarantined-registration"]);
  git(repo, ["worktree", "add", workspace.worktreePath, "quarantined-registration"]);
  fs.writeFileSync(path.join(workspace.worktreePath, "staged.txt"), "keep staged\n");
  git(workspace.worktreePath, ["add", "staged.txt"]);
  fs.renameSync(workspace.envelope.rootPath, quarantine);

  await assert.rejects(manager.cleanup(workspace), /registered Git worktree/);
  assert.equal(fs.existsSync(workspace.worktreePath), true);
  assert.match(git(repo, ["worktree", "list", "--porcelain"]), new RegExp(workspace.worktreePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(git(workspace.worktreePath, ["status", "--porcelain"]), /^A  staged\.txt$/m);

  git(repo, ["worktree", "remove", "--force", workspace.worktreePath]);
  git(repo, ["branch", "-D", "quarantined-registration"]);
  await manager.cleanup(workspace);
});

test("treats an OS-expired scratch envelope as already cleaned", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delegate-envelope-expiry-test-"));
  const source = path.join(root, "source");
  const temporaryRoot = path.join(root, "temporary");
  fs.mkdirSync(source);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manager = new GitWorkspaceManager(temporaryRoot, temporaryRoot, () => "owner-token");
  const workspace = await manager.prepare({
    sourceCwd: source,
    runId: "run",
    childId: "child",
    patchPath: path.join(root, "patch.patch"),
    manifestPath: path.join(root, "manifest.json"),
  });
  fs.rmSync(workspace.envelope.rootPath, { recursive: true });

  assert.deepEqual(await new GitWorkspaceManager(temporaryRoot).inspectScratch(workspace), {
    entries: [],
    truncated: false,
    error: "Scratch workspace expired",
  });
  await new GitWorkspaceManager(temporaryRoot).cleanup(workspace);
});

test("treats a missing OS temporary root as scratch expiry", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delegate-root-expiry-test-"));
  const source = path.join(root, "source");
  const temporaryRoot = path.join(root, "temporary");
  fs.mkdirSync(source);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manager = new GitWorkspaceManager(temporaryRoot, temporaryRoot, () => "owner-token");
  const workspace = await manager.prepare({
    sourceCwd: source,
    runId: "run",
    childId: "child",
    patchPath: path.join(root, "patch.patch"),
    manifestPath: path.join(root, "manifest.json"),
  });
  fs.rmSync(temporaryRoot, { recursive: true });

  assert.deepEqual(await manager.inspectScratch(workspace), {
    entries: [],
    truncated: false,
    error: "Scratch workspace expired",
  });
  await manager.cleanup(workspace);
});

test("keeps legacy scratch inspection and cleanup compatible", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delegate-legacy-scratch-test-"));
  const temporaryRoot = path.join(root, "temporary");
  const legacyRoot = path.join(root, "delegate-runs");
  const legacyPath = path.join(legacyRoot, "parent", "run", "worktrees", "child");
  fs.mkdirSync(legacyPath, { recursive: true });
  fs.writeFileSync(path.join(legacyPath, "evidence.txt"), "legacy\n");
  const info = fs.lstatSync(legacyPath, { bigint: true });
  const workspace = {
    kind: "temporary",
    sourceCwd: root,
    worktreePath: legacyPath,
    directoryIdentity: { dev: info.dev.toString(), ino: info.ino.toString() },
    integration: { state: "working" },
  };
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manager = new GitWorkspaceManager(temporaryRoot, legacyRoot);

  assert.deepEqual(await manager.inspectScratch(workspace), { entries: ["evidence.txt"], truncated: false });
  await manager.cleanup(workspace);
  assert.equal(fs.existsSync(legacyPath), false);
});

test("refuses legacy cleanup when its durable root is missing", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delegate-missing-legacy-root-test-"));
  const temporaryRoot = path.join(root, "temporary");
  const legacyRoot = path.join(root, "delegate-runs");
  const movedRoot = path.join(root, "moved-delegate-runs");
  const legacyPath = path.join(legacyRoot, "parent", "run", "worktrees", "child");
  fs.mkdirSync(legacyPath, { recursive: true });
  fs.writeFileSync(path.join(legacyPath, "evidence.txt"), "legacy\n");
  const info = fs.lstatSync(legacyPath, { bigint: true });
  const workspace = {
    kind: "temporary",
    sourceCwd: root,
    worktreePath: legacyPath,
    directoryIdentity: { dev: info.dev.toString(), ino: info.ino.toString() },
    integration: { state: "working" },
  };
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manager = new GitWorkspaceManager(temporaryRoot, legacyRoot);
  await manager.inspectScratch(workspace);
  fs.renameSync(legacyRoot, movedRoot);

  await assert.rejects(manager.cleanup(workspace), /Legacy delegate root is missing/);
  assert.equal(fs.readFileSync(path.join(movedRoot, "parent", "run", "worktrees", "child", "evidence.txt"), "utf8"), "legacy\n");
  fs.renameSync(movedRoot, legacyRoot);
  await manager.cleanup(workspace);
});

test("never treats a registered Git worktree as legacy scratch", async (t) => {
  const { repo, store } = fixture(t);
  const manager = new GitWorkspaceManager(store, store);
  const workspace = await manager.prepare(preparation(store, "registered-not-scratch"));
  const info = fs.lstatSync(workspace.worktreePath, { bigint: true });
  const disguised = {
    kind: "temporary",
    sourceCwd: repo,
    worktreePath: workspace.worktreePath,
    directoryIdentity: { dev: info.dev.toString(), ino: info.ino.toString() },
    integration: { state: "working" },
  };

  await assert.rejects(manager.cleanup(disguised), /outside the delegate temporary root|registered Git worktree/);
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
