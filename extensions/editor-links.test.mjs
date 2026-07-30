import assert from "node:assert/strict";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";
import {
  createBashToolDefinition,
  initTheme,
} from "@earendil-works/pi-coding-agent";
import {
  linkifyRenderedPaths,
  linkifyText,
  linkifyToolDefinition,
  linkifyToolOutput,
  registerBuiltInToolLinks,
  startBridge,
} from "./editor-links.ts";

function fixture(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "editor-links-test-"));
  const report = path.join(cwd, ".plans", "session-audit", "findings.md");
  fs.mkdirSync(path.dirname(report), { recursive: true });
  fs.writeFileSync(report, "# Findings\n");
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  return { cwd, report };
}

function bridgeTarget(bridgeUrl) {
  return new URL(bridgeUrl).searchParams.get("url");
}

function editorTarget(markdown) {
  const bridgeUrl = markdown.match(/\]\((http:\/\/[^ )]+)/)?.[1];
  assert.ok(bridgeUrl, `missing bridge URL in ${markdown}`);
  return bridgeTarget(bridgeUrl);
}

function osc8Url(text) {
  const url = text.match(/\x1b\]8;[^;]*;([^\x07\x1b]*)(?:\x07|\x1b\\)/)?.[1];
  assert.ok(url, `missing OSC 8 URL in ${JSON.stringify(text)}`);
  return url;
}

async function requestBridge(t, target, zedCli) {
  const launches = [];
  const server = startBridge(0, "open", zedCli, (command, args) => {
    launches.push({ command, args: [...args] });
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");

  const response = await fetch(
    `http://127.0.0.1:${address.port}/open?url=${encodeURIComponent(target)}`,
  );
  assert.equal(response.status, 200);
  return launches;
}

test("opens a repository file in its nearest Zed workspace and preserves its position", async (t) => {
  const { cwd } = fixture(t);
  fs.mkdirSync(path.join(cwd, ".git"));
  const repository = path.join(cwd, "nested-repository");
  const report = path.join(repository, "docs", "report.md");
  fs.mkdirSync(path.join(repository, ".git"), { recursive: true });
  fs.mkdirSync(path.dirname(report), { recursive: true });
  fs.writeFileSync(report, "# Report\n");
  const zedCli = path.join(cwd, "zed");
  fs.writeFileSync(zedCli, "");
  fs.chmodSync(zedCli, 0o755);
  const target = `zed://file${pathToFileURL(report).pathname}:12:3`;

  const launches = await requestBridge(t, target, zedCli);

  assert.deepEqual(launches, [{
    command: zedCli,
    args: [repository, `${report}:12:3`],
  }]);
});

test("falls back to the Zed URL outside a Git repository", async (t) => {
  const { cwd, report } = fixture(t);
  const zedCli = path.join(cwd, "zed");
  fs.writeFileSync(zedCli, "");
  fs.chmodSync(zedCli, 0o755);
  const target = `zed://file${pathToFileURL(report).pathname}`;

  const launches = await requestBridge(t, target, zedCli);

  assert.deepEqual(launches, [{ command: "open", args: [target] }]);
});

test("falls back to the Zed URL when the Zed CLI is unavailable", async (t) => {
  const { cwd, report } = fixture(t);
  fs.mkdirSync(path.join(cwd, ".git"));
  const target = `zed://file${pathToFileURL(report).pathname}:7`;

  const launches = await requestBridge(t, target, path.join(cwd, "missing-zed"));

  assert.deepEqual(launches, [{ command: "open", args: [target] }]);
});

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

test("does not rewrite images, external links, anchors, inline prose, or missing files", (t) => {
  const { cwd } = fixture(t);
  const input = [
    "![report](.plans/session-audit/findings.md)",
    "[site](https://example.com/report)",
    "[section](#findings)",
    "`open .plans/session-audit/findings.md later`",
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

test("linkifies an exact path formatted as inline code", (t) => {
  const { cwd, report } = fixture(t);

  const result = linkifyText("Latest modified file: `.plans/session-audit/findings.md`", cwd);

  assert.match(result, /^Latest modified file: \[`\.plans\/session-audit\/findings\.md`\]\(http:/);
  assert.equal(editorTarget(result), `zed://file${pathToFileURL(report).pathname}`);
});

test("rewrites a tool renderer file hyperlink", (t) => {
  const { report } = fixture(t);
  const input = `\x1b]8;;${pathToFileURL(report).href}\x1b\\${report}\x1b]8;;\x1b\\`;

  const result = linkifyToolOutput(input);

  assert.equal(bridgeTarget(osc8Url(result)), `zed://file${pathToFileURL(report).pathname}`);
  assert.match(result, new RegExp(report.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("preserves non-file tool hyperlinks", () => {
  const input = "\x1b]8;;https://example.com/report\x07report\x1b]8;;\x07";

  assert.equal(linkifyToolOutput(input), input);
});

test("linkifies existing paths in ANSI-styled bash output", (t) => {
  const { cwd, report } = fixture(t);
  const input = "\x1b[38;5;250m.plans/session-audit/findings.md\x1b[39m";

  const result = linkifyRenderedPaths(input, cwd);

  assert.equal(bridgeTarget(osc8Url(result)), `zed://file${pathToFileURL(report).pathname}`);
  assert.match(result, /\.plans\/session-audit\/findings\.md/);
});

test("leaves missing paths in bash output unchanged", (t) => {
  const { cwd } = fixture(t);
  const input = "\x1b[38;5;250m.plans/session-audit/missing.md\x1b[39m";

  assert.equal(linkifyRenderedPaths(input, cwd), input);
});

test("rewrites paths rendered by the built-in bash tool", (t) => {
  const { cwd, report } = fixture(t);
  initTheme("dark");
  const definition = linkifyToolDefinition(createBashToolDefinition(cwd), {
    result: (text) => linkifyRenderedPaths(text, cwd),
  });
  const context = {
    args: { command: "find .plans -type f" },
    toolCallId: "bash-test",
    invalidate() {},
    lastComponent: undefined,
    state: {},
    cwd,
    executionStarted: true,
    argsComplete: true,
    isPartial: false,
    expanded: false,
    showImages: true,
    isError: false,
  };

  const component = definition.renderResult(
    { content: [{ type: "text", text: ".plans/session-audit/findings.md" }] },
    { expanded: false, isPartial: false },
    {},
    context,
  );
  const output = component.render(120).find((line) => line.includes(".plans/"));

  assert.ok(output);
  assert.equal(bridgeTarget(osc8Url(output)), `zed://file${pathToFileURL(report).pathname}`);
});

test("overrides only untouched built-in path tools", () => {
  const registered = [];
  const sourceInfo = (source) => ({ sourceInfo: { source } });
  const pi = {
    getAllTools: () => [
      { name: "read", ...sourceInfo("builtin") },
      { name: "write", ...sourceInfo("builtin") },
      { name: "edit", ...sourceInfo("another-extension") },
      { name: "ls", ...sourceInfo("builtin") },
      { name: "bash", ...sourceInfo("builtin") },
    ],
    registerTool: (definition) => registered.push(definition.name),
  };

  registerBuiltInToolLinks(pi, process.cwd());

  assert.deepEqual(registered, ["read", "write", "ls", "bash"]);
});

test("rewrites the built-in write tool path without changing its label or body", (t) => {
  const { cwd, report } = fixture(t);
  const registered = [];
  registerBuiltInToolLinks({
    getAllTools: () => [{ name: "write", sourceInfo: { source: "builtin" } }],
    registerTool: (definition) => registered.push(definition),
  }, cwd);
  const [definition] = registered;
  const theme = {
    fg: (_color, text) => text,
    bold: (text) => text,
  };
  const context = {
    args: {},
    toolCallId: "write-test",
    invalidate() {},
    lastComponent: undefined,
    state: {},
    cwd,
    executionStarted: true,
    argsComplete: true,
    isPartial: false,
    expanded: false,
    showImages: true,
    isError: false,
  };

  const component = definition.renderCall(
    { path: ".plans/session-audit/findings.md", content: "body .plans/session-audit/findings.md" },
    theme,
    context,
  );
  const [output, , body] = component.render(120);

  assert.match(output, /write .*\.plans\/session-audit\/findings\.md/);
  assert.equal(bridgeTarget(osc8Url(output)), `zed://file${pathToFileURL(report).pathname}`);
  assert.equal(body.trimEnd(), "body .plans/session-audit/findings.md");

  const narrowComponent = definition.renderCall(
    { path: ".plans/session-audit/findings.md", content: "" },
    theme,
    { ...context, lastComponent: undefined },
  );
  const narrowPathLines = narrowComponent.render(20).slice(1);
  assert.ok(narrowPathLines.length > 1);
  for (const line of narrowPathLines) {
    assert.equal(bridgeTarget(osc8Url(line)), `zed://file${pathToFileURL(report).pathname}`);
  }
});

test("rewrites wrapped read ranges and decorated edit paths", (t) => {
  const { cwd, report } = fixture(t);
  const registered = [];
  registerBuiltInToolLinks({
    getAllTools: () => ["read", "edit"].map((name) => ({ name, sourceInfo: { source: "builtin" } })),
    registerTool: (definition) => registered.push(definition),
  }, cwd);
  const definitions = new Map(registered.map((definition) => [definition.name, definition]));
  const theme = {
    fg: (_color, text) => text,
    bg: (_color, text) => text,
    bold: (text) => text,
  };
  const context = {
    args: {},
    toolCallId: "path-test",
    invalidate() {},
    lastComponent: undefined,
    state: {},
    cwd,
    executionStarted: true,
    argsComplete: true,
    isPartial: false,
    expanded: false,
    showImages: true,
    isError: false,
  };
  const target = `zed://file${pathToFileURL(report).pathname}`;

  const readLines = definitions.get("read").renderCall(
    { path: ".plans/session-audit/findings.md", offset: 1, limit: 1 },
    theme,
    context,
  ).render(20);
  assert.ok(readLines.some((line) => line.includes(":1-1")));
  for (const line of readLines.filter((line) => line.includes("\x1b]8;"))) {
    assert.equal(bridgeTarget(osc8Url(line)), target);
  }
  assert.ok(readLines.filter((line) => line.includes("\x1b]8;")).length > 1);

  const editLines = definitions.get("edit").renderCall(
    { path: ".plans/session-audit/findings.md", edits: [{ oldText: "Findings", newText: "Updated" }] },
    theme,
    context,
  ).render(20);
  for (const line of editLines.filter((line) => line.includes("\x1b]8;"))) {
    assert.equal(bridgeTarget(osc8Url(line)), target);
  }
  assert.ok(editLines.filter((line) => line.includes("\x1b]8;")).length > 1);
});

test("inserts fallback links around visible paths without corrupting ANSI styling", (t) => {
  const { cwd } = fixture(t);
  for (const name of ["read", "1", ";"]) fs.writeFileSync(path.join(cwd, name), "");
  const registered = [];
  registerBuiltInToolLinks({
    getAllTools: () => [{ name: "read", sourceInfo: { source: "builtin" } }],
    registerTool: (definition) => registered.push(definition),
  }, cwd);
  const [definition] = registered;
  const color = (text) => `\x1b[38;2;208;208;208m${text}\x1b[39m`;
  const theme = {
    fg: (_color, text) => color(text),
    bold: (text) => text,
  };
  const context = {
    args: {},
    toolCallId: "ansi-path-test",
    invalidate() {},
    lastComponent: undefined,
    state: {},
    cwd,
    executionStarted: true,
    argsComplete: true,
    isPartial: false,
    expanded: false,
    showImages: true,
    isError: false,
  };

  for (const name of ["read", "1", ";"]) {
    const [output] = definition.renderCall({ path: name }, theme, context).render(20);
    assert.equal(stripVTControlCharacters(output).trimEnd(), `read ${name}`);
    assert.equal(bridgeTarget(osc8Url(output)), `zed://file${pathToFileURL(path.join(cwd, name)).pathname}`);
    assert.doesNotMatch(output, /\x1b\[[0-9;]*\x1b\]8;/);
  }
});

test("preserves renderer component reuse while rewriting its output", (t) => {
  const { report } = fixture(t);
  const input = `\x1b]8;;${pathToFileURL(report).href}\x1b\\report\x1b]8;;\x1b\\`;
  let invalidations = 0;
  const child = {
    render: () => [input],
    invalidate: () => invalidations++,
  };
  const receivedPrevious = [];
  const definition = {
    renderCall(_args, _theme, context) {
      receivedPrevious.push(context.lastComponent);
      return context.lastComponent ?? child;
    },
  };
  const wrapped = linkifyToolDefinition(definition);

  const first = wrapped.renderCall({}, {}, { lastComponent: undefined });
  const second = wrapped.renderCall({}, {}, { lastComponent: first });
  first.invalidate();

  assert.equal(bridgeTarget(osc8Url(first.render(120)[0])), `zed://file${pathToFileURL(report).pathname}`);
  assert.strictEqual(second, first);
  assert.strictEqual(receivedPrevious[1], child);
  assert.equal(invalidations, 1);
});
