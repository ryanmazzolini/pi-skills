# Relational Database Concurrency

Read this when relational database transactions can overlap on the same logical state, or when a change affects transaction boundaries, isolation, locking, contention, or retry behavior.

First identify the database engine and deployed version, schema constraints, framework and driver, connection-pool model, and every production or operational writer. Exact isolation, lock, timeout, and error behavior comes from the matching engine, framework, and driver documentation—not from generic SQL intuition.

## Define what must remain true

State the invariant and the smallest logical scope that must coordinate. Trace each competing transaction from its first read or lock through commit or rollback, including jobs, callbacks, repairs, backfills, triggers, and nested service calls. Name its read set, write set, lock or validation order, external calls, and retry owner.

When transactions touch several records or use more than one coordination mechanism, draw the competing timelines or wait-for edges. Finish when the possible overlap and the state that must serialize are visible.

## Compare coordination strategies

Choose the simplest mechanism that enforces the invariant close to the data. When the mechanism could materially change correctness, contention, or complexity, compare two or three credible options that could reasonably win, such as:

- a constraint or atomic statement;
- optimistic validation or a version check;
- row or table locking;
- an application-named lock when the invariant does not map to stored rows;
- stronger transaction isolation;
- a single writer or partitioned work queue.

For each viable option, explain contention scope, allowed concurrency, failure signal, rollback behavior, caller-visible retry, and the state that proves the operation completed. If the invariant or existing constraints eliminate every alternative, explain that evidence rather than inventing a weaker option. Prefer native constraints and atomic mutations when they fully express the rule. Do not introduce a lock merely because concurrency exists.

## Bound failure and resource use

For a lock-based option, verify one acquisition order across every writer and acquire the required scope before dependent work. Keep the transaction and critical section small; move avoidable remote I/O, user waits, and expensive calculation outside them.

Reject designs that leave a check-then-write gap, coordinate only some writers, acquire the same state in different orders, or derive a lock set that concurrent changes can expand without detection. Keep contention failures distinct from successful duplicate-work suppression.

Choose wait behavior from the caller's contract. A bounded synchronous operation may wait; retryable asynchronous work may need to fail and release its connection instead. Account for connections, threads, workers, and queued work retained by every holder and waiter. Examine nested calls, mixed coordination mechanisms, hot keys, fairness, and the effect at pool or worker capacity.

Retry only after rollback. Make the mutation idempotent, place bounded retry policy at one layer, and use backoff and jitter when simultaneous retries can recreate contention. Keep duplicate-work suppression distinct from contention handling.

## Operate and verify

Define signals for transaction age, lock waits, blockers, deadlocks or serialization failures, pool checkout delay, retries, and queue age. Provide a containment and recovery path for a stuck holder or overload without assuming termination is safe.

Test the real engine with separate connections and deterministic barriers rather than sleeps. Cover ordinary overlap, the important contention or conflict path, rollback of partial or completion state, and success after the conflict clears. Add a realistic capacity check when waiting can consume a shared pool or worker budget.

Before relying on exact behavior, read the matching `<engine>/concurrency.md` reference in this directory when one exists. Otherwise retrieve the deployed engine version's official documentation. Retrieve framework and driver documentation separately for transaction nesting, connection ownership, exception mapping, and automatic retries.

Lead with the recommended strategy and why it preserves the invariant without unnecessary serialization. Show the highest-impact failure mode, resource bound, verification, and remaining engine-specific unknown. Stop before implementation.
