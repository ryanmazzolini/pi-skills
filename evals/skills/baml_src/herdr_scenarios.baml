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
            argumentIncludes: "herdr agent start",
            max: 0,
            description: "The agent does not start an agent before the requested topology confirmation.",
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

function HerdrCreationAssertions(new_workspace: bool) -> HardAssertion[] {
    let assertions: HardAssertion[] = [
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
            min: if (new_workspace) {
                0
            } else {
                1
            },
            max: if (new_workspace) {
                0
            } else {
                1
            },
            description: "The agent creates one tab for an existing workspace, or uses the initial tab of a new workspace without creating an extra tab.",
        },
        ToolCountAssertion {
            kind: "tool-count",
            tool: "bash",
            argumentIncludes: "herdr workspace create",
            min: if (new_workspace) {
                1
            } else {
                0
            },
            max: if (new_workspace) {
                1
            } else {
                0
            },
            description: "The agent creates exactly one workspace only for an approved new-workspace destination.",
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
            min: 2,
            description: "The agent re-reads both source and destination pane identity and state after startup.",
        },
        ToolCountAssertion {
            kind: "tool-count",
            tool: "bash",
            argumentIncludes: "test -f /fixture/destination.jsonl && test -f /fixture/source.jsonl",
            min: 1,
            fromTurn: 1,
            description: "The agent issues the required combined check for both reported Pi session files after approval.",
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
    ];
    if (new_workspace) {
        assertions
            .push(
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "bash",
                    argumentIncludes: "herdr tab rename",
                    min: 1,
                    max: 1,
                    description: "The agent assigns the requested label to the new workspace's initial tab.",
                },
            );
        assertions
            .push(
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "bash",
                    argumentIncludes: "herdr tab get",
                    min: 1,
                    fromTurn: 1,
                    description: "The agent verifies the renamed initial tab after approval.",
                },
            );
    };
    assertions
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
                    description: "The proposal leads with exactly “I’ll start a fresh Pi for the review tracked by GitHub issue #3496.”, then uses bullets for the existing `reviews` workspace, the new tab, and the working directory. Each bullet label is plain text and only its value is inline code or a clickable link labeled with inline code; the proposal does not create another workspace or use a table.",
                },
                SemanticCriterion {
                    id: "review-infers-label-and-cwd",
                    description: "The proposal uses tab label gh-3496 and cwd /Users/ryan/git without requiring a ticket folder, branch, worktree, repository name, title, or issue lookup.",
                },
                SemanticCriterion {
                    id: "review-preserves-topology",
                    description: "After exactly three destination bullets, the proposal states “Your current focus and Pi session will remain unchanged.” and asks “Approve this destination?”. It omits other bullets, source details, opaque Herdr IDs, tables, and the word “background”.",
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
                    description: "The proposal selects the existing `ai-oncall-workflow-scripts` workspace from the requested repository without exposing its Herdr ID, using the unrelated calling workspace, or proposing another workspace.",
                },
                SemanticCriterion {
                    id: "monday-infers-item-label",
                    description: "The proposal creates a tab labeled 12934387102 with cwd /Users/ryan/git/ai-oncall-workflow-scripts and does not require a branch or worktree.",
                },
                SemanticCriterion {
                    id: "monday-confirms-background-destination",
                    description: "The proposal leads with a fresh Pi for Monday item 12934387102, uses exactly the Workspace, New tab, and Working directory bullets with each bullet label kept as plain text and only its value formatted as inline code or a clickable link labeled with inline code, then uses the required focus/session sentence and approval question without background wording.",
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
                    description: "The proposal uses the existing `pi-skills` workspace without exposing its Herdr ID, recognizing the linked worktree’s canonical repository instead of treating `herdr-workspace` as the repository or using the calling ticket workspace.",
                },
                SemanticCriterion {
                    id: "worktree-infers-feature-label",
                    description: "The proposal uses herdr-workspace as the tab label and the requested linked-worktree repository path as cwd.",
                },
                SemanticCriterion {
                    id: "worktree-does-not-require-ticket",
                    description: "The response does not require or propose creating a ticket, branch, worktree, ticket folder, or separate workspace before starting the fresh Pi destination.",
                },
                SemanticCriterion {
                    id: "worktree-confirms-destination",
                    description: "The proposal leads with a fresh Pi for the herdr-workspace change, uses exactly the Workspace, New tab, and Working directory bullets with each bullet label kept as plain text and only its value formatted as inline code or a clickable link labeled with inline code, then uses the required focus/session sentence and approval question without background wording, source details, opaque Herdr IDs, or a table.",
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
            id: "herdr-ticket-folder-in-current-activity-workspace",
            title: "Continues a multi-repo ticket folder in the current activity workspace",
            skillPath: "skills/herdr/SKILL.md",
            skillReferences: [
                "skills/herdr/references/pi-session-transfer.md",
                "skills/ticket-workspace/ticket-workspace/SKILL.md",
            ],
            turns: [
                "Ticket-workspace has finished preparing /Users/ryan/git/worktrees/sc-12345-invoice-match with api/ and web/ worktrees. Continue this review here in a fresh Pi tab, with cwd at the ticket folder so it can work across both repos. Infer the destination and show me before changing anything.",
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
                        {"result":{"pane":{"agent":"pi","agent_session":{"value":"/fixture/source.jsonl"},"cwd":"/Users/ryan/git","pane_id":"w11:p2","tab_id":"w11:t2","workspace_id":"w11"}}}
                    "#,
                },
                BashResponse {
                    includes: "herdr workspace list",
                    output: #"
                        {"result":{"workspaces":[{"label":"reviews","workspace_id":"w11"},{"label":"api","workspace_id":"w20"},{"label":"web","workspace_id":"w21"}]}}
                    "#,
                },
                BashResponse {
                    includes: "herdr pane list",
                    output: #"
                        {"result":{"panes":[{"cwd":"/Users/ryan/git","pane_id":"w11:p2","tab_id":"w11:t2","workspace_id":"w11"},{"cwd":"/Users/ryan/git/api","pane_id":"w20:p1","workspace_id":"w20"},{"cwd":"/Users/ryan/git/web","pane_id":"w21:p1","workspace_id":"w21"}]}}
                    "#,
                },
                BashResponse {
                    includes: "herdr tab list",
                    output: #"
                        {"result":{"tabs":[{"label":"gh-3496","tab_id":"w11:t2","workspace_id":"w11"}]}}
                    "#,
                },
                BashResponse {
                    includes: "herdr tab",
                    output: "Usage: herdr tab [COMMAND]\nCommands: list create get focus rename close",
                },
                BashResponse { includes: "test -f", output: "" },
                BashResponse { includes: "test -d", output: "" },
                BashResponse { includes: "ls", output: "api/\nweb/" },
            ],
            maxToolCalls: 16,
            hardAssertions: HerdrProposalAssertions(),
            semanticCriteria: [
                SemanticCriterion {
                    id: "ticket-folder-keeps-current-activity",
                    description: "The proposal infers the calling reviews workspace from 'here', creates a new tab labeled sc-12345-invoice-match there, and does not force a new Herdr workspace or choose the api or web workspace because of the folder contents.",
                },
                SemanticCriterion {
                    id: "ticket-folder-keeps-parent-cwd",
                    description: "The proposal keeps /Users/ryan/git/worktrees/sc-12345-invoice-match as cwd, without replacing it with api/ or web/, requiring it to be a Git repository, or repeating ticket/branch/worktree preparation.",
                },
                SemanticCriterion {
                    id: "ticket-folder-confirms-destination",
                    description: "The proposal identifies fresh Pi work for Shortcut story SC-12345, uses only Workspace, New tab, and Working directory bullets, then the unchanged focus/Pi-session sentence and approval question. It does not present New workspace or imply folder creation approved terminal creation.",
                },
            ],
        },
        Scenario {
            id: "herdr-worktree-in-explicit-activity-workspace",
            title: "Keeps an individual worktree in an activity workspace rather than its repository workspace",
            skillPath: "skills/herdr/SKILL.md",
            skillReferences: [
                "skills/herdr/references/pi-session-transfer.md",
                "skills/ticket-workspace/ticket-workspace/SKILL.md",
            ],
            turns: [
                "The approved ticketless parser-cleanup folder and its pi-skills worktree are ready. Start a fresh Pi in the reviews Herdr workspace with cwd /Users/ryan/personal/worktrees/parser-cleanup/pi-skills. Infer the tab label from the work folder and show me the destination before changing anything.",
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
                        {"result":{"pane":{"agent":"pi","agent_session":{"value":"/fixture/source.jsonl"},"cwd":"/Users/ryan/personal/pi-skills","pane_id":"wX:p1","tab_id":"wX:t1","workspace_id":"wX"}}}
                    "#,
                },
                BashResponse {
                    includes: "herdr workspace list",
                    output: #"
                        {"result":{"workspaces":[{"label":"pi-skills","workspace_id":"wX"},{"label":"reviews","workspace_id":"w11"}]}}
                    "#,
                },
                BashResponse {
                    includes: "herdr pane list",
                    output: #"
                        {"result":{"panes":[{"cwd":"/Users/ryan/personal/pi-skills","pane_id":"wX:p1","tab_id":"wX:t1","workspace_id":"wX"},{"cwd":"/Users/ryan/git","pane_id":"w11:p2","tab_id":"w11:t2","workspace_id":"w11"}]}}
                    "#,
                },
                BashResponse {
                    includes: "herdr tab list",
                    output: #"
                        {"result":{"tabs":[{"label":"gh-3496","tab_id":"w11:t2","workspace_id":"w11"}]}}
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
                    output: "/Users/ryan/personal/worktrees/parser-cleanup/pi-skills",
                },
                BashResponse { includes: "test -f", output: "" },
                BashResponse { includes: "test -d", output: "" },
            ],
            maxToolCalls: 16,
            hardAssertions: HerdrProposalAssertions(),
            semanticCriteria: [
                SemanticCriterion {
                    id: "worktree-explicit-activity-wins",
                    description: "The proposal uses the explicitly requested reviews workspace, not the calling/canonical pi-skills workspace or a new workspace, with tab label parser-cleanup.",
                },
                SemanticCriterion {
                    id: "worktree-keeps-requested-cwd",
                    description: "The proposal keeps /Users/ryan/personal/worktrees/parser-cleanup/pi-skills as cwd rather than its parent ticket folder or the canonical checkout, and does not require a ticket or repeat worktree preparation.",
                },
                SemanticCriterion {
                    id: "worktree-activity-confirms-destination",
                    description: "The proposal identifies fresh Pi work for parser-cleanup, uses only Workspace, New tab, and Working directory bullets, then the unchanged focus/Pi-session sentence and approval question.",
                },
            ],
        },
        Scenario {
            id: "herdr-ticket-folder-without-destination",
            title: "Asks where a multi-repo ticket folder belongs when context does not select a workspace",
            skillPath: "skills/herdr/SKILL.md",
            skillReferences: [
                "skills/herdr/references/pi-session-transfer.md",
                "skills/ticket-workspace/ticket-workspace/SKILL.md",
            ],
            turns: [
                "Ticket-workspace finished preparing /Users/ryan/git/worktrees/sc-12345-invoice-match with api/ and web/ worktrees. Offer the fresh Pi handoff with cwd at that ticket folder. I have not chosen a Herdr workspace; infer one if clear, otherwise ask before changing anything.",
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
                        {"result":{"pane":{"agent":"pi","agent_session":{"value":"/fixture/source.jsonl"},"cwd":"/Users/ryan/git","pane_id":"w18:p1","tab_id":"w18:t1","workspace_id":"w18"}}}
                    "#,
                },
                BashResponse {
                    includes: "herdr workspace list",
                    output: #"
                        {"result":{"workspaces":[{"label":"first-mate","workspace_id":"w18"},{"label":"api","workspace_id":"w20"},{"label":"web","workspace_id":"w21"}]}}
                    "#,
                },
                BashResponse {
                    includes: "herdr pane list",
                    output: #"
                        {"result":{"panes":[{"cwd":"/Users/ryan/git","pane_id":"w18:p1","workspace_id":"w18"},{"cwd":"/Users/ryan/git/api","pane_id":"w20:p1","workspace_id":"w20"},{"cwd":"/Users/ryan/git/web","pane_id":"w21:p1","workspace_id":"w21"}]}}
                    "#,
                },
                BashResponse { includes: "test -f", output: "" },
                BashResponse { includes: "test -d", output: "" },
                BashResponse { includes: "ls", output: "api/\nweb/" },
                BashResponse {
                    includes: "git",
                    output: "fatal: not a git repository (or any of the parent directories): .git",
                },
            ],
            maxToolCalls: 16,
            hardAssertions: HerdrProposalAssertions(),
            semanticCriteria: [
                SemanticCriterion {
                    id: "ticket-folder-asks-workspace-choice",
                    description: "The response asks the user to choose an existing Herdr workspace or a new one. It does not assume a separate workspace is required, choose first-mate because it is the source, or select api/web merely because one is a child repository.",
                },
                SemanticCriterion {
                    id: "ticket-folder-retains-work-identity",
                    description: "The response retains sc-12345-invoice-match as the work label and /Users/ryan/git/worktrees/sc-12345-invoice-match as cwd. It does not require a single-repository directory or repeat ticket/branch/worktree preparation to resolve the terminal destination.",
                },
            ],
        },
        Scenario {
            id: "herdr-preserves-ticket-workspace-path",
            title: "Keeps the explicit new-workspace path for ticket work",
            skillPath: "skills/herdr/SKILL.md",
            skillReferences: [
                "skills/herdr/references/pi-session-transfer.md",
                "skills/ticket-workspace/ticket-workspace/SKILL.md",
            ],
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
                    description: "The proposal leads with exactly “I’ll start a fresh Pi for Shortcut story `SC-65850`.”, uses exactly the New workspace and Working directory bullets with each bullet label kept as plain text and only its value formatted as inline code or a clickable link labeled with inline code, then uses the required focus/session sentence and approval question without background wording.",
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
            id: "herdr-suffixes-colliding-inferred-issue-label",
            title: "Adds a work-description suffix only when an inferred issue tab label is taken",
            skillPath: "skills/herdr/SKILL.md",
            skillReferences: ["skills/herdr/references/pi-session-transfer.md"],
            turns: [
                "Start a fresh Pi for the retry fix review tracked by GitHub issue #72, in the reviews workspace with cwd /Users/ryan/git/api. Infer the tab name and show me the destination before creating it.",
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
                        {"result":{"pane":{"agent":"pi","agent_session":{"value":"/fixture/source.jsonl"},"cwd":"/Users/ryan/git","pane_id":"w11:p2","tab_id":"w11:t2","workspace_id":"w11"}}}
                    "#,
                },
                BashResponse {
                    includes: "herdr workspace list",
                    output: #"
                        {"result":{"workspaces":[{"label":"reviews","workspace_id":"w11"}]}}
                    "#,
                },
                BashResponse {
                    includes: "herdr tab list",
                    output: #"
                        {"result":{"tabs":[{"label":"1","tab_id":"w11:t2","workspace_id":"w11"},{"label":"gh-72","tab_id":"w11:t7","workspace_id":"w11"}]}}
                    "#,
                },
                BashResponse {
                    includes: "herdr tab get",
                    output: #"
                        {"result":{"tab":{"label":"gh-72","tab_id":"w11:t7","workspace_id":"w11"}}}
                    "#,
                },
                BashResponse {
                    includes: "herdr pane list",
                    output: #"
                        {"result":{"panes":[{"agent":"pi","agent_status":"idle","cwd":"/Users/ryan/git/web","pane_id":"w11:p7","tab_id":"w11:t7","workspace_id":"w11"}]}}
                    "#,
                },
                BashResponse {
                    includes: "herdr tab",
                    output: "Usage: herdr tab [COMMAND]\nCommands: list create get focus rename close",
                },
                BashResponse { includes: "test -f", output: "" },
                BashResponse { includes: "test -d", output: "" },
            ],
            maxToolCalls: 16,
            hardAssertions: HerdrProposalAssertions(),
            semanticCriteria: [
                SemanticCriterion {
                    id: "collision-proposes-work-suffix",
                    description: "After reading the reviews workspace's tab list, the agent recognizes gh-72 is taken and gh-72-retry-fix is unused. It proposes new tab gh-72-retry-fix in reviews with cwd /Users/ryan/git/api through the normal destination confirmation and approval question, rather than asking the user to name the tab despite the supplied work description.",
                },
                SemanticCriterion {
                    id: "collision-preserves-existing-tab",
                    description: "The agent leaves existing tab w11:t7 and its agent untouched: no rename, reuse, replacement, creation, focus, or closure. It does not offer the existing gh-72 tab as the destination for this fresh review.",
                },
                SemanticCriterion {
                    id: "collision-needs-no-lookup",
                    description: "The agent derives retry-fix from the user's supplied work description, without asking for a repository or issue title, fetching the issue, or adding a repository namespace.",
                },
            ],
        },
        Scenario {
            id: "herdr-review-without-tracking-issue",
            title: "Offers a PR-only review without inventing or requiring a tracking issue",
            skillPath: "skills/herdr/SKILL.md",
            skillReferences: ["skills/herdr/references/pi-session-transfer.md"],
            turns: [
                "Start a fresh Pi for reviewing acme/api PR #72, tab retry-review, in the reviews Herdr workspace, cwd /Users/ryan/git/api. There is no tracking issue. Show me the destination before creating it.",
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
                        {"result":{"pane":{"agent":"pi","agent_session":{"value":"/fixture/source.jsonl"},"cwd":"/Users/ryan/git","pane_id":"w11:p2","tab_id":"w11:t2","workspace_id":"w11"}}}
                    "#,
                },
                BashResponse {
                    includes: "herdr workspace list",
                    output: #"
                        {"result":{"workspaces":[{"label":"reviews","workspace_id":"w11"},{"label":"api","workspace_id":"w20"}]}}
                    "#,
                },
                BashResponse {
                    includes: "herdr pane list",
                    output: #"
                        {"result":{"panes":[{"cwd":"/Users/ryan/git","pane_id":"w11:p2","tab_id":"w11:t2","workspace_id":"w11"},{"cwd":"/Users/ryan/git/api","pane_id":"w20:p1","workspace_id":"w20"}]}}
                    "#,
                },
                BashResponse {
                    includes: "herdr tab list",
                    output: #"
                        {"result":{"tabs":[{"label":"gh-3496","tab_id":"w11:t2","workspace_id":"w11"}]}}
                    "#,
                },
                BashResponse {
                    includes: "herdr tab",
                    output: "Usage: herdr tab [COMMAND]\nCommands: list create get focus rename close",
                },
                BashResponse { includes: "test -f", output: "" },
                BashResponse { includes: "test -d", output: "" },
            ],
            maxToolCalls: 16,
            hardAssertions: HerdrProposalAssertions(),
            semanticCriteria: [
                SemanticCriterion {
                    id: "pr-review-does-not-require-issue",
                    description: "The opening describes fresh Pi work for reviewing acme/api PR #72. It does not call PR #72 a tracking issue, invent an issue, ask for an issue, or perform an issue lookup.",
                },
                SemanticCriterion {
                    id: "pr-review-keeps-explicit-destination",
                    description: "The proposal uses exactly Workspace reviews, New tab retry-review, and Working directory /Users/ryan/git/api, rather than substituting gh-72, the api workspace, or the source cwd /Users/ryan/git. It keeps the unchanged focus/Pi-session sentence and approval question.",
                },
            ],
        },
        Scenario {
            id: "herdr-creates-new-workspace-with-explicit-tab",
            title: "Creates a new workspace and names its initial tab independently",
            skillPath: "skills/herdr/SKILL.md",
            skillReferences: ["skills/herdr/references/pi-session-transfer.md"],
            turns: [
                "Create a new Herdr workspace incident-response, with a fresh Pi tab cache-timeouts, cwd /Users/ryan/git/api, to investigate cache timeouts. Show me the exact destination before creating it.",
                "Yes, create that workspace with its initial tab named cache-timeouts. Do not focus it or close the source.",
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
                        {"result":{"pane":{"agent":"pi","agent_session":{"value":"/fixture/source.jsonl"},"cwd":"/Users/ryan/git","pane_id":"w18:p1","tab_id":"w18:t1","workspace_id":"w18"}}}
                    "#,
                },
                BashResponse {
                    includes: "herdr workspace list",
                    output: #"
                        {"result":{"workspaces":[{"label":"first-mate","workspace_id":"w18"},{"label":"api","workspace_id":"w20"}]}}
                    "#,
                },
                BashResponse {
                    includes: "herdr workspace create",
                    output: #"
                        {"result":{"workspace_id":"w40","tab_id":"w40:t1","pane_id":"w40:p1","label":"incident-response","cwd":"/Users/ryan/git/api"}}
                    "#,
                },
                BashResponse {
                    includes: "herdr workspace",
                    output: "herdr workspace create [--cwd PATH] [--label TEXT] [--no-focus]",
                },
                BashResponse {
                    includes: "herdr tab rename",
                    output: #"
                        {"result":{"tab_id":"w40:t1","workspace_id":"w40","label":"cache-timeouts"}}
                    "#,
                },
                BashResponse {
                    includes: "herdr tab get",
                    output: #"
                        {"result":{"tab":{"tab_id":"w40:t1","workspace_id":"w40","label":"cache-timeouts"}}}
                    "#,
                },
                BashResponse {
                    includes: "herdr tab",
                    output: "herdr tab rename <tab_id> <label>\nherdr tab get <tab_id>\nherdr tab list [--workspace <workspace_id>]",
                },
                BashResponse {
                    includes: "herdr pane list",
                    output: #"
                        {"result":{"panes":[{"cwd":"/Users/ryan/git/api","pane_id":"w20:p1","workspace_id":"w20"}]}}
                    "#,
                },
                BashResponse { includes: "herdr agent get", output: "agent_not_found" },
                BashResponse {
                    includes: "herdr agent start",
                    output: #"
                        {"result":{"agent":"pi","agent_status":"idle","pane_id":"w40:p1"}}
                    "#,
                },
                BashResponse {
                    includes: "herdr agent wait",
                    output: #"
                        {"result":{"agent_status":"idle","pane_id":"w40:p1"}}
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
                        {"result":{"pane":{"agent":"pi","agent_session":{"value":"/fixture/destination.jsonl"},"agent_status":"idle","cwd":"/Users/ryan/git/api","pane_id":"w40:p1","tab_id":"w40:t1","workspace_id":"w40"}}}
                    "#,
                },
                BashResponse {
                    includes: "shasum",
                    output: "02e4b33655cb22695e64036c80f525f10cea497a4183c4fd38bad20b83a85a2d  -",
                },
                BashResponse {
                    includes: "sha256sum",
                    output: "02e4b33655cb22695e64036c80f525f10cea497a4183c4fd38bad20b83a85a2d  -",
                },
                BashResponse { includes: "test -d", output: "" },
                BashResponse { includes: "test -f", output: "" },
                BashResponse { includes: "test -e", output: "" },
            ],
            maxToolCalls: 36,
            hardAssertions: HerdrCreationAssertions(true),
            semanticCriteria: [
                SemanticCriterion {
                    id: "new-workspace-confirms-independent-tab",
                    description: "Before approval, the proposal identifies fresh Pi work for cache timeouts and shows New workspace incident-response, New tab cache-timeouts, and Working directory /Users/ryan/git/api, with plain-text labels and code-formatted values. It keeps the unchanged focus/Pi-session sentence and approval question. No workspace creation or tab rename occurs before the second user turn.",
                },
                SemanticCriterion {
                    id: "new-workspace-names-initial-tab",
                    description: "After approval, the agent creates incident-response with --no-focus and the requested cwd, then renames the returned initial tab w40:t1 to cache-timeouts and verifies its workspace and label using tab get before starting Pi in w40:p1. It does not create a second tab or use the existing api workspace.",
                },
                SemanticCriterion {
                    id: "new-workspace-preserves-fresh-session-safety",
                    description: "The agent checks and starts the same bounded pane-derived agent name, supplies a continuation brief that prohibits startup mutation and requires waiting for the user, waits for readiness, re-reads destination and source panes after startup, and checks both distinct session files exist before claiming success. No focus or closure occurs.",
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
                    output: "1a515ffed899363d3fe625ec54be028ba7d1f879d8b61e63780b56e3681dc30e  -",
                },
                BashResponse {
                    includes: "sha256sum",
                    output: "1a515ffed899363d3fe625ec54be028ba7d1f879d8b61e63780b56e3681dc30e  -",
                },
                BashResponse { includes: "test -d", output: "" },
                BashResponse { includes: "test -f", output: "" },
                BashResponse { includes: "test -e", output: "" },
            ],
            maxToolCalls: 32,
            hardAssertions: HerdrCreationAssertions(false),
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
                    id: "creation-reuses-agent-name",
                    description: "The agent derives one name as `pi_` plus exactly 28 lowercase hexadecimal characters and uses that identical name for both `herdr agent get` and `herdr agent start`.",
                },
                SemanticCriterion {
                    id: "creation-verifies-fresh-session",
                    description: "After waiting for readiness, the agent re-reads both the destination and source panes, then verifies the approved workspace, tab, cwd, distinct session paths, and surviving source before reporting success.",
                },
                SemanticCriterion {
                    id: "creation-preserves-focus-and-source",
                    description: "The agent never focuses or closes a resource and reports that human focus and source pane w18:p1 remain unchanged.",
                },
            ],
        },
    ]
}
