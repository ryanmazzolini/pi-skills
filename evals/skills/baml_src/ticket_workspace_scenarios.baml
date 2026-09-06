function TicketWorkspaceScenarios() -> Scenario[] {
    [
        Scenario {
            id: "ticket-workspace-preserves-explicit-herdr-inputs",
            title: "Passes independent workspace, tab, and cwd choices through the ticket-workspace entry point",
            skillPath: "skills/ticket-workspace/ticket-workspace/SKILL.md",
            skillReferences: ["skills/herdr/SKILL.md", "skills/herdr/references/pi-session-transfer.md"],
            turns: [
                "Use ticket-workspace to finish the handoff. The approved sc-12345-invoice-match folder and its api/ and web/ worktrees are already prepared; do not prepare them again. Offer a fresh Pi in Herdr workspace reviews, tab invoice-audit, cwd /Users/ryan/git/worktrees/sc-12345-invoice-match/api. Show me that destination before creating it.",
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
                        {"result":{"workspaces":[{"label":"first-mate","workspace_id":"w18"},{"label":"reviews","workspace_id":"w11"},{"label":"api","workspace_id":"w20"}]}}
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
                    id: "ticket-entry-preserves-workspace",
                    description: "The handoff proposes the explicitly requested existing reviews workspace, not a new ticket workspace or the api repository workspace.",
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
    ]
}
