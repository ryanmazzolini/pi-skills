class HerdrWaitState {
    pane_id: string,
    agent_status: string,
}

class HerdrWaitResponse {
    result: HerdrWaitState,
}

class HerdrListedTab {
    workspace_id: string,
}

class HerdrTabInventory {
    tabs: HerdrListedTab[],
}

class HerdrTabListResponse {
    result: HerdrTabInventory,
}

// Match direct CLI calls, not commands mentioned in prose or shell wrappers.
// Pane IDs may be quoted; each wait/read needs its own recorded tool result.
function HerdrCommandWords(command: string) -> string[] {
    let words: string[] = [];
    for (let word in command.replace("\n", " ").replace("\t", " ").split(" ")) {
        if (word.length() > 0) {
            if (
                word.length() >= 2
                    && (
                        (word.starts_with("'") && word.ends_with("'"))
                            || (word.starts_with("\"") && word.ends_with("\""))
                    )
            ) {
                words.push(word.substring(1, word.length() - 1));
            } else {
                words.push(word);
            };
        };
    }
    ;
    words
}

function HerdrCommandIs(words: string[], group: string, action: string) -> bool {
    words.length() >= 3 && words[0] == "herdr" && words[1] == group && words[2] == action
}

function HerdrStartsPane(words: string[], pane_id: string) -> bool {
    if (words.length() < 6 || !HerdrCommandIs(words, "agent", "start")) {
        return false;
    };
    let previous = "";
    for (let word in words) {
        if (word == "--") {
            return false;
        };
        if (previous == "--pane" && word == pane_id) {
            return true;
        };
        previous = word;
    }
    ;
    false
}

function HerdrWaitSucceeded(result: string, pane_id: string) -> bool {
    let response: HerdrWaitResponse? = baml.yaml.deserialize<HerdrWaitResponse>(result) catch_all (_) {
        _ => null,
    };
    match (response) {
        let value: HerdrWaitResponse => {
            value.result.pane_id == pane_id
                && (value.result.agent_status == "idle" || value.result.agent_status == "done")
        },
        null => false,
    }
}

function HerdrTabListSucceeded(result: string, workspace_id: string) -> bool {
    let response: HerdrTabListResponse? = baml.yaml.deserialize<HerdrTabListResponse>(result) catch_all (_) {
        _ => null,
    };
    match (response) {
        let value: HerdrTabListResponse => {
            for (let tab in value.result.tabs) {
                if (tab.workspace_id != workspace_id) {
                    return false;
                };
            }
            ;
            true
        },
        null => false,
    }
}

function HerdrChecksSourceFile(words: string[], source: string) -> bool {
    words.length() == 3
        && words[0] == "test"
        && (words[1] == "-f" || words[1] == "-e")
        && words[2] == source
}

function HerdrChecksSessionFiles(words: string[], source: string, destination: string) -> bool {
    words.length() == 7
        && words[0] == "test"
        && words[1] == "-f"
        && words[3] == "&&"
        && words[4] == "test"
        && words[5] == "-f"
        && (
            (words[2] == destination && words[6] == source)
                || (words[2] == source && words[6] == destination)
        )
}

// Readiness reads and file checks may be repeated. A new start or failed wait
// invalidates readiness; consent/order violations remain failures for the trace.
function EvaluateHerdrCreationSequence(
    assertion: HerdrCreationSequenceAssertion,
    calls: ToolCallRecord[],
) -> HardAssertionResult {
    let proposal_source = false;
    let proposal_workspace = false;
    let environment_checked = false;
    let help_read = false;
    let directory_check = -1;
    let source_refresh = -1;
    let source_file_check = -1;
    let workspace_refresh = -1;
    let tab_refresh = -1;
    let create_index = -1;
    let rename_index = -1;
    let tab_check_index = -1;
    let agent_lookup_index = -1;
    let agent_lookup_failed = false;
    let start_index = -1;
    let wait_index = -1;
    let source_index = -1;
    let destination_index = -1;
    let files_index = -1;
    let violations: string[] = [];
    for (let call in calls) {
        if (call.tool == "bash") {
            let command = call.command ?? "";
            let words = HerdrCommandWords(command);
            let approved = call.turn >= assertion.fromTurn;
            let creates_tab = HerdrCommandIs(words, "tab", "create");
            let creates_workspace = HerdrCommandIs(words, "workspace", "create");
            let renames_tab = HerdrCommandIs(words, "tab", "rename");
            let starts_agent = HerdrCommandIs(words, "agent", "start");
            if (!approved && (creates_tab || creates_workspace || renames_tab || starts_agent)) {
                violations.push(`Tool call ${call.index}: mutation before approval.`);
            };
            if (command.includes("HERDR_ENV")) {
                environment_checked = true;
            };
            if (words.length() == 2 && words[0] == "herdr" && words[1] == "--help") {
                help_read = true;
            };
            if (HerdrCommandIs(words, "pane", "current")) {
                if (approved) {
                    source_refresh = call.index;
                    source_file_check = -1;
                } else {
                    proposal_source = true;
                };
            };
            if (HerdrCommandIs(words, "workspace", "list")) {
                if (approved) {
                    workspace_refresh = call.index;
                } else {
                    proposal_workspace = true;
                };
            };
            if (approved) {
                if (
                    words.length() == 3
                        && words[0] == "test"
                        && words[1] == "-d"
                        && words[2] == assertion.destinationCwd
                ) {
                    directory_check
                        = if (call.result.trim().length() == 0) {
                            call.index
                        } else {
                            -1
                        };
                };
                if (HerdrChecksSourceFile(words, assertion.sourceSessionPath) && source_refresh >= 0) {
                    // The fixture represents a successful file test with empty output.
                    source_file_check
                        = if (call.result.trim().length() == 0) {
                            call.index
                        } else {
                            -1
                        };
                };
                if (
                    HerdrCommandIs(words, "tab", "list")
                        && words.length() == 5
                        && words[3] == "--workspace"
                        && words[4] == assertion.destinationWorkspaceId
                ) {
                    tab_refresh
                        = if (HerdrTabListSucceeded(call.result, assertion.destinationWorkspaceId)) {
                            call.index
                        } else {
                            -1
                        };
                };
                if (creates_tab || creates_workspace) {
                    if (
                        !environment_checked
                            || !help_read
                            || !proposal_source
                            || !proposal_workspace
                            || source_refresh < 0
                            || workspace_refresh < 0
                    ) {
                        violations
                            .push(
                                `Tool call ${call.index}: creation lacks environment/help checks, proposal reads, or post-approval source/workspace refreshes.`,
                            );
                    };
                    if (directory_check < 0) {
                        violations
                            .push(
                                `Tool call ${call.index}: creation lacks a successful post-approval directory check for ${assertion.destinationCwd}.`,
                            );
                    };
                    if (source_file_check <= source_refresh) {
                        violations
                            .push(
                                `Tool call ${call.index}: creation lacks a successful file check after the source refresh.`,
                            );
                    };
                    if (!assertion.newWorkspace && tab_refresh < 0) {
                        violations
                            .push(
                                `Tool call ${call.index}: creation lacks a successful post-approval tab listing for workspace ${assertion.destinationWorkspaceId}.`,
                            );
                    };
                    if (creates_workspace != assertion.newWorkspace || create_index >= 0) {
                        violations
                            .push(
                                `Tool call ${call.index}: unexpected or duplicate destination creation.`,
                            );
                    };
                    create_index = call.index;
                } else if (renames_tab) {
                    if (
                        !assertion.newWorkspace
                            || create_index < 0
                            || start_index >= 0
                            || words.length() != 5
                            || words[3] != assertion.destinationTabId
                    ) {
                        violations
                            .push(
                                `Tool call ${call.index}: initial-tab naming must follow its creation and precede startup.`,
                            );
                    };
                    rename_index = call.index;
                    tab_check_index = -1;
                } else if (
                    HerdrCommandIs(words, "tab", "get")
                        && words.length() == 4
                        && words[3] == assertion.destinationTabId
                        && rename_index >= 0
                ) {
                    tab_check_index = call.index;
                } else if (
                    HerdrCommandIs(words, "agent", "get")
                        && words.length() == 4
                        && words[3] == assertion.destinationAgentName
                        && create_index >= 0
                ) {
                    if (call.result.trim() == "agent_not_found") {
                        agent_lookup_index = call.index;
                    } else {
                        agent_lookup_index = -1;
                        agent_lookup_failed = true;
                    };
                } else if (starts_agent) {
                    if (
                        agent_lookup_index <= create_index
                            || agent_lookup_failed
                            || words.length() < 4
                            || words[3] != assertion.destinationAgentName
                    ) {
                        violations
                            .push(
                                `Tool call ${call.index}: startup requires an agent_not_found lookup for ${assertion.destinationAgentName} after creation, with no failed lookup.`,
                            );
                    };
                    if (
                        create_index < 0
                            || !HerdrStartsPane(words, assertion.destinationPaneId)
                            || (
                                assertion.newWorkspace
                                    && (
                                        rename_index <= create_index
                                            || tab_check_index <= rename_index
                                    )
                            )
                    ) {
                        violations
                            .push(
                                `Tool call ${call.index}: startup lacks destination creation or verified initial-tab naming.`,
                            );
                    };
                    start_index = call.index;
                    wait_index = -1;
                    source_index = -1;
                    destination_index = -1;
                    files_index = -1;
                } else if (
                    HerdrCommandIs(words, "agent", "wait")
                        && (words.length() == 4 || (words.length() == 6 && words[4] == "--timeout"))
                        && words[3] == assertion.destinationPaneId
                ) {
                    if (
                        start_index >= 0
                            && HerdrWaitSucceeded(call.result, assertion.destinationPaneId)
                    ) {
                        if (wait_index < 0) {
                            wait_index = call.index;
                        };
                    } else {
                        wait_index = -1;
                        source_index = -1;
                        destination_index = -1;
                        files_index = -1;
                    };
                } else if (HerdrCommandIs(words, "pane", "get") && words.length() == 4 && wait_index >= 0) {
                    if (words[3] == assertion.sourcePaneId && source_index < 0) {
                        source_index = call.index;
                    };
                    if (words[3] == assertion.destinationPaneId && destination_index < 0) {
                        destination_index = call.index;
                    };
                } else if (
                    HerdrChecksSessionFiles(words, assertion.sourceSessionPath, assertion.destinationSessionPath)
                        && source_index >= 0
                        && destination_index >= 0
                ) {
                    // These fixtures return empty output for a successful test command.
                    files_index
                        = if (call.result.trim().length() == 0) {
                            call.index
                        } else {
                            -1
                        };
                };
            };
        };
    }
    ;
    let evidence = [
        `Expected proposal reads, approval from turn ${assertion.fromTurn + 1}, directory check, refreshed source/workspaces, a source-file check and existing-destination tab listing before creation, creation/naming, agent_not_found lookup for the pane-derived name, startup, idle/done wait, both pane reads, then both session-file checks.`,
        `Tool call indices (-1 means missing): directory=${directory_check}, source refresh=${source_refresh}, source file=${source_file_check}, workspace refresh=${workspace_refresh}, tab refresh=${tab_refresh}, create=${create_index}, rename=${rename_index}, tab check=${tab_check_index}, agent lookup=${agent_lookup_index}, start=${start_index}, wait=${wait_index}, source read=${source_index}, destination read=${destination_index}, files=${files_index}.`,
    ];
    for (let violation in violations) {
        evidence.push(violation);
    }
    ;
    HardAssertionResult {
        description: assertion.description,
        passed: violations.length() == 0
            && assertion.sourcePaneId != assertion.destinationPaneId
            && assertion.sourceSessionPath != assertion.destinationSessionPath
            && create_index >= 0
            && start_index > create_index
            && wait_index > start_index
            && source_index > wait_index
            && destination_index > wait_index
            && files_index > source_index
            && files_index > destination_index,
        evidence: evidence,
    }
}
