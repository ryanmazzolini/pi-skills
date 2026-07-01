# Language

Use these terms consistently when discussing simplification opportunities.

**Module**
Any unit with an interface and an implementation: function, file, class, package, workflow, or
service slice.

**Interface**
Everything a caller must know to use a module correctly: type shape, invariants, ordering,
configuration, errors, performance, and side effects.

**Deep module**
A module where a small interface hides meaningful behavior or decisions. Callers get leverage because
they do not repeat the hidden knowledge.

**Shallow module**
A module whose interface is almost as complicated as its implementation. Shallow modules often move
complexity around instead of removing it.

**Seam**
A place where behavior can vary without editing the caller. Seams are useful when variation is real
or a boundary forces it. They are costly when added speculatively.

**Adapter**
A concrete implementation used at a seam, such as a production HTTP adapter, an in-memory test
adapter, or a wrapper around a third-party API.
