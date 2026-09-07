class HerdrWaitState {
    pane_id: string,
    agent_status: string,
}

class HerdrWaitResponse {
    result: HerdrWaitState,
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

function HerdrStartsPane(words: string[], pane_id: string) -> bool {
    if (words.length() < 6 || words[0] != "herdr" || words[1] != "agent" || words[2] != "start") {
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

function EvaluateHerdrPaneVerification(
    assertion: HerdrPaneVerificationAssertion,
    calls: ToolCallRecord[],
) -> HardAssertionResult {
    let start_index = -1;
    let wait_index = -1;
    let source_index = -1;
    let destination_index = -1;
    for (let call in calls) {
        if (call.tool == "bash" && call.turn >= assertion.fromTurn) {
            let words = HerdrCommandWords(call.command ?? "");
            if (HerdrStartsPane(words, assertion.destinationPaneId)) {
                start_index = call.index;
                wait_index = -1;
                source_index = -1;
                destination_index = -1;
            } else if (
                (words.length() == 4 || (words.length() == 6 && words[4] == "--timeout"))
                    && words[0] == "herdr"
                    && words[1] == "agent"
                    && words[2] == "wait"
                    && words[3] == assertion.destinationPaneId
            ) {
                let successful_wait = false;
                let response: HerdrWaitResponse? = baml.yaml.deserialize<HerdrWaitResponse>(call.result) catch_all (_) {
                    _ => null,
                };
                match (response) {
                    let value: HerdrWaitResponse => {
                        if (
                            start_index >= 0
                                && call.index > start_index
                                && value.result.pane_id == assertion.destinationPaneId
                                && (
                                    value.result.agent_status == "idle"
                                        || value.result.agent_status == "done"
                                )
                        ) {
                            successful_wait = true;
                        };
                    },
                    null => {
                    },
                };
                if (successful_wait) {
                    if (wait_index < 0) {
                        wait_index = call.index;
                    };
                } else {
                    wait_index = -1;
                    source_index = -1;
                    destination_index = -1;
                };
            } else if (
                wait_index >= 0
                    && call.index > wait_index
                    && words.length() == 4
                    && words[0] == "herdr"
                    && words[1] == "pane"
                    && words[2] == "get"
            ) {
                if (words[3] == assertion.sourcePaneId) {
                    source_index = call.index;
                };
                if (words[3] == assertion.destinationPaneId) {
                    destination_index = call.index;
                };
            };
        };
    }
    ;
    HardAssertionResult {
        description: assertion.description,
        passed: assertion.sourcePaneId != assertion.destinationPaneId
            && wait_index >= 0
            && source_index > wait_index
            && destination_index > wait_index,
        evidence: [
            `Expected startup and an idle/done wait for ${assertion.destinationPaneId}, then reads of ${assertion.sourcePaneId} and ${assertion.destinationPaneId} from turn ${assertion.fromTurn + 1} onward.`,
            `Tool call indices (-1 means missing): start=${start_index}, successful wait=${wait_index}, source read=${source_index}, destination read=${destination_index}.`,
        ],
    }
}
