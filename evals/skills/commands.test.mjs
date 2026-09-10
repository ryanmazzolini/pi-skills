import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const { scripts } = JSON.parse(readFileSync(join(repo, "package.json"), "utf8"));

// Run the real npm commands in a disposable project. The fake BAML executable
// records only controlled fixture values and never calls a model or bridge.
function runCommand(t, script, args = [], { exitCode = 0, exportedKey = "exported-test-key" } = {}) {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), "skill-eval-command-")));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  mkdirSync(join(cwd, "evals", "skills"), { recursive: true });
  mkdirSync(join(cwd, "bin"));
  symlinkSync(join(repo, "node_modules"), join(cwd, "node_modules"), "dir");
  writeFileSync(join(cwd, "package.json"), JSON.stringify({ scripts }));
  writeFileSync(join(cwd, ".env"), "OPENAI_API_KEY=dotenv-test-key\n");
  const capture = join(cwd, "capture.json");
  writeFileSync(join(cwd, "bin", "baml"), `#!/usr/bin/env node
require("node:fs").writeFileSync(process.env.CAPTURE_PATH, JSON.stringify({
  args: process.argv.slice(2),
  cwd: process.cwd(),
  baseUrl: process.env.SKILL_EVAL_OPENAI_BASE_URL,
  route: process.env.SKILL_EVAL_ROUTE,
  apiKey: process.env.OPENAI_API_KEY,
}));
process.exit(Number(process.env.FIXTURE_EXIT_CODE));
`, { mode: 0o755 });
  const env = {
    ...process.env,
    PATH: join(cwd, "bin") + delimiter + process.env.PATH,
    CAPTURE_PATH: capture,
    FIXTURE_EXIT_CODE: String(exitCode),
    OPENAI_API_KEY: exportedKey,
  };
  delete env.SKILL_EVAL_OPENAI_BASE_URL;
  delete env.SKILL_EVAL_ROUTE;
  delete env.SKILL_EVAL_SPINNER;
  if (exportedKey === null) delete env.OPENAI_API_KEY;
  const result = spawnSync("npm", ["run", script, "--", ...args], {
    cwd, env, encoding: "utf8", timeout: 15_000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, exitCode, result.stderr);
  const invocation = JSON.parse(readFileSync(capture, "utf8"));
  assert.equal(invocation.cwd, join(cwd, "evals", "skills"));
  return invocation;
}

for (const [script, args, expectedArgs] of [
  ["eval:skills", ["--suite_id", "ticket-workspace"], ["run", "RunEvals", "--", "--suite_id", "ticket-workspace"]],
  ["eval:skills:judge:herdr", ["--json-args", '{"case_id":"valid"}'], ["run", "CheckHerdrJudge", "--", "--json-args", '{"case_id":"valid"}']],
  ["eval:skills:test", [], ["test", "-i", "skills::*"]],
]) {
  test(`${script} keeps direct OpenAI defaults and forwards arguments`, (t) => {
    const invocation = runCommand(t, script, args);
    assert.equal(invocation.baseUrl, "https://api.openai.com/v1");
    assert.equal(invocation.route, "direct");
    assert.equal(invocation.apiKey, "exported-test-key");
    assert.deepEqual(invocation.args, expectedArgs);
  });
}

test("direct evals still load a key from dotenv when none is exported", (t) => {
  assert.equal(runCommand(t, "eval:skills", [], { exportedKey: null }).apiKey, "dotenv-test-key");
});

test("Codex evals use the local endpoint and dummy key, preserving spaced arguments", (t) => {
  const args = ["--suite_id", "ticket-workspace", "--output_dir", "results with spaces"];
  const invocation = runCommand(t, "eval:skills:codex", args);
  assert.equal(invocation.baseUrl, "http://127.0.0.1:18080/v1");
  assert.equal(invocation.route, "codex-local");
  assert.equal(invocation.apiKey, "dummy-not-a-real-openai-api-key");
  assert.deepEqual(invocation.args, ["run", "RunEvals", "--", ...args]);
});

test("Codex evals propagate a failed BAML exit status", (t) => {
  runCommand(t, "eval:skills:codex", [], { exitCode: 7 });
});
