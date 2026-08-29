# Skill behavior evals

This local-only suite exercises a skill inside a controlled, traditional coding-agent harness written entirely in BAML. It is review evidence, not a deterministic CI gate.

BAML owns the typed scenario definitions, suite registry, agent loop, fixture tools, deterministic trace assertions, semantic judge, native testsets, CLI entry point, and JSON/Markdown reports.

## What the harness tests

The subject model sees a minimal coding-assistant prompt, the explicitly loaded `SKILL.md` and scenario-declared skill references, the user turn, typed mock tool descriptions, and the accumulated transcript. On each step it chooses one action: `read`, `web_search`, `fetch_content`, `bash`, `edit`, `write`, `public_action`, or `respond`.

This tests portable skill behavior rather than Pi-specific skill loading or provider tool-call serialization.

## Safety and isolation

- Subject-selected actions dispatch only to typed fixture maps and arrays.
- Mock tools never access the real filesystem, network, shell, GitHub, or Git remotes.
- Mutation and public-action mocks record the attempt but never execute it.
- Host-only BAML code reads the selected skill and validated repository-relative skill references, then writes reports. Those capabilities are never exposed as subject actions.
- Reports contain skill text, transcripts, and tool traces. They stay under the ignored `.skill-eval-results/` directory unless `--output_dir` selects another local path.

BAML itself is not a security sandbox. The isolation boundary is the fixture dispatcher: agent-visible actions must never call `baml.fs`, `baml.http`, or `baml.sys`.

## Prerequisites

- New BAML wrapper on `PATH`
- BAML toolchain `0.15.0`, installed with `baml toolchain install 0.15.0`
- `OPENAI_API_KEY` in the repository root `.env` file, or exported in the shell, for live subject and judge calls

Start from the ignored local template if needed:

```bash
cp .env.example .env
```

The live npm commands use `dotenv-cli` to load the root `.env` before launching BAML. Existing process variables remain available. The deterministic check does not load credentials.

The project pins the exact toolchain in `baml.toml`. Repository scripts enter `evals/skills/` before invoking BAML so the wrapper selects that manifest rather than its global default. The subject uses `openai-responses/gpt-5-mini`; the semantic judge uses `openai-responses/gpt-5`.

## Commands

Validate the BAML project and deterministic harness contracts without model calls:

```bash
npm run eval:skills:check
```

List the native BAML tests:

```bash
(cd evals/skills && baml test --list)
```

Run all live skill behavior tests:

```bash
npm run eval:skills:test
```

The scenarios run in parallel, while each scenario's agent loop remains ordered. Interactive npm runs show one cyan suite spinner with the completed scenario count. Each completion prints a stable green `✓` or red `✗` line, and `NO_COLOR` disables coloring. Redirected and non-interactive runs use stable `[RUN]`, `[PASS]`, and `[FAIL]` lines instead.

Run all scenarios and write separate JSON and Markdown reports for each skill:

```bash
npm run eval:skills
```

Run a research scenario:

```bash
npm run eval:skills -- \
  --scenario_id research-local-evidence-sufficient
```

Run the HCI scenarios:

```bash
npm run eval:skills -- --suite_id hci
```

Repeat each selected scenario:

```bash
npm run eval:skills -- --repetitions 3
```

Run the subject and deterministic assertions without the semantic judge:

```bash
npm run eval:skills -- --skip_judge true
```

Choose where to write reports:

```bash
npm run eval:skills -- \
  --output_dir .skill-eval-results/manual-run
```

`--output_dir` is the parent directory for each selected skill's report.

## Interpreting results

Hard assertions deterministically inspect the mock-tool trace, such as whether local evidence was read before external research or whether publication was attempted before confirmation. The BAML judge assesses focus, evidence use, and whether the response fulfilled every scenario criterion.

Use direct assertions for behavior the trace can prove. Use the semantic judge only for fuzzy response quality. Repeat important scenarios and inspect cited trace evidence rather than treating one model result as proof.

A behavior failure exits nonzero after writing the report. Compiler, provider, or runtime failures also exit nonzero. BAML's native test runners can add `testing.Quorum` or `testing.PassRate` policies when the suite needs an aggregate stochastic threshold.
