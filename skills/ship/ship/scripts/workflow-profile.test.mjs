import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { resolveNamedProfile, resolveVaultPath, resolveWorkspaceProfile } from "./workflow-profile.mjs";

const scriptPath = fileURLToPath(new URL("./workflow-profile.mjs", import.meta.url));

function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-profile-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const home = path.join(base, "home");
  const configPath = path.join(base, "workflows.json");
  fs.mkdirSync(home, { recursive: true });
  return {
    base,
    home,
    configPath,
    directory(name) {
      const result = path.join(base, name);
      fs.mkdirSync(result, { recursive: true });
      return result;
    },
    write(profiles) {
      fs.writeFileSync(configPath, `${JSON.stringify({ version: 1, profiles }, null, 2)}\n`);
    },
  };
}

test("profile-only lookup resolves the selected readable vault without validating unavailable siblings", (t) => {
  const f = fixture(t);
  const vault = f.directory("personal-vault");
  const root = path.join(f.base, "missing-personal-root");
  f.write({
    personal: { vault, gitRoots: [root] },
    work: { vault: path.join(f.base, "missing-work-vault"), gitRoots: [path.join(f.base, "missing-work-root")] },
  });

  const result = resolveNamedProfile({ profileName: "personal", configPath: f.configPath, home: f.home, env: {} });
  assert.deepEqual(result, {
    version: 1,
    profile: { name: "personal", vault: fs.realpathSync(vault) },
  });
  assert.throws(
    () => resolveNamedProfile({ profileName: "work", configPath: f.configPath, home: f.home, env: {} }),
    /work\.vault is unavailable/,
  );
});

test("workspace lookup resolves one profile for a nested ticket worktree", (t) => {
  const f = fixture(t);
  const vault = f.directory("vault");
  const root = f.directory("personal");
  const workspace = path.join(root, "worktrees", "pi-skills-firstmate", "pi-skills");
  fs.mkdirSync(workspace, { recursive: true });
  f.write({ personal: { vault, gitRoots: [root] } });

  const result = resolveWorkspaceProfile({ cwd: workspace, configPath: f.configPath, home: f.home, env: {} });
  assert.equal(result.profile.name, "personal");
  assert.equal(result.profile.vault, fs.realpathSync(vault));
  assert.equal(result.workspace, fs.realpathSync(workspace));
  assert.equal(result.matchedGitRoot, fs.realpathSync(root));
});

test("explicit profile disambiguation still enforces workspace containment", (t) => {
  const f = fixture(t);
  const personalVault = f.directory("personal-vault");
  const personalRoot = f.directory("personal-root");
  const workVault = f.directory("work-vault");
  const workRoot = f.directory("work-root");
  const workspace = path.join(personalRoot, "repo");
  fs.mkdirSync(workspace);
  f.write({
    personal: { vault: personalVault, gitRoots: [personalRoot] },
    work: { vault: workVault, gitRoots: [workRoot] },
  });

  assert.throws(
    () => resolveWorkspaceProfile({ cwd: workspace, profileName: "work", configPath: f.configPath, home: f.home, env: {} }),
    /no available Git root containing workspace/,
  );
  assert.equal(
    resolveWorkspaceProfile({ cwd: workspace, profileName: "personal", configPath: f.configPath, home: f.home, env: {} }).profile.name,
    "personal",
  );
  assert.throws(
    () => resolveWorkspaceProfile({ cwd: workspace, profileName: "", configPath: f.configPath, home: f.home, env: {} }),
    /Invalid workflow profile name/,
  );
});

test("workspace lookup fails rather than guessing between matching profiles", (t) => {
  const f = fixture(t);
  const root = f.directory("shared-root");
  const workspace = path.join(root, "repo");
  fs.mkdirSync(workspace);
  f.write({
    personal: { vault: f.directory("personal-vault"), gitRoots: [root] },
    work: { vault: f.directory("work-vault"), gitRoots: [root, path.join(f.base, "missing-work-root")] },
  });

  assert.throws(
    () => resolveWorkspaceProfile({ cwd: workspace, configPath: f.configPath, home: f.home, env: {} }),
    /matches multiple workflow profiles: personal, work/,
  );
  fs.writeFileSync(path.join(f.directory("personal-vault"), "AGENTS.md"), "# Personal\n");
  assert.equal(
    resolveVaultPath({
      cwd: workspace,
      profileName: "personal",
      configPath: f.configPath,
      home: f.home,
      env: {},
      target: "AGENTS.md",
      mode: "read",
    }).profile.name,
    "personal",
  );
});

test("workspace lookup reports no match and unavailable profiles without selecting either", (t) => {
  const f = fixture(t);
  const workspace = f.directory("unmatched");
  f.write({
    personal: { vault: f.directory("vault"), gitRoots: [f.directory("other-root")] },
    work: { vault: path.join(f.base, "missing-vault"), gitRoots: [path.join(f.base, "missing-root")] },
  });

  assert.throws(
    () => resolveWorkspaceProfile({ cwd: workspace, configPath: f.configPath, home: f.home, env: {} }),
    /No workflow profile matches.*Unavailable profiles: work/,
  );
});

test("a matched profile fails when its vault is unavailable", (t) => {
  const f = fixture(t);
  const root = f.directory("work-root");
  const workspace = path.join(root, "repo");
  fs.mkdirSync(workspace);
  f.write({ work: { vault: path.join(f.base, "missing-vault"), gitRoots: [root] } });

  assert.throws(
    () => resolveWorkspaceProfile({ cwd: workspace, configPath: f.configPath, home: f.home, env: {} }),
    /work\.vault is unavailable/,
  );
});

test("a workspace profile uses its available matching root when another configured root is unavailable", (t) => {
  const f = fixture(t);
  const root = f.directory("work-root");
  const workspace = path.join(root, "repo");
  fs.mkdirSync(workspace);
  f.write({
    work: {
      vault: f.directory("work-vault"),
      gitRoots: [root, path.join(f.base, "missing-work-root")],
    },
  });

  const result = resolveWorkspaceProfile({ cwd: workspace, configPath: f.configPath, home: f.home, env: {} });
  assert.equal(result.profile.name, "work");
  assert.deepEqual(result.profile.gitRoots, [fs.realpathSync(root)]);
  assert.equal(result.matchedGitRoot, fs.realpathSync(root));
});

test("canonical paths allow vault aliases but prevent a workspace symlink from escaping its Git root", (t) => {
  const f = fixture(t);
  const realVault = f.directory("real-vault");
  const vaultAlias = path.join(f.base, "vault-alias");
  fs.symlinkSync(realVault, vaultAlias, "dir");
  const root = f.directory("root");
  const outside = f.directory("outside");
  const escapedWorkspace = path.join(root, "linked-repo");
  fs.symlinkSync(outside, escapedWorkspace, "dir");
  f.write({ personal: { vault: vaultAlias, gitRoots: [root] } });

  assert.equal(
    resolveNamedProfile({ profileName: "personal", configPath: f.configPath, home: f.home, env: {} }).profile.vault,
    fs.realpathSync(realVault),
  );
  assert.throws(
    () => resolveWorkspaceProfile({ cwd: escapedWorkspace, configPath: f.configPath, home: f.home, env: {} }),
    /No workflow profile matches/,
  );
});

test("workspace routing rejects equal or nested vault and workspace directories", async (t) => {
  for (const relation of ["equal", "vault-inside", "workspace-inside"]) {
    await t.test(relation, () => {
      const f = fixture(t);
      const root = f.directory(`root-${relation}`);
      let workspace;
      let vault;
      if (relation === "equal") {
        workspace = f.directory(`root-${relation}/same`);
        vault = path.join(f.base, "same-vault-alias");
        fs.symlinkSync(workspace, vault, "dir");
      } else if (relation === "vault-inside") {
        workspace = f.directory(`root-${relation}/repo`);
        vault = f.directory(`root-${relation}/repo/notes`);
      } else {
        vault = f.directory(`root-${relation}/vault`);
        workspace = f.directory(`root-${relation}/vault/repo`);
      }
      f.write({ personal: { vault, gitRoots: [root] } });
      assert.throws(
        () => resolveWorkspaceProfile({ cwd: workspace, configPath: f.configPath, home: f.home, env: {} }),
        /vault and workspace must be disjoint/,
      );
    });
  }
});

test("vault path validation permits scoped regular files and missing write targets", (t) => {
  const f = fixture(t);
  const vault = f.directory("vault");
  const root = f.directory("root");
  const workspace = f.directory("root/worktrees/sample");
  const item = path.join(vault, "projects", "pi-skills", "work", "sample");
  fs.mkdirSync(item, { recursive: true });
  fs.writeFileSync(path.join(item, "index.md"), "# Sample\n");
  f.write({ personal: { vault, gitRoots: [root] } });
  const options = { cwd: workspace, configPath: f.configPath, home: f.home, env: {}, within: "projects/pi-skills/work/sample" };

  assert.equal(resolveVaultPath({ ...options, target: "index.md", mode: "read" }).target, path.join(item, "index.md"));
  assert.equal(
    resolveVaultPath({ ...options, target: "working/handoff.md", mode: "write" }).target,
    path.join(item, "working", "handoff.md"),
  );
  assert.throws(
    () => resolveVaultPath({ profileName: "personal", configPath: f.configPath, home: f.home, env: {}, target: "new.md", mode: "write" }),
    /writes require --cwd/,
  );
});

test("vault path validation rejects symlinked leaves, escaped working directories, and traversing Current targets", (t) => {
  const f = fixture(t);
  const vault = f.directory("vault");
  const root = f.directory("root");
  const workspace = f.directory("root/worktrees/sample");
  const item = path.join(vault, "projects", "pi-skills", "work", "sample");
  const outside = f.directory("outside");
  fs.mkdirSync(item, { recursive: true });
  fs.writeFileSync(path.join(outside, "outside.md"), "outside\n");
  fs.symlinkSync(path.join(outside, "outside.md"), path.join(item, "index.md"));
  fs.symlinkSync(outside, path.join(item, "working"), "dir");
  f.write({ personal: { vault, gitRoots: [root] } });
  const options = { cwd: workspace, configPath: f.configPath, home: f.home, env: {}, within: "projects/pi-skills/work/sample" };

  assert.throws(() => resolveVaultPath({ ...options, target: "index.md", mode: "read" }), /may not traverse symbolic links/);
  assert.throws(() => resolveVaultPath({ ...options, target: "index.md", mode: "write" }), /may not traverse symbolic links/);
  assert.throws(() => resolveVaultPath({ ...options, target: "working/handoff.md", mode: "write" }), /may not traverse symbolic links/);
  assert.throws(() => resolveVaultPath({ ...options, target: "../outside.md", mode: "read" }), /canonical relative path/);
  assert.throws(() => resolveVaultPath({ ...options, target: "working/outside.md", mode: "read" }), /may not traverse symbolic links/);
});

test("leading-home paths and the environment override resolve canonically", (t) => {
  const f = fixture(t);
  const vault = path.join(f.home, "vault");
  const root = path.join(f.home, "personal");
  const workspace = path.join(root, "repo");
  fs.mkdirSync(vault);
  fs.mkdirSync(workspace, { recursive: true });
  fs.writeFileSync(path.join(f.home, "configured.json"), `${JSON.stringify({
    version: 1,
    profiles: { personal: { vault: "~/vault", gitRoots: ["~/personal"] } },
  })}\n`);

  const result = resolveWorkspaceProfile({
    cwd: workspace,
    home: f.home,
    env: { PI_SKILLS_WORKFLOW_CONFIG: "~/configured.json" },
  });
  assert.equal(result.profile.vault, fs.realpathSync(vault));
  assert.equal(result.matchedGitRoot, fs.realpathSync(root));
});

test("the CLI emits canonical JSON for the skill caller", (t) => {
  const f = fixture(t);
  const vault = f.directory("vault");
  const root = f.directory("root");
  const workspace = path.join(root, "repo");
  fs.mkdirSync(workspace);
  f.write({ personal: { vault, gitRoots: [root] } });

  const result = spawnSync(process.execPath, [scriptPath, "workspace", "--cwd", workspace, "--config", f.configPath], {
    encoding: "utf8",
    env: { ...process.env, HOME: f.home },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).profile.name, "personal");

  fs.writeFileSync(path.join(vault, "AGENTS.md"), "# Fixture\n");
  const target = spawnSync(process.execPath, [
    scriptPath,
    "path",
    "--cwd",
    workspace,
    "--target",
    "AGENTS.md",
    "--mode",
    "read",
    "--config",
    f.configPath,
  ], { encoding: "utf8", env: { ...process.env, HOME: f.home } });
  assert.equal(target.status, 0, target.stderr);
  assert.equal(JSON.parse(target.stdout).target, path.join(vault, "AGENTS.md"));
});

test("configuration input and errors stay bounded", (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.configPath, "x".repeat(64 * 1024 + 1));
  assert.throws(
    () => resolveNamedProfile({ profileName: "personal", configPath: f.configPath, home: f.home, env: {} }),
    /no larger than 65536 bytes/,
  );

  f.write({ personal: { vault: f.directory("vault"), gitRoots: [] } });
  assert.throws(
    () => resolveNamedProfile({ profileName: "personal", configPath: f.configPath, home: f.home, env: {} }),
    /gitRoots must contain 1-32 paths/,
  );
  assert.throws(
    () => resolveNamedProfile({ profileName: "personal", configPath: f.configPath, env: {} }),
    /without a home directory/,
  );

  f.write({ personal: { vault: "~RAW-CONFIG-SENTINEL", gitRoots: [f.directory("root")] } });
  assert.throws(
    () => resolveNamedProfile({ profileName: "personal", configPath: f.configPath, home: f.home, env: {} }),
    (error) => error.message.includes("unsupported home-relative syntax") && !error.message.includes("RAW-CONFIG-SENTINEL"),
  );
  const cli = spawnSync(process.execPath, [scriptPath, "profile", "--profile", "personal", "--config", f.configPath], {
    encoding: "utf8",
    env: { ...process.env, HOME: f.home },
  });
  assert.equal(cli.status, 1);
  assert.doesNotMatch(cli.stderr, /RAW-CONFIG-SENTINEL/);

  const invalidName = `${"a".repeat(60_000)}RAW-PROFILE-NAME-SENTINEL`;
  f.write({ [invalidName]: { vault: f.directory("other-vault"), gitRoots: [f.directory("other-root")] } });
  assert.throws(
    () => resolveNamedProfile({ profileName: "personal", configPath: f.configPath, home: f.home, env: {} }),
    (error) => Buffer.byteLength(error.message, "utf8") < 1024 && !error.message.includes("RAW-PROFILE-NAME-SENTINEL"),
  );
  const invalidCli = spawnSync(process.execPath, [scriptPath, "profile", "--profile", "personal", "--config", f.configPath], {
    encoding: "utf8",
    env: { ...process.env, HOME: f.home },
  });
  assert.equal(invalidCli.status, 1);
  assert.ok(Buffer.byteLength(invalidCli.stderr, "utf8") < 1024);
  assert.doesNotMatch(invalidCli.stderr, /RAW-PROFILE-NAME-SENTINEL/);
});
