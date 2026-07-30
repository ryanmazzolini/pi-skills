---
name: "godot-gameplay-guidelines"
description: "Godot 4.7 gameplay implementation and review. Use when changing gameplay behavior, scene ownership, game feel, or runtime performance."
---

# Godot Gameplay Guidelines

Close a feedback loop: define the player-visible change, give it a clear Godot owner, run it, and observe what happened.

## Choose experiment or production

Before production implementation, decide whether the player-visible behavior is settled through evidence. When input, game feel, pacing, camera, feedback, or interaction flow remains materially uncertain, stop the production workflow and use one disposable experiment to settle one question.

Read [Prototyping](references/prototyping.md) for the experiment defaults. Return to the production workflow only when the verdict settles the intended behavior and identifies a representative scenario that can prove it.

## Workflow

1. **Define the change.** Inspect the relevant scenes, scripts, Resources, autoloads, and project commands. Identify the player-visible behavior, its owner, and a representative scene or scenario that can prove it works. During review, question whether the current architecture should exist before recommending ways to harden it.

   Complete when the behavior, owner, and evidence are clear.

2. **Implement or review it.** Apply every relevant default below. Explain any new global state, mutable Resource, custom framework, or performance system.

   Complete when every relevant default is satisfied or has an explicit exception.

3. **Validate it in Godot.** Check changed scripts, run the representative scenario, and inspect editor and game errors. Prefer structured runtime evidence for behavior and screenshots for appearance. Run the project's full validation. A human must playtest game-feel changes; profile performance changes under representative load.

   Complete when every claim has evidence or is clearly reported as pending.

## Defaults

- Use a fitting Godot feature before building custom infrastructure: scenes, nodes, Resources, signals, TileMapLayer, navigation, AnimationPlayer, or tweens.
- Prefer self-contained scenes and composition over deep inheritance. Parent-child structure should express lifetime ownership; a common ancestor should connect siblings and provide external dependencies.
- Call typed methods to start behavior. Emit typed, past-tense signals to report events.
- Let one cohesive node or child scene own each gameplay capability and its lifecycle. Split it when responsibilities, lifetimes, update rates, or reuse needs diverge.
- Treat exported Resources as shared configuration. Keep per-instance mutable state with its owning node unless the Resource is deliberately local or duplicated.
- Follow the project's typing style. When no policy exists, add types at public boundaries: exported values, parameters, returns, signals, and collections.
- Perform physics body movement and direct physics queries during the physics update.
- Use an autoload when a responsibility must survive scene changes, has broad scope, and owns isolated state. Prefer scene-owned behavior for local responsibilities.
- Let repeated gameplay needs earn an abstraction. Keep tunable gameplay values visible to designers and future maintainers.
- Introduce data-oriented storage or performance systems only when measured scale or access patterns justify them.

## Progressive References

- Before changing physics bodies, node lifecycle, mutable Resources, TileMapLayer, navigation, performance-sensitive code, or a project migrating from Godot 4.6, read [Godot 4.7 correctness](references/godot-4-7-correctness.md).
- When Godot MCP tools are available, or the task needs editor or runtime evidence, read [MCP feedback loop](references/mcp-feedback-loop.md).
