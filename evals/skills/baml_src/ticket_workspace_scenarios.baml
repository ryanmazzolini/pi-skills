function TicketWorkspaceFixtures(epic_workspace_exists: bool) -> BashResponse[] {
    [
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
            output: if (epic_workspace_exists) {
                #"
                    {"result":{"workspaces":[{"label":"first-mate","workspace_id":"w18"},{"label":"reviews","workspace_id":"w11"},{"label":"api","workspace_id":"w20"},{"label":"invoice-matching","workspace_id":"w30"}]}}
                "#
            } else {
                #"
                    {"result":{"workspaces":[{"label":"first-mate","workspace_id":"w18"},{"label":"reviews","workspace_id":"w11"},{"label":"api","workspace_id":"w20"}]}}
                "#
            },
        },
        BashResponse {
            includes: "herdr tab list",
            output: #"
                {"result":{"tabs":[{"label":"sc-12500-fix-timeout","tab_id":"w11:t7","workspace_id":"w11"}]}}
            "#,
        },
        BashResponse {
            includes: "herdr tab get",
            output: #"
                {"result":{"tab":{"label":"sc-12500-fix-timeout","tab_id":"w11:t7","workspace_id":"w11"}}}
            "#,
        },
        BashResponse {
            includes: "herdr pane list",
            output: #"
                {"result":{"panes":[{"agent":"pi","agent_session":{"value":"/fixture/existing.jsonl"},"shell_state":"running","cwd":"/Users/ryan/git/worktrees/sc-12500-fix-timeout","pane_id":"w11:p7","tab_id":"w11:t7","workspace_id":"w11"},{"agent":"pi","cwd":"/Users/ryan/git/api","pane_id":"w20:p1","workspace_id":"w20"}]}}
            "#,
        },
        BashResponse {
            includes: "herdr pane get w11:p7",
            output: #"
                {"result":{"pane":{"agent":"pi","agent_session":{"value":"/fixture/existing.jsonl"},"shell_state":"running","cwd":"/Users/ryan/git/worktrees/sc-12500-fix-timeout","pane_id":"w11:p7","tab_id":"w11:t7","workspace_id":"w11"}}}
            "#,
        },
        BashResponse {
            includes: "herdr workspace",
            output: "Usage: herdr workspace [COMMAND]\nCommands: list create get focus rename close",
        },
        BashResponse {
            includes: "herdr tab",
            output: "Usage: herdr tab [COMMAND]\nCommands: list create get focus rename close",
        },
        BashResponse {
            includes: "herdr pane",
            output: "Usage: herdr pane [COMMAND]\nCommands: current list get focus close",
        },
        BashResponse {
            includes: "herdr agent",
            output: "Usage: herdr agent [COMMAND]\nCommands: get start wait read",
        },
        BashResponse { includes: "test -f", output: "" },
        BashResponse { includes: "test -d", output: "" },
    ]
}

function TicketEpicScenario(new_workspace: bool) -> Scenario {
    let fixtures = TicketWorkspaceFixtures(!new_workspace);
    for (let fixture in fixtures) {
        if (!new_workspace && fixture.includes == "herdr tab list") {
            fixture.output = #"{"result":{"tabs":[]}}"#;
        };
    }
    ;
    Scenario {
        id: if (new_workspace) {
            "ticket-workspace-new-epic"
        } else {
            "ticket-workspace-existing-epic"
        },
        title: if (new_workspace) {
            "Proposes an epic workspace with its initial ticket tab"
        } else {
            "Proposes a ticket tab in the existing epic workspace"
        },
        skillPath: "skills/ticket-workspace/ticket-workspace/SKILL.md",
        skillReferences: ["skills/herdr/SKILL.md", "skills/herdr/references/pi-session-transfer.md"],
        turns: [
            "Use ticket-workspace to offer a fresh Pi destination for SC-12345. Its approved folder /Users/ryan/git/worktrees/sc-12345-invoice-match and api/ and web/ worktrees are already prepared. The story belongs to epic EP-42, named invoice-matching. Show me the proposed destination before creating anything; do not repeat ticket lookup or worktree preparation.",
        ],
        files: {},
        searchResponses: [],
        fetchResponses: {},
        bashResponses: fixtures,
        maxToolCalls: 20,
        hardAssertions: HerdrScopeAssertions(),
        semanticCriteria: [
            SemanticCriterion {
                id: "ticket-epic-workspace",
                description: if (new_workspace) {
                    "After inspecting live workspaces and finding no invoice-matching workspace, proposes a new workspace named invoice-matching for epic EP-42, not a workspace named for the ticket or api repository. Does not require a second choice merely to propose this epic default."
                } else {
                    "After inspecting live workspaces, proposes workspace invoice-matching (w30) for epic EP-42, rather than the source, reviews or api workspace. Does not create or propose a duplicate epic workspace."
                },
            },
            SemanticCriterion {
                id: "ticket-epic-tab-and-cwd",
                description: "The concrete fresh-Pi proposal includes New tab: sc-12345-invoice-match and Working directory: /Users/ryan/git/worktrees/sc-12345-invoice-match. For a new workspace this names its initial tab, not an extra tab. The cwd remains the ticket folder containing both worktrees; no filesystem regrouping under the epic is proposed or attempted.",
            },
            SemanticCriterion {
                id: "ticket-epic-confirmation",
                description: "Uses the existing fresh-Pi destination confirmation: identifies Shortcut story SC-12345, shows Workspace or New workspace, New tab and Working directory bullets, states Your current focus and Pi session will remain unchanged., and asks Approve this destination? Does not repeat completed ticket/worktree preparation or create resources before approval.",
            },
        ],
    }
}

function TicketContinuationScenario(choice: string) -> Scenario {
    Scenario {
        id: `ticket-workspace-isolated-${choice}`,
        title: `Respects the isolated-ticket continuation choice: ${choice}`,
        skillPath: "skills/ticket-workspace/ticket-workspace/SKILL.md",
        skillReferences: ["skills/herdr/SKILL.md", "skills/herdr/references/pi-session-transfer.md"],
        turns: [
            "Use ticket-workspace for isolated bug SC-12500, fix-timeout. It has no epic. The approved folder /Users/ryan/git/worktrees/sc-12500-fix-timeout and api/ worktree are already prepared; do not prepare them again. "
                + if (choice == "current") {
                    "Continue in this Pi session using that worktree. Do not change anything yet; confirm where we will work."
                } else if (choice == "existing-pi") {
                    "I want to continue in the existing Pi in workspace reviews, tab sc-12500-fix-timeout, pane w11:p7. Inspect it and explain the next step; do not send work, start another Pi, focus or close anything yet."
                } else {
                    "Where should we continue? I have not chosen a session or terminal destination."
                },
        ],
        files: {},
        searchResponses: [],
        fetchResponses: {},
        bashResponses: TicketWorkspaceFixtures(false),
        maxToolCalls: 20,
        hardAssertions: HerdrScopeAssertions(),
        semanticCriteria: [
            SemanticCriterion {
                id: "ticket-isolated-user-choice",
                description: if (choice == "current") {
                    "Accepts the already explicit choice to stay in the current Pi, using /Users/ryan/git/worktrees/sc-12500-fix-timeout/api. Does not ask the user to select a destination again or require a fresh-session handoff just because this session is rooted outside the ticket folder. Does not change anything or claim the session cwd changed."
                } else if (choice == "existing-pi") {
                    "Inspects the selected reviews tab/pane and recognizes the existing Pi in w11:p7 at the ticket folder. Explains continuing there without replacing or restarting it. Does not treat an existing Pi as an available shell for fresh-session startup, send work to it, or ask the user to choose a different destination merely because Pi is already running."
                } else {
                    "Asks the user where to continue, offering the current Pi session, relevant existing destinations/sessions and creating a workspace/tab. Does not automatically select api, reviews, the calling workspace or any project/activity fallback. Does not force a fresh Pi destination proposal before the user chooses how to continue."
                },
            },
            SemanticCriterion {
                id: "ticket-isolated-no-preparation-or-handoff",
                description: "Does not repeat completed ticket lookup or folder/branch/worktree preparation, regroup the filesystem, create terminal resources or start a Pi. Keeps the response bounded to the user's choice or decision request, without claiming a handoff is ready.",
            },
        ],
    }
}

function TicketWorkspaceScenarios() -> Scenario[] {
    let scenarios = [
        Scenario {
            id: "ticket-workspace-preserves-explicit-herdr-inputs",
            title: "Passes independent workspace, tab, and cwd choices through the ticket-workspace entry point",
            skillPath: "skills/ticket-workspace/ticket-workspace/SKILL.md",
            skillReferences: ["skills/herdr/SKILL.md", "skills/herdr/references/pi-session-transfer.md"],
            turns: [
                "Use ticket-workspace to finish the handoff. SC-12345 belongs to epic EP-42, invoice-matching, but I want this work in reviews. The approved sc-12345-invoice-match folder and its api/ and web/ worktrees are already prepared; do not prepare them again. Offer a fresh Pi in Herdr workspace reviews, tab invoice-audit, cwd /Users/ryan/git/worktrees/sc-12345-invoice-match/api. Show me that destination before creating it.",
            ],
            files: {},
            searchResponses: [],
            fetchResponses: {},
            bashResponses: TicketWorkspaceFixtures(true),
            maxToolCalls: 16,
            hardAssertions: HerdrScopeAssertions(),
            semanticCriteria: [
                SemanticCriterion {
                    id: "ticket-entry-preserves-workspace",
                    description: "The handoff proposes the explicitly requested existing reviews workspace, not the invoice-matching epic workspace, a new ticket workspace or the api repository workspace.",
                },
                SemanticCriterion {
                    id: "ticket-entry-preserves-tab-and-cwd",
                    description: "The handoff proposes exactly tab invoice-audit and cwd /Users/ryan/git/worktrees/sc-12345-invoice-match/api. It does not replace the tab with the ticket slug or replace cwd with the parent ticket folder.",
                },
                SemanticCriterion {
                    id: "ticket-entry-confirms-without-repreparing",
                    description: "The agent offers a fresh Pi using Workspace, New tab, and Working directory bullets, preserves the focus/Pi-session guarantee, and asks approval. It does not repeat ticket lookup or folder, branch, or worktree preparation.",
                },
            ],
        },
        TicketEpicScenario(false),
        TicketEpicScenario(true),
        TicketContinuationScenario("undecided"),
        TicketContinuationScenario("current"),
        TicketContinuationScenario("existing-pi"),
    ];
    for (let scenario in scenarios) {
        for (let criterion in HerdrBehaviorCriteria()) {
            scenario.semanticCriteria.push(criterion);
        }
        ;
    }
    ;
    scenarios
}
