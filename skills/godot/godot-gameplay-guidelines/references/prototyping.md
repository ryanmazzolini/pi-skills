# Prototyping

Use a disposable Godot experiment when inspection, conversation, or a sketch cannot settle how gameplay should feel or behave. The experiment supplies evidence for a later production decision; it is not an early production implementation.

## Bound the question

Name one experiential question and what the player will do or observe to answer it. Compare two or three meaningfully different variants when the direction is open. Run separate experiments for independent questions rather than growing one general prototype.

Example: “Which Excavation input feels best?” can compare tapping, dragging, and timed precision with one fixture reward. It does not need tools, inventory, persistence, or backend rewards.

## Keep it disposable

- Prefer one clearly marked entry scene with representative in-memory or fixture state.
- Keep saves, network contracts, and external side effects out of the experiment.
- Prefer new prototype-owned paths. Touch production scenes or autoloads only when fidelity requires it, and record those edits for cleanup.
- Expose only the tuning values needed for quick comparison.
- Use the real surrounding context when it changes the judgment; otherwise omit unrelated product behavior, production hardening, tests, and abstractions.
- Record the prototype-owned paths and one command or scene that runs the experiment.

## Judge and finish

Verify that the experiment runs without relevant Godot errors, then use human playtesting as the evidence for game feel. Test on representative hardware when touch, attention, performance, or device ergonomics can change the verdict.

Iterate while changes remain cheap and answer the same question. Once settled, record the verdict, remove the prototype-owned paths, revert every recorded prototype edit to production files, and implement the chosen behavior afresh under the production workflow. Do not promote prototype code into the product.
