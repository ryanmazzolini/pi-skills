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
  cronBlock,
  dateWindow,
  ensureReportPath,
  launchdDefinition,
  nativeSchedule,
  readCrontab,
  reconcileDates,
  renderFrontmatter,
  replaceCronBlock,
  reportGenerationStatus,
  resolveExecutable,
  resolveProfile,
  systemdDefinitions,
} from "../scripts/daily-report-lib.mjs";
import {
  installLaunchd,
  installSystemd,
  removeLaunchd,
  removeSystemd,
} from "../scripts/daily-report.mjs";

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

test("cron block replacement is idempotent and preserves unrelated entries", (t) => {
  const base = temporaryDirectory(t);
  const profile = { name: "work", schedule: "30 17 * * 1-5" };
  const tools = { pi: "/opt/bin/pi", git: "/usr/bin/git" };
  const block = cronBlock({
    profile,
    configPath: path.join(base, "set%tings.json"),
    tools,
    scriptPath: "/opt/daily report.mjs",
    env: { XDG_STATE_HOME: path.join(base, "state%dir") },
  });
  const original = "0 9 * * * /usr/bin/example\n";
  const once = replaceCronBlock(original, block.marker, block.text);
  const twice = replaceCronBlock(once, block.marker, block.text);
  assert.equal(twice, once);
  assert.match(once, /\/usr\/bin\/example/);
  assert.equal((once.match(/# BEGIN daily-report:work/g) || []).length, 1);
  assert.match(once, /set\\%tings\.json/);
  assert.match(once, /state\\%dir/);
});

test("native schedule parsing supports fixed times and numeric weekdays", () => {
  assert.deepEqual(nativeSchedule("30 17 * * 1-5"), {
    hour: 17,
    minute: 30,
    weekdays: [1, 2, 3, 4, 5],
  });
  assert.deepEqual(nativeSchedule("0 9 * * 7,1"), {
    hour: 9,
    minute: 0,
    weekdays: [0, 1],
  });
  assert.equal(nativeSchedule("*/15 9 * * 1-5"), undefined);
  assert.equal(nativeSchedule("30 17 1 * *"), undefined);
});

test("launchd definition uses calendar intervals and absolute command paths", (t) => {
  const base = temporaryDirectory(t);
  const definition = launchdDefinition({
    profile: { name: "work", schedule: "30 17 * * 1-5" },
    configPath: path.join(base, "settings & reports.json"),
    tools: { pi: "/opt/bin/pi", git: "/usr/bin/git" },
    scriptPath: "/opt/daily report.mjs",
    env: {
      PATH: "/wrapper/bin:/usr/bin",
      XDG_STATE_HOME: path.join(base, "state"),
    },
    homeDirectory: base,
  });
  assert.equal(
    definition.plistPath,
    path.join(base, "Library", "LaunchAgents", "com.llm-wiki.daily-report.work.plist"),
  );
  assert.match(definition.plist, /<key>RunAtLoad<\/key>\n  <true\/>/);
  assert.match(definition.plist, /<key>Weekday<\/key>\n        <integer>1<\/integer>/);
  assert.match(definition.plist, /<integer>5<\/integer>/);
  assert.match(definition.plist, /settings &amp; reports\.json/);
  assert.match(definition.plist, /<string>\/opt\/daily report\.mjs<\/string>/);
  assert.match(definition.plist, /<string>\/wrapper\/bin:\/usr\/bin:/);
});

test("systemd definitions use a persistent user timer", (t) => {
  const base = temporaryDirectory(t);
  const definitions = systemdDefinitions({
    profile: { name: "work", schedule: "30 17 * * 1-5" },
    configPath: path.join(base, "settings.json"),
    tools: { pi: "/opt/bin/pi", git: "/usr/bin/git" },
    scriptPath: "/opt/daily report.mjs",
    env: { XDG_CONFIG_HOME: path.join(base, "config") },
    homeDirectory: base,
  });
  assert.equal(
    definitions.timerPath,
    path.join(base, "config", "systemd", "user", "daily-report-work.timer"),
  );
  assert.match(definitions.timer, /OnCalendar=Mon,Tue,Wed,Thu,Fri \*-\*-\* 17:30:00/);
  assert.match(definitions.timer, /Persistent=true/);
  assert.match(definitions.service, /ExecStart="[^"]+node" "\/opt\/daily report\.mjs"/);
  assert.match(definitions.service, /"--config" ".*settings\.json"/);
});

test("launchd update restores a previously loaded job after bootstrap failure", (t) => {
  const base = temporaryDirectory(t);
  const label = "com.llm-wiki.daily-report.work";
  const plistPath = path.join(base, "Library", "LaunchAgents", `${label}.plist`);
  fs.mkdirSync(path.dirname(plistPath), { recursive: true });
  fs.writeFileSync(plistPath, "previous plist\n");
  const launchctl = path.join(base, "launchctl");
  writeExecutable(
    launchctl,
    `#!${process.execPath}
const fs = require('node:fs');
const [command, target, plist] = process.argv.slice(2);
if (command === 'print') process.exit(0);
if (command === 'bootout' || command === 'enable') process.exit(0);
if (command === 'bootstrap') {
  if (fs.readFileSync(plist, 'utf8') === 'previous plist\\n') process.exit(0);
  console.error('simulated bootstrap failure');
  process.exit(1);
}
process.exit(2);
`,
  );
  const result = installLaunchd(
    { name: "work", schedule: "30 17 * * 1-5" },
    path.join(base, "settings.json"),
    { tools: { pi: "/opt/bin/pi", git: "/usr/bin/git" } },
    { env: { XDG_STATE_HOME: path.join(base, "state") }, homeDirectory: base, launchctl },
  );
  assert.equal(result.ok, false);
  assert.equal(result.preserved, true);
  assert.equal(fs.readFileSync(plistPath, "utf8"), "previous plist\n");
});

test("launchd removal keeps its plist when bootout fails", (t) => {
  const base = temporaryDirectory(t);
  const label = "com.llm-wiki.daily-report.work";
  const plistPath = path.join(base, "Library", "LaunchAgents", `${label}.plist`);
  fs.mkdirSync(path.dirname(plistPath), { recursive: true });
  fs.writeFileSync(plistPath, "existing plist\n");
  const launchctl = path.join(base, "launchctl");
  writeExecutable(
    launchctl,
    `#!${process.execPath}
const command = process.argv[2];
if (command === 'print') process.exit(0);
if (command === 'bootout') { console.error('still loaded'); process.exit(1); }
process.exit(2);
`,
  );
  assert.throws(
    () => removeLaunchd({ name: "work" }, { homeDirectory: base, launchctl }),
    /still loaded/,
  );
  assert.equal(fs.existsSync(plistPath), true);
});

test("launchd unsupported schedule removes the old job before cron fallback", (t) => {
  const base = temporaryDirectory(t);
  const label = "com.llm-wiki.daily-report.work";
  const plistPath = path.join(base, "Library", "LaunchAgents", `${label}.plist`);
  fs.mkdirSync(path.dirname(plistPath), { recursive: true });
  fs.writeFileSync(plistPath, "existing plist\n");
  const launchctl = path.join(base, "launchctl");
  writeExecutable(
    launchctl,
    `#!${process.execPath}
const command = process.argv[2];
if (command === 'print' || command === 'bootout') process.exit(0);
process.exit(2);
`,
  );
  const result = installLaunchd(
    { name: "work", schedule: "*/15 9 * * 1-5" },
    path.join(base, "settings.json"),
    { tools: { pi: "/opt/bin/pi", git: "/usr/bin/git" } },
    { homeDirectory: base, launchctl },
  );
  assert.equal(result.ok, false);
  assert.equal(result.preserved, false);
  assert.equal(fs.existsSync(plistPath), false);
});

test("launchd failed bootout suppresses cron fallback even without an old plist", (t) => {
  const base = temporaryDirectory(t);
  const label = "com.llm-wiki.daily-report.work";
  const plistPath = path.join(base, "Library", "LaunchAgents", `${label}.plist`);
  const launchctl = path.join(base, "launchctl");
  writeExecutable(
    launchctl,
    `#!${process.execPath}
const command = process.argv[2];
if (command === 'print') process.exit(0);
if (command === 'bootout') { console.error('still loaded'); process.exit(1); }
process.exit(2);
`,
  );
  const result = installLaunchd(
    { name: "work", schedule: "30 17 * * 1-5" },
    path.join(base, "settings.json"),
    { tools: { pi: "/opt/bin/pi", git: "/usr/bin/git" } },
    { env: { XDG_STATE_HOME: path.join(base, "state") }, homeDirectory: base, launchctl },
  );
  assert.equal(result.ok, false);
  assert.equal(result.preserved, true);
  assert.equal(fs.existsSync(plistPath), false);
});

test("launchd bootstrap failure does not preserve a loaded job without its old plist", (t) => {
  const base = temporaryDirectory(t);
  const label = "com.llm-wiki.daily-report.work";
  const plistPath = path.join(base, "Library", "LaunchAgents", `${label}.plist`);
  const launchctl = path.join(base, "launchctl");
  writeExecutable(
    launchctl,
    `#!${process.execPath}
const command = process.argv[2];
if (command === 'print' || command === 'bootout') process.exit(0);
if (command === 'bootstrap') { console.error('simulated bootstrap failure'); process.exit(1); }
process.exit(2);
`,
  );
  const result = installLaunchd(
    { name: "work", schedule: "30 17 * * 1-5" },
    path.join(base, "settings.json"),
    { tools: { pi: "/opt/bin/pi", git: "/usr/bin/git" } },
    { env: { XDG_STATE_HOME: path.join(base, "state") }, homeDirectory: base, launchctl },
  );
  assert.equal(result.ok, false);
  assert.equal(result.preserved, false);
  assert.equal(fs.existsSync(plistPath), false);
  assert.match(result.reason, /plist did not exist/);
});

test("systemd unsupported schedule removes old units before cron fallback", (t) => {
  const base = temporaryDirectory(t);
  const env = { XDG_CONFIG_HOME: path.join(base, "config") };
  const unitDirectory = path.join(env.XDG_CONFIG_HOME, "systemd", "user");
  const servicePath = path.join(unitDirectory, "daily-report-work.service");
  const timerPath = path.join(unitDirectory, "daily-report-work.timer");
  fs.mkdirSync(unitDirectory, { recursive: true });
  fs.writeFileSync(servicePath, "existing service\n");
  fs.writeFileSync(timerPath, "existing timer\n");
  const systemctl = path.join(base, "systemctl");
  writeExecutable(
    systemctl,
    `#!${process.execPath}
const command = process.argv[3];
if (command === 'show-environment' || command === 'is-enabled' || command === 'is-active' || command === 'disable' || command === 'daemon-reload') process.exit(0);
process.exit(2);
`,
  );
  const result = installSystemd(
    { name: "work", schedule: "*/15 9 * * 1-5" },
    path.join(base, "settings.json"),
    { tools: { pi: "/opt/bin/pi", git: "/usr/bin/git" } },
    { env, homeDirectory: base, systemctl },
  );
  assert.equal(result.ok, false);
  assert.equal(result.preserved, false);
  assert.equal(fs.existsSync(servicePath), false);
  assert.equal(fs.existsSync(timerPath), false);
});

test("systemd removal reload failure still permits cron fallback", (t) => {
  const base = temporaryDirectory(t);
  const env = { XDG_CONFIG_HOME: path.join(base, "config") };
  const unitDirectory = path.join(env.XDG_CONFIG_HOME, "systemd", "user");
  const servicePath = path.join(unitDirectory, "daily-report-work.service");
  const timerPath = path.join(unitDirectory, "daily-report-work.timer");
  fs.mkdirSync(unitDirectory, { recursive: true });
  fs.writeFileSync(servicePath, "existing service\n");
  fs.writeFileSync(timerPath, "existing timer\n");
  const systemctl = path.join(base, "systemctl");
  writeExecutable(
    systemctl,
    `#!${process.execPath}
const command = process.argv[3];
if (command === 'show-environment' || command === 'is-enabled' || command === 'is-active' || command === 'disable') process.exit(0);
if (command === 'daemon-reload') { console.error('reload failed'); process.exit(1); }
process.exit(2);
`,
  );
  const result = installSystemd(
    { name: "work", schedule: "*/15 9 * * 1-5" },
    path.join(base, "settings.json"),
    { tools: { pi: "/opt/bin/pi", git: "/usr/bin/git" } },
    { env, homeDirectory: base, systemctl },
  );
  assert.equal(result.ok, false);
  assert.equal(result.preserved, false);
  assert.equal(fs.existsSync(servicePath), false);
  assert.equal(fs.existsSync(timerPath), false);
});

test("systemd update restores enabled active units after enable failure", (t) => {
  const base = temporaryDirectory(t);
  const env = { XDG_CONFIG_HOME: path.join(base, "config") };
  const unitDirectory = path.join(env.XDG_CONFIG_HOME, "systemd", "user");
  const servicePath = path.join(unitDirectory, "daily-report-work.service");
  const timerPath = path.join(unitDirectory, "daily-report-work.timer");
  fs.mkdirSync(unitDirectory, { recursive: true });
  fs.writeFileSync(servicePath, "previous service\n");
  fs.writeFileSync(timerPath, "previous timer\n");
  const systemctl = path.join(base, "systemctl");
  writeExecutable(
    systemctl,
    `#!${process.execPath}
const args = process.argv.slice(2);
if (args[1] === 'show-environment' || args[1] === 'is-enabled' || args[1] === 'is-active' || args[1] === 'daemon-reload' || args[1] === 'disable' || args[1] === 'start') process.exit(0);
if (args[1] === 'enable' && args.includes('--now')) { console.error('simulated enable failure'); process.exit(1); }
if (args[1] === 'enable') process.exit(0);
process.exit(2);
`,
  );
  const result = installSystemd(
    { name: "work", schedule: "30 17 * * 1-5" },
    path.join(base, "settings.json"),
    { tools: { pi: "/opt/bin/pi", git: "/usr/bin/git" } },
    { env, homeDirectory: base, systemctl },
  );
  assert.equal(result.ok, false);
  assert.equal(result.preserved, true);
  assert.equal(fs.readFileSync(servicePath, "utf8"), "previous service\n");
  assert.equal(fs.readFileSync(timerPath, "utf8"), "previous timer\n");
});

test("systemd removal keeps unit files when disable fails", (t) => {
  const base = temporaryDirectory(t);
  const env = { XDG_CONFIG_HOME: path.join(base, "config") };
  const unitDirectory = path.join(env.XDG_CONFIG_HOME, "systemd", "user");
  const servicePath = path.join(unitDirectory, "daily-report-work.service");
  const timerPath = path.join(unitDirectory, "daily-report-work.timer");
  fs.mkdirSync(unitDirectory, { recursive: true });
  fs.writeFileSync(servicePath, "existing service\n");
  fs.writeFileSync(timerPath, "existing timer\n");
  const systemctl = path.join(base, "systemctl");
  writeExecutable(
    systemctl,
    `#!${process.execPath}
const args = process.argv.slice(2);
if (args[1] === 'show-environment' || args[1] === 'is-enabled' || args[1] === 'is-active') process.exit(0);
if (args[1] === 'disable') { console.error('still active'); process.exit(1); }
process.exit(2);
`,
  );
  assert.throws(
    () => removeSystemd({ name: "work" }, { env, homeDirectory: base, systemctl }),
    /still enabled or active/,
  );
  assert.equal(fs.existsSync(servicePath), true);
  assert.equal(fs.existsSync(timerPath), true);
});

test("crontab read accepts only a known empty-crontab diagnostic", (t) => {
  const base = temporaryDirectory(t);
  const denied = path.join(base, "denied-crontab");
  writeExecutable(denied, "#!/bin/sh\necho 'permission denied' >&2\nexit 1\n");
  assert.throws(() => readCrontab(denied), /permission denied/);

  const empty = path.join(base, "empty-crontab");
  writeExecutable(empty, "#!/bin/sh\necho 'no crontab for test' >&2\nexit 1\n");
  assert.equal(readCrontab(empty), "");
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
