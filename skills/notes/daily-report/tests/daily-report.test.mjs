import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  DailyReportError,
  acquireReportLock,
  collectGit,
  collectGithub,
  collectShortcut,
  dateWindow,
  ensureReportPath,
  reconcileDates,
  renderFrontmatter,
  reportGenerationStatus,
  resolveExecutable,
  resolveProfile,
} from "../scripts/daily-report-lib.mjs";
const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.resolve(TEST_DIRECTORY, "../scripts/daily-report.mjs");
const GIT = resolveExecutable("git");

function temporaryDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "daily-report-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function writeExecutable(filePath, content) {
  fs.writeFileSync(filePath, content, { mode: 0o755 });
}

function testConfig(base, optionalEnabled = true) {
  const vault = path.join(base, "vault");
  const gitRoot = path.join(base, "repos");
  fs.mkdirSync(vault, { recursive: true });
  fs.mkdirSync(gitRoot, { recursive: true });
  const configPath = path.join(base, "daily-report.json");
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      version: 1,
      defaults: { timezone: "UTC", maxReconcileDays: 7 },
      profiles: {
        work: {
          vault,
          gitRoots: [gitRoot],
          reportDirectory: "daily-reports",
          github: { enabled: optionalEnabled },
          shortcut: { enabled: optionalEnabled },
        },
      },
    }),
  );
  return { configPath, gitRoot, vault };
}

function fakeCommandEnvironment(t, { includePi = true } = {}) {
  const base = temporaryDirectory(t);
  const bin = path.join(base, "bin");
  fs.mkdirSync(bin);
  if (!GIT) throw new Error("git is required for tests");
  fs.symlinkSync(GIT, path.join(bin, "git"));
  if (includePi) {
    writeExecutable(
      path.join(bin, "pi"),
      "#!/bin/sh\nif [ -n \"$DAILY_REPORT_TEST_CAPTURE\" ]; then cat > \"$DAILY_REPORT_TEST_CAPTURE\"; else cat >/dev/null; fi\nprintf '# Work report — test\\n\\n## Summary\\n\\nGenerated from test evidence.\\n'\n",
    );
  }
  return { base, env: { ...process.env, PATH: bin }, bin };
}

test("dateWindow honors daylight-saving boundaries", () => {
  const spring = dateWindow("2026-03-08", "America/New_York");
  assert.equal(spring.start, "2026-03-08T05:00:00.000Z");
  assert.equal(spring.end, "2026-03-09T04:00:00.000Z");

  const fall = dateWindow("2026-11-01", "America/New_York");
  assert.equal(fall.start, "2026-11-01T04:00:00.000Z");
  assert.equal(fall.end, "2026-11-02T05:00:00.000Z");
});

test("resolveProfile rejects a report directory outside the vault", (t) => {
  const base = temporaryDirectory(t);
  const vault = path.join(base, "vault");
  const repos = path.join(base, "repos");
  fs.mkdirSync(vault);
  fs.mkdirSync(repos);
  assert.throws(
    () =>
      resolveProfile(
        {
          version: 1,
          profiles: { work: { vault, gitRoots: [repos], reportDirectory: "../outside" } },
        },
        "work",
      ),
    DailyReportError,
  );
});

test("report destination rejects symlinked base and year directories", (t) => {
  const base = temporaryDirectory(t);
  const vault = path.join(base, "vault");
  const repos = path.join(base, "repos");
  const outside = path.join(base, "outside");
  fs.mkdirSync(vault);
  fs.mkdirSync(repos);
  fs.mkdirSync(outside);
  const config = {
    version: 1,
    profiles: { work: { vault, gitRoots: [repos], reportDirectory: "daily-reports" } },
  };

  fs.symlinkSync(outside, path.join(vault, "daily-reports"));
  let profile = resolveProfile(config, "work");
  assert.throws(() => ensureReportPath(profile, "2026-07-09"), /symbolic link/);
  assert.equal(fs.existsSync(path.join(outside, "2026")), false);

  fs.unlinkSync(path.join(vault, "daily-reports"));
  fs.mkdirSync(path.join(vault, "daily-reports"));
  fs.symlinkSync(outside, path.join(vault, "daily-reports", "2026"));
  profile = resolveProfile(config, "work");
  assert.throws(() => ensureReportPath(profile, "2026-07-09"), /symbolic link/);
});

test("report lock prevents concurrent ownership and release verifies ownership", (t) => {
  const base = temporaryDirectory(t);
  const reportPath = path.join(base, "2026-07-09.md");
  const lockPath = path.join(base, ".2026-07-09.md.lock");
  const releaseFirst = acquireReportLock(reportPath);
  assert.throws(() => acquireReportLock(reportPath), /already in progress/);

  fs.unlinkSync(lockPath);
  const releaseSecond = acquireReportLock(reportPath);
  releaseFirst();
  assert.equal(fs.existsSync(lockPath), true);
  assert.throws(() => acquireReportLock(reportPath), /already in progress/);

  releaseSecond();
  const releaseThird = acquireReportLock(reportPath);
  releaseThird();
});

test("frontmatter is OKF-compatible and records partial source status", () => {
  const frontmatter = renderFrontmatter({
    profile: { name: "work" },
    date: "2026-07-09",
    timestamp: "2026-07-09T21:30:00.000Z",
    sources: {
      git: { status: "ok" },
      github: { status: "unavailable" },
      shortcut: { status: "degraded" },
    },
  });
  assert.match(frontmatter, /^---\ntype: Daily Report\n/);
  assert.match(frontmatter, /generation_status: partial/);
  assert.match(frontmatter, /sources_ok:\n  - "git"/);
  assert.match(frontmatter, /sources_degraded:\n  - "shortcut"/);
  assert.match(frontmatter, /sources_unavailable:\n  - "github"/);
});

test("reconcileDates applies a rolling calendar-day cap and weekday filter", () => {
  const profile = { maxReconcileDays: 7, reportDays: [1, 2, 3, 4, 5] };
  assert.deepEqual(reconcileDates(profile, "2026-07-09", 7), [
    "2026-07-03",
    "2026-07-06",
    "2026-07-07",
    "2026-07-08",
    "2026-07-09",
  ]);
});

test("local Git collector includes only configured author activity in the window", (t) => {
  const base = temporaryDirectory(t);
  const repository = path.join(base, "repo");
  fs.mkdirSync(repository);
  const git = (args, env = process.env) => {
    const result = spawnSync(GIT, args, { cwd: repository, env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  };
  git(["init", "-q"]);
  git(["config", "user.name", "Test User"]);
  git(["config", "user.email", "test@example.com"]);
  fs.writeFileSync(path.join(repository, "note.txt"), "inside\n");
  git(["add", "note.txt"]);
  git(["commit", "-q", "-m", "Inside window"], {
    ...process.env,
    GIT_AUTHOR_DATE: "2026-07-09T12:00:00Z",
    GIT_COMMITTER_DATE: "2026-07-09T12:00:00Z",
  });
  git(["worktree", "add", "-q", "--detach", path.join(base, "worktree"), "HEAD"]);
  fs.mkdirSync(path.join(base, "invalid", ".git"), { recursive: true });

  const result = collectGit(
    { gitRoots: [base], gitMaxDepth: 3, gitAuthors: [] },
    { git: GIT },
    { start: "2026-07-09T00:00:00.000Z", end: "2026-07-10T00:00:00.000Z" },
  );
  assert.equal(result.status, "ok");
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].subject, "Inside window");
  assert.match(result.warnings.join("\n"), /Ignored invalid Git marker/);
});

test("Git collection is fatal when every valid repository fails", (t) => {
  const base = temporaryDirectory(t);
  fs.mkdirSync(path.join(base, "repo", ".git"), { recursive: true });
  const failingGit = path.join(base, "git");
  writeExecutable(
    failingGit,
    `#!${process.execPath}\nconst args = process.argv.slice(2);\nif (args.includes('--is-inside-work-tree')) { console.log('true'); process.exit(0); }\nif (args.includes('--git-common-dir')) { console.log('.git'); process.exit(0); }\nif (args.includes('--get')) { console.log('test@example.com'); process.exit(0); }\nconsole.error('simulated log failure'); process.exit(2);\n`,
  );
  assert.throws(
    () =>
      collectGit(
        { gitRoots: [base], gitMaxDepth: 3, gitAuthors: ["test@example.com"] },
        { git: failingGit },
        { start: "2026-07-09T00:00:00.000Z", end: "2026-07-10T00:00:00.000Z" },
      ),
    /failed for every discovered repository/,
  );
});

test("GitHub collector filters owners and exact time windows", (t) => {
  const base = temporaryDirectory(t);
  const gh = path.join(base, "gh");
  writeExecutable(
    gh,
    `#!${process.execPath}\nconst endpoint = process.argv[3];\nif (endpoint === '/user') console.log(JSON.stringify({login:'tester'}));\nelse if (endpoint.includes('page=1')) console.log(JSON.stringify([\n  {id:'1',type:'PullRequestEvent',created_at:'2026-07-09T12:00:00Z',repo:{name:'Org/repo'},payload:{action:'opened',number:7,pull_request:{title:'Useful PR',html_url:'https://github.com/Org/repo/pull/7',body:'private body'}}},\n  {id:'2',type:'IssuesEvent',created_at:'2026-07-09T13:00:00Z',repo:{name:'Other/repo'},payload:{action:'opened',issue:{number:2,title:'Excluded',html_url:'https://github.com/Other/repo/issues/2'}}},\n  {id:'3',type:'IssuesEvent',created_at:'2026-07-08T23:00:00Z',repo:{name:'Org/repo'},payload:{action:'opened',issue:{number:3,title:'Old'}}}\n]));\nelse console.log('[]');\n`,
  );
  const result = collectGithub(
    { github: { enabled: true, owners: ["Org"], includeBodies: false, maxPages: 2 } },
    { gh },
    { start: "2026-07-09T00:00:00.000Z", end: "2026-07-10T00:00:00.000Z" },
  );
  assert.equal(result.status, "ok");
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].title, "Useful PR");
  assert.equal(result.items[0].body, undefined);
});

test("Shortcut collector deduplicates owned/requested stories and includes bounded history", (t) => {
  const base = temporaryDirectory(t);
  const short = path.join(base, "short");
  writeExecutable(
    short,
    `#!${process.execPath}\nconst endpoint = process.argv[3];\nconst responses = {\n  '/member': {id:'member-1',profile:{name:'Test User',mention_name:'test'}},\n  '/stories/search': [{id:42,name:'Test story',app_url:'https://app.shortcut.com/test/story/42',story_type:'feature',workflow_state_id:9,updated_at:'2026-07-09T12:00:00Z',created_at:'2026-07-01T12:00:00Z',owner_ids:['member-1'],requested_by_id:'member-1'}],\n  '/workflows': [{states:[{id:9,name:'In Development'}]}],\n  '/stories/42/history': [{changed_at:'2026-07-09T13:00:00Z',actor_name:'Test User',member_id:'member-1',actions:[{action:'update',entity_type:'story',name:'workflow state'}]}]\n};\nconsole.log(JSON.stringify(responses[endpoint] ?? []));\n`,
  );
  const result = collectShortcut(
    { shortcut: { enabled: true, includeRequested: true, maxStories: 50 } },
    { short },
    { start: "2026-07-09T00:00:00.000Z", end: "2026-07-10T00:00:00.000Z" },
  );
  assert.equal(result.status, "ok");
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].state, "In Development");
  assert.equal(result.items[0].history[0].byAuthenticatedMember, true);
});

test("CLI launcher install and removal are idempotent", (t) => {
  const base = temporaryDirectory(t);
  const bin = path.join(base, "bin");
  const install = () =>
    spawnSync(process.execPath, [CLI_PATH, "install-cli", "--bin-dir", bin], {
      encoding: "utf8",
    });
  const first = install();
  assert.equal(first.status, 0, first.stderr);
  const launcher = path.join(bin, "daily-report");
  assert.equal(fs.realpathSync(launcher), fs.realpathSync(CLI_PATH));
  const invocation = spawnSync(launcher, ["--help"], { encoding: "utf8" });
  assert.equal(invocation.status, 0, invocation.stderr);
  assert.match(invocation.stdout, /daily-report run PROFILE/);
  const second = install();
  assert.equal(second.status, 0, second.stderr);
  const removal = spawnSync(process.execPath, [CLI_PATH, "remove-cli", "--bin-dir", bin], {
    encoding: "utf8",
  });
  assert.equal(removal.status, 0, removal.stderr);
  assert.equal(fs.existsSync(launcher), false);
});

test("missing optional CLIs still writes a partial report and exits successfully", (t) => {
  const { base, env } = fakeCommandEnvironment(t);
  const { configPath, vault } = testConfig(base, true);
  const capturePath = path.join(base, "evidence.json");
  const result = spawnSync(
    process.execPath,
    [CLI_PATH, "run", "work", "2026-07-09", "--config", configPath],
    { env: { ...env, DAILY_REPORT_TEST_CAPTURE: capturePath }, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const reportPath = path.join(vault, "daily-reports", "2026", "2026-07-09.md");
  assert.equal(reportGenerationStatus(reportPath), "partial");
  const report = fs.readFileSync(reportPath, "utf8");
  assert.match(report, /sources_unavailable:\n  - "github"\n  - "shortcut"/);
  assert.match(report, /> Source coverage: Git available; GitHub and Shortcut unavailable\./);
  const promptEvidence = fs.readFileSync(capturePath, "utf8");
  assert.doesNotMatch(promptEvidence, /reason|warning/i);
});

test("removed legacy schedule fields fail with shared-scheduler guidance", (t) => {
  const base = temporaryDirectory(t);
  const { configPath } = testConfig(base, false);
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  config.profiles.work.schedule = "30 17 * * 1-5";
  fs.writeFileSync(configPath, JSON.stringify(config));

  const result = spawnSync(
    process.execPath,
    [CLI_PATH, "doctor", "work", "--config", configPath],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /schedule is no longer supported; declare cadence with scheduled-jobs/);
});

test("legacy scheduler lifecycle commands are unavailable", () => {
  for (const command of ["install-schedule", "remove-schedule", "install-cron", "remove-cron"]) {
    const result = spawnSync(process.execPath, [CLI_PATH, command], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(`Unknown command: ${command}`));
  }
});

test("disabled optional sources produce a complete report", (t) => {
  const { base, env } = fakeCommandEnvironment(t);
  const { configPath, vault } = testConfig(base, false);
  const result = spawnSync(
    process.execPath,
    [CLI_PATH, "run", "work", "2026-07-09", "--config", configPath],
    { env, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const reportPath = path.join(vault, "daily-reports", "2026", "2026-07-09.md");
  assert.equal(reportGenerationStatus(reportPath), "complete");
  assert.match(fs.readFileSync(reportPath, "utf8"), /sources_skipped:/);
});

test("missing Pi is fatal and leaves the report date absent", (t) => {
  const { base, env } = fakeCommandEnvironment(t, { includePi: false });
  const { configPath, vault } = testConfig(base, false);
  const result = spawnSync(
    process.execPath,
    [CLI_PATH, "run", "work", "2026-07-09", "--config", configPath],
    { env, encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Required command not found on PATH: pi/);
  assert.equal(fs.existsSync(path.join(vault, "daily-reports", "2026", "2026-07-09.md")), false);
});
