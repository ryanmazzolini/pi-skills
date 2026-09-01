type Verdict = "PASS" | "FAIL";

type AgentAction = "read"
    | "web_search"
    | "fetch_content"
    | "bash"
    | "edit"
    | "write"
    | "public_action"
    | "respond";

class AgentStep {
    action: AgentAction,
    path: string?,
    query: string?,
    queries: string[]?,
    url: string?,
    urls: string[]?,
    command: string?,
    content: string?,
    message: string?,
}

class TranscriptEntry {
    turn: int,
    role: "user" | "assistant" | "tool",
    text: string,
}

class ToolCallRecord {
    index: int,
    turn: int,
    tool: string,
    path: string?,
    query: string?,
    queries: string[]?,
    url: string?,
    urls: string[]?,
    command: string?,
    content: string?,
    result: string,
}

class ToolCountAssertion {
    kind: "tool-count",
    tool: string,
    argumentIncludes: string?,
    commandSegmentIncludes: string?,
    commandSegmentExcludes: string?,
    min: int?,
    max: int?,
    fromTurn: int?,
    description: string,
}

class ToolBeforeAssertion {
    kind: "tool-before",
    tool: string,
    beforeTools: string[],
    description: string,
}

class QueryBatchAssertion {
    kind: "query-batch",
    tool: string,
    minQueries: int,
    maxQueries: int,
    description: string,
}

class CommandAllowlistAssertion {
    kind: "command-allowlist",
    tool: string,
    allowedCommands: string[],
    description: string,
}

class UrlCountAssertion {
    kind: "url-count",
    tool: "fetch_content",
    min: int?,
    max: int?,
    description: string,
}

type HardAssertion = ToolCountAssertion
    | ToolBeforeAssertion
    | QueryBatchAssertion
    | CommandAllowlistAssertion
    | UrlCountAssertion;

class SemanticCriterion {
    id: string,
    description: string,
}

class BashResponse {
    includes: string,
    output: string,
}

class Scenario {
    id: string,
    title: string,
    skillPath: string,
    skillReferences: string[],
    turns: string[],
    files: map<string, string>,
    searchResponses: string[],
    fetchResponses: map<string, string>,
    bashResponses: BashResponse[],
    maxToolCalls: int,
    hardAssertions: HardAssertion[],
    semanticCriteria: SemanticCriterion[],
}

class ScenarioSuite {
    id: string,
    scenarios: Scenario[],
}

class HardAssertionResult {
    description: string,
    passed: bool,
    evidence: string[],
}

class CriterionJudgment {
    criterion_id: string,
    verdict: Verdict,
    reason: string,
    evidence: string[],
}

class JudgeResult {
    verdict: Verdict,
    summary: string,
    criteria: CriterionJudgment[],
}

class SubjectRun {
    scenarioId: string,
    scenarioTitle: string,
    repetition: int,
    skillText: string,
    transcript: TranscriptEntry[],
    toolCalls: ToolCallRecord[],
    hardAssertions: HardAssertionResult[],
    semanticCriteria: SemanticCriterion[],
    judge: JudgeResult?,
    judgeError: string?,
    runError: string?,
    durationMs: int,
}

class EvalReport {
    formatVersion: int,
    createdAtMs: int,
    gitHead: string,
    skillPath: string,
    scenarioSkillTarget: string,
    bamlVersion: string,
    subjectModel: string,
    judgeModel: string?,
    repetitions: int,
    runs: SubjectRun[],
}

class RunSummary {
    jsonPath: string,
    markdownPath: string,
    failures: int,
    totalRuns: int,
}
