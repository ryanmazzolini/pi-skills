---
name: "prototype"
description: Build a throwaway artifact to answer one design question. Use when research and conversation cannot settle how an interface, interaction, or state model should look, behave, or feel.
license: "MIT; adapted from mattpocock/skills"
---

# Prototype

Answer one question through experience, then discard the code. A prototype gathers alignment evidence; it is not production implementation.

## Bound the experiment

Run a prototype inside an active alignment. Treat a caller-supplied alignment as a locator: first use [`durable-context.md`](../ship/references/durable-context.md) to classify its workflow as verified legacy or the workspace profile's canonical work item. For vault-native work, resolve the alignment target through the workflow-profile helper before reading or updating it. Otherwise use the current verified `alignment.md` or legacy `question.md`. If none exists, return to `align` to create or reuse one and micro-align the experiment before writing code.

Read the alignment and the relevant product surface. State:

- the single question the prototype will answer
- why inspection, conversation, or a sketch cannot answer it
- what the user will observe or do to settle the question

Resolve these through inspection or a short proposal when possible. If uncertainty still blocks the experiment, explain it. Ask one short question, then stop. Return to `align` when several independent decisions remain. Treat an explicit invocation or approval already given in the conversation or alignment as approval to prototype. Otherwise recommend the experiment and wait for approval before writing code.

When the framing or candidate experience space remains open, read [Orient](../ship/references/exploration.md#orient) and [Phase 1 of `exploration.md`](../ship/references/exploration.md#phase-1--fan-out) before choosing the artifact. Treat candidate families as experience hypotheses and evidence paths as relevant patterns or observations. Include an alternative that challenges the apparent favorite, then stop at the reference's checkpoint.

Choose the smallest useful form. When comparison itself will answer an appearance, hierarchy, interaction, behavior, or state question, name two or three structurally different hypotheses and build them as a set with the same surrounding context, representative data, and fidelity. Complete the bounded set before critiquing or refining one. A narrow question does not need extra variants.

- For appearance or information hierarchy, create the smallest UI that can be judged in its real surrounding context.
- For interaction, behavior, or state, create a tiny interactive application with representative in-memory data and make the relevant state visible after each action.

Use the project's existing runtime, components, and task runner when they improve fidelity. Otherwise prefer a self-contained artifact under the vault-native work item's `working/` directory, or beside a legacy workflow that remains in place. For a vault-native artifact, resolve its work-item target through the workflow-profile helper before writing or cleaning it up. Clearly mark every prototype entry point as throwaway and provide one command or URL to run it.

Before writing, inspect the working tree and record a baseline of the files and pre-existing changes that cleanup must preserve. Keep prototype work in clearly named new paths when practical. If meaningful fidelity requires changing an already-edited file, use precise prototype-only edits or ask before moving the experiment to an isolated workspace.

Keep only what answers the question. Omit production hardening, tests, persistence, abstractions, unrelated paths, and external side effects. Stub real mutations and services. If meaningful evaluation would require production quality or a broad implementation, stop and return that constraint to alignment.

## Hand over recoverably

Before user evaluation, record an open prototype in the active alignment file: its question, location, run command or URL, what to judge, prototype-owned paths or edits, pre-existing work to preserve, and remaining cleanup. For a comparison, include every path or edit created for any variant—including one discarded before evaluation—and shared scaffolding in the prototype-owned inventory. Verify that it runs, then give the user the run command or URL and the exact question to judge.

Iterate only while changes remain cheap and continue to answer that same question. After comparison, refine the selected direction only if the original question remains unanswered; otherwise stop iterating and proceed to the verdict and cleanup below. Stop when the question is answered or the prototype no longer stays disposable.

When the user settles the question, add the verdict to the open prototype without removing its recovery details, then stop prototype processes. Remove only the recorded prototype-owned paths and edits by default. When the user asks to preserve the prototype, instead move or retain it outside the production path and record its location.

Compare the working tree with the recorded baseline and confirm that no prototype entry point, task, or process remains in the production path. Only then replace the open prototype with the verdict, the evidence needed to understand it, and the affected alignment decisions.

Return to `align` at the decision the prototype interrupted. Do not advance to planning or promote prototype code into production. Production implementation may later reproduce the validated behavior under normal project standards.

Keep the user-facing result concise: where to try the prototype and what to judge before the verdict, then the learned decision and cleanup status afterward.
