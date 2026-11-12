---
name: "prototype"
description: "Build a throwaway mock or tiny working version so the user can react to something concrete. Use when a choice about how an interface, interaction, or state model should look, behave, or feel would be settled faster by seeing it than by answering questions."
license: "MIT; adapted from mattpocock/skills"
---

# Prototype

Answer one question through experience, then discard the code. A prototype gathers evidence for a decision; it is not production implementation.

Keep experiment bookkeeping and cleanup mechanics internal unless they change what the user may safely do. Before evaluation, say where to try the prototype and what to judge. Afterward, state the decision it settled and whether the throwaway code was removed.

## Bound the experiment

A prototype needs no alignment or work item. When an alignment or work item already exists, record the experiment there. Treat a caller-supplied alignment as a locator: first use [`durable-context.md`](../ship/references/durable-context.md) to classify its workflow as verified legacy or the workspace profile's canonical work item. For vault-native work, apply the [vault-target checks](../ship/references/workflow-profiles.md) before reading or updating the alignment with ordinary file tools. Otherwise use the current verified `alignment.md` or legacy `question.md`. When none exists, keep the experiment's record in the conversation.

Read the relevant product surface and any existing alignment. State:

- the single question the prototype will answer
- why seeing or trying it would settle the choice faster than inspection, conversation, or a sketch
- what the user will observe or do to settle the question

Resolve these through inspection or a short proposal when possible. If uncertainty still blocks the experiment, explain it. Ask one short question, then stop. When several independent decisions remain, prototype the one that seeing will settle and raise the others separately.

Build without asking when the prototype is quick, lives entirely in new files outside the production tree, and has no external side effects. Also treat an explicit invocation or approval already given in the conversation or alignment as approval to prototype. Otherwise recommend the experiment and wait for approval before writing code.

When the framing or candidate experience space remains open, read [Orient](../ship/references/exploration.md#orient) and [Phase 1 of `exploration.md`](../ship/references/exploration.md#phase-1--fan-out) before choosing the artifact. Treat candidate families as experience hypotheses and evidence paths as relevant patterns or observations. Include an alternative that challenges the apparent favorite, then stop at the reference's checkpoint.

Choose the smallest useful form. When comparison itself will answer an appearance, hierarchy, interaction, behavior, or state question, name two or three structurally different hypotheses and build them as a set with the same surrounding context, representative data, and fidelity. Complete the bounded set before critiquing or refining one. A narrow question does not need extra variants.

- For appearance or information hierarchy, create the smallest UI that can be judged in its real surrounding context.
- For interaction, behavior, or state, create a tiny interactive application with representative in-memory data and make the relevant state visible after each action.

Use the project's existing runtime, components, and task runner when they improve fidelity. Otherwise prefer a self-contained artifact under the vault-native work item's `working/` directory, beside a legacy workflow that remains in place, or in an OS temp directory when no work item exists. For a vault-native artifact, apply the [vault-target checks](../ship/references/workflow-profiles.md) before writing or cleaning it up with ordinary file tools. Clearly mark every prototype entry point as throwaway and provide one command or URL to run it.

Before writing, inspect the working tree and record a baseline of the files and pre-existing changes that cleanup must preserve. Keep prototype work in clearly named new paths when practical. If meaningful fidelity requires changing an already-edited file, use precise prototype-only edits or ask before moving the experiment to an isolated workspace.

Keep only what answers the question. Omit production hardening, tests, persistence, abstractions, unrelated paths, and external side effects. Stub real mutations and services. If meaningful evaluation would require production quality or a broad implementation, stop and tell the user.

## Hand over recoverably

Before user evaluation, record an open prototype in the active alignment or work item, or in the conversation when neither exists: its question, location, run command or URL, what to judge, prototype-owned paths or edits, pre-existing work to preserve, and remaining cleanup. For a comparison, include every path or edit created for any variant—including one discarded before evaluation—and shared scaffolding in the prototype-owned inventory. Verify that it runs, then give the user the run command or URL and the exact question to judge.

Iterate only while changes remain cheap and continue to answer that same question. After comparison, refine the selected direction only if the original question remains unanswered; otherwise stop iterating and proceed to the verdict and cleanup below. Stop when the question is answered or the prototype no longer stays disposable.

When the user settles the question, add the verdict to the open prototype without removing its recovery details, then stop prototype processes. Remove only the recorded prototype-owned paths and edits by default. When the user asks to preserve the prototype, instead move or retain it outside the production path and record its location.

Compare the working tree with the recorded baseline and confirm that no prototype entry point, task, or process remains in the production path. Only then replace the open prototype with the verdict, the evidence needed to understand it, and the affected decisions.

Return to the decision the prototype informed. A verdict settles that decision only; it does not approve production implementation. Do not advance to planning or promote prototype code into production. Production implementation may later reproduce the validated behavior under normal project standards.

Keep the user-facing result concise and in product language. Do not narrate the workflow that led to the prototype.
