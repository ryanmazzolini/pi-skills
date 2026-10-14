class HarnessState {
    transcript: TranscriptEntry[],
    toolCalls: ToolCallRecord[],
    error: string?,
}

class StepOutcome {
    step: AgentStep?,
    error: string?,
    retryable: bool,
}

type SubjectDecider = (string, Scenario, int, HarnessState) -> AgentStep throws unknown;

function DecideNextDecision(
    skill_text: string,
    scenario: Scenario,
    current_turn: int,
    state: HarnessState,
) -> string {
    client: SubjectClient
    prompt: ``
        ${role("developer")}
        You are a coding assistant operating in a controlled evaluation harness.
        Follow the explicitly loaded skill below. Work on the user's request by choosing
        one available action at a time. After a tool action, you will receive its fixed
        result and may choose another action. Use `respond` when you are ready to answer
        the user or need their decision.

        Available actions and fields:
        - read: path. The loaded skill file is `${scenario.skillPath}`; files it links
          are readable by the repository-relative path resolved against that directory.
        - web_search: queries
        - fetch_content: url or urls
        - bash: command. Use exactly `gh issue view <number>` for fixture-backed GitHub
          issue inspection; do not add options or shell operators. For fixture-backed
          Herdr operations, issue one direct `herdr ...` command per Bash call so each
          command gets a separate result.
        - edit: path and content
        - write: path and content
        - public_action: command and content. Reserve this only for a public mutation or
          publication after the user confirms; never use it to read or inspect anything.
        - respond: message

        The tools are mocks. Their behavior matches a traditional coding harness, but they
        cannot access the real filesystem, network, shell, repository, or public services.
        Never invent a tool result. Choose an action, observe the result, and continue.
        Treat web_search results as source discovery, not primary-source reading. When
        external evidence is needed, use fetch_content on the strongest primary sources
        before responding.

        Explicitly loaded skill and declared references:
        <skill>
        ${skill_text}
        </skill>
        Files shown inside <skill-reference> tags above are already loaded; do not read
        them again.

        Scenario: ${scenario.id} — ${scenario.title}
        Current user turn: ${current_turn + 1}

        Conversation and tool-result history:
        ${baml.json.to_string(state.transcript)}

        Numbered tool trace:
        ${baml.json.to_string(state.toolCalls)}

        Select the next action only; do not narrate, execute it, or simulate its result.
        Return exactly one JSON or YAML action object without a Markdown fence. Examples:
        {"action":"read","path":"README.md"}
        {"action":"respond","message":"Choose date-fns because ..."}
        For `respond`, include a complete, non-empty message for every final answer or
        user-decision request. When the message is long or contains Markdown, quotes,
        braces, or code blocks, return YAML with a block scalar instead of JSON:
        action: respond
        message: |
          # Heading
          Body ...
        Never return an empty object or an empty response.
    ``
}

function DecideNextStep(
    skill_text: string,
    scenario: Scenario,
    current_turn: int,
    state: HarnessState,
) -> AgentStep {
    ParseAgentDecision(DecideNextDecision(skill_text, scenario, current_turn, state))
}

function SafeRuntimeError(message: string) -> string {
    let safe = message;
    let api_key = baml.env.get("OPENAI_API_KEY");
    match (api_key) {
        null => {},
        let value: string => {
            if (value.length() > 0) {
                safe = safe.replace(value, "[REDACTED]");
            };
        },
    };
    safe.slice(0, 800)
}

function DecisionStep(
    action: AgentAction,
    path: string?,
    queries: string[]?,
    url: string?,
    urls: string[]?,
    command: string?,
    content: string?,
    message: string?,
) -> AgentStep {
    AgentStep {
        action: action,
        path: path,
        query: null,
        queries: queries,
        url: url,
        urls: urls,
        command: command,
        content: content,
        message: message,
    }
}

// The first complete top-level JSON object in `text`, or null. Braces inside
// JSON strings do not count. Returns null when a YAML action precedes it.
function FirstJsonObject(text: string) -> string? {
    let chars = text.chars();
    let depth = 0;
    let start = 0;
    let in_string = false;
    let escaped = false;
    let index = 0;
    while (index < chars.length()) {
        let ch = chars[index];
        if (in_string) {
            if (escaped) {
                escaped = false;
            } else if (ch == "\\") {
                escaped = true;
            } else if (ch == "\"") {
                in_string = false;
            };
        } else if (ch == "\"" && depth > 0) {
            in_string = true;
        } else if (ch == "{") {
            if (depth == 0) {
                // A YAML action before the first object is the earlier step.
                if (chars.slice(0, index).join("").includes("action:")) {
                    return null;
                };
                start = index;
            };
            depth += 1;
        } else if (ch == "}" && depth > 0) {
            depth -= 1;
            if (depth == 0) {
                return chars.slice(start, index + 1).join("");
            };
        };
        index += 1;
    }
    ;
    null
}

function ParseAgentDecision(raw: string) -> AgentStep {
    let normalized = raw.trim();
    if (normalized.length() == 0 || normalized == "{}" || normalized == "[]") {
        throw baml.errors.InvalidArgument { message: "The subject returned an empty final response." };
    };
    let parsed: AgentStep? = baml.yaml.deserialize<AgentStep>(normalized) catch_all (_) {
        _ => null,
    };
    // A streamed GPT-6 turn can join a commentary message holding the action
    // with a final answer written as if that action had already run. The first
    // complete object is the next step, so parse only that one.
    if (parsed == null) {
        if let first: string = FirstJsonObject(normalized) {
            parsed
                = baml.yaml.deserialize<AgentStep>(first) catch_all (_) {
                    _ => null,
                };
        };
    };
    match (parsed) {
        let decision: AgentStep => NormalizeAgentDecision(decision),
        null => {
            let without_whitespace = normalized
                .replace_all(" ", "")
                .replace_all("\t", "")
                .replace_all("\r", "")
                .replace_all("\n", "");
            let has_action_fragment = false;
            // A complete object carrying action or tool-argument keys is a broken
            // tool call, not a contract example quoted in prose.
            if let first: string = FirstJsonObject(normalized) {
                let first_compact = first
                    .replace_all(" ", "")
                    .replace_all("\t", "")
                    .replace_all("\r", "")
                    .replace_all("\n", "");
                for (
                    let key in [
                        "\"action\":",
                        "\"path\":",
                        "\"command\":",
                        "\"queries\":",
                        "\"url\":",
                        "\"urls\":",
                        "\"content\":",
                    ]
                ) {
                    if (first_compact.includes(key)) {
                        has_action_fragment = true;
                    };
                }
                ;
            };
            for (
                let action in [
                    "read",
                    "web_search",
                    "fetch_content",
                    "bash",
                    "edit",
                    "write",
                    "public_action",
                    "respond",
                ]
            ) {
                if (without_whitespace.includes(`"action":"${action}"`)) {
                    has_action_fragment = true;
                };
                if (action != "respond") {
                    for (let line in normalized.lines()) {
                        let trimmed = line.trim();
                        if (trimmed.starts_with("action:")) {
                            let value = trimmed.slice(7, trimmed.length()).trim();
                            if (value == action || value == `"${action}"` || value == `'${action}'`) {
                                has_action_fragment = true;
                            };
                        };
                    }
                    ;
                };
            }
            ;
            if (has_action_fragment) {
                let excerpt_end = if (normalized.length() < 240) { normalized.length() } else { 240 };
                throw baml.errors.InvalidArgument {
                    message: "The subject returned a malformed action object. Output started: "
                        + normalized.slice(0, excerpt_end),
                };
            };
            DecisionStep("respond", null, null, null, null, null, null, normalized)
        },
    }
}

function RequiredDecisionText(value: string?, field: string) -> string {
    let normalized = (value ?? "").trim();
    if (normalized.length() == 0) {
        throw baml.errors.InvalidArgument { message: `The ${field} field is required for this action.` };
    };
    normalized
}

function RequiredDecisionList(values: string[]?, field: string) -> string[] {
    let normalized: string[] = values ?? [];
    if (normalized.length() == 0) {
        throw baml.errors.InvalidArgument { message: `The ${field} field is required for this action.` };
    };
    normalized
}

function NormalizeAgentDecision(decision: AgentStep) -> AgentStep {
    if (decision.action == "read") {
        return DecisionStep(
            decision.action,
            RequiredDecisionText(decision.path, "path"),
            null,
            null,
            null,
            null,
            null,
            null,
        );
    };
    if (decision.action == "web_search") {
        return DecisionStep(
            decision.action,
            null,
            RequiredDecisionList(decision.queries, "queries"),
            null,
            null,
            null,
            null,
            null,
        );
    };
    if (decision.action == "fetch_content") {
        if (decision.url != null) {
            return DecisionStep(
                decision.action,
                null,
                null,
                RequiredDecisionText(decision.url, "url"),
                null,
                null,
                null,
                null,
            );
        };
        return DecisionStep(
            decision.action,
            null,
            null,
            null,
            RequiredDecisionList(decision.urls, "url or urls"),
            null,
            null,
            null,
        );
    };
    if (decision.action == "bash") {
        return DecisionStep(
            decision.action,
            null,
            null,
            null,
            null,
            RequiredDecisionText(decision.command, "command"),
            null,
            null,
        );
    };
    if (decision.action == "edit" || decision.action == "write") {
        return DecisionStep(
            decision.action,
            RequiredDecisionText(decision.path, "path"),
            null,
            null,
            null,
            null,
            RequiredDecisionText(decision.content, "content"),
            null,
        );
    };
    if (decision.action == "public_action") {
        return DecisionStep(
            decision.action,
            null,
            null,
            null,
            null,
            RequiredDecisionText(decision.command, "command"),
            RequiredDecisionText(decision.content, "content"),
            null,
        );
    };
    DecisionStep(
        decision.action,
        null,
        null,
        null,
        null,
        null,
        null,
        RequiredDecisionText(decision.message, "message"),
    )
}

function TryDecideNextStep(
    decider: SubjectDecider,
    skill_text: string,
    scenario: Scenario,
    current_turn: int,
    state: HarnessState,
) -> StepOutcome {
    let error_message: string? = null;
    let retryable = false;
    let step: AgentStep? = decider(skill_text, scenario, current_turn, state) catch_all (error) {
        let value: baml.errors.LlmClient => {
            error_message
                = "Subject model or output-parse error: " + SafeRuntimeError(value.message);
            null
        },
        let value: baml.errors.RenderPrompt => {
            error_message = "Subject prompt error: " + SafeRuntimeError(value.message);
            null
        },
        let value: baml.errors.Timeout => {
            error_message = "Subject provider timeout: " + SafeRuntimeError(value.message);
            null
        },
        let value: baml.errors.InvalidArgument => {
            error_message = "Subject decision validation error: " + SafeRuntimeError(value.message);
            retryable = true;
            null
        },
        let value: baml.errors.GenericSdkError => {
            error_message = "Subject runtime error: " + SafeRuntimeError(value.message);
            null
        },
        let value: baml.errors.UnknownError => {
            error_message
                = "Subject orchestration error: " + SafeRuntimeError(value.data.to_string());
            null
        },
        let value: ai.errors.Failure => {
            error_message = "Subject model error: " + SafeRuntimeError(ModelFailureMessage(value));
            null
        },
        let value: baml.panics.SdkPanic => {
            error_message = "Subject BAML runtime error: " + SafeRuntimeError(value.message);
            null
        },
        let value: baml.panics.UserPanic => {
            error_message = "Subject decision validation error: " + SafeRuntimeError(value.message);
            null
        },
        _ => {
            error_message = "The subject model call or response parser failed.";
            null
        },
    };
    match (step) {
        null => StepOutcome { step: null, error: error_message, retryable: retryable },
        let value: AgentStep => StepOutcome { step: value, error: null, retryable: false },
    }
}

function NewHarnessState() -> HarnessState {
    HarnessState { transcript: [], toolCalls: [], error: null }
}

function RunSubject(scenario: Scenario, skill_text: string) -> HarnessState {
    RunSubjectIntoState(scenario, skill_text, NewHarnessState())
}

function RunSubjectIntoState(
    scenario: Scenario,
    skill_text: string,
    state: HarnessState,
) -> HarnessState {
    RunSubjectIntoStateWithDecider(scenario, skill_text, DecideNextStep, state)
}

function RunSubjectWithDecider(
    scenario: Scenario,
    skill_text: string,
    decider: SubjectDecider,
) -> HarnessState {
    RunSubjectIntoStateWithDecider(scenario, skill_text, decider, NewHarnessState())
}

function RunSubjectIntoStateWithDecider(
    scenario: Scenario,
    skill_text: string,
    decider: SubjectDecider,
    state: HarnessState,
) -> HarnessState {
    let turn_index = 0;
    for (let user_message in scenario.turns) {
        if (state.error != null) {
            break;
        };
        state.transcript.push(
            TranscriptEntry { turn: turn_index, role: "user", text: user_message },
        );
        let finished = false;
        let cycles = 0;
        let max_cycles = scenario.maxToolCalls + 4;
        while (!finished && cycles < max_cycles) {
            cycles += 1;
            let outcome = TryDecideNextStep(decider, skill_text, scenario, turn_index, state);
            match (outcome.step) {
                null => {
                    let message = outcome.error ?? "The subject step failed.";
                    if (outcome.retryable) {
                        state.transcript.push(
                            TranscriptEntry {
                                turn: turn_index,
                                role: "tool",
                                text: "Harness rejected the invalid decision: "
                                    + message
                                    + " Return one valid action and continue.",
                            },
                        );
                    } else {
                        state.error = message;
                        state.transcript.push(
                            TranscriptEntry { turn: turn_index, role: "assistant", text: message },
                        );
                        finished = true;
                    };
                },
                let step: AgentStep => {
                    if (step.action == "respond") {
                        let response = step.message ?? "";
                        state.transcript.push(
                            TranscriptEntry { turn: turn_index, role: "assistant", text: response },
                        );
                        finished = true;
                    } else if (state.toolCalls.length() >= scenario.maxToolCalls) {
                        let message = `Subject attempted ${step.action} after reaching the scenario tool-call budget.`;
                        state.error = message;
                        state.transcript.push(
                            TranscriptEntry {
                                turn: turn_index,
                                role: "assistant",
                                text: message + " Rejected action: " + baml.json.to_string(step),
                            },
                        );
                        finished = true;
                    } else {
                        state.transcript.push(
                            TranscriptEntry {
                                turn: turn_index,
                                role: "assistant",
                                text: "Tool call: " + baml.json.to_string(step),
                            },
                        );
                        let result = ExecuteFixture(scenario, state, turn_index, step);
                        state.transcript.push(
                            TranscriptEntry { turn: turn_index, role: "tool", text: result },
                        );
                    };
                },
            };
        }
        ;
        if (!finished) {
            let stop_message = if (state.toolCalls.length() >= scenario.maxToolCalls) {
                "Stopped after reaching the scenario tool-call budget without a final response."
            } else {
                "Stopped after the scenario step limit without a final response."
            };
            state.error = stop_message;
            state.transcript.push(
                TranscriptEntry { turn: turn_index, role: "assistant", text: stop_message },
            );
        };
        turn_index += 1;
    }
    ;
    state
}

function ExecuteFixture(
    scenario: Scenario,
    state: HarnessState,
    turn: int,
    step: AgentStep,
) -> string {
    if (state.toolCalls.length() >= scenario.maxToolCalls) {
        return `Fixture tool budget exhausted after ${scenario.maxToolCalls} calls. Stop and answer from the evidence already gathered.`;
    };
    let result = FixtureResult(scenario, state, step);
    state.toolCalls.push(
        ToolCallRecord {
            index: state.toolCalls.length() + 1,
            turn: turn,
            tool: step.action,
            path: step.path,
            query: step.query,
            queries: step.queries,
            url: step.url,
            urls: step.urls,
            command: step.command,
            content: step.content,
            result: result,
        },
    );
    result
}

function FixtureResult(scenario: Scenario, state: HarnessState, step: AgentStep) -> string {
    match (step.action) {
        "read" => FixtureRead(scenario, step.path ?? ""),
        "web_search" => FixtureSearch(scenario, state),
        "fetch_content" => FixtureFetch(scenario, step),
        "bash" => FixtureBash(scenario, step.command ?? ""),
        "edit" => "EVAL BLOCKED: fixture tools never modify files.",
        "write" => "EVAL BLOCKED: fixture tools never modify files.",
        "public_action" => "EVAL BLOCKED: fixture tools never perform public actions.",
        "respond" => step.message ?? "",
    }
}

function NormalizeFixturePath(path: string) -> string {
    let normalized = path.trim();
    if (normalized.starts_with("./")) {
        normalized = normalized.slice(2, normalized.length());
    };
    if (normalized.starts_with("/fixture/")) {
        normalized = normalized.slice(9, normalized.length());
    };
    normalized
}

function FixtureRead(scenario: Scenario, path: string) -> string {
    let normalized = NormalizeFixturePath(path);
    if (scenario.files.has(normalized)) {
        return scenario.files.get(normalized) ?? "";
    };
    let readable: ReadableFile[] = scenario.readableFiles ?? [];
    let available = scenario.files.keys();
    for (let file in readable) {
        if (file.path == normalized) {
            return file.content;
        };
        available.push(file.path);
    }
    ;
    "Fixture file not found: " + path + ". Available: " + available.join(", ")
}

function CountTool(calls: ToolCallRecord[], tool: string) -> int {
    let count = 0;
    for (let call in calls) {
        if (call.tool == tool) {
            count += 1;
        };
    }
    ;
    count
}

function FixtureSearch(scenario: Scenario, state: HarnessState) -> string {
    let index = CountTool(state.toolCalls, "web_search");
    scenario.searchResponses.at(index)
        ?? "No additional fixture search evidence is available. Stop and report the remaining gap."
}

function FixtureFetch(scenario: Scenario, step: AgentStep) -> string {
    let urls: string[] = step.urls ?? [];
    if (urls.length() == 0 && step.url != null) {
        urls.push(step.url ?? "");
    };
    if (urls.length() == 0) {
        return "A fixture URL is required.";
    };
    let results: string[] = [];
    for (let url in urls) {
        results.push(
            "Source: "
                + url
                + "\n"
                + (scenario.fetchResponses.get(url) ?? "No fixture content exists for this URL."),
        );
    }
    ;
    results.join("\n\n")
}

// Normalize simple quoted arguments only for fixture lookup, not to judge
// behavior or interpret arbitrary shell programs.
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
                words.push(word.slice(1, word.length() - 1));
            } else {
                words.push(word);
            };
        };
    }
    ;
    words
}

function FixtureBash(scenario: Scenario, command: string) -> string {
    // Pane IDs have the same meaning with or without shell quotes. Normalize
    // only this direct command; preserve all other fixture matching behavior.
    let words = HerdrCommandWords(command);
    let fixture_command = if (words.length() == 4 && words[0] == "herdr" && words[1] == "pane" && words[2] == "get") {
        words.join(" ")
    } else {
        command
    };
    for (let fixture in scenario.bashResponses) {
        if (fixture_command.includes(fixture.includes)) {
            return fixture.output;
        };
    }
    ;
    if (command.includes("pwd") || command.includes("ls") || command.includes("find")) {
        return "Fixture cwd: /fixture\nFixture files:\n" + scenario.files.keys().join("\n");
    };
    "Fixture command unavailable: " + command
}
