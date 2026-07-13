import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { linkifyText } from "./editor-links.ts";

function fixture(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "editor-links-test-"));
  const report = path.join(cwd, ".plans", "session-audit", "findings.md");
  fs.mkdirSync(path.dirname(report), { recursive: true });
  fs.writeFileSync(report, "# Findings\n");
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  return { cwd, report };
}

function editorTarget(markdown) {
  const bridgeUrl = markdown.match(/\]\((http:\/\/[^ )]+)/)?.[1];
  assert.ok(bridgeUrl, `missing bridge URL in ${markdown}`);
  return new URL(bridgeUrl).searchParams.get("url");
}

test("rewrites an existing local Markdown destination", (t) => {
  const { cwd, report } = fixture(t);

  const result = linkifyText(
    "Full report: [`findings`](.plans/session-audit/findings.md)",
    cwd,
  );

  assert.match(result, /^Full report: \[`findings`\]\(http:\/\/127\.0\.0\.1:48291\/open\?url=/);
  assert.equal(editorTarget(result), `zed://file${pathToFileURL(report).pathname}`);
});

test("preserves a Markdown title when rewriting its destination", (t) => {
  const { cwd, report } = fixture(t);

  const result = linkifyText(
    '[report](.plans/session-audit/findings.md "Open findings")',
    cwd,
  );

  assert.match(result, / "Open findings"\)$/);
  assert.equal(editorTarget(result), `zed://file${pathToFileURL(report).pathname}`);
});

test("does not rewrite images, external links, anchors, inline code, or missing files", (t) => {
  const { cwd } = fixture(t);
  const input = [
    "![report](.plans/session-audit/findings.md)",
    "[site](https://example.com/report)",
    "[section](#findings)",
    "`[report](.plans/session-audit/findings.md)`",
    "[missing](.plans/session-audit/missing.md)",
  ].join("\n");

  assert.equal(linkifyText(input, cwd), input);
});

test("continues to linkify a bare existing path", (t) => {
  const { cwd, report } = fixture(t);

  const result = linkifyText("See .plans/session-audit/findings.md", cwd);

  assert.match(result, /^See \[\.plans\/session-audit\/findings\.md\]\(http:/);
  assert.equal(editorTarget(result), `zed://file${pathToFileURL(report).pathname}`);
});
