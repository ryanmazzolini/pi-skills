---
name: "clear-writing"
description: "Rewrite human-facing text so it is direct, concrete, and easy to read without changing its meaning. Use when rewording documentation, skills, pull request descriptions, commit messages, review comments, user-facing responses, or other prose. Pair with writing-for-agents when the text instructs an AI agent."
---

# Clear Writing

Rewrite prose for a capable reader who needs the relevant context without unnecessary effort.

## Preserve the meaning

Before rewriting, identify the main point, intended reader, and useful result. Preserve facts, requirements, safeguards, conditions, uncertainty, and any technical term whose exact wording carries meaning. Preserve precise meaning, not terminology for its own sake. Follow any format or content rules for the artifact.

Read enough surrounding context to understand what the text means. If an ambiguity could materially change the rewrite, explain it and ask one focused question. Do not silently resolve it.

Treat pasted text as output-only unless the user asks you to edit a file.

## Rewrite for the reader

Lead with the main point, then develop one idea at a time. Start a new paragraph when the focus changes. Prefer short, direct sentences with enough variation and connection to read naturally.

Use concrete subjects and direct verbs. Prefer plain, specific words over abstractions, internal jargon, stacked nouns, or inflated claims.

Treat reader competence and reader context separately. Do not infer familiarity with a system, domain, incident, or local vocabulary from general technical expertise. Prefer the reader's terms. Introduce a local term only when the reader needs its exact name to act or continue the discussion, and explain its practical meaning first.

Use one term for each concept instead of rotating synonyms. Reserve hedges for real uncertainty, and state exactly what is unknown and why.

Keep connected ideas in prose. Use bullets for genuinely separate facts and numbered steps when order matters. Put conditions before actions, and keep each step focused on one action.

Remove repeated context, process narration, and detail that does not help the reader act or understand. Keep the result proportional to the subject. Use links for supporting detail when the reader can open them, and keep the context needed to understand the result in the text.

## Explain and update clearly

When explaining an unfamiliar process, system, or trade-off, begin with one concrete example. Reuse that example when comparing options or introducing lower-level details.

Before asking a question, explain the situation that makes the answer necessary. Then ask one short, focused question.

When describing a change, state what changed, what happened before, and why the new behavior is better.

Treat investigation notes as source material, not as the structure of the response. For a decision or update, state the conclusion, its practical effect, and what happens next. Include only the evidence the reader needs to understand or act; link the rest.

Describe product requirements through user outcomes before implementation details when possible.

## Respect the artifact

Artifact-specific instructions decide required content and format. This skill improves the prose without replacing those rules.

For user interfaces, begin with the action the person is trying to complete and the visible effect. Use terms they encounter in their work. Keep service names, data-model terms, persistence details, and internal scope boundaries out of the interface unless knowing them changes what the person should do. Name buttons after the action or result, not the implementation mechanism.

For pull requests, commit messages, and review comments, write about the project change and the context the reader needs. Keep investigation notes, prompting, and agent workflow out of the artifact.

For agent instructions, use `writing-for-agents` to make the behavior contract reliable, then apply this skill to make it clear.

## Check the rewrite

Confirm that:

- the meaning and important constraints remain intact;
- the main point appears before supporting detail;
- concrete subjects perform clear actions;
- each paragraph or list has one purpose;
- unnecessary or unexplained jargon, repetition, and process narration are gone;
- the reader can understand and act without decoding unfamiliar terms or reconstructing the conclusion from supporting evidence;
- the result is concise without hiding necessary context.

Return the rewritten text first. Add commentary only for a material ambiguity, trade-off, or intentional change the reader needs to know about.
