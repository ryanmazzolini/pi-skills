function CommitPrWorkItem() -> string {
    #"
        # SC-10101 — Prevent sync waits from exhausting connections

        Shortcut: https://app.shortcut.com/acme/story/10101

        Return and transfer sync runs inside Inbox's per-message process lock. It previously acquired a second advisory lock for each connected component. Overlapping components could leave workers waiting in open transactions while retaining database connections, allowing one slow holder to create a convoy that exhausted the lending service pool. Inner advisory-lock failures could also be mistaken for duplicate Inbox jobs, leaving the message processed instead of retried.

        The branch removes the inner advisory-lock layer. Sync locks affected return, command, and transfer rows in canonical order. Async jobs use `FOR UPDATE NOWAIT`; a busy row or expanded component raises `RetryableSync`, rolls back Inbox's processed marker, and lets Sidekiq retry. Repair and backfill callers retain blocking row locks.

        This bounds async connection wait time. Active statement duration and blocking operational callers remain outside this change.
    "#
}

function CommitPrInspectionOutput() -> string {
    " app/jobs/lending/sync_job.rb                 |  2 +-\n app/services/inbox/process_message.rb              |  4 ++--\n app/services/lending/sync_group.rb       | 18 ++++++++++++++++--\n spec/services/inbox/process_message_spec.rb        |  7 +++++--\n spec/services/lending/sync_group_spec.rb | 12 ++++++++++--\n 5 files changed, 34 insertions(+), 9 deletions(-)\n\n"
        + CommitSyncDiff()
}

function CommitPrScenarios() -> Scenario[] {
    [
        Scenario {
            id: "commit-pr-result-first-description",
            title: "Drafts a reviewer-oriented PR with behavior before mechanics",
            skillPath: "skills/commit/commit-pr/SKILL.md",
            skillReferences: ["skills/ship/ship/references/review-gate.md"],
            turns: [
                "Draft the pull request for the current branch, but do not push, create, or update it. Read work-item.md, review-evidence.md, and the repository instructions, inspect the branch against main, and run the expected repository checks. Return the base branch, full title and body, review evidence, and validation status for my approval.",
            ],
            files: {
                "work-item.md": CommitPrWorkItem(),
                "review-evidence.md": "# Review evidence\n\nIndependent review covered commit a1b2c3d4 against main with no findings. The reviewer traced canonical row ordering, NOWAIT contention, Inbox rollback, Sidekiq retry, and blocking repair behavior. No code changed after review.",
                "AGENTS.md": "# Repository checks\n\nBefore opening a pull request, run `bundle exec rspec`, `bundle exec rubocop`, and `git diff --check main...HEAD`. Report their exact results in the PR draft.",
            },
            searchResponses: [],
            fetchResponses: {},
            bashResponses: [
                BashResponse {
                    includes: "git diff --stat main...HEAD && git diff main...HEAD",
                    output: CommitPrInspectionOutput(),
                },
                BashResponse {
                    includes: "git diff --check main...HEAD && bundle exec rspec",
                    output: "936 examples, 0 failures, 3 pending",
                },
                BashResponse {
                    includes: "bundle exec rspec && bundle exec rubocop",
                    output: "936 examples, 0 failures, 3 pending\n184 files inspected, no offenses detected",
                },
                BashResponse {
                    includes: "git status",
                    output: "## fix/sc-10101/bound-sync-lock-waits...origin/fix/sc-10101/bound-sync-lock-waits",
                },
                BashResponse {
                    includes: "git log",
                    output: "a1b2c3d4 fix(shelving): prevent sync waits from exhausting connections",
                },
                BashResponse {
                    includes: "git diff main...HEAD --stat",
                    output: " app/jobs/lending/sync_job.rb                 |  2 +-\n app/services/inbox/process_message.rb              |  4 ++--\n app/services/lending/sync_group.rb       | 18 ++++++++++++++++--\n spec/services/inbox/process_message_spec.rb        |  7 +++++--\n spec/services/lending/sync_group_spec.rb | 12 ++++++++++--\n 5 files changed, 34 insertions(+), 9 deletions(-)",
                },
                BashResponse { includes: "git diff --check", output: "" },
                BashResponse { includes: "git diff", output: CommitSyncDiff() },
                BashResponse {
                    includes: "gh pr view",
                    output: "no pull requests found for branch fix/sc-10101/bound-sync-lock-waits",
                },
                BashResponse {
                    includes: "bundle exec rspec",
                    output: "936 examples, 0 failures, 3 pending",
                },
                BashResponse {
                    includes: "bundle exec rubocop",
                    output: "184 files inspected, no offenses detected",
                },
                BashResponse {
                    includes: "git branch",
                    output: "* fix/sc-10101/bound-sync-lock-waits\n  main",
                },
                BashResponse {
                    includes: "git remote",
                    output: "origin\tgit@github.com:acme/lending-service.git (fetch)\norigin\tgit@github.com:acme/lending-service.git (push)",
                },
            ],
            maxToolCalls: 16,
            hardAssertions: [
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "read",
                    argumentIncludes: "work-item.md",
                    min: 1,
                    description: "The agent reads the work item that explains the reviewer-facing problem and result.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "read",
                    argumentIncludes: "review-evidence.md",
                    min: 1,
                    description: "The agent reads the supplied independent review evidence.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "read",
                    argumentIncludes: "AGENTS.md",
                    min: 1,
                    description: "The agent reads the repository's expected validation commands.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "bash",
                    argumentIncludes: "git log",
                    min: 1,
                    description: "The agent inspects every commit on the branch.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "bash",
                    commandSegmentIncludes: "git diff main...HEAD",
                    commandSegmentExcludes: "--stat",
                    min: 1,
                    description: "The agent inspects the full branch diff against its base instead of relying on the stat.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "bash",
                    argumentIncludes: "bundle exec rspec",
                    min: 1,
                    description: "The agent runs the repository's RSpec regression check.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "bash",
                    argumentIncludes: "bundle exec rubocop",
                    min: 1,
                    description: "The agent runs the repository's RuboCop check.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "bash",
                    argumentIncludes: "git diff --check",
                    min: 1,
                    description: "The agent runs the repository's whitespace check.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "bash",
                    argumentIncludes: "gh pr create",
                    max: 0,
                    description: "The agent does not create the PR before approval.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "bash",
                    argumentIncludes: "git push",
                    max: 0,
                    description: "The agent does not push while only drafting the PR.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "public_action",
                    max: 0,
                    description: "The agent does not perform a public action before approval.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "edit",
                    max: 0,
                    description: "The agent does not edit project files while drafting the PR.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "write",
                    max: 0,
                    description: "The agent does not create project files while drafting the PR.",
                },
            ],
            semanticCriteria: [
                SemanticCriterion {
                    id: "pr-title-names-result",
                    description: "The PR title uses an unambiguous action verb and names the resulting operational behavior—preventing sync waits or connection exhaustion—rather than merely naming row locks, NOWAIT, or an internal refactor. It does not rely on a word that can read as an adjective or result state instead of an action.",
                },
                SemanticCriterion {
                    id: "pr-description-leads-with-behavior",
                    description: "The Description leads with the concrete new sync behavior or operational result, then explains the previous nested-lock failure and why it mattered. It does not lead with implementation mechanics or require the exact phrase 'With this change'.",
                },
                SemanticCriterion {
                    id: "pr-body-explains-review-critical-mechanics",
                    description: "After establishing the behavior, the body explains canonical return, command, and transfer row locking; async NOWAIT contention; retryable error propagation through Inbox rollback and Sidekiq retry; blocking repair/backfill behavior; and the deferred active-statement or operational-wait limits. Description and Details may divide this content, but together they must present a complete causal explanation without repeating the same narrative.",
                },
                SemanticCriterion {
                    id: "pr-testing-and-approval-are-accurate",
                    description: "Testing reports the supplied RSpec and RuboCop results without invention, and the response names main as the base and the no-findings review evidence. After presenting the complete draft and status, the response ends with an explicit request for approval or edits instead of creating or pushing the PR; an imperative request such as 'Please confirm' is acceptable.",
                },
            ],
        },
    ]
}
