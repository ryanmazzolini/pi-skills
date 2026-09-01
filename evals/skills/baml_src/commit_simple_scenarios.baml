function CommitReconciliationWorkItem() -> string {
    #"
        # SC-65850 — Bound reconciliation lock waits

        Receipt and transfer reconciliation runs inside Coil's per-message process lock. It previously acquired a second advisory lock for every connected reconciliation component. When components overlapped, workers waited for that inner lock inside open transactions while retaining database connections. A convoy behind one slow holder could exhaust the LDS connection pool. Some inner lock failures were also treated as duplicate Coil jobs, so the message was marked processed instead of retried.

        The staged change removes the inner advisory-lock layer. Reconciliation now locks the affected receipt, command, and transfer rows in canonical order. Async jobs request those rows with `FOR UPDATE NOWAIT`. A busy row or a connected component that expands after discovery raises `RetryableReconciliation`; Coil rolls back its processed marker and Sidekiq retries. Repair and backfill callers retain blocking row locks.

        This bounds how long an async contender retains a connection while waiting. It does not bound active statement duration or blocking operational callers.
    "#
}

function CommitReconciliationDiff() -> string {
    #"
        diff --git a/app/jobs/putaway/reconcile_job.rb b/app/jobs/putaway/reconcile_job.rb
        index 2499148..f14b4f1 100644
        --- a/app/jobs/putaway/reconcile_job.rb
        +++ b/app/jobs/putaway/reconcile_job.rb
        @@ -3,7 +3,7 @@ class ReconcileJob

           def perform(message_id)
             Coil::ProcessMessage.call(message_id) do |message|
        -      ReconcileComponent.call(message)
        +      ReconcileComponent.call(message, blocking: false)
             end
           end
         end
        diff --git a/app/services/coil/process_message.rb b/app/services/coil/process_message.rb
        index bf097ae..76057e7 100644
        --- a/app/services/coil/process_message.rb
        +++ b/app/services/coil/process_message.rb
        @@ -4,7 +4,7 @@ class Coil::ProcessMessage
               mark_processed!
               yield message
             end
        -  rescue AdvisoryLock::LockNotAcquired
        -    mark_duplicate!
        +  rescue RetryableReconciliation
        +    raise
           end
         end
        diff --git a/app/services/putaway/reconcile_component.rb b/app/services/putaway/reconcile_component.rb
        index 9abb554..949b518 100644
        --- a/app/services/putaway/reconcile_component.rb
        +++ b/app/services/putaway/reconcile_component.rb
        @@ -1,5 +1,19 @@
         class ReconcileComponent
        -  def call
        -    AdvisoryLock.with_lock(component_lock_key) { reconcile! }
        +  def call(blocking:)
        +    lock_connected_rows!(wait: blocking)
        +    raise RetryableReconciliation if connected_component_expanded?
        +
        +    reconcile!
        +  end
        +
        +  private
        +
        +  def lock_connected_rows!(wait:)
        +    lock_clause = wait ? "FOR UPDATE" : "FOR UPDATE NOWAIT"
        +    receipts.order(:id).lock(lock_clause).load
        +    commands.order(:id).lock(lock_clause).load
        +    transfers.order(:id).lock(lock_clause).load
        +  rescue ActiveRecord::LockWaitTimeout
        +    raise RetryableReconciliation
           end
         end
        diff --git a/spec/services/coil/process_message_spec.rb b/spec/services/coil/process_message_spec.rb
        index 3e08cb0..1d6fdc9 100644
        --- a/spec/services/coil/process_message_spec.rb
        +++ b/spec/services/coil/process_message_spec.rb
        @@ -1,5 +1,8 @@
         RSpec.describe Coil::ProcessMessage do
        -  it "marks a completed message as processed" do
        -    expect { subject.call { true } }.to change(processed_messages, :count).by(1)
        +  it "rolls back the processed marker and exposes the error to Sidekiq" do
        +    expect do
        +      subject.call { raise RetryableReconciliation }
        +    end.to raise_error(RetryableReconciliation)
        +      .and not_change(processed_messages, :count)
           end
         end
        diff --git a/spec/services/putaway/reconcile_component_spec.rb b/spec/services/putaway/reconcile_component_spec.rb
        index eec93f2..959d6d7 100644
        --- a/spec/services/putaway/reconcile_component_spec.rb
        +++ b/spec/services/putaway/reconcile_component_spec.rb
        @@ -1,5 +1,13 @@
         RSpec.describe ReconcileComponent do
        -  it "reconciles a connected component" do
        -    expect(subject.call).to be_successful
        +  it "locks connected rows in canonical order" do
        +    expect(subject.lock_order).to eq(%i[receipt command transfer])
        +  end
        +
        +  it "raises a retryable error instead of waiting for async contention" do
        +    expect { subject.call(blocking: false) }.to raise_error(RetryableReconciliation)
        +  end
        +
        +  it "keeps repair reconciliation blocking" do
        +    expect(subject.call(blocking: true)).to be_successful
           end
         end
    "#
}

function CommitSimpleInspectionOutput() -> string {
    "## fix/sc-65850/bound-reconciliation-lock-waits\nM  app/jobs/putaway/reconcile_job.rb\nM  app/services/coil/process_message.rb\nM  app/services/putaway/reconcile_component.rb\nM  spec/services/coil/process_message_spec.rb\nM  spec/services/putaway/reconcile_component_spec.rb\n\n"
        + CommitReconciliationDiff()
}

function CommitSimpleScenarios() -> Scenario[] {
    [
        Scenario {
            id: "commit-simple-result-first-context",
            title: "Drafts a result-first commit body with enough causal context",
            skillPath: "skills/commit/commit-simple/SKILL.md",
            skillReferences: [],
            turns: [
                "Draft the commit message for the current staged change, but do not commit or push it. Read work-item.md and inspect the repository state, staged diff, and recent commit style. Return the proposed Subject and Body for my approval.",
            ],
            files: { "work-item.md": CommitReconciliationWorkItem() },
            searchResponses: [],
            fetchResponses: {},
            bashResponses: [
                BashResponse {
                    includes: "git status --short --branch && git diff",
                    output: CommitSimpleInspectionOutput(),
                },
                BashResponse {
                    includes: "git status",
                    output: "## fix/sc-65850/bound-reconciliation-lock-waits\nM  app/jobs/putaway/reconcile_job.rb\nM  app/services/coil/process_message.rb\nM  app/services/putaway/reconcile_component.rb\nM  spec/services/coil/process_message_spec.rb\nM  spec/services/putaway/reconcile_component_spec.rb",
                },
                BashResponse { includes: "git diff", output: CommitReconciliationDiff() },
                BashResponse {
                    includes: "git log",
                    output: "91f2e10 fix(putaway): preserve receipt reconciliation retries\n4a8d731 fix(coil): roll back processed markers on handler errors\n17c2b04 refactor(putaway): centralize connected component discovery",
                },
                BashResponse {
                    includes: "git branch",
                    output: "* fix/sc-65850/bound-reconciliation-lock-waits\n  main",
                },
                BashResponse { includes: "git rev-parse", output: "main" },
            ],
            maxToolCalls: 12,
            hardAssertions: [
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "read",
                    argumentIncludes: "work-item.md",
                    min: 1,
                    description: "The agent reads the work item that explains the failure mode and resulting behavior.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "bash",
                    argumentIncludes: "git status",
                    min: 1,
                    description: "The agent inspects the current branch and staged state.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "bash",
                    argumentIncludes: "git diff",
                    min: 1,
                    description: "The agent inspects the staged implementation before drafting the message.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "bash",
                    argumentIncludes: "git log",
                    min: 1,
                    description: "The agent inspects recent commit style before drafting the message.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "bash",
                    argumentIncludes: "git commit",
                    max: 0,
                    description: "The agent does not commit before the user approves the proposed message.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "bash",
                    argumentIncludes: "git push",
                    max: 0,
                    description: "The agent does not push while only drafting a commit message.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "edit",
                    max: 0,
                    description: "The agent does not change project files while drafting the message.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "write",
                    max: 0,
                    description: "The agent does not create project files while drafting the message.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "public_action",
                    max: 0,
                    description: "The agent does not perform any public action while drafting the message.",
                },
            ],
            semanticCriteria: [
                SemanticCriterion {
                    id: "commit-subject-names-result",
                    description: "The Conventional Commit subject names the operational result—preventing reconciliation waits or connection exhaustion—rather than merely naming row locks, NOWAIT, or an internal refactor.",
                },
                SemanticCriterion {
                    id: "commit-body-leads-with-change",
                    description: "Within the proposed Body, the first paragraph leads with the resulting reconciliation behavior and coordination change. It does not begin with investigation history, the old failure, or low-level implementation mechanics, and it does not need to use the exact phrase 'With this change'.",
                },
                SemanticCriterion {
                    id: "commit-body-explains-causal-benefit",
                    description: "The Body connects canonical row locks and async NOWAIT contention to the retryable error, Coil processed-marker rollback, and Sidekiq retry, then explains how this avoids workers waiting in open transactions with database connections. It contrasts the prior nested advisory lock and mistaken duplicate handling after establishing the new behavior.",
                },
                SemanticCriterion {
                    id: "commit-body-keeps-material-boundaries",
                    description: "The Body preserves that repair and backfill callers still block and stays proportional to the change without narrating the conversation, prompting, or development process.",
                },
            ],
        },
    ]
}
