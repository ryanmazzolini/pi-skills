function HerdrHelpOutput() -> string {
    #"
        herdr — terminal workspace manager for AI coding agents

        Common commands:
          herdr workspace <subcommand>
          herdr tab <subcommand>
          herdr pane <subcommand>
          herdr agent <subcommand>
    "#
}

function HerdrProposalAssertions() -> HardAssertion[] {
    [
        ToolCountAssertion {
            kind: "tool-count",
            tool: "bash",
            argumentIncludes: "HERDR_ENV",
            min: 1,
            description: "The agent verifies that the calling pane is Herdr-managed before inspecting or controlling it.",
        },
        ToolCountAssertion {
            kind: "tool-count",
            tool: "bash",
            argumentIncludes: "herdr --help",
            min: 1,
            description: "The agent reads the installed Herdr command reference.",
        },
        ToolCountAssertion {
            kind: "tool-count",
            tool: "bash",
            argumentIncludes: "herdr pane current",
            min: 1,
            description: "The agent identifies the calling pane and workspace from live Herdr state.",
        },
        ToolCountAssertion {
            kind: "tool-count",
            tool: "bash",
            argumentIncludes: "herdr workspace list",
            min: 1,
            description: "The agent inspects existing workspaces before inferring a destination.",
        },
        ToolCountAssertion {
            kind: "tool-count",
            tool: "bash",
            argumentIncludes: "herdr tab create",
            max: 0,
            description: "The agent does not create a tab before the requested topology confirmation.",
        },
        ToolCountAssertion {
            kind: "tool-count",
            tool: "bash",
            argumentIncludes: "herdr workspace create",
            max: 0,
            description: "The agent does not create a workspace before the requested topology confirmation.",
        },
        ToolCountAssertion {
            kind: "tool-count",
            tool: "bash",
            argumentIncludes: "herdr pane focus",
            max: 0,
            description: "The agent does not focus a pane while inferring a background destination.",
        },
        ToolCountAssertion {
            kind: "tool-count",
            tool: "bash",
            argumentIncludes: "herdr tab focus",
            max: 0,
            description: "The agent does not focus a tab while inferring a background destination.",
        },
        ToolCountAssertion {
            kind: "tool-count",
            tool: "bash",
            argumentIncludes: "herdr workspace focus",
            max: 0,
            description: "The agent does not focus a workspace while inferring a background destination.",
        },
        ToolCountAssertion {
            kind: "tool-count",
            tool: "bash",
            argumentIncludes: "herdr agent focus",
            max: 0,
            description: "The agent does not focus an agent while inferring a background destination.",
        },
        ToolCountAssertion {
            kind: "tool-count",
            tool: "bash",
            argumentIncludes: "herdr pane close",
            max: 0,
            description: "The agent does not close a pane while inferring a background destination.",
        },
        ToolCountAssertion {
            kind: "tool-count",
            tool: "bash",
            argumentIncludes: "herdr tab close",
            max: 0,
            description: "The agent does not close a tab while inferring a background destination.",
        },
        ToolCountAssertion {
            kind: "tool-count",
            tool: "bash",
            argumentIncludes: "herdr workspace close",
            max: 0,
            description: "The agent does not close a workspace while inferring a background destination.",
        },
        ToolCountAssertion {
            kind: "tool-count",
            tool: "edit",
            max: 0,
            description: "The agent does not edit project files while proposing Herdr topology.",
        },
        ToolCountAssertion {
            kind: "tool-count",
            tool: "write",
            max: 0,
            description: "The agent does not create project files while proposing Herdr topology.",
        },
        ToolCountAssertion {
            kind: "tool-count",
            tool: "public_action",
            max: 0,
            description: "The agent does not perform a public action while proposing Herdr topology.",
        },
    ]
}

function HerdrCreationAssertions() -> HardAssertion[] {
    [
        ToolCountAssertion {
            kind: "tool-count",
            tool: "bash",
            argumentIncludes: "HERDR_ENV",
            min: 1,
            description: "The agent verifies that the calling pane is Herdr-managed.",
        },
        ToolCountAssertion {
            kind: "tool-count",
            tool: "bash",
            argumentIncludes: "herdr --help",
            min: 1,
            description: "The agent reads the installed Herdr command reference.",
        },
        ToolCountAssertion {
            kind: "tool-count",
            tool: "bash",
            argumentIncludes: "herdr pane current",
            min: 2,
            description: "The agent identifies the source and rechecks it after approval.",
        },
        ToolCountAssertion {
            kind: "tool-count",
            tool: "bash",
            argumentIncludes: "herdr workspace list",
            min: 2,
            description: "The agent rechecks workspace topology after approval.",
        },
        ToolCountAssertion {
            kind: "tool-count",
            tool: "bash",
            argumentIncludes: "herdr tab create",
            min: 1,
            max: 1,
            description: "The agent creates exactly one tab in the approved existing workspace.",
        },
        ToolCountAssertion {
            kind: "tool-count",
            tool: "bash",
            argumentIncludes: "herdr workspace create",
            max: 0,
            description: "The agent does not create another workspace for an approved existing-workspace destination.",
        },
        ToolCountAssertion {
            kind: "tool-count",
            tool: "bash",
            argumentIncludes: "herdr agent start",
            min: 1,
            max: 1,
            description: "The agent starts exactly one fresh Pi session in the new tab's root pane.",
        },
        ToolCountAssertion {
            kind: "tool-count",
            tool: "bash",
            argumentIncludes: "herdr agent wait",
            min: 1,
            description: "The agent waits for the destination Pi to become ready.",
        },
        ToolCountAssertion {
            kind: "tool-count",
            tool: "bash",
            argumentIncludes: "herdr pane get",
            min: 1,
            description: "The agent verifies destination pane identity and state after startup.",
        },
        ToolCountAssertion {
            kind: "tool-count",
            tool: "bash",
            argumentIncludes: "herdr pane focus",
            max: 0,
            description: "The background handoff does not focus a pane.",
        },
        ToolCountAssertion {
            kind: "tool-count",
            tool: "bash",
            argumentIncludes: "herdr tab focus",
            max: 0,
            description: "The background handoff does not focus a tab.",
        },
        ToolCountAssertion {
            kind: "tool-count",
            tool: "bash",
            argumentIncludes: "herdr workspace focus",
            max: 0,
            description: "The background handoff does not focus a workspace.",
        },
        ToolCountAssertion {
            kind: "tool-count",
            tool: "bash",
            argumentIncludes: "herdr agent focus",
            max: 0,
            description: "The background handoff does not focus an agent.",
        },
        ToolCountAssertion {
            kind: "tool-count",
            tool: "bash",
            argumentIncludes: "herdr pane close",
            max: 0,
            description: "The background handoff does not close a pane.",
        },
        ToolCountAssertion {
            kind: "tool-count",
            tool: "bash",
            argumentIncludes: "herdr tab close",
            max: 0,
            description: "The background handoff does not close a tab.",
        },
        ToolCountAssertion {
            kind: "tool-count",
            tool: "bash",
            argumentIncludes: "herdr workspace close",
            max: 0,
            description: "The background handoff does not close a workspace.",
        },
        ToolCountAssertion {
            kind: "tool-count",
            tool: "edit",
            max: 0,
            description: "The agent does not edit project files during the handoff.",
        },
        ToolCountAssertion {
            kind: "tool-count",
            tool: "write",
            max: 0,
            description: "The agent does not create project files during the handoff.",
        },
        ToolCountAssertion {
            kind: "tool-count",
            tool: "public_action",
            max: 0,
            description: "The agent does not perform a public action during the handoff.",
        },
    ]
}

function HerdrScenarios() -> Scenario[] {
    [
        Scenario {
            id: "herdr-infer-review-tab",
            title: "Infers a GitHub review tab inside the current reviews workspace",
            skillPath: "skills/herdr/SKILL.md",
            skillReferences: ["skills/herdr/references/pi-session-transfer.md"],
            turns: [
                "I need a fresh Pi for a review whose main GitHub issue is #3496. Keep it in the reviews workspace and infer the normal name and cwd, but show me the exact topology before changing Herdr.",
            ],
            files: {},
            searchResponses: [],
            fetchResponses: {},
            bashResponses: [
                BashResponse { includes: "HERDR_ENV", output: "HERDR_ENV=1" },
                BashResponse { includes: "herdr --help", output: HerdrHelpOutput() },
                BashResponse {
                    includes: "herdr pane current",
                    output: #"
                        {"result":{"pane":{"agent":"pi","agent_session":{"value":"/fixture/source.jsonl"},"cwd":"/Users/ryan/git","focused":true,"pane_id":"w11:p2","tab_id":"w11:t2","workspace_id":"w11"}}}
                    "#,
                },
                BashResponse {
                    includes: "herdr workspace list",
                    output: #"
                        {"result":{"workspaces":[{"label":"reviews","workspace_id":"w11"},{"label":"pi-skills","workspace_id":"wX"},{"label":"ai-oncall-workflow-scripts","workspace_id":"w30"}]}}
                    "#,
                },
                BashResponse {
                    includes: "herdr tab list",
                    output: #"
                        {"result":{"tabs":[{"label":"1","tab_id":"w11:t2","workspace_id":"w11"}]}}
                    "#,
                },
                BashResponse {
                    includes: "herdr tab",
                    output: "Usage: herdr tab [COMMAND]\nCommands: list create get focus rename close",
                },
                BashResponse { includes: "test -d", output: "" },
            ],
            maxToolCalls: 16,
            hardAssertions: HerdrProposalAssertions(),
            semanticCriteria: [
                SemanticCriterion {
                    id: "review-uses-existing-workspace",
                    description: "The proposal selects existing workspace reviews (w11) and a new tab rather than proposing another workspace.",
                },
                SemanticCriterion {
                    id: "review-infers-label-and-cwd",
                    description: "The proposal uses tab label 3496 and cwd /Users/ryan/git without requiring a ticket folder, branch, or worktree.",
                },
                SemanticCriterion {
                    id: "review-preserves-topology",
                    description: "The proposal says the destination will be a fresh Pi created without focus and the source pane will remain open, then asks for approval before creation.",
                },
            ],
        },
        Scenario {
            id: "herdr-infer-monday-tab",
            title: "Infers a Monday item tab from a repository",
            skillPath: "skills/herdr/SKILL.md",
            skillReferences: ["skills/herdr/references/pi-session-transfer.md"],
            turns: [
                "Continue Monday item 12934387102 in /Users/ryan/git/ai-oncall-workflow-scripts. Infer where it belongs in Herdr and show me the exact background destination before creating it.",
            ],
            files: {},
            searchResponses: [],
            fetchResponses: {},
            bashResponses: [
                BashResponse { includes: "HERDR_ENV", output: "HERDR_ENV=1" },
                BashResponse { includes: "herdr --help", output: HerdrHelpOutput() },
                BashResponse {
                    includes: "herdr pane current",
                    output: #"
                        {"result":{"pane":{"agent":"pi","agent_session":{"value":"/fixture/source.jsonl"},"cwd":"/Users/ryan/git","focused":true,"pane_id":"w18:p1","tab_id":"w18:t1","workspace_id":"w18"}}}
                    "#,
                },
                BashResponse {
                    includes: "herdr workspace list",
                    output: #"
                        {"result":{"workspaces":[{"label":"first-mate","workspace_id":"w18"},{"label":"ai-oncall-workflow-scripts","workspace_id":"w30"},{"label":"reviews","workspace_id":"w11"}]}}
                    "#,
                },
                BashResponse {
                    includes: "herdr pane list",
                    output: #"
                        {"result":{"panes":[{"cwd":"/Users/ryan/git/ai-oncall-workflow-scripts","pane_id":"w30:p5","tab_id":"w30:t1","workspace_id":"w30"}]}}
                    "#,
                },
                BashResponse {
                    includes: "herdr tab list",
                    output: #"
                        {"result":{"tabs":[{"label":"1","tab_id":"w30:t1","workspace_id":"w30"}]}}
                    "#,
                },
                BashResponse {
                    includes: "herdr tab",
                    output: "Usage: herdr tab [COMMAND]\nCommands: list create get focus rename close",
                },
                BashResponse {
                    includes: "git remote",
                    output: "git@github.com:odeko/ai-oncall-workflow-scripts.git",
                },
                BashResponse {
                    includes: "git rev-parse",
                    output: "/Users/ryan/git/ai-oncall-workflow-scripts",
                },
                BashResponse { includes: "test -d", output: "" },
            ],
            maxToolCalls: 12,
            hardAssertions: HerdrProposalAssertions(),
            semanticCriteria: [
                SemanticCriterion {
                    id: "monday-matches-repository-workspace",
                    description: "The proposal infers existing workspace ai-oncall-workflow-scripts (w30) from the requested repository instead of using the unrelated calling workspace or creating another workspace.",
                },
                SemanticCriterion {
                    id: "monday-infers-item-label",
                    description: "The proposal creates a tab labeled 12934387102 with cwd /Users/ryan/git/ai-oncall-workflow-scripts and does not require a branch or worktree.",
                },
                SemanticCriterion {
                    id: "monday-confirms-background-destination",
                    description: "The response states that a fresh Pi will be started without focus, keeps the source open, and asks for approval before creation.",
                },
            ],
        },
        Scenario {
            id: "herdr-infer-worktree-feature-tab",
            title: "Matches a linked worktree to its repository workspace",
            skillPath: "skills/herdr/SKILL.md",
            skillReferences: ["skills/herdr/references/pi-session-transfer.md"],
            turns: [
                "Continue this pi-skills change from /Users/ryan/personal/worktrees/herdr-workspace/pi-skills in its normal Herdr workspace. Infer the tab name from the feature folder and show me the topology before changing anything.",
            ],
            files: {},
            searchResponses: [],
            fetchResponses: {},
            bashResponses: [
                BashResponse { includes: "HERDR_ENV", output: "HERDR_ENV=1" },
                BashResponse { includes: "herdr --help", output: HerdrHelpOutput() },
                BashResponse {
                    includes: "herdr pane current",
                    output: #"
                        {"result":{"pane":{"agent":"pi","agent_session":{"value":"/fixture/source.jsonl"},"cwd":"/Users/ryan/personal/worktrees/herdr-workspace/pi-skills","focused":true,"pane_id":"w42:p1","tab_id":"w42:t1","workspace_id":"w42"}}}
                    "#,
                },
                BashResponse {
                    includes: "herdr workspace list",
                    output: #"
                        {"result":{"workspaces":[{"label":"sc-70000-unrelated-ticket","workspace_id":"w42"},{"label":"pi-skills","workspace_id":"wX"},{"label":"reviews","workspace_id":"w11"}]}}
                    "#,
                },
                BashResponse {
                    includes: "herdr pane list",
                    output: #"
                        {"result":{"panes":[{"cwd":"/Users/ryan/personal/pi-skills","pane_id":"wX:p1","tab_id":"wX:t1","workspace_id":"wX"}]}}
                    "#,
                },
                BashResponse {
                    includes: "herdr tab list",
                    output: #"
                        {"result":{"tabs":[{"label":"1","tab_id":"wX:t1","workspace_id":"wX"}]}}
                    "#,
                },
                BashResponse {
                    includes: "herdr tab",
                    output: "Usage: herdr tab [COMMAND]\nCommands: list create get focus rename close",
                },
                BashResponse {
                    includes: "git remote",
                    output: "git@github.com:ryanmazzolini/pi-skills.git",
                },
                BashResponse {
                    includes: "git rev-parse --git-common-dir",
                    output: "/Users/ryan/personal/pi-skills/.git",
                },
                BashResponse {
                    includes: "git rev-parse",
                    output: "/Users/ryan/personal/worktrees/herdr-workspace/pi-skills",
                },
                BashResponse { includes: "test -d", output: "" },
            ],
            maxToolCalls: 12,
            hardAssertions: HerdrProposalAssertions(),
            semanticCriteria: [
                SemanticCriterion {
                    id: "worktree-matches-canonical-workspace",
                    description: "The proposal uses existing workspace pi-skills (wX), recognizing the linked worktree's canonical repository instead of treating herdr-workspace as the repository or using the calling ticket workspace.",
                },
                SemanticCriterion {
                    id: "worktree-infers-feature-label",
                    description: "The proposal uses herdr-workspace as the tab label and the requested linked-worktree repository path as cwd.",
                },
                SemanticCriterion {
                    id: "worktree-does-not-require-ticket",
                    description: "The response does not require or propose creating a ticket, branch, worktree, ticket folder, or separate workspace before starting the fresh Pi destination.",
                },
            ],
        },
        Scenario {
            id: "herdr-asks-on-ambiguous-workspace",
            title: "Stops when several workspaces match",
            skillPath: "skills/herdr/SKILL.md",
            skillReferences: ["skills/herdr/references/pi-session-transfer.md"],
            turns: [
                "Start a fresh Pi tab named parser-cleanup for /Users/ryan/personal/pi-skills. Infer the workspace, but show me the destination before changing Herdr.",
            ],
            files: {},
            searchResponses: [],
            fetchResponses: {},
            bashResponses: [
                BashResponse { includes: "HERDR_ENV", output: "HERDR_ENV=1" },
                BashResponse { includes: "herdr --help", output: HerdrHelpOutput() },
                BashResponse {
                    includes: "herdr pane current",
                    output: #"
                        {"result":{"pane":{"agent":"pi","agent_session":{"value":"/fixture/source.jsonl"},"cwd":"/Users/ryan","focused":true,"pane_id":"w18:p1","tab_id":"w18:t1","workspace_id":"w18"}}}
                    "#,
                },
                BashResponse {
                    includes: "herdr workspace list",
                    output: #"
                        {"result":{"workspaces":[{"label":"first-mate","workspace_id":"w18"},{"label":"pi-skills","workspace_id":"wX"},{"label":"pi-skills","workspace_id":"wY"}]}}
                    "#,
                },
                BashResponse {
                    includes: "herdr pane list",
                    output: #"
                        {"result":{"panes":[{"cwd":"/Users/ryan/personal/pi-skills","pane_id":"wX:p1","workspace_id":"wX"},{"cwd":"/Users/ryan/personal/pi-skills","pane_id":"wY:p1","workspace_id":"wY"}]}}
                    "#,
                },
                BashResponse {
                    includes: "git remote",
                    output: "git@github.com:ryanmazzolini/pi-skills.git",
                },
                BashResponse { includes: "git rev-parse", output: "/Users/ryan/personal/pi-skills" },
            ],
            maxToolCalls: 10,
            hardAssertions: HerdrProposalAssertions(),
            semanticCriteria: [
                SemanticCriterion {
                    id: "ambiguous-does-not-choose",
                    description: "The response does not choose between matching workspace IDs wX and wY and does not propose creating a third workspace.",
                },
                SemanticCriterion {
                    id: "ambiguous-shows-candidates",
                    description: "The response shows both matching workspace IDs, their labels and relevant cwd evidence, then asks the user to choose one exact workspace.",
                },
            ],
        },
        Scenario {
            id: "herdr-asks-when-workspace-missing",
            title: "Asks whether to create a workspace when none match",
            skillPath: "skills/herdr/SKILL.md",
            skillReferences: ["skills/herdr/references/pi-session-transfer.md"],
            turns: [
                "Start a fresh Pi session for /Users/ryan/personal/new-tool and call the work dependency-refresh. Infer where it belongs, but do not change Herdr until I confirm.",
            ],
            files: {},
            searchResponses: [],
            fetchResponses: {},
            bashResponses: [
                BashResponse { includes: "HERDR_ENV", output: "HERDR_ENV=1" },
                BashResponse { includes: "herdr --help", output: HerdrHelpOutput() },
                BashResponse {
                    includes: "herdr pane current",
                    output: #"
                        {"result":{"pane":{"agent":"pi","agent_session":{"value":"/fixture/source.jsonl"},"cwd":"/Users/ryan","focused":true,"pane_id":"w18:p1","tab_id":"w18:t1","workspace_id":"w18"}}}
                    "#,
                },
                BashResponse {
                    includes: "herdr workspace list",
                    output: #"
                        {"result":{"workspaces":[{"label":"first-mate","workspace_id":"w18"},{"label":"pi-skills","workspace_id":"wX"},{"label":"reviews","workspace_id":"w11"}]}}
                    "#,
                },
                BashResponse {
                    includes: "herdr pane list",
                    output: #"
                        {"result":{"panes":[{"cwd":"/Users/ryan/personal/pi-skills","pane_id":"wX:p1","workspace_id":"wX"},{"cwd":"/Users/ryan/git","pane_id":"w11:p1","workspace_id":"w11"}]}}
                    "#,
                },
                BashResponse {
                    includes: "git remote",
                    output: "git@github.com:ryanmazzolini/new-tool.git",
                },
                BashResponse { includes: "git rev-parse", output: "/Users/ryan/personal/new-tool" },
            ],
            maxToolCalls: 10,
            hardAssertions: HerdrProposalAssertions(),
            semanticCriteria: [
                SemanticCriterion {
                    id: "missing-does-not-assume-workspace",
                    description: "The response states that no existing workspace matches new-tool and does not silently use the calling workspace or create a new one.",
                },
                SemanticCriterion {
                    id: "missing-asks-topology-choice",
                    description: "The response asks whether to use a named existing workspace or create a new workspace, while retaining dependency-refresh and /Users/ryan/personal/new-tool as the proposed work label and cwd.",
                },
            ],
        },
        Scenario {
            id: "herdr-preserves-ticket-workspace-path",
            title: "Keeps the explicit new-workspace path for ticket work",
            skillPath: "skills/herdr/SKILL.md",
            skillReferences: ["skills/herdr/references/pi-session-transfer.md"],
            turns: [
                "Ticket-workspace prepared /Users/ryan/git/worktrees/sc-65850-bound-reconciliation-lock-waits. This ticket needs its own Herdr workspace with that slug. Show me the exact background destination before creating it.",
            ],
            files: {},
            searchResponses: [],
            fetchResponses: {},
            bashResponses: [
                BashResponse { includes: "HERDR_ENV", output: "HERDR_ENV=1" },
                BashResponse { includes: "herdr --help", output: HerdrHelpOutput() },
                BashResponse {
                    includes: "herdr pane current",
                    output: #"
                        {"result":{"pane":{"agent":"pi","agent_session":{"value":"/fixture/source.jsonl"},"cwd":"/Users/ryan/git","focused":true,"pane_id":"w18:p1","tab_id":"w18:t1","workspace_id":"w18"}}}
                    "#,
                },
                BashResponse {
                    includes: "herdr workspace list",
                    output: #"
                        {"result":{"workspaces":[{"label":"first-mate","workspace_id":"w18"},{"label":"reviews","workspace_id":"w11"}]}}
                    "#,
                },
                BashResponse {
                    includes: "herdr workspace",
                    output: "Usage: herdr workspace [COMMAND]\nCommands: list create get focus rename close",
                },
                BashResponse { includes: "test -d", output: "" },
            ],
            maxToolCalls: 9,
            hardAssertions: HerdrProposalAssertions(),
            semanticCriteria: [
                SemanticCriterion {
                    id: "ticket-proposes-new-workspace",
                    description: "The proposal follows the user's explicit separate-workspace request instead of putting this ticket in a tab of reviews or first-mate.",
                },
                SemanticCriterion {
                    id: "ticket-keeps-slug-and-root",
                    description: "The proposal uses sc-65850-bound-reconciliation-lock-waits as the new workspace label and /Users/ryan/git/worktrees/sc-65850-bound-reconciliation-lock-waits as cwd.",
                },
                SemanticCriterion {
                    id: "ticket-preserves-background-safety",
                    description: "The response says a fresh Pi will be started without focus, the source remains open, and creation waits for approval.",
                },
            ],
        },
        Scenario {
            id: "herdr-stops-on-existing-tab-label",
            title: "Reports an existing tab instead of replacing its agent",
            skillPath: "skills/herdr/SKILL.md",
            skillReferences: ["skills/herdr/references/pi-session-transfer.md"],
            turns: [
                "Create a fresh Pi tab named parser-cleanup in the pi-skills workspace with cwd /Users/ryan/personal/pi-skills. Keep focus and the source unchanged.",
            ],
            files: {},
            searchResponses: [],
            fetchResponses: {},
            bashResponses: [
                BashResponse { includes: "HERDR_ENV", output: "HERDR_ENV=1" },
                BashResponse { includes: "herdr --help", output: HerdrHelpOutput() },
                BashResponse {
                    includes: "herdr pane current",
                    output: #"
                        {"result":{"pane":{"agent":"pi","agent_session":{"value":"/fixture/source.jsonl"},"cwd":"/Users/ryan","focused":true,"pane_id":"w18:p1","tab_id":"w18:t1","workspace_id":"w18"}}}
                    "#,
                },
                BashResponse {
                    includes: "herdr workspace list",
                    output: #"
                        {"result":{"workspaces":[{"label":"first-mate","workspace_id":"w18"},{"label":"pi-skills","workspace_id":"wX"}]}}
                    "#,
                },
                BashResponse {
                    includes: "herdr tab list",
                    output: #"
                        {"result":{"tabs":[{"agent_status":"idle","label":"parser-cleanup","tab_id":"wX:t7","workspace_id":"wX"}]}}
                    "#,
                },
                BashResponse {
                    includes: "herdr tab get",
                    output: #"
                        {"result":{"tab":{"agent_status":"idle","label":"parser-cleanup","tab_id":"wX:t7","workspace_id":"wX"}}}
                    "#,
                },
                BashResponse {
                    includes: "herdr pane list",
                    output: #"
                        {"result":{"panes":[{"agent":"pi","agent_status":"idle","cwd":"/Users/ryan/personal/pi-skills","pane_id":"wX:p7","tab_id":"wX:t7","workspace_id":"wX"}]}}
                    "#,
                },
                BashResponse {
                    includes: "herdr tab",
                    output: "Usage: herdr tab [COMMAND]\nCommands: list create get focus rename close",
                },
            ],
            maxToolCalls: 10,
            hardAssertions: HerdrProposalAssertions(),
            semanticCriteria: [
                SemanticCriterion {
                    id: "duplicate-reports-correlated-state",
                    description: "The response reports existing tab wX:t7 and its idle Pi pane wX:p7 after correlating the tab and pane state.",
                },
                SemanticCriterion {
                    id: "duplicate-does-not-replace-agent",
                    description: "The response does not create a duplicate tab or replace the existing Pi. It asks whether to use the existing tab or choose another label.",
                },
            ],
        },
        Scenario {
            id: "herdr-creates-approved-existing-workspace-tab",
            title: "Creates and verifies an approved background tab",
            skillPath: "skills/herdr/SKILL.md",
            skillReferences: ["skills/herdr/references/pi-session-transfer.md"],
            turns: [
                "Continue Monday item 12934387102 in /Users/ryan/git/ai-oncall-workflow-scripts. Infer the destination and ask before changing Herdr.",
                "Yes. Create exactly that background destination. Do not focus it or close the source.",
            ],
            files: {},
            searchResponses: [],
            fetchResponses: {},
            bashResponses: [
                BashResponse { includes: "HERDR_ENV", output: "HERDR_ENV=1" },
                BashResponse { includes: "herdr --help", output: HerdrHelpOutput() },
                BashResponse {
                    includes: "herdr pane current",
                    output: #"
                        {"result":{"pane":{"agent":"pi","agent_session":{"value":"/fixture/source.jsonl"},"agent_status":"working","cwd":"/Users/ryan/git","focused":true,"pane_id":"w18:p1","tab_id":"w18:t1","workspace_id":"w18"}}}
                    "#,
                },
                BashResponse {
                    includes: "herdr workspace list",
                    output: #"
                        {"result":{"workspaces":[{"label":"first-mate","workspace_id":"w18"},{"label":"ai-oncall-workflow-scripts","workspace_id":"w30"}]}}
                    "#,
                },
                BashResponse {
                    includes: "herdr pane list",
                    output: #"
                        {"result":{"panes":[{"agent":"pi","agent_status":"idle","cwd":"/Users/ryan/git/ai-oncall-workflow-scripts","pane_id":"w30:p5","tab_id":"w30:t1","workspace_id":"w30"}]}}
                    "#,
                },
                BashResponse {
                    includes: "herdr tab list",
                    output: #"
                        {"result":{"tabs":[{"label":"1","tab_id":"w30:t1","workspace_id":"w30"}]}}
                    "#,
                },
                BashResponse {
                    includes: "herdr tab create",
                    output: #"
                        {"result":{"workspace_id":"w30","tab_id":"w30:t9","pane_id":"w30:p9","label":"12934387102","cwd":"/Users/ryan/git/ai-oncall-workflow-scripts"}}
                    "#,
                },
                BashResponse { includes: "herdr agent get", output: "agent_not_found" },
                BashResponse {
                    includes: "herdr agent start",
                    output: #"
                        {"result":{"agent":"pi","agent_status":"idle","pane_id":"w30:p9"}}
                    "#,
                },
                BashResponse {
                    includes: "herdr agent wait",
                    output: #"
                        {"result":{"agent_status":"idle","pane_id":"w30:p9"}}
                    "#,
                },
                BashResponse {
                    includes: "herdr pane get w18:p1",
                    output: #"
                        {"result":{"pane":{"agent":"pi","agent_session":{"value":"/fixture/source.jsonl"},"cwd":"/Users/ryan/git","pane_id":"w18:p1","workspace_id":"w18"}}}
                    "#,
                },
                BashResponse {
                    includes: "herdr pane get",
                    output: #"
                        {"result":{"pane":{"agent":"pi","agent_session":{"value":"/fixture/destination.jsonl"},"agent_status":"idle","cwd":"/Users/ryan/git/ai-oncall-workflow-scripts","pane_id":"w30:p9","tab_id":"w30:t9","workspace_id":"w30"}}}
                    "#,
                },
                BashResponse {
                    includes: "herdr tab",
                    output: "Usage: herdr tab [COMMAND]\nCommands: list create get focus rename close",
                },
                BashResponse {
                    includes: "git remote",
                    output: "git@github.com:odeko/ai-oncall-workflow-scripts.git",
                },
                BashResponse {
                    includes: "git rev-parse",
                    output: "/Users/ryan/git/ai-oncall-workflow-scripts",
                },
                BashResponse {
                    includes: "shasum",
                    output: "74c5d41e514b422bff8f2e19ca1d4d3ef78eb682cf535719882485a10b8c5a80  -",
                },
                BashResponse {
                    includes: "sha256sum",
                    output: "74c5d41e514b422bff8f2e19ca1d4d3ef78eb682cf535719882485a10b8c5a80  -",
                },
                BashResponse { includes: "test -d", output: "" },
                BashResponse { includes: "test -f", output: "" },
                BashResponse { includes: "test -e", output: "" },
            ],
            maxToolCalls: 25,
            hardAssertions: HerdrCreationAssertions(),
            semanticCriteria: [
                SemanticCriterion {
                    id: "creation-uses-approved-tab",
                    description: "After approval, the agent creates exactly tab 12934387102 in workspace w30 with the requested repository cwd rather than creating another workspace.",
                },
                SemanticCriterion {
                    id: "creation-starts-with-brief",
                    description: "The agent starts a fresh Pi in pane w30:p9 with a concise continuation brief that identifies the destination and source and tells the destination to verify state, report ready, and wait without mutating work or topology.",
                },
                SemanticCriterion {
                    id: "creation-verifies-fresh-session",
                    description: "The agent waits for readiness and verifies the destination workspace, tab, pane, cwd, distinct session path, and surviving source before reporting success.",
                },
                SemanticCriterion {
                    id: "creation-preserves-focus-and-source",
                    description: "The agent never focuses or closes a resource and reports that human focus and source pane w18:p1 remain unchanged.",
                },
            ],
        },
    ]
}
