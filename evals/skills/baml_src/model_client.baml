// Model calls for the eval subject and judge.
//
// Every request streams. The ChatGPT plan route accepts only streamed Responses
// requests, and streaming the direct route too keeps both routes' output the
// same. That matters for GPT-6, which can split one answer into commentary and
// final-answer messages: a streamed turn joins every message's text, while a
// non-streamed turn keeps only the last message.

function EvalModel() -> string {
    "gpt-6-luna"
}

function EvalReasoningEffort() -> string {
    "high"
}

// An unknown route would silently bill the API key, so reject it.
function EvalRoute() -> string {
    let route = baml.env.get("SKILL_EVAL_ROUTE") ?? "direct";
    if (route != "direct" && route != "chatgpt-plan") {
        baml.sys.panic(`Unknown SKILL_EVAL_ROUTE "${route}"; use "direct" or "chatgpt-plan".`);
    };
    route
}

function UsesChatGptPlan() -> bool {
    EvalRoute() == "chatgpt-plan"
}

// The plan route's access token lasts one hour, so each request asks the
// sign-in helper for a current one. The helper refreshes it when needed.
function ChatGptPlanToken() -> string {
    let output = baml.sys.exec(
        "node",
        [RepoRoot() + "/evals/skills/chatgpt-plan.mjs", "token"],
        baml.sys.ProcessOptions {
            cwd: null,
            env: null,
            timeout_ms: 60000,
            stdin: null,
            stderr: baml.sys.StderrMode.Pipe,
        },
    );
    if (!output.ok()) {
        throw ai.errors.InvalidRequest {
            provider: "chatgpt-plan",
            status_code: null,
            detail: output.stderr.to_string().trim(),
            raw_body: null,
        }
    };
    output.stdout.to_string().trim()
}

function RouteResponsesClient(with_credentials: bool) -> openai.ResponsesClient {
    if (UsesChatGptPlan()) {
        let token = if (with_credentials) {
            ChatGptPlanToken()
        } else {
            "chatgpt-plan-token"
        };
        openai.ResponsesClient.new(
            model = EvalModel(),
            api_key = token,
            base_url = "https://api.openai.com/v1",
            reasoning_effort = EvalReasoningEffort(),
        )
    } else {
        openai.ResponsesClient.new(
            model = EvalModel(),
            api_key = env.OPENAI_API_KEY,
            base_url = env.SKILL_EVAL_OPENAI_BASE_URL,
            reasoning_effort = EvalReasoningEffort(),
        )
    }
}

class EvalResponsesClient {
    implements ai.Client {
        function id(self) -> string {
            `openai/${EvalModel()}`
        }

        function render(self, input: ai.ModelTurnInput) -> baml.http.Request {
            RouteResponsesClient(false).render(input) catch_all (e) {
                _ => throw ai.errors.normalize(e),
            }
        }

        function invoke(self, input: ai.ModelTurnInput) -> ai.ModelTurn {
            RouteResponsesClient(true).invoke_stream(input).final_turn() catch_all (e) {
                _ => throw ai.errors.normalize(e),
            }
        }
    }
}

client SubjectClient = EvalResponsesClient {};

client JudgeClient = EvalResponsesClient {};

// Describes a typed model-call failure for reports, keeping the provider's
// status and response body because they carry the actionable reason. Callers
// still pass the result through SafeRuntimeError, which bounds its length.
function ModelFailureMessage(failure: ai.errors.Failure) -> string {
    match (failure) {
        let value: ai.errors.InvalidRequest => {
            `${value.provider} rejected the request${FailureResponse(value.status_code, value.raw_body)}: ${value.detail}`
        },
        let value: ai.errors.NetworkFailure => {
            `${value.provider} network failure${FailureResponse(value.status_code, value.raw_body)}: ${value.detail}`
        },
        let value: ai.errors.RateLimited => {
            `${value.provider} rate limit${FailureResponse(value.status_code, value.raw_body)}`
        },
        let value: ai.errors.ParseFailed => {
            `${value.provider} returned unparseable output: ${value.raw_output}`
        },
        _ => baml.json.to_string(failure),
    }
}

function FailureResponse(status_code: int?, raw_body: string?) -> string {
    let status = if let code: int = status_code {
        ` (HTTP ${code})`
    } else {
        ""
    };
    let body = if let text: string = raw_body {
        ` [response: ${text}]`
    } else {
        ""
    };
    status + body
}
