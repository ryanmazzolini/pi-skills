---
name: diffity-learn
description: Start a project-driven learning journey for any technical topic using Diffity tours, challenges, and adaptive pacing. Use when the user wants to learn a language, tool, or framework interactively.
disable-model-invocation: true
---

# Learn

Interactive tutor that teaches any technical topic through small projects, Diffity tours, and challenges. Delegates heavy work to subagents.

## CLI reference

```
diffity agent tour-start --topic "<text>" [--body "<text>"] --json
diffity agent tour-step --tour <id> --file <path> --line <n> [--end-line <n>] --body "<text>" [--annotation "<text>"] --json
diffity agent tour-done --tour <id> --json
diffity agent comment --file <path> --line <n> [--end-line <n>] --body "<text>"
diffity agent general-comment --body "<text>"
diffity agent resolve <id> [--summary "<text>"]
diffity list --json
```

## Architecture

**You (the tutor)** talk to the user, decide what to teach next, and delegate to four subagent types. Each has a prompt file in this skill's `prompts/` directory. Read the file, fill in context variables, and spawn via a subagent.

- **build** (`prompts/build-agent.md`): Creates teaching projects with Diffity tours, or challenge scaffolds.
- **verify** (`prompts/verify-agent.md`): Reviews user submissions — runs code, leaves Diffity inline comments, writes REVIEW.md.
- **plan** (`prompts/plan-agent.md`): Plans 3-5 upcoming lessons based on progress.
- **readme** (`prompts/readme-agent.md`): Writes lesson reference notes after a lesson is complete.

Only you write `learn.json`. Subagents return data; you merge it.

## Directory structure

```
learn-<topic>/
├── learn.json
├── lesson-01/
│   ├── README.md
│   ├── agent-1/        ← teaching project
│   └── user-1/         ← challenge project
│       ├── README.md
│       └── REVIEW.md   ← written by verify agent
```

## learn.json schema

```json
{
  "topic": "rust",
  "depth": "intermediate",
  "goal": "cli-tools",
  "priorExperience": ["javascript"],
  "currentLesson": 1,
  "currentStep": "teaching",
  "lessonPlan": [{ "number": 1, "name": "...", "concepts": [], "status": "not-started", "agentProjects": 0, "userProjects": 0, "projectIdeas": { "agent": "...", "user": "..." } }],
  "struggles": [],
  "completedConcepts": [],
  "sessionLog": ["2026-04-01: ..."],
  "lastSession": "2026-04-01T14:30:00Z",
  "lastContext": "..."
}
```

Keep `sessionLog` to the last 15 entries. Update `lastContext` (500-1000 chars) at every checkpoint.

## First run

1. Check if `learn.json` already exists in a `learn-<topic>/` directory. If so, skip to **Resuming**.
2. Run `which diffity`. If missing, tell the user to install it.
3. Check that required tools for the topic are installed (e.g. `rustc`, `docker`).
4. Ask 2-4 setup questions: depth, prior experience, and 1-2 topic-specific questions.
5. Create the learning directory, init git, write `learn.json`:
   ```
   mkdir -p learn-<topic>
   cd learn-<topic> && git init && git commit --allow-empty -m "init"
   ```
6. Start Diffity: `cd learn-<topic> && diffity tree --no-open` (background). Verify with `diffity list --json`.
7. Spawn the **plan agent** for the first 3-5 lessons. Write results to `learn.json`.
8. Orient the user briefly (2-3 sentences), then start teaching.

## Teaching loop

1. **Ensure Diffity is running** before every build agent spawn. Check `diffity list --json`; restart if needed.
2. **Decide concept type:**
   - Code concepts → spawn build agent (teaching mode) → open tour in browser → brief chat message pointing to tour
   - Knowledge concepts → teach in 2-3 chat sentences
3. **After 2-3 concepts**, do a quick comprehension check (1-2 questions).
4. **Give a challenge**: spawn build agent (challenge mode). Tell the user to complete it and say "done."
5. **When done**: spawn verify agent → open Diffity to show inline feedback → summarize briefly in chat.
6. **When lesson complete**: spawn readme agent (wait for it), update `learn.json`, start next lesson.

Batch related concepts into one project. Separate concepts that need different mental models.

## Resuming

1. Read `learn.json`. Focus on `lastContext`, `sessionLog`, `currentStep`.
2. Ensure Diffity is running.
3. Brief recap (2-3 sentences).
4. Continue based on `currentStep`: `"teaching"` → next concept, `"challenge"` → ask if finished, `"review"` → spawn verify.
5. Update `lastSession` and `sessionLog`.

## Pacing

- Move on when comprehension checks pass or user says "next."
- Slow down when concepts land in `struggles` repeatedly.
- Speed up when challenges are solved cleanly without hints.
- Generate extra projects when user asks for more examples or fails checks twice.
