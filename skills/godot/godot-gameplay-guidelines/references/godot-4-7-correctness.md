# Godot 4.7 Correctness

Use the documentation for the project's actual Godot version when it differs from 4.7.

## Physics movement

Run physics body movement and direct space queries from `_physics_process()`.

- `move_and_collide()` receives relative motion, so velocity in units per second normally becomes `velocity * delta`.
- `CharacterBody2D` and `CharacterBody3D` store `velocity` in units per second. `move_and_slide()` consumes that property directly; use `delta` when changing velocity over time, such as acceleration or gravity.
- Move a code-controlled character body with its movement methods rather than assigning its position through ordinary gameplay movement.

Source: [Using CharacterBody2D and CharacterBody3D](https://docs.godotengine.org/en/4.7/tutorials/physics/using_character_body_2d.html)

## Node lifecycle

Use parent-child structure when the child shares the parent's lifetime. Keep external dependencies explicit and provide them from an owning ancestor.

Godot enters a parent into the scene tree before its children. Children become ready before their parent. Use `queue_free()` for normal deferred removal, then treat references to the queued object as ending.

Source: [Node](https://docs.godotengine.org/en/4.7/classes/class_node.html)

## Mutable Resources

Godot loads a Resource path once and returns the same cached object to each user. Treat loaded and exported Resources as shared unless the design deliberately makes them local or duplicates them.

Before mutating a Resource during play, decide whether the change should affect every user. Keep per-instance state on the owning node when it should not be shared.

Source: [Resources](https://docs.godotengine.org/en/4.7/tutorials/scripting/resources.html)

## TileMapLayer

Use `TileMapLayer`; `TileMap` is deprecated. Tile changes are normally batched until the end of the frame. Call `update_internals()` only when the same frame requires the updated result, because forcing updates can be expensive.

Runtime tile data can share sub-resources with the TileSet. Duplicate a sub-resource before changing it for one tile. Limit runtime tile updates to cells that need them.

Source: [TileMapLayer](https://docs.godotengine.org/en/4.7/classes/class_tilemaplayer.html)

## Navigation

A navigation map may not be synchronized during `_ready()`. Defer the first path request or wait for the map to report a change.

For `NavigationAgent2D` and `NavigationAgent3D`:

- Stop early when navigation is finished.
- Call `get_next_path_position()` once per physics update while following a path.
- Set a new target only when the target changes enough to require a new path. Rebuilding the path every frame can make agents jitter or backtrack.
- Treat avoidance as an additional simulation, not collision or pathfinding. Measure its cost before enabling it for many agents.

Source: [Using NavigationAgents](https://docs.godotengine.org/en/4.7/tutorials/navigation/navigation_using_navigationagents.html)

## Performance

Profile a representative scene before changing architecture for performance. Repeat the same scenario afterward and compare the same measurements.

Frame time includes rendering. Physics time and idle time help narrow the affected subsystem. Use self time to distinguish work done by a function from time spent in functions it calls.

Source: [The profiler](https://docs.godotengine.org/en/4.7/tutorials/scripting/debug/the_profiler.html)

## Migrating from Godot 4.6

Read the migration guide for every subsystem the project uses. Gameplay-relevant changes include input device identifiers, packed-array setter behavior, inherited typed returns, audio area masks, Jolt Physics behavior, and new-project window stretch defaults.

Source: [Upgrading from Godot 4.6 to Godot 4.7](https://docs.godotengine.org/en/4.7/tutorials/migrating/upgrading_to_godot_4.7.html)
