---
name: "teach"
description: "Teach the user a new skill or concept in a durable learning workspace. Use when the user asks to learn, be taught, or build a course of lessons over multiple sessions."
disable-model-invocation: true
argument-hint: "What would you like to learn about?"
license: "MIT; adapted from mattpocock/skills"
---

# Teach

The user has asked you to teach them something. This is stateful work: assume they intend to learn the topic over multiple sessions.

## Teaching Workspace

Treat the current directory as the teaching workspace. If the current directory is clearly the wrong place to create durable teaching files, ask where to put the workspace before writing files.

The workspace state lives in these files:

- `MISSION.md`: the reason the user is interested in the topic. Use it to ground every teaching decision. Use the format in [MISSION-FORMAT.md](./MISSION-FORMAT.md).
- `RESOURCES.md`: trusted sources for knowledge and communities for wisdom. Use the format in [RESOURCES-FORMAT.md](./RESOURCES-FORMAT.md).
- `GLOSSARY.md`: canonical terms the user already understands. Use the format in [GLOSSARY-FORMAT.md](./GLOSSARY-FORMAT.md).
- `./learning-records/*.md`: compact records of what the user has learned, titled `0001-<dash-case-name>.md`, incrementing each time. Use the format in [LEARNING-RECORD-FORMAT.md](./LEARNING-RECORD-FORMAT.md).
- `./lessons/*.html`: self-contained HTML lessons. A lesson teaches one tightly scoped thing tied to the mission.
- `./reference/*.html`: quick-reference materials such as cheat sheets, algorithms, syntax, poses, routines, or glossaries.
- `./assets/*`: reusable components shared across lessons. See [Assets](#assets).
- `NOTES.md`: a scratchpad for user preferences and working notes.

Create files and directories lazily. Do not scaffold a whole course before the mission and first lesson need it.

## Host Neutrality

Use whatever tools the current host provides. Do not assume host-specific commands, subagents, or UI affordances.

When a lesson should be opened for the user, use the host's normal file opener if available (`open`, `xdg-open`, `start`, browser tool, or equivalent). If not, report the file path.

## Philosophy

Deep learning needs three things:

- **Knowledge**, captured from high-quality, high-trust resources
- **Skills**, acquired through relevant practice and feedback
- **Wisdom**, which comes from interacting with other learners and practitioners

Before `RESOURCES.md` is well populated, focus on finding high-quality resources. Prefer trusted sources over parametric memory.

Some topics lean more toward knowledge than skills. Theoretical physics may be more knowledge-based. Yoga may be more skills-based.

### Fluency vs Storage Strength

Split learning into two strengths:

- **Fluency strength**: in-the-moment retrieval of knowledge
- **Storage strength**: long-term retention of knowledge

Fluency can create an illusion of mastery. Storage strength is the goal. Design lessons that build retention through desirable difficulty:

- retrieval practice: recall from memory
- spacing: practice distributed over time
- interleaving: mixing related topics during skills practice

## Lessons

A lesson is the main thing you produce. Each lesson is one self-contained HTML file saved to `./lessons/` and titled `0001-<dash-case-name>.html`, incrementing each time.

A lesson should be beautiful: clean, readable typography and layout, suitable for later review and printing. Think Tufte.

Keep lessons short and quick to complete. Working memory is small. Each lesson should give one tangible win, tie directly to the mission, and fit the user's zone of proximal development.

Each lesson should:

- link via HTML anchors to relevant lessons and reference documents
- recommend one primary source to read or watch
- include citations for factual claims
- remind the user to ask follow-up questions when anything is unclear

## Assets

Lessons are built from reusable components in `./assets/`: stylesheets, quiz widgets, simulators, diagram helpers, or anything a second lesson could reuse.

Reuse is the default. Before authoring a lesson, inspect `./assets/` and use components already there. When a lesson needs something reusable, write it as a component in `./assets/` and link to it.

A shared stylesheet is the first component a workspace earns. Every lesson links it so lessons feel like one coherent course instead of one-off pages.

## The Mission

Every lesson should tie back to the mission: why the user wants to learn this topic.

If the user is unclear about the mission, or `MISSION.md` is missing or empty, first ask why they want to learn this. A vague mission makes lessons feel abstract and makes it hard to choose what comes next.

Missions can change. Confirm with the user before changing `MISSION.md`, then add a learning record that captures the shift.

## Zone Of Proximal Development

Each lesson should feel challenging enough, not overwhelming.

The user may specify exactly what they want to learn. If they do not, infer the next lesson by:

- reading `learning-records`
- using the mission to choose what matters next
- teaching the most relevant thing that fits the user's zone of proximal development

## Knowledge

Design lessons around a skill the user will learn. Include only the knowledge needed to acquire that skill. Teach the knowledge first, then ask the user to practice through a feedback loop.

Gather knowledge from trusted resources first. Use `RESOURCES.md` to track them. Add citations to lessons so the user can trust and revisit the source.

For knowledge acquisition, difficulty is the enemy: it consumes working memory needed for understanding.

## Skills

If knowledge is about acquisition, skills are about durability and flexibility. Make the knowledge stick.

For skill acquisition, difficulty is the tool. Effortful retrieval builds storage strength. Teach skills through interactive lessons, such as:

- quizzes and light in-browser tasks
- guided real-world steps, such as yoga poses, command-line drills, or design exercises

Each activity should have a tight feedback loop. Prefer immediate, automatic feedback when practical.

For quizzes, each answer should be the same number of words and, when practical, similar character length. Do not leak clues through formatting.

## Acquiring Wisdom

Wisdom comes from real-world interaction: testing skills outside the learning environment.

When a question appears to require wisdom, answer as well as you can, then point the user toward a community where they can test the skill in the real world.

A community may be a forum, subreddit, class, local group, or professional community. Prefer high-reputation communities with strong moderation. If the user does not want community suggestions, respect that and note the preference in `RESOURCES.md` or `NOTES.md`.

## Reference Documents

While creating lessons, also create reference documents when they will be revisited. Lessons can link to them.

Lessons are for learning. Reference documents are for fast lookup. They should compress the useful knowledge into a quick-reference format.

Useful reference types include:

- syntax and code snippets for programming
- algorithms and flowcharts for processes
- yoga poses and sequences
- exercises and routines for fitness
- glossaries for topics with specialized language

## `NOTES.md`

Use `NOTES.md` for teaching preferences and reminders that should influence future lessons.
