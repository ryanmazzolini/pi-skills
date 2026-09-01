# PostgreSQL Concurrency Sources

Read this only after the live system identifies PostgreSQL as its database engine. Establish the deployed major version, then use that version's official documentation rather than assuming `current` matches production.

This file routes questions to semantic authority; it does not replace the documentation. Retrieve only the page or pages needed for the exact decision instead of treating the table as a reading list.

| Question | Official PostgreSQL documentation |
|---|---|
| Isolation levels, serialization anomalies, and required retries | [Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html) |
| Table, row, page, and advisory locks; deadlocks and lock lifetime | [Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html) |
| Locking clauses, `NOWAIT`, and `SKIP LOCKED` | [`SELECT`](https://www.postgresql.org/docs/current/sql-select.html) |
| Statement, transaction, lock, and idle-session timeouts | [Client Connection Defaults](https://www.postgresql.org/docs/current/runtime-config-client.html) |
| Current locks and wait state | [`pg_locks`](https://www.postgresql.org/docs/current/view-pg-locks.html) and [`pg_stat_activity`](https://www.postgresql.org/docs/current/monitoring-stats.html#MONITORING-PG-STAT-ACTIVITY-VIEW) |
| Blocking-session and advisory-lock functions | [System Information Functions](https://www.postgresql.org/docs/current/functions-info.html) and [System Administration Functions](https://www.postgresql.org/docs/current/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS) |
| SQLSTATE meanings used by drivers and frameworks | [Error Codes](https://www.postgresql.org/docs/current/errcodes-appendix.html) |

Replace `current` in each URL with the deployed major version when exact behavior may differ. Follow relevant cross-references in the official documentation before recommending a lock mode, isolation level, timeout, diagnostic query, or retry condition.

Also retrieve the active framework and driver documentation. Verify how they begin and nest transactions, check out connections, expose PostgreSQL errors, and perform automatic retries. Confirm live role and session settings through the project's existing safe runtime indirection; do not read credentials or copy secret configuration into the review.
