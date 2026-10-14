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
  atomicWriteReport,
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
  todayInTimeZone,
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

function testConfig(base, optionalEnabled = true, overrides = {}) {
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
          ...overrides,
        },
      },
    }),
  );
  return { configPath, gitRoot, vault };
}

function commandEnvironment(t) {
  const base = temporaryDirectory(t);
  const bin = path.join(base, "bin");
  fs.mkdirSync(bin);
  if (!GIT) throw new Error("git is required for tests");
  fs.symlinkSync(GIT, path.join(bin, "git"));
  return { base, env: { ...process.env, PATH: bin }, bin };
}

const REPORT_DATE = "2020-07-09";
const REPORT_BODY = `# Work report — ${REPORT_DATE}\n\n## Summary\n\nActivity from supplied evidence.\n\n## Activity\n\n- Test activity.\n\n## Sources\n\n- Local Git.\n`;

function cli(env, configPath, args) {
  return spawnSync(process.execPath, [CLI_PATH, ...args, "--config", configPath], {
    env, encoding: "utf8",
  });
}

function collectedFixture(t, optionalEnabled = true, overrides = {}) {
  const environment = commandEnvironment(t);
  const config = testConfig(environment.base, optionalEnabled, overrides);
  const result = cli(environment.env, config.configPath, ["collect", "work", REPORT_DATE]);
  assert.equal(result.status, 0, result.stderr);
  const evidencePath = path.join(environment.base, "evidence.json");
  const bodyPath = path.join(environment.base, "body.md");
  fs.writeFileSync(evidencePath, result.stdout);
  fs.writeFileSync(bodyPath, REPORT_BODY);
  return {
    ...environment, ...config, evidencePath, bodyPath, evidence: JSON.parse(result.stdout),
    reportPath: path.join(config.vault, "daily-reports", "2020", `${REPORT_DATE}.md`),
  };
}

function publish(fixture, flags = [], env = fixture.env) {
  return cli(env, fixture.configPath, [
    "publish", "work", "--evidence", fixture.evidencePath, "--body", fixture.bodyPath, ...flags,
  ]);
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
  assert.match(invocation.stdout, /daily-report collect PROFILE/);
  assert.match(invocation.stdout, /daily-report publish PROFILE/);
  assert.ok(invocation.stdout.includes(path.resolve(TEST_DIRECTORY, "../references/report-system-prompt.md")));
  const second = install();
  assert.equal(second.status, 0, second.stderr);
  const removal = spawnSync(process.execPath, [CLI_PATH, "remove-cli", "--bin-dir", bin], {
    encoding: "utf8",
  });
  assert.equal(removal.status, 0, removal.stderr);
  assert.equal(fs.existsSync(launcher), false);
});

test("collection and publication work without Pi and preserve partial report format", (t) => {
  const fixture = collectedFixture(t);
  assert.equal(resolveExecutable("pi", fixture.env), undefined);
  assert.equal(fs.existsSync(fixture.reportPath), false);
  assert.deepEqual(fixture.evidence.report, {
    date: REPORT_DATE, profile: "work", window: dateWindow(REPORT_DATE, "UTC"), previousReportHash: null,
  });
  assert.doesNotMatch(fs.readFileSync(fixture.evidencePath, "utf8"), /reason|warning/i);
  assert.equal(fixture.evidence.sources.github.status, "unavailable");
  assert.equal(fixture.evidence.sources.shortcut.status, "unavailable");

  // Publishing uses captured evidence, not installed collector commands.
  const result = publish(fixture, [], { ...fixture.env, PATH: "" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).action, "written");
  assert.equal(reportGenerationStatus(fixture.reportPath), "partial");
  const report = fs.readFileSync(fixture.reportPath, "utf8");
  assert.match(report, /^---\ntype: Daily Report\n/);
  assert.match(report, /title: "Work report — 2020-07-09"/);
  assert.match(report, /timestamp: "\d{4}-\d{2}-\d{2}T/);
  assert.match(report, /sources_unavailable:\n  - "github"\n  - "shortcut"/);
  assert.match(report, /> Source coverage: Git available; GitHub and Shortcut unavailable\./);
  assert.ok(report.endsWith(REPORT_BODY));
});

test("legacy scheduler lifecycle commands are unavailable", () => {
  for (const command of ["install-schedule", "remove-schedule", "install-cron", "remove-cron"]) {
    const result = spawnSync(process.execPath, [CLI_PATH, command], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(`Unknown command: ${command}`));
  }
});

test("disabled optional sources produce a complete report and Pi settings are not resolved", (t) => {
  const fixture = collectedFixture(t, false, { pi: { model: "unused", timeoutSeconds: -1 } });
  const config = JSON.parse(fs.readFileSync(fixture.configPath, "utf8"));
  assert.equal(Object.hasOwn(resolveProfile(config, "work"), "pi"), false);
  const result = publish(fixture);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(reportGenerationStatus(fixture.reportPath), "complete");
  assert.match(fs.readFileSync(fixture.reportPath, "utf8"), /sources_skipped:\n  - "github"\n  - "shortcut"/);
  const doctor = cli(fixture.env, fixture.configPath, ["doctor", "work"]);
  assert.equal(doctor.status, 0, doctor.stderr);
  assert.doesNotMatch(doctor.stdout, /pi:/);
});

test("missing Git is fatal for collection and leaves the report date absent", (t) => {
  const { base, env } = commandEnvironment(t);
  const { configPath, vault } = testConfig(base, false);
  const result = cli({ ...env, PATH: "" }, configPath, ["collect", "work", REPORT_DATE]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Required command not found on PATH: git/);
  assert.equal(fs.existsSync(path.join(vault, "daily-reports", "2020", `${REPORT_DATE}.md`)), false);
});

test("CLI collects real Git evidence at exact timezone boundaries without writing a report", (t) => {
  const { base, env } = commandEnvironment(t);
  const { configPath, gitRoot, vault } = testConfig(base, false, {
    timezone: "America/New_York", gitAuthors: ["test@example.com"],
  });
  const git = (args, extraEnv = {}) => {
    const result = spawnSync(GIT, args, { cwd: gitRoot, env: { ...process.env, ...extraEnv }, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  };
  git(["init", "-q"]);
  git(["config", "user.name", "Test User"]);
  git(["config", "user.email", "test@example.com"]);
  for (const [subject, instant, author] of [
    ["Before", "2020-07-09T03:59:59Z", "test@example.com"],
    ["Start", "2020-07-09T04:00:00Z", "test@example.com"],
    ["Inside", "2020-07-09T12:00:00Z", "test@example.com"],
    ["Other author", "2020-07-09T13:00:00Z", "other@example.com"],
    ["End", "2020-07-10T04:00:00Z", "test@example.com"],
  ]) {
    git(["commit", "-q", "--allow-empty", "-m", subject], {
      GIT_AUTHOR_DATE: instant, GIT_COMMITTER_DATE: instant, GIT_AUTHOR_EMAIL: author,
    });
  }
  const result = cli(env, configPath, ["collect", "work", REPORT_DATE]);
  assert.equal(result.status, 0, result.stderr);
  const evidence = JSON.parse(result.stdout);
  assert.deepEqual(evidence.sources.git.items.map((item) => item.subject), ["Start", "Inside"]);
  assert.deepEqual(evidence.report.window, dateWindow(REPORT_DATE, "America/New_York"));
  assert.deepEqual(fs.readdirSync(path.join(vault, "daily-reports", "2020")), []);
});

test("reconcile lists only eligible missing dates and honors refresh and force", (t) => {
  const { base, env } = commandEnvironment(t);
  const timezone = "Pacific/Kiritimati";
  const { configPath, vault } = testConfig(base, false, {
    timezone, reportDays: ["mon", "tue", "wed", "thu", "fri"],
  });
  const today = todayInTimeZone(timezone);
  const eligible = reconcileDates({ maxReconcileDays: 7, reportDays: [1, 2, 3, 4, 5] }, today);
  for (const [date, content] of [
    [eligible[0], "---\ngeneration_status: complete\n---\nComplete report\n"],
    [eligible[1], "---\ngeneration_status: partial\n---\nPartial report\n"],
    [eligible[2], "An existing handwritten report\n"],
  ]) {
    const directory = path.join(vault, "daily-reports", date.slice(0, 4));
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, `${date}.md`), content);
  }
  for (const [flags, expected] of [
    [[], eligible.slice(3)],
    [["--refresh-partial"], [eligible[1], ...eligible.slice(3)]],
    [["--force"], eligible],
  ]) {
    const result = cli(env, configPath, ["reconcile", "work", ...flags]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { profile: "work", today, dates: expected });
  }
  const capped = cli(env, configPath, ["reconcile", "work", "--max-days", "1", "--force"]);
  assert.equal(capped.status, 0, capped.stderr);
  assert.deepEqual(JSON.parse(capped.stdout).dates, eligible.includes(today) ? [today] : []);
});

test("collect defaults to the profile date and refuses invalid or future dates", (t) => {
  const { base, env } = commandEnvironment(t);
  const timezone = "Pacific/Kiritimati";
  const { configPath } = testConfig(base, false, { timezone });
  const result = cli(env, configPath, ["collect", "work"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).report.date, todayInTimeZone(timezone));
  for (const date of ["2020-02-30", "../../outside", "9999-01-01"]) {
    const invalid = cli(env, configPath, ["collect", "work", date]);
    assert.equal(invalid.status, 1, invalid.stderr);
    assert.equal(invalid.stdout, "");
  }
});

test("publication protects reports created after collection and force explicitly replaces them", (t) => {
  const fixture = collectedFixture(t, false);
  const original = "Handwritten report with no producer metadata.\n";
  fs.writeFileSync(fixture.reportPath, original);
  for (const flags of [[], ["--refresh-partial"]]) {
    const result = publish(fixture, flags);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).action, "skipped");
    assert.equal(fs.readFileSync(fixture.reportPath, "utf8"), original);
    const collected = cli(fixture.env, fixture.configPath, ["collect", "work", REPORT_DATE, ...flags]);
    assert.equal(collected.status, 0, collected.stderr);
    assert.equal(JSON.parse(collected.stdout).action, "skipped");
  }
  const result = publish(fixture, ["--force"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).action, "written");
  assert.equal(reportGenerationStatus(fixture.reportPath), "complete");
  const forced = cli(fixture.env, fixture.configPath, ["collect", "work", REPORT_DATE, "--force"]);
  assert.equal(forced.status, 0, forced.stderr);
  assert.equal(JSON.parse(forced.stdout).report.date, REPORT_DATE);
});

test("refresh-partial rechecks status at publication and never replaces a complete report", (t) => {
  const fixture = collectedFixture(t);
  assert.equal(publish(fixture).status, 0);
  assert.equal(reportGenerationStatus(fixture.reportPath), "partial");
  const collected = cli(fixture.env, fixture.configPath, ["collect", "work", REPORT_DATE, "--refresh-partial"]);
  assert.equal(collected.status, 0, collected.stderr);
  fixture.evidence = JSON.parse(collected.stdout);
  assert.match(fixture.evidence.report.previousReportHash, /^[a-f0-9]{64}$/);

  fixture.evidence.sources.github.status = "ok";
  fixture.evidence.sources.shortcut.status = "ok";
  fs.writeFileSync(fixture.evidencePath, JSON.stringify(fixture.evidence));
  const refreshed = publish(fixture, ["--refresh-partial"]);
  assert.equal(refreshed.status, 0, refreshed.stderr);
  assert.equal(reportGenerationStatus(fixture.reportPath), "complete");
  const complete = fs.readFileSync(fixture.reportPath, "utf8");
  fs.writeFileSync(fixture.bodyPath, REPORT_BODY.replace("Test activity", "Late stale synthesis"));
  const late = publish(fixture, ["--refresh-partial"]);
  assert.equal(late.status, 0, late.stderr);
  assert.equal(JSON.parse(late.stdout).action, "skipped");
  assert.equal(fs.readFileSync(fixture.reportPath, "utf8"), complete);
});

test("optional authentication and network failures stay out of synthesis evidence", (t) => {
  const { base, bin, env } = commandEnvironment(t);
  const { configPath } = testConfig(base, true);
  for (const command of ["gh", "short"]) {
    writeExecutable(path.join(bin, command), `#!${process.execPath}\nconsole.error('simulated authentication or network failure'); process.exit(1);\n`);
  }
  const result = cli(env, configPath, ["collect", "work", REPORT_DATE]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /simulated authentication or network failure/);
  assert.doesNotMatch(result.stdout, /failure|reason|warnings/);
  const evidence = JSON.parse(result.stdout);
  assert.equal(evidence.sources.github.status, "unavailable");
  assert.equal(evidence.sources.shortcut.status, "unavailable");
});

test("invalid evidence and bodies fail before publication without leaving a lock", (t) => {
  const fixture = collectedFixture(t, false);
  const lockPath = path.join(path.dirname(fixture.reportPath), `.${REPORT_DATE}.md.lock`);
  const original = fs.readFileSync(fixture.evidencePath, "utf8");
  for (const mutate of [
    (evidence) => { evidence.report.profile = "personal"; },
    (evidence) => { evidence.report.date = "../outside"; },
    (evidence) => { evidence.report.date = "9999-01-01"; },
    (evidence) => { evidence.report.window.start = "2020-07-08T00:00:00.000Z"; },
    (evidence) => { evidence.sources.git.status = "skipped"; },
    (evidence) => { delete evidence.sources.shortcut; },
    (evidence) => { delete evidence.report.previousReportHash; },
  ]) {
    const evidence = JSON.parse(original);
    mutate(evidence);
    fs.writeFileSync(fixture.evidencePath, JSON.stringify(evidence));
    const result = publish(fixture);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(fs.existsSync(fixture.reportPath), false);
    assert.equal(fs.existsSync(lockPath), false);
  }
  fs.writeFileSync(fixture.evidencePath, "invalid json");
  assert.match(publish(fixture).stderr, /Invalid evidence JSON/);
  fs.writeFileSync(fixture.evidencePath, original);
  fs.writeFileSync(fixture.bodyPath, "Not a report");
  assert.match(publish(fixture).stderr, /Invalid or empty Markdown report body/);
  fs.unlinkSync(fixture.bodyPath);
  assert.match(publish(fixture).stderr, /Could not read body file/);
  assert.equal(fs.existsSync(fixture.reportPath), false);
  assert.equal(fs.existsSync(lockPath), false);
});

test("publication normalizes wrappers without accepting body-owned metadata", (t) => {
  const fixture = collectedFixture(t, false);
  fs.writeFileSync(fixture.bodyPath, `\u001b[32m\`\`\`markdown\n---\ngeneration_status: partial\n---\n\n${REPORT_BODY}\`\`\`\u001b[0m`);
  const result = publish(fixture);
  assert.equal(result.status, 0, result.stderr);
  const report = fs.readFileSync(fixture.reportPath, "utf8");
  assert.equal(reportGenerationStatus(fixture.reportPath), "complete");
  assert.equal(report.match(/generation_status:/g).length, 1);
  assert.ok(report.endsWith(REPORT_BODY));
});

test("publication respects an active lock and succeeds after its owner releases it", (t) => {
  const fixture = collectedFixture(t, false);
  const release = acquireReportLock(fixture.reportPath);
  const result = publish(fixture, ["--force"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /already in progress/);
  assert.equal(fs.existsSync(fixture.reportPath), false);
  release();
  const retry = publish(fixture);
  assert.equal(retry.status, 0, retry.stderr);
});

test("single-date collection and publication refuse unsafe report files even with force", (t) => {
  for (const kind of ["symlink", "directory"]) {
    const fixture = collectedFixture(t, false);
    const outside = path.join(fixture.base, "outside.md");
    fs.writeFileSync(outside, "Must stay untouched.\n");
    if (kind === "symlink") fs.symlinkSync(outside, fixture.reportPath);
    else fs.mkdirSync(fixture.reportPath);
    const collected = cli(fixture.env, fixture.configPath, ["collect", "work", REPORT_DATE, "--force"]);
    assert.equal(collected.status, 1);
    assert.match(collected.stderr, /must be a regular file/);
    const result = publish(fixture, ["--force"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /must be a regular file/);
    assert.equal(fs.readFileSync(outside, "utf8"), "Must stay untouched.\n");
  }
});

test("atomic writes replace a report and clean up temporary files on failure", (t) => {
  const base = temporaryDirectory(t);
  const reportPath = path.join(base, "report.md");
  atomicWriteReport(reportPath, "Original report\n");
  atomicWriteReport(reportPath, "Replacement report\n");
  assert.equal(fs.readFileSync(reportPath, "utf8"), "Replacement report\n");
  assert.deepEqual(fs.readdirSync(base), ["report.md"]);

  const directory = path.join(base, "directory.md");
  fs.mkdirSync(directory);
  assert.throws(() => atomicWriteReport(directory, "Cannot replace a directory\n"));
  assert.deepEqual(fs.readdirSync(base).sort(), ["directory.md", "report.md"]);
});

test("overlapping partial refreshes cannot publish stale evidence over a newer report", (t) => {
  const fixture = collectedFixture(t);
  assert.equal(publish(fixture).status, 0);
  const absentSnapshot = publish(fixture, ["--refresh-partial"]);
  assert.equal(absentSnapshot.status, 1);
  assert.match(absentSnapshot.stderr, /Report changed after evidence collection/);

  const stale = cli(fixture.env, fixture.configPath, ["collect", "work", REPORT_DATE, "--refresh-partial"]);
  assert.equal(stale.status, 0, stale.stderr);
  fs.writeFileSync(fixture.evidencePath, stale.stdout);

  const git = (args, extraEnv = {}) => {
    const result = spawnSync(GIT, args, { cwd: fixture.gitRoot, env: { ...process.env, ...extraEnv }, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  };
  git(["init", "-q"]);
  git(["config", "user.name", "Test User"]);
  git(["config", "user.email", "test@example.com"]);
  git(["commit", "-q", "--allow-empty", "-m", "Later activity"], {
    GIT_AUTHOR_DATE: `${REPORT_DATE}T12:00:00Z`, GIT_COMMITTER_DATE: `${REPORT_DATE}T12:00:00Z`,
  });
  const newer = cli(fixture.env, fixture.configPath, ["collect", "work", REPORT_DATE, "--refresh-partial"]);
  assert.equal(newer.status, 0, newer.stderr);
  assert.equal(JSON.parse(newer.stdout).sources.git.items[0].subject, "Later activity");
  const newerFixture = {
    ...fixture, evidencePath: path.join(fixture.base, "newer-evidence.json"),
    bodyPath: path.join(fixture.base, "newer-body.md"),
  };
  fs.writeFileSync(newerFixture.evidencePath, newer.stdout);
  fs.writeFileSync(newerFixture.bodyPath, REPORT_BODY.replace("Test activity", "Later activity"));
  const written = publish(newerFixture, ["--refresh-partial"]);
  assert.equal(written.status, 0, written.stderr);
  assert.equal(reportGenerationStatus(fixture.reportPath), "partial");
  const newerReport = fs.readFileSync(fixture.reportPath, "utf8");
  const late = publish(fixture, ["--refresh-partial"]);
  assert.equal(late.status, 1);
  assert.match(late.stderr, /Collect fresh evidence before publishing/);
  assert.equal(fs.readFileSync(fixture.reportPath, "utf8"), newerReport);
  assert.equal(fs.readFileSync(fixture.evidencePath, "utf8"), stale.stdout);
  assert.equal(fs.readFileSync(newerFixture.evidencePath, "utf8"), newer.stdout);
  assert.equal(fs.existsSync(path.join(path.dirname(fixture.reportPath), `.${REPORT_DATE}.md.lock`)), false);
  const forced = publish(fixture, ["--force"]);
  assert.equal(forced.status, 0, forced.stderr);
  assert.ok(fs.readFileSync(fixture.reportPath, "utf8").endsWith(REPORT_BODY));
});

test("reconcile skips unsafe existing report files without blocking missing dates", (t) => {
  const { base, env } = commandEnvironment(t);
  const { configPath, vault } = testConfig(base, false);
  const today = todayInTimeZone("UTC");
  const dates = reconcileDates({ maxReconcileDays: 3, reportDays: [0, 1, 2, 3, 4, 5, 6] }, today);
  const reportPath = (date) => {
    const directory = path.join(vault, "daily-reports", date.slice(0, 4));
    fs.mkdirSync(directory, { recursive: true });
    return path.join(directory, `${date}.md`);
  };
  const outside = path.join(base, "outside.md");
  fs.writeFileSync(outside, "Must stay untouched.\n");
  fs.symlinkSync(outside, reportPath(dates[0]));
  fs.mkdirSync(reportPath(dates[1]));
  for (const flags of [[], ["--refresh-partial"], ["--force"]]) {
    const result = cli(env, configPath, ["reconcile", "work", "--max-days", "3", ...flags]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout).dates, [today]);
  }
  assert.equal(fs.readFileSync(outside, "utf8"), "Must stay untouched.\n");
});

test("standalone synthesis is removed rather than retained as a fallback", () => {
  const result = spawnSync(process.execPath, [CLI_PATH, "run", "work"], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown command: run/);
});
