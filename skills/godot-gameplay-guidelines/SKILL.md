---
name: godot-gameplay-guidelines
description: Gameplay-oriented defaults for Godot projects. Use when working with .gd files, scene architecture, or tuning game feel and performance.
---

# Godot Gameplay Guidelines

## Priorities

- Optimize for player feel, frame stability, and iteration speed
- Prefer scene composition and signals over deep inheritance and broad globals
- Playtest early so feel problems surface before abstractions harden

## Defaults

- Keep data in resources or lightweight data objects, and keep behavior in nodes
- Put physics-driven movement and collision work in `_physics_process`
- Reserve autoloads for true globals such as input, audio, or save systems

## Review Questions

- Does this feel better in play, not just in code?
- What happens when many entities are active at once?
- Can designers or future-you tune this quickly without rewiring the scene?
