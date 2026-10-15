#!/usr/bin/env node
// Change walkthrough: facts about a change from the sem CLI, a summary for the guide author,
// and one offline HTML page from the facts plus an agent-written guide.
//
//   node walkthrough.mjs facts <repo> <base> <head>              > facts.json
//   node walkthrough.mjs summary <facts.json>                    one line per change
//   node walkthrough.mjs render <facts.json> <guide.json> <out.html>
//   node walkthrough.mjs outdir <repo> <head>                    prints the output directory
import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const MIN_SEM = "0.27.0";
// The programming languages sem extracts entities from (sem's README, "32 programming languages").
// Data formats such as JSON, YAML and Markdown still get cards but stay out of the call tree.
const CODE_EXTS = new Set(("ts tsx mts cts js jsx mjs cjs es6 py pyi go rs java c h cpp cc cxx hpp hh hxx cs rb php inc phtml swift ex exs "
  + "sh fish lua hcl tf tfvars kt kts f90 f95 f03 f08 f for vue erb svelte pl pm dart ml mli scala sc sbt nix hs elm clj cljs cljc d di zig sql psql pgsql ddl").split(" "));
const JS_EXTS = ["ts", "tsx", "js", "jsx", "mts", "cts", "mjs", "cjs"];
const TEST_DIRS = new Set(["e2e", "cypress", "playwright", "testing", "fixtures", "fixture", "benchmarks", "benchmark", "__tests__", "__mocks__"]);
const TEST_FILE_PATTERNS = ["_test.", ".test.", "_spec.", ".spec."];

const fail = (msg) => { console.error(msg); process.exit(2); };
const git = (repo, args) => execFileSync("git", args, { cwd: repo, encoding: "utf8", maxBuffer: 1 << 28 }).trim();
const sem = (args, cwd) => execFileSync("sem", args, { cwd, encoding: "utf8", maxBuffer: 1 << 30, stdio: ["ignore", "pipe", "pipe"] });
const ext = (p) => p.slice(p.lastIndexOf(".") + 1);
const isCode = (p) => CODE_EXTS.has(ext(p));
const isTestPath = (p) => {
  const lower = p.toLowerCase();
  const name = lower.slice(lower.lastIndexOf("/") + 1);
  return TEST_FILE_PATTERNS.some((pat) => name.includes(pat)) || lower.split("/").some((c) => TEST_DIRS.has(c));
};

function requireSem() {
  let version;
  try {
    version = sem(["--version"]).trim().split(/\s+/).pop();
  } catch {
    fail("walkthrough needs the sem CLI. Install it with `brew install sem-cli` (https://github.com/Ataraxy-Labs/sem) and rerun.");
  }
  const num = (v) => v.split(".").map(Number);
  const [a, b] = [num(version), num(MIN_SEM)];
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) < (b[i] ?? 0)) fail(`sem ${version} is older than the tested ${MIN_SEM}. Run \`sem config update\` and rerun.`);
    if ((a[i] ?? 0) > (b[i] ?? 0)) break;
  }
}

// --- Trees: a committed tree extracted to a temp dir, its sem graph, and a lazy import index so a
// call edge can be checked against real imports instead of trusted on name alone.
// read-tree into a temporary index, then checkout-index from it. Unlike `git archive`, this ignores
// export-ignore and export-subst attributes, so the extracted tree is the commit as committed.
function materialize(repo, sha) {
  const dir = mkdtempSync(path.join(tmpdir(), "walkthrough-"));
  const index = path.join(tmpdir(), `${path.basename(dir)}.index`);
  const env = { ...process.env, GIT_INDEX_FILE: index };
  try {
    execFileSync("git", ["read-tree", sha], { cwd: repo, env, stdio: ["ignore", "ignore", "pipe"] });
    execFileSync("git", ["checkout-index", "-a", `--prefix=${dir}${path.sep}`], { cwd: repo, env, stdio: ["ignore", "ignore", "pipe"] });
  } finally {
    rmSync(index, { force: true });
  }
  const files = new Set(git(repo, ["ls-tree", "-r", "--name-only", sha]).split("\n").filter(isCode));
  return { dir, files };
}

// Call edges in both directions. sem records a generic call such as `readJsonBody<T>(req)` as a
// type reference, so a typeref whose target is a function or method counts as a call too.
function graphOf(dir) {
  const g = JSON.parse(sem(["graph", dir, "--json"], dir));
  const ents = new Map(g.entities.map((e) => [e.id, e]));
  const out = new Map(), inc = new Map();
  const add = (m, k, v) => (m.get(k) ?? m.set(k, new Set()).get(k)).add(v);
  for (const e of g.edges) {
    if (e.fromEntity === e.toEntity) continue;
    const callish = e.refType === "calls" || e.refType === "dispatch"
      || (e.refType === "typeref" && /^(function|method)$/.test(ents.get(e.toEntity)?.entityType ?? ""));
    if (!callish) continue;
    add(out, e.fromEntity, e.toEntity);
    add(inc, e.toEntity, e.fromEntity);
  }
  return { ents, out, inc };
}

function workspacePackages(dir) {
  const names = [];
  const pkgs = path.join(dir, "packages");
  if (!existsSync(pkgs)) return names;
  for (const entry of readdirSync(pkgs)) {
    try { const name = JSON.parse(readFileSync(path.join(pkgs, entry, "package.json"), "utf8")).name; if (name) names.push(name); } catch {}
  }
  return names;
}

// Module specifiers a JS/TS file imports: `import … from "x"`, `import "x"`, `export … from "x"`,
// `import("x")` and `require("x")`.
const specifiers = (content) => [...content.matchAll(/(?:\bimport\b[^'"]*?\bfrom\s*|\bexport\b[^'"]*?\bfrom\s*|\bimport\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g)].map((m) => m[1]);

class Tree {
  constructor({ dir, files }, graph) {
    this.dir = dir; this.files = files; this.g = graph; this.imports = new Map(); this.packages = workspacePackages(dir);
  }
  fileOf(id) { return this.g.ents.get(id)?.filePath; }
  read(file) { try { return readFileSync(path.join(this.dir, file), "utf8"); } catch { return ""; } }
  // Repo-relative files this file imports. TypeScript ESM names the emitted file (`./watch.js`),
  // so extensions are dropped and every JS/TS extension tried; built output isn't committed, so
  // `/dist/` is read as `/src/`.
  importsOf(file) {
    if (this.imports.has(file)) return this.imports.get(file);
    const set = new Set();
    if (JS_EXTS.includes(ext(file))) {
      for (const raw of specifiers(this.read(file))) {
        if (!raw.startsWith(".")) continue;
        const spec = raw.replace(/\.(js|mjs|cjs|jsx)$/, "").replace("/dist/", "/src/");
        const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
        const hit = [base, ...JS_EXTS.map((e) => `${base}.${e}`), ...JS_EXTS.map((e) => `${base}/index.${e}`)].find((p) => this.files.has(p));
        if (hit) set.add(hit);
      }
    }
    this.imports.set(file, set);
    return set;
  }
  // A call is checked when both ends share a file or the caller's file imports the callee's.
  // Anything else is a name match only, which is how `resolve` from node:path got linked to an
  // unrelated `resolve`. For those, the specifier that binds the name tells a builtin or package
  // (a wrong match) from a sibling file.
  edge(from, to, id) {
    const f = this.fileOf(from), t = this.fileOf(to);
    if (f && t && (f === t || this.importsOf(f).has(t))) return { id, checked: true };
    const spec = f ? importSpecifier(this.read(f), this.g.ents.get(to)?.name ?? "") : null;
    const external = spec != null && (spec.startsWith("node:")
      || (!spec.startsWith(".") && !spec.startsWith("/") && !this.packages.some((p) => spec === p || spec.startsWith(`${p}/`))));
    return { id, checked: false, importedFrom: spec, external };
  }
}

// The specifier that binds `name` in a JS/TS file, from import declarations and require calls.
function importSpecifier(content, name) {
  const binds = (clause) => clause.replace(/[{}\n]/g, " ").split(",").some((item) => {
    const local = item.trim().replace(/^type\s+/, "").split(" as ").pop().trim();
    return local !== "" && local !== "*" && local === name;
  });
  for (const m of content.matchAll(/(?<![\w$.])import\s*(type\s+)?([^'"]*?)\bfrom\s*['"]([^'"]+)['"]/g)) if (binds(m[2])) return m[3];
  for (const m of content.matchAll(/^\s*(?:const|let|var)\s+([^=]+?)=\s*require\(\s*['"]([^'"]+)['"]/gm)) if (binds(m[1])) return m[2];
  return null;
}

// --- Line diff of an entity's before and after text with real file line numbers. Common ends are
// trimmed, then an LCS over the middle; very large middles fall back to a plain replace.
function lineDiff(before, after, oldStart, newStart) {
  const a = before ? before.split("\n") : [], b = after ? after.split("\n") : [];
  if (a.length && a[a.length - 1] === "" && before.endsWith("\n")) a.pop();
  if (b.length && b[b.length - 1] === "" && after.endsWith("\n")) b.pop();
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const ma = a.slice(pre, a.length - suf), mb = b.slice(pre, b.length - suf);
  const ops = [];
  let oldNo = oldStart, newNo = newStart;
  const equal = (t) => { ops.push([" ", oldNo++, newNo++, t]); };
  const del = (t) => { ops.push(["-", oldNo++, null, t]); };
  const ins = (t) => { ops.push(["+", null, newNo++, t]); };
  for (let i = 0; i < pre; i++) equal(a[i]);
  if (ma.length * mb.length > 25_000_000) {
    ma.forEach(del); mb.forEach(ins);
  } else {
    const n = ma.length, m = mb.length;
    const dp = new Uint32Array((n + 1) * (m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
      dp[i * (m + 1) + j] = ma[i] === mb[j] ? dp[(i + 1) * (m + 1) + j + 1] + 1 : Math.max(dp[(i + 1) * (m + 1) + j], dp[i * (m + 1) + j + 1]);
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (ma[i] === mb[j]) { equal(ma[i]); i++; j++; }
      else if (dp[(i + 1) * (m + 1) + j] >= dp[i * (m + 1) + j + 1]) del(ma[i++]);
      else ins(mb[j++]);
    }
    while (i < n) del(ma[i++]);
    while (j < m) ins(mb[j++]);
  }
  for (let i = a.length - suf; i < a.length; i++) equal(a[i]);
  return ops;
}

// Web URL of the origin remote, for links to the commit and to files at a revision.
function webUrl(repo) {
  let url;
  try { url = git(repo, ["remote", "get-url", "origin"]).replace(/\.git$/, ""); } catch { return null; }
  if (url.startsWith("git@")) { const [host, p] = url.slice(4).split(/:(.+)/); return p ? `https://${host}/${p}` : null; }
  if (url.startsWith("ssh://git@")) return `https://${url.slice(10)}`;
  return url.startsWith("https://") ? url : null;
}

function facts(repo, base, head) {
  requireSem();
  const started = Date.now();
  const timings = {};
  const baseSha = git(repo, ["rev-parse", base]), headSha = git(repo, ["rev-parse", head]);

  let t = Date.now();
  const diff = JSON.parse(sem(["diff", `${baseSha}..${headSha}`, "--json"], repo));
  timings.semDiff = Date.now() - t;

  t = Date.now();
  const bTree = materialize(repo, baseSha), hTree = materialize(repo, headSha);
  timings.materializeTrees = Date.now() - t;
  try {
    t = Date.now();
    const bg = graphOf(bTree.dir), hg = graphOf(hTree.dir);
    timings.buildGraphs = Date.now() - t;
    const bt = new Tree(bTree, bg), ht = new Tree(hTree, hg);

    // Base-side id of a change: the same id, or the old name and path for renames and moves.
    const baseId = (c) => {
      if (bg.ents.has(c.entityId)) return c.entityId;
      const file = c.oldFilePath ?? c.filePath, name = c.oldEntityName ?? c.entityName;
      for (const e of bg.ents.values()) if (e.filePath === file && e.name === name) return e.id;
      return null;
    };
    const ids = diff.changes.map((c) => ({ b: baseId(c), h: hg.ents.has(c.entityId) ? c.entityId : null }));
    const changedIds = new Set(ids.flatMap(({ b, h }) => [b, h]).filter(Boolean));
    const referenced = new Set();
    const changes = diff.changes.map((c, i) => {
      const { b: bid, h: hid } = ids[i];
      const before = (bid && bg.out.get(bid)) ?? new Set(), after = (hid && hg.out.get(hid)) ?? new Set();
      const callers = [...((hid && hg.inc.get(hid)) ?? [])].filter((x) => !changedIds.has(x)).sort();
      const added = [...after].filter((x) => !before.has(x)).sort();
      const removed = [...before].filter((x) => !after.has(x)).sort();
      const kept = [...after].filter((x) => before.has(x)).sort();
      for (const id of [...added, ...removed, ...kept, ...callers]) referenced.add(id);
      return {
        id: `c${i + 1}`, entityId: c.entityId, baseId: bid, headId: hid,
        kind: c.changeType, type: c.entityType, name: c.entityName, oldName: c.oldEntityName,
        file: c.filePath, oldFile: c.oldFilePath,
        lines: [c.startLine, c.endLine], oldLines: c.oldStartLine != null && c.oldEndLine != null ? [c.oldStartLine, c.oldEndLine] : null,
        cosmetic: c.structuralChange === false, code: isCode(c.filePath), test: isTestPath(c.filePath),
        callees: {
          added: added.map((to) => ht.edge(hid ?? "", to, to)),
          removed: removed.map((to) => bt.edge(bid ?? "", to, to)),
          kept: kept.map((to) => ht.edge(hid ?? "", to, to)),
        },
        callersOutsideChange: callers.map((from) => ht.edge(from, hid ?? "", from)),
        diff: lineDiff(c.beforeContent ?? "", c.afterContent ?? "", c.oldStartLine ?? c.startLine, c.startLine),
      };
    });
    const entities = {};
    for (const id of [...referenced, ...changedIds]) {
      const e = hg.ents.get(id) ?? bg.ents.get(id);
      if (e) entities[id] = { name: e.name, type: e.entityType, file: e.filePath, line: e.startLine };
    }
    const files = git(repo, ["diff", "--numstat", baseSha, headSha]).split("\n").filter(Boolean).map((l) => {
      const [added, removed, p] = l.split("\t");
      return { path: p, added: +added || 0, removed: +removed || 0 };
    });
    timings.total = Date.now() - started;
    return {
      range: { base: baseSha, head: headSha, subject: git(repo, ["log", "-1", "--format=%s", headSha]), web: webUrl(repo) },
      stats: {
        filesChanged: diff.summary?.fileCount ?? files.length,
        linesAdded: files.reduce((a, f) => a + f.added, 0), linesRemoved: files.reduce((a, f) => a + f.removed, 0),
        entitiesChanged: changes.length, entitiesHead: hg.ents.size, callEdgesHead: [...hg.out.values()].reduce((a, s) => a + s.size, 0),
      },
      files, changes, entities, timingsMs: timings, sem: sem(["--version"]).trim(),
    };
  } finally {
    rmSync(bTree.dir, { recursive: true, force: true });
    rmSync(hTree.dir, { recursive: true, force: true });
  }
}

// One line per change: id, kind, type, name, location, lines added and removed, then the calls it
// gained or lost and its unchanged callers. `?` marks a name-only match.
function summary(factsPath) {
  const f = JSON.parse(readFileSync(factsPath, "utf8"));
  const nameOf = (id) => f.entities[id]?.name ?? id.split("::").pop();
  const names = (edges) => edges.filter((e) => !e.external).map((e) => `${nameOf(e.id)}${e.checked ? "" : "?"}`);
  const { range: r, stats: st } = f;
  console.log(`${r.subject}  ${r.base.slice(0, 7)}..${r.head.slice(0, 7)}  ${st.filesChanged} files  +${st.linesAdded} -${st.linesRemoved}  ${st.entitiesChanged} changes`);
  for (const c of f.changes) {
    const count = (m) => c.diff.filter((o) => o[0] === m && o[3].trim()).length;
    const extra = [];
    const added = names(c.callees.added), removed = names(c.callees.removed), callers = names(c.callersOutsideChange);
    if (added.length) extra.push(`calls +${added.join(",")}`);
    if (removed.length) extra.push(`calls -${removed.join(",")}`);
    if (callers.length) extra.push(`callers ${callers.join(",")}`);
    if (c.cosmetic) extra.push("cosmetic");
    if (c.test) extra.push("test");
    console.log(`${c.id.padEnd(4)} ${c.kind.padEnd(8)} ${c.type.padEnd(10)} ${c.name.padEnd(36)} ${c.file}:${c.lines[0]}-${c.lines[1]}  +${count("+")} -${count("-")}${extra.length ? "  " : ""}${extra.join("  ")}`);
  }
}

// The checks the page also runs, so a guide problem is reported here even when no browser opens the page.
function validate(facts, guide) {
  const problems = [];
  const ids = new Set(facts.changes.map((c) => c.id));
  const systems = Object.keys(guide.systems ?? {});
  if (typeof guide.title !== "string" || typeof guide.intent !== "string") problems.push("guide: title and intent must be strings");
  if (!Array.isArray(guide.steps) || !guide.steps.length) return [...problems, "guide: steps must be a non-empty array"];
  guide.steps.forEach((s, i) => {
    const label = typeof s.id === "string" ? s.id : `step ${i + 1}`;
    for (const k of ["id", "title", "why"]) if (typeof s[k] !== "string") problems.push(`${label}: missing ${k}`);
    if (!["high", "medium", "low"].includes(s.risk)) problems.push(`${label}: risk must be high, medium or low`);
    if (!Array.isArray(s.changes)) problems.push(`${label}: changes must be an array of facts ids`);
    else for (const id of s.changes) if (!ids.has(id)) problems.push(`${label} → ${id}: not in the facts`);
    for (const w of s.watch ?? []) {
      if (typeof w.text !== "string") problems.push(`${label}: a note has no text`);
      if (w.change && !ids.has(w.change)) problems.push(`${label} note → ${w.change}: not in the facts`);
    }
    for (const e of s.map ?? []) {
      if (typeof e.from !== "string" || typeof e.to !== "string" || typeof e.via !== "string") problems.push(`${label}: a map crossing needs from, to and via`);
      else if (!systems.includes(e.from) && !systems.includes(e.to)) problems.push(`${label} map ${e.from} → ${e.to}: neither end is a system in guide.systems`);
    }
  });
  return problems;
}

function render(factsPath, guidePath, outPath) {
  const factsText = readFileSync(factsPath, "utf8"), guideText = readFileSync(guidePath, "utf8");
  const problems = validate(JSON.parse(factsText), JSON.parse(guideText));
  if (problems.length) {
    for (const p of problems) console.error(p);
    fail(`${problems.length} problem${problems.length === 1 ? "" : "s"} in ${guidePath}. Fix the guide and render again.`);
  }
  const embed = (s) => s.replace(/<\//g, "<\\/"); // keep "</script>" inside embedded JSON from closing the tag
  const parts = {
    D3: readFileSync(path.join(here, "vendor", "d3.min.js"), "utf8"),
    PRISM: readFileSync(path.join(here, "vendor", "prism.min.js"), "utf8"),
    FACTS: embed(factsText), GUIDE: embed(guideText),
  };
  // One pass over the placeholders, so content that happens to contain a placeholder is never substituted.
  const html = readFileSync(path.join(here, "page.html"), "utf8").replace(/__(D3|PRISM|FACTS|GUIDE)__/g, (_, k) => parts[k]);
  writeFileSync(outPath, html);
  console.error(`every reference checks out; wrote ${outPath}`);
}

function outdir(repo, head) {
  const name = path.basename(git(repo, ["rev-parse", "--show-toplevel"]));
  const short = git(repo, ["rev-parse", "--short=7", head]);
  const dir = path.join(process.env.XDG_CACHE_HOME || path.join(homedir(), ".cache"), "change-walkthrough", "out", name, short);
  mkdirSync(dir, { recursive: true });
  console.log(dir);
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "facts" && args.length === 3) process.stdout.write(JSON.stringify(facts(...args), null, 1) + "\n");
else if (cmd === "summary" && args.length === 1) summary(...args);
else if (cmd === "render" && args.length === 3) render(...args);
else if (cmd === "outdir" && args.length === 2) outdir(...args);
else fail("usage: walkthrough.mjs facts <repo> <base> <head> | summary <facts> | render <facts> <guide> <out.html> | outdir <repo> <head>");
