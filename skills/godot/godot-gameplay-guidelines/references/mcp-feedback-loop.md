# MCP Feedback Loop

Use the live tool descriptions for exact arguments. They are the source of truth for the installed server version.

## Companion roles

[`minimal-godot-mcp`](https://github.com/ryanmazzolini/minimal-godot-mcp) uses Godot's built-in language and debug protocols without a project addon. Use it for:

- diagnostics for one changed GDScript file;
- a final workspace diagnostic scan;
- running-game console output and errors;
- clearing console output before a new run.

[`satelliteoflove/godot-mcp`](https://github.com/satelliteoflove/godot-mcp) uses an editor addon. Use it for editor and scene inspection, deterministic game-time control, input, structured runtime state, screenshots, and profiling.

The editor bridge serves one client at a time. Keep editor-driving work in one session rather than making several agents wait for the same bridge.

## Choose file tools or MCP tools

Edit plain `.gd` and `.tscn` files with normal file tools. Then open or inspect the result through Godot.

Use the editor bridge when Godot must preserve or reveal information that plain text cannot safely handle, including:

- reparenting nodes with dependent paths or signal connections;
- encoded TileMapLayer or GridMap cell data;
- effective node and resource properties;
- editor state, imports, and error logs;
- the running game.

Confirm with the user before installing or updating the addon, restarting Godot with unsaved work, or changing the project only to support the test harness.

## Run the loop

1. Confirm that the intended project is open and the available MCP servers are connected. Check server and addon versions when the editor bridge behaves unexpectedly.
2. Check each changed GDScript file with the fast per-file diagnostic tool.
3. Before a run, clear the game console and record the current editor-log cursor.
4. Run a representative scene. Start with frozen game time when timing or input matters.
5. Put input inside a controlled game-time step so button edges and timing reach actual frames.
6. Read structured runtime state and the scene tree to judge behavior. Capture a screenshot only when appearance is the question.
7. Read both error sources: editor, import, and addon errors from the editor bridge; running-game output and errors from the companion console.
8. Stop the run, scan workspace diagnostics, and run the project's full validation.
9. Leave human game-feel checks and target-hardware performance checks pending until they happen.

## Use powerful tools carefully

Use runtime script execution only to create a temporary test scenario, such as reaching a difficult game state. It executes code inside the game. Its denylist prevents accidents; it is not a security boundary. Keep persistent project changes in reviewed files.

Prefer structured state over screenshots for positions, velocities, state machines, counters, and other behavior. Screenshots are evidence for layout, art, animation, effects, and other visual questions.

## Work without both servers

- With only `minimal-godot-mcp`, use diagnostics and the game console. Run scenes through the editor or the project's normal commands.
- With only `satelliteoflove/godot-mcp`, use its editor and runtime evidence. Use the project's Godot command for script validation.
- With neither server, use normal file inspection, project commands, representative scene runs, and manual playtesting.
- Without a runnable Godot environment, perform a static review and report runtime, visual, game-feel, and performance checks as pending.

## Sources

- [`minimal-godot-mcp` tools](https://github.com/ryanmazzolini/minimal-godot-mcp/blob/c377379dcaa302a68e69c8526dd291f89a3d01c3/src/index.ts#L105-L173)
- [`godot-mcp` overview and companion split](https://github.com/satelliteoflove/godot-mcp/blob/59da3d0dae06c79cc970d83828e54b2fc16d0769/README.md#L13-L34)
- [`godot-mcp` companion guidance](https://github.com/satelliteoflove/godot-mcp/blob/59da3d0dae06c79cc970d83828e54b2fc16d0769/README.md#L117-L123)
- [Deterministic playtesting guidance](https://github.com/satelliteoflove/godot-mcp/blob/59da3d0dae06c79cc970d83828e54b2fc16d0769/docs/claude-code-setup.md#L36-L47)
- [Single-client editor bridge and game-time control](https://github.com/satelliteoflove/godot-mcp/blob/59da3d0dae06c79cc970d83828e54b2fc16d0769/docs/architecture.md#L32-L55)
