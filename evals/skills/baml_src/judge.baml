client<llm> JudgeClient {
    provider: openai-responses,
    options: {
        model: "gpt-5",
        api_key: env.OPENAI_API_KEY,
    },
}

function JudgeCase(
    scenario: Scenario,
    skill_text: string,
    transcript: TranscriptEntry[],
    tool_calls: ToolCallRecord[],
    hard_assertions: HardAssertionResult[],
) -> JudgeResult {
    client: JudgeClient
    prompt: #"
        You are evaluating whether a coding agent followed one explicitly loaded skill.

        Judge only the supplied transcript and mock-tool trace. Do not assume actions or
        evidence that are not recorded. Deterministic hard assertions are authoritative:
        an overall PASS is impossible when any hard assertion failed. The overall verdict
        is PASS only when every hard assertion and every semantic criterion passes.

        Evaluate every semantic criterion exactly once using its exact criterion id. A
        criterion passes only when the trace contains affirmative evidence. Missing or
        ambiguous evidence fails. Keep reasons concise and cite exact assistant text or
        numbered tool calls in the evidence array.

        Scenario: {{ scenario.id }} — {{ scenario.title }}

        User turns:
        {{ scenario.turns }}

        Skill under test:
        <skill>
        {{ skill_text }}
        </skill>

        Normalized transcript:
        {{ transcript }}

        Numbered mock-tool trace:
        {{ tool_calls }}

        Deterministic hard assertions:
        {{ hard_assertions }}

        Semantic criteria:
        {{ scenario.semanticCriteria }}

        {{ ctx.output_format }}
    "#
}

function CriterionIdsMatch(scenario: Scenario, result: JudgeResult) -> bool {
    if (scenario.semanticCriteria.length() != result.criteria.length()) {
        return false;
    };
    let observed: string[] = [];
    for (let criterion in result.criteria) {
        if (observed.includes(criterion.criterion_id)) {
            return false;
        };
        observed.push(criterion.criterion_id);
    }
    ;
    for (let expected in scenario.semanticCriteria) {
        if (!observed.includes(expected.id)) {
            return false;
        };
    }
    ;
    true
}

function NormalizeJudgeResult(
    scenario: Scenario,
    hard_assertions: HardAssertionResult[],
    result: JudgeResult,
) -> JudgeResult {
    if (!CriterionIdsMatch(scenario, result)) {
        baml.sys.panic("Judge criterion ids did not match scenario " + scenario.id);
    };
    let should_pass = AllHardAssertionsPass(hard_assertions);
    for (let criterion in result.criteria) {
        if (criterion.verdict == "FAIL") {
            should_pass = false;
        };
    }
    ;
    result.verdict
        = if (should_pass) {
            "PASS"
        } else {
            "FAIL"
        };
    result
}
