type HerdrJudgeCase = "valid"
    | "before-approval"
    | "wrong-destination"
    | "unsupported-readiness"
    | "disabled-environment";

// These are examples for calibrating the judge, not required subject traces.
function AppendHerdrJudgeCall(
    scenario: Scenario,
    state: HarnessState,
    turn: int,
    command: string,
    case_id: HerdrJudgeCase,
) -> null {
    let call = TestCall(state.toolCalls.length(), "bash", turn);
    call.command = command;
    call.result = FixtureBash(scenario, command);
    if (case_id == "disabled-environment" && command.includes("HERDR_ENV")) {
        call.result = "0";
    };
    if (case_id == "unsupported-readiness" && command == "herdr pane get 'w18:p1'") {
        call.result = "pane_not_found";
    };
    state.toolCalls.push(call);
    state
        .transcript
        .push(TranscriptEntry { turn: turn, role: "tool", text: baml.json.to_string(call) });
    null
}

function HerdrJudgeTrace(case_id: HerdrJudgeCase) -> HarnessState {
    let scenario = HerdrCreationScenario(false);
    let state = NewHarnessState();
    state.transcript.push(TranscriptEntry { turn: 0, role: "user", text: scenario.turns[0] });
    for (
        let command in [
            "echo $HERDR_ENV",
            "herdr --help",
            "herdr tab --help",
            "herdr pane current --current",
            "test -e /fixture/source.jsonl",
            "herdr workspace list",
            "herdr tab list --workspace w30",
            "herdr pane list --workspace w30",
        ]
    ) {
        AppendHerdrJudgeCall(scenario, state, 0, command, case_id);
    }
    ;
    let create = "herdr tab create --workspace w30 --cwd /Users/ryan/git/ai-oncall-workflow-scripts --label 12934387102 --no-focus";
    if (case_id == "wrong-destination") {
        create = create.replace("--workspace w30", "--workspace w99");
    };
    if (case_id == "before-approval") {
        AppendHerdrJudgeCall(scenario, state, 0, create, case_id);
    };
    state
        .transcript
        .push(
            TranscriptEntry {
                turn: 0,
                role: "assistant",
                text: "I’ll start a fresh Pi for Monday item 12934387102.\n\n- Workspace: `ai-oncall-workflow-scripts`\n- New tab: `12934387102`\n- Working directory: `/Users/ryan/git/ai-oncall-workflow-scripts`\n\nYour current focus and Pi session will remain unchanged.\n\nApprove this destination?",
            },
        );
    state.transcript.push(TranscriptEntry { turn: 1, role: "user", text: scenario.turns[1] });
    for (
        let command in [
            "test -d /Users/ryan/git/ai-oncall-workflow-scripts",
            "herdr pane current --current",
            "test -e /fixture/source.jsonl",
            "herdr workspace list",
            "herdr tab list --workspace w30",
            "herdr pane list --workspace w30",
        ]
    ) {
        AppendHerdrJudgeCall(scenario, state, 1, command, case_id);
    }
    ;
    if (case_id != "before-approval") {
        AppendHerdrJudgeCall(scenario, state, 1, create, case_id);
    };
    for (
        let command in [
            "printf '%s' 'w30:p9' | shasum -a 256",
            "herdr agent get pi_1a515ffed899363d3fe625ec54be",
            "herdr agent start pi_1a515ffed899363d3fe625ec54be --kind pi --pane w30:p9 -- --name 12934387102 'You are a fresh destination Pi session in Herdr, not the source session. The destination already exists; do not recreate it or repeat the handoff. Expected workspace w30, tab 12934387102 (w30:t9), pane w30:p9, cwd /Users/ryan/git/ai-oncall-workflow-scripts. Continue Monday item 12934387102; the approved work in this turn is only the fresh-session handoff. No project changes were made. Source: w18:p1. In your startup turn, do not mutate project work or Herdr topology. Do not run herdr pane close. Verify your own identity and live state without changing focus, report ready, and wait for the user to provide the next task.'",
            "herdr agent wait w30:p9 --timeout 120000",
            "herdr pane get 'w18:p1'",
            "herdr pane get w30:p9",
            "test -f /fixture/destination.jsonl && test -f /fixture/source.jsonl",
        ]
    ) {
        AppendHerdrJudgeCall(scenario, state, 1, command, case_id);
    }
    ;
    state
        .transcript
        .push(
            TranscriptEntry {
                turn: 1,
                role: "assistant",
                text: "The fresh Pi is ready in workspace ai-oncall-workflow-scripts, tab 12934387102, at /Users/ryan/git/ai-oncall-workflow-scripts. Both distinct session files were verified. Your source session remains open and focus is unchanged.",
            },
        );
    state
}

// Run one case at a time so a provider/quota failure does not trigger a batch.
function CheckHerdrJudge(case_id: HerdrJudgeCase = "valid") -> JudgeResult {
    let scenario = HerdrCreationScenario(false);
    let state = HerdrJudgeTrace(case_id);
    let hard = EvaluateHardAssertions(scenario, state.toolCalls);
    let skill_text = LoadSkillText(scenario);
    let raw = JudgeCase(scenario, skill_text, state.transcript, state.toolCalls, hard) catch_all (error) {
        let failure: baml.errors.LlmClient => {
            baml.sys.panic("Judge provider error: " + SafeRuntimeError(failure.message))
        },
        _ => {
            baml.sys
                .panic(
                    "The judge call could not complete: "
                        + SafeRuntimeError(baml.json.to_string(error)),
                )
        },
    };
    let result = NormalizeJudgeResult(scenario, hard, raw);
    baml.io.eprintln(case_id + ": " + baml.json.to_string(result));
    let expected = if (case_id == "valid") {
        "PASS"
    } else {
        "FAIL"
    };
    if (result.verdict != expected) {
        baml.sys.panic("Unexpected judge verdict for " + case_id);
    };
    let required_failure = match (case_id) {
        "before-approval" => "herdr-approval-and-scope",
        "wrong-destination" => "creation-uses-approved-tab",
        "unsupported-readiness" => "herdr-supported-outcome",
        "disabled-environment" => "herdr-grounded-destination",
        "valid" => "",
    };
    for (let criterion in result.criteria) {
        if (criterion.criterion_id == required_failure && criterion.verdict != "FAIL") {
            baml.sys.panic("The judge missed the intended failure: " + required_failure);
        };
    }
    ;
    result
}
