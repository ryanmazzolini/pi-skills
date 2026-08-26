client<llm> SubjectClient {
    provider: openai-responses,
    options: {
        model: "gpt-5-mini",
        api_key: env.OPENAI_API_KEY,
    },
}

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
    prompt: #"
        You are a coding assistant operating in a controlled evaluation harness.
        Follow the explicitly loaded skill below. Work on the user's request by choosing
        one available action at a time. After a tool action, you will receive its fixed
        result and may choose another action. Use `respond` when you are ready to answer
        the user or need their decision.

        Available actions and fields:
        - read: path
        - web_search: queries (prefer one batch of 2–4 distinct queries when a broad pass is needed)
        - fetch_content: url or urls
        - bash: command. Use this for fixture-backed read-only shell and GitHub CLI
          inspection, including `gh issue view`.
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

        Explicitly loaded skill:
        <skill>
        {{ skill_text }}
        </skill>

        Scenario: {{ scenario.id }} — {{ scenario.title }}
        Current user turn: {{ current_turn + 1 }}

        Conversation and tool-result history:
        {{ state.transcript }}

        Numbered tool trace:
        {{ state.toolCalls }}

        Select the next action only; do not narrate, execute it, or simulate its result.
        Return exactly one JSON or YAML action object without a Markdown fence. Examples:
        {"action":"read","path":"README.md"}
        {"action":"respond","message":"Choose date-fns because ..."}
        For `respond`, include a complete, non-empty message for every final answer or
        user-decision request. Never return an empty object or an empty response.
    "#
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
        null => {
        },
        let value: string => {
            if (value.length() > 0) {
                safe = safe.replace(value, "[REDACTED]");
            };
        },
    };
    safe.substring(0, 800)
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

function ParseAgentDecision(raw: string) -> AgentStep {
    let normalized = raw.trim();
    if (normalized.length() == 0 || normalized == "{}" || normalized == "[]") {
        throw baml.errors.InvalidArgument { message: "The subject returned an empty final response." };
    };
    let parsed: AgentStep? = baml.yaml.deserialize<AgentStep>(normalized) catch_all (_) {
        _ => null,
    };
    match (parsed) {
        let decision: AgentStep => NormalizeAgentDecision(decision),
        null => {
            if (normalized.includes("{") || normalized.includes("}") || normalized.includes("action:")) {
                throw baml.errors.InvalidArgument { message: "The subject returned a malformed action object." };
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
        let value: baml.errors.DevOther => {
            error_message = "Subject orchestration error: " + SafeRuntimeError(value.message);
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
        state
            .transcript
            .push(TranscriptEntry { turn: turn_index, role: "user", text: user_message });
        let finished = false;
        let cycles = 0;
        let max_cycles = scenario.maxToolCalls + 4;
        while (!finished && cycles < max_cycles && state.toolCalls.length() < scenario.maxToolCalls) {
            cycles += 1;
            let outcome = TryDecideNextStep(decider, skill_text, scenario, turn_index, state);
            match (outcome.step) {
                null => {
                    let message = outcome.error ?? "The subject step failed.";
                    if (outcome.retryable) {
                        state
                            .transcript
                            .push(
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
                        state
                            .transcript
                            .push(
                                TranscriptEntry {
                                    turn: turn_index,
                                    role: "assistant",
                                    text: message,
                                },
                            );
                        finished = true;
                    };
                },
                let step: AgentStep => {
                    if (step.action == "respond") {
                        let response = step.message ?? "";
                        state
                            .transcript
                            .push(
                                TranscriptEntry {
                                    turn: turn_index,
                                    role: "assistant",
                                    text: response,
                                },
                            );
                        finished = true;
                    } else {
                        state
                            .transcript
                            .push(
                                TranscriptEntry {
                                    turn: turn_index,
                                    role: "assistant",
                                    text: "Tool call: " + baml.json.to_string(step),
                                },
                            );
                        let result = ExecuteFixture(scenario, state, turn_index, step);
                        state
                            .transcript
                            .push(TranscriptEntry { turn: turn_index, role: "tool", text: result });
                    };
                },
            };
        }
        ;
        if (!finished) {
            state
                .transcript
                .push(
                    TranscriptEntry {
                        turn: turn_index,
                        role: "assistant",
                        text: if (state.toolCalls.length() >= scenario.maxToolCalls) {
                            "Stopped after reaching the scenario tool-call budget without a final response."
                        } else {
                            "Stopped after the scenario step limit without a final response."
                        },
                    },
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
    state
        .toolCalls
        .push(
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
        normalized = normalized.substring(2, normalized.length());
    };
    if (normalized.starts_with("/fixture/")) {
        normalized = normalized.substring(9, normalized.length());
    };
    normalized
}

function FixtureRead(scenario: Scenario, path: string) -> string {
    let normalized = NormalizeFixturePath(path);
    if (scenario.files.has(normalized)) {
        scenario.files.get(normalized) ?? ""
    } else {
        "Fixture file not found: " + path + ". Available: " + scenario.files.keys().join(", ")
    }
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
        results
            .push(
                "Source: "
                    + url
                    + "\n"
                    + (
                        scenario.fetchResponses.get(url)
                            ?? "No fixture content exists for this URL."
                    ),
            );
    }
    ;
    results.join("\n\n")
}

function FixtureBash(scenario: Scenario, command: string) -> string {
    for (let fixture in scenario.bashResponses) {
        if (command.includes(fixture.includes)) {
            return fixture.output;
        };
    }
    ;
    if (command.includes("pwd") || command.includes("ls") || command.includes("find")) {
        return "Fixture cwd: /fixture\nFixture files:\n" + scenario.files.keys().join("\n");
    };
    "Fixture command unavailable: " + command
}
