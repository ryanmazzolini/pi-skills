# Layer examples by project type

A feature becomes real by crossing the project's layers. These are illustrative — name the actual layers from the project's own CONTEXT.md and code, don't force a feature into a template. A tracer-bullet slice is the thinnest cut that touches every layer once for a single happy path.

## Web service (e.g. Rails/GraphQL + React/Vue)
- persistence: migration / schema for the one table the path needs
- domain: the model or service method the path calls
- API: the one query/mutation or endpoint exposed
- client: the one screen or component that calls it
Tracer bullet: one record created via the UI, round-tripping through the real API and DB.

## Game (e.g. Godot)
- data: the resource / data definition (e.g. one card, one entity)
- systems: the script or node that acts on it
- scene: the scene wiring it into the running game
- input/feedback: the control and the on-screen response
Tracer bullet: one entity the player can trigger and see respond, in a real scene.

## Audio / MIDI tool (e.g. Rust + midir)
- input: capture from one device
- transform: the one mapping/merge the feature performs
- output: emit to the virtual port / sink
- host integration: the path verified inside the target host (e.g. DAW)
Tracer bullet: one physical input producing one correct output event in the host.

## CLI / library
- core: the one public function or command
- contract: its signature / args / return shape
- surface: how a caller invokes it (flag, import)
- feedback: output, exit code, or return value
Tracer bullet: one real invocation producing the right result, callable as a user would.

## How to use these
- If the project's layers are obvious from the code, skip this file — just name them.
- The layer count isn't fixed; some features cross two layers, some five.
- The rule is constant across all types: thinnest end-to-end cut first, then thicken.
