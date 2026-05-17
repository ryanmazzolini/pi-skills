---
name: godot-gameplay-guidelines
description: Gameplay-oriented defaults for Godot projects. Use when working with .gd files, scene architecture, or tuning game feel and performance.
---

# Godot Gameplay Guidelines

## Priorities

- Optimize for player feel, frame stability, and iteration speed
- Prefer scene composition, data-oriented state, and signals over deep inheritance and broad globals
- Playtest early so feel problems surface before abstractions harden

## Defaults

- Prefer Godot-native semantics before custom systems: scenes, nodes, resources, signals, TileMapLayer, navigation/path APIs, AnimationPlayer, tweens
- Start prototypes with clear Godot-shaped seams: scene-owned scripts, Resources for inspectable data, and components for repeated behavior
- Avoid god scripts even in prototypes; establish file/module boundaries early so humans and LLMs can navigate safely
- Prefer data-oriented game state and system/component behavior over deep OO entity hierarchies
- Prefer fat components that own meaningful gameplay lifecycles, e.g. movement, health, selection, tasks, interaction
- Add abstraction deliberately, but deepen it only after repeated gameplay patterns earn it
- Put physics-driven movement and collision work in `_physics_process`
- Reserve autoloads for true globals such as input, audio, or save systems

## Review Questions

- Does this feel better in play, not just in code?
- What happens when many entities are active at once?
- Can designers or future-you tune this quickly without rewiring the scene?
