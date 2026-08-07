# Interface Design

Read this when creating or changing a module boundary or public API. Design from the caller's point of view before implementing. Aim for a small interface that hides the hard parts.

1. Inspect the problem, callers, common operations, current conventions, compatibility needs, and constraints. Ask only about choices the code cannot answer.
2. Sketch two or three credible interfaces with meaningfully different shapes or ownership. Do not add an alternative that could not reasonably win.
3. For each option, show the contract, one ordinary caller example, what callers no longer need to know, errors and side effects, and the main cost.
4. Compare only differences that affect the decision: caller effort, correct use, misuse, testing, compatibility, lifecycle ownership, or future change.
5. Lead with the recommended interface and why it wins. Show the alternatives and consequential trade-offs beneath it. If a hybrid wins, show its concrete interface.

Favor the common caller path. Keep lifecycle, dependencies, policy, and internal coordination behind the interface when possible. Use [presentation.md](presentation.md) only when a side-by-side or spatial view makes the options easier to judge.

Stop when the user can choose an interface. Ask which direction they want; do not implement until they explicitly approve implementation.
