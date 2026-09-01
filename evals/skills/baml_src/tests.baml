function TestStep(action: AgentAction) -> AgentStep {
    AgentStep {
        action: action,
        path: null,
        query: null,
        queries: null,
        url: null,
        urls: null,
        command: null,
        content: null,
        message: null,
    }
}

function FixtureLocalEvidenceDecider(
    skill_text: string,
    scenario: Scenario,
    turn: int,
    state: HarnessState,
) -> AgentStep {
    let reads = CountTool(state.toolCalls, "read");
    if (reads == 0) {
        let step = TestStep("read");
        step.path = "README.md";
        return step;
    };
    if (reads == 1) {
        let step = TestStep("read");
        step.path = "docs/data-store.md";
        return step;
    };
    let step = TestStep("respond");
    step.message = "Use SQLite because the approved architecture is embedded and offline-first.";
    step
}

function ContractSmokeReport(output_dir: string) -> RunSummary {
    let scenario = SelectScenarios(ResearchScenarios(), "research-local-evidence-sufficient")[0];
    let state = RunSubjectWithDecider(scenario, "fixture research skill", FixtureLocalEvidenceDecider);
    let run = SubjectRun {
        scenarioId: scenario.id,
        scenarioTitle: scenario.title,
        repetition: 1,
        skillText: "fixture research skill",
        transcript: state.transcript,
        toolCalls: state.toolCalls,
        hardAssertions: EvaluateHardAssertions(scenario, state.toolCalls),
        semanticCriteria: scenario.semanticCriteria,
        judge: null,
        judgeError: null,
        runError: null,
        durationMs: 1,
    };
    WriteReport(
        output_dir,
        EvalReport {
            formatVersion: 2,
            createdAtMs: baml.sys.now_ms(),
            gitHead: GitHead(),
            skillPath: ResolveRepoPath(scenario.skillPath),
            scenarioSkillTarget: scenario.skillPath,
            bamlVersion: BamlVersion(),
            subjectModel: "fixture",
            judgeModel: null,
            repetitions: 1,
            runs: [run],
        },
    )
}

function FixtureApprovalDecider(
    skill_text: string,
    scenario: Scenario,
    turn: int,
    state: HarnessState,
) -> AgentStep {
    if (turn == 0) {
        let reads = CountTool(state.toolCalls, "read");
        if (reads == 0) {
            let step = TestStep("read");
            step.path = "README.md";
            return step;
        };
        if (reads == 1) {
            let step = TestStep("read");
            step.path = "docs/data-store.md";
            return step;
        };
        let step = TestStep("respond");
        step.message = "Recommend SQLite.";
        return step;
    };
    let step = TestStep("respond");
    step.message = "Use SQLite.";
    step
}

class FixtureSubjectError {
    message: string,
}

function FixtureInvalidThenRespondDecider(
    skill_text: string,
    scenario: Scenario,
    turn: int,
    state: HarnessState,
) -> AgentStep throws baml.errors.InvalidArgument {
    for (let entry in state.transcript) {
        if (entry.text.includes("Harness rejected the invalid decision")) {
            let step = TestStep("respond");
            step.message = "Recovered final response.";
            return step;
        };
    }
    ;
    throw baml.errors.InvalidArgument { message: "empty response" };
}

function FixtureFailAfterReadDecider(
    skill_text: string,
    scenario: Scenario,
    turn: int,
    state: HarnessState,
) -> AgentStep throws FixtureSubjectError {
    if (state.toolCalls.length() == 0) {
        let step = TestStep("read");
        step.path = "README.md";
        return step;
    };
    throw FixtureSubjectError { message: "expected fixture failure" };
}

function FixtureAlwaysReadDecider(
    skill_text: string,
    scenario: Scenario,
    turn: int,
    state: HarnessState,
) -> AgentStep {
    let step = TestStep("read");
    step.path = "README.md";
    step
}

function FixturePostBudgetPublicationDecider(
    skill_text: string,
    scenario: Scenario,
    turn: int,
    state: HarnessState,
) -> AgentStep {
    if (state.toolCalls.length() == 0) {
        let step = TestStep("read");
        step.path = "README.md";
        return step;
    };
    if (state.toolCalls.length() == 1) {
        let step = TestStep("bash");
        step.command = "gh issue view 123";
        return step;
    };
    for (let entry in state.transcript) {
        if (entry.text.includes("Fixture tool budget exhausted")) {
            let step = TestStep("respond");
            step.message = "Ready to publish after the hidden attempt.";
            return step;
        };
    }
    ;
    let step = TestStep("public_action");
    step.command = "gh issue comment 123";
    step.content = "Publish this recommendation.";
    step
}

function TestCall(index: int, tool: string, turn: int) -> ToolCallRecord {
    ToolCallRecord {
        index: index,
        turn: turn,
        tool: tool,
        path: null,
        query: null,
        queries: null,
        url: null,
        urls: null,
        command: null,
        content: null,
        result: "fixture",
    }
}

testset "contracts" {
    test "defines the research scenarios in BAML" {
        let scenarios = ResearchScenarios();
        let scenario = SelectScenarios(scenarios, "research-local-evidence-sufficient")[0];
        assert.equal(ValidateScenarioSkillTarget(scenarios), "skills/ship/research/SKILL.md");
        assert.is_true(LoadSkillText(scenario).includes("2–4 genuinely different queries"));
    }

    test "defines the HCI scenarios in BAML" {
        let scenarios = HciScenarios();
        let scenario = SelectScenarios(scenarios, "hci-quantity-preview-without-disclaimer")[0];
        assert.equal(ValidateScenarioSkillTarget(scenarios), "skills/ux-accessibility/hci/SKILL.md");
        assert
            .is_true(
                LoadSkillText(scenario)
                    .includes("First distinguish an empty surface from one missing value"),
            );
        let assertions = EvaluateHardAssertions(scenario, [TestCall(1, "bash", 0)]);
        let rejected_shell = false;
        for (let assertion in assertions) {
            if (assertion.description.includes("shell commands")) {
                assert.equal(assertion.passed, false);
                rejected_shell = true;
            };
        }
        ;
        assert.is_true(rejected_shell);
    }

    test "defines progressively disclosed architecture scenarios" {
        let scenarios = ArchitectureScenarios();
        let data_structure = SelectScenarios(scenarios, "architecture-compounding-data-representation")[0];
        let other_engine = SelectScenarios(scenarios, "architecture-non-postgresql-concurrency")[0];
        let postgresql = SelectScenarios(scenarios, "architecture-postgresql-lock-convoy")[0];
        assert
            .equal(
                ValidateScenarioSkillTarget(scenarios),
                "skills/architecture/architecture/SKILL.md",
            );
        assert.is_true(LoadSkillText(data_structure).includes("Green feature tests prove behavior"));
        assert.is_true(!LoadSkillText(other_engine).includes("PostgreSQL"));
        assert.is_true(LoadSkillText(postgresql).includes("PostgreSQL Concurrency Sources"));
    }

    test "selects a suite or one globally unique scenario" {
        let suites = ScenarioSuites();
        let hci = SelectScenarioSuites(suites, "hci", null);
        let research_case = SelectScenarioSuites(suites, null, "research-local-evidence-sufficient");
        assert.equal(hci[0].id, "hci");
        assert.equal(research_case[0].id, "research");
    }

    test "response decisions support typed and plain text but reject empty messages" {
        let typed_decision = TestStep("respond");
        typed_decision.message = "Use SQLite.";
        let typed = NormalizeAgentDecision(typed_decision);
        let plain = ParseAgentDecision("Use SQLite.");
        let rejected: AgentStep? = ParseAgentDecision("") catch_all (error) {
            baml.errors.InvalidArgument => null,
        };
        assert.equal(typed.action, "respond");
        assert.equal(typed.message, "Use SQLite.");
        assert.equal(plain.message, "Use SQLite.");
        assert.equal(rejected, null);
    }

    test "fixture read is in memory and recorded" {
        let scenario = SelectScenarios(ResearchScenarios(), "research-local-evidence-sufficient")[0];
        let state = HarnessState { transcript: [], toolCalls: [], error: null };
        let step = TestStep("read");
        step.path = "README.md";
        let result = ExecuteFixture(scenario, state, 0, step);
        assert.is_true(result.includes("Field Notes"));
        assert.equal(state.toolCalls.length(), 1);
        assert.equal(state.toolCalls[0].tool, "read");
    }

    test "complete mock coding loop follows local evidence contract" {
        let scenario = SelectScenarios(ResearchScenarios(), "research-local-evidence-sufficient")[0];
        let state = RunSubjectWithDecider(scenario, "fixture research skill", FixtureLocalEvidenceDecider);
        let assertions = EvaluateHardAssertions(scenario, state.toolCalls);
        assert.is_true(AllHardAssertionsPass(assertions));
        assert.equal(state.toolCalls.length(), 2);
        assert.equal(state.transcript[state.transcript.length() - 1].role, "assistant");
    }

    test "multi-turn approval does not reopen tool use" {
        let scenario = SelectScenarios(ResearchScenarios(), "research-does-not-reopen-after-approval")[0];
        let state = RunSubjectWithDecider(scenario, "fixture research skill", FixtureApprovalDecider);
        let assertions = EvaluateHardAssertions(scenario, state.toolCalls);
        assert.is_true(AllHardAssertionsPass(assertions));
        assert.equal(state.toolCalls.length(), 2);
        assert.equal(state.toolCalls[1].turn, 0);
    }

    test "invalid subject decisions receive bounded corrective feedback" {
        let scenario = SelectScenarios(ResearchScenarios(), "research-local-evidence-sufficient")[0];
        let state = RunSubjectWithDecider(scenario, "fixture research skill", FixtureInvalidThenRespondDecider);
        assert.equal(state.error, null);
        assert.equal(state.toolCalls.length(), 0);
        assert.is_true(state.transcript[1].text.includes("Harness rejected"));
        assert.equal(state.transcript[2].text, "Recovered final response.");
    }

    test "subject errors preserve the trace accumulated before failure" {
        let scenario = SelectScenarios(ResearchScenarios(), "research-local-evidence-sufficient")[0];
        let state = RunSubjectWithDecider(scenario, "fixture research skill", FixtureFailAfterReadDecider);
        assert.equal(state.toolCalls.length(), 1);
        assert.is_true(state.error != null);
        assert.is_true(state.transcript.length() >= 4);
    }

    test "tool budget permits a final response after the last allowed tool" {
        let scenario = SelectScenarios(ResearchScenarios(), "research-local-evidence-sufficient")[0];
        scenario.maxToolCalls = 2;
        let state = RunSubjectWithDecider(scenario, "fixture research skill", FixtureLocalEvidenceDecider);
        assert.equal(state.toolCalls.length(), 2);
        assert.equal(state.error, null);
        assert.equal(state.transcript[state.transcript.length() - 1].text, "Use SQLite because the approved architecture is embedded and offline-first.");
    }

    test "tool budget rejects extra tools and records an incomplete run" {
        let scenario = SelectScenarios(ResearchScenarios(), "research-local-evidence-sufficient")[0];
        scenario.maxToolCalls = 1;
        let state = RunSubjectWithDecider(scenario, "fixture research skill", FixtureAlwaysReadDecider);
        let assertions = EvaluateHardAssertions(scenario, state.toolCalls);
        let run = SubjectRun {
            scenarioId: scenario.id,
            scenarioTitle: scenario.title,
            repetition: 1,
            skillText: "fixture research skill",
            transcript: state.transcript,
            toolCalls: state.toolCalls,
            hardAssertions: assertions,
            semanticCriteria: scenario.semanticCriteria,
            judge: null,
            judgeError: null,
            runError: state.error,
            durationMs: 1,
        };
        assert.equal(state.toolCalls.length(), 1);
        assert.is_true(AllHardAssertionsPass(assertions));
        assert.is_true(state.error != null);
        assert.is_true(RunFailed(run));
    }

    test "post-budget publication attempt cannot hide behind a final response" {
        let scenario = SelectScenarios(ResearchScenarios(), "research-confirms-before-publication")[0];
        scenario.maxToolCalls = 2;
        let state = RunSubjectWithDecider(scenario, "fixture research skill", FixturePostBudgetPublicationDecider);
        let assertions = EvaluateHardAssertions(scenario, state.toolCalls);
        let run = SubjectRun {
            scenarioId: scenario.id,
            scenarioTitle: scenario.title,
            repetition: 1,
            skillText: "fixture research skill",
            transcript: state.transcript,
            toolCalls: state.toolCalls,
            hardAssertions: assertions,
            semanticCriteria: scenario.semanticCriteria,
            judge: null,
            judgeError: null,
            runError: state.error,
            durationMs: 1,
        };
        assert.equal(state.toolCalls.length(), 2);
        assert.is_true(AllHardAssertionsPass(assertions));
        assert.is_true((state.error ?? "").includes("public_action"));
        assert.is_true(RunFailed(run));
    }

    test "local evidence assertion rejects external search" {
        let scenario = SelectScenarios(ResearchScenarios(), "research-local-evidence-sufficient")[0];
        let call = TestCall(1, "web_search", 0);
        call.queries = ["sqlite versus postgres", "offline embedded database"];
        let results = EvaluateHardAssertions(scenario, [call]);
        assert.is_true(!results[0].passed);
        assert.is_true(!results[1].passed);
    }

    test "local read before external retrieval passes ordering rule" {
        let scenario = SelectScenarios(ResearchScenarios(), "research-external-evidence-needed")[0];
        let read_call = TestCall(1, "read", 0);
        let search_call = TestCall(2, "web_search", 0);
        search_call.queries = ["date-fns node 24 support", "moment project status"];
        let results = EvaluateHardAssertions(scenario, [read_call, search_call]);
        assert.is_true(results[1].passed);
        assert.is_true(results[3].passed);
    }

    test "filtered ordering requires each local read before either external tool" {
        let assertion = ToolBeforeAssertion {
            kind: "tool-before",
            tool: "read",
            argumentIncludes: "transaction-flows.md",
            beforeTools: ["web_search", "fetch_content"],
            description: "The agent reads transaction flows before external retrieval.",
        };
        let runtime_call = TestCall(1, "read", 0);
        runtime_call.path = "runtime.md";
        let fetch_call = TestCall(2, "fetch_content", 0);
        let search_call = TestCall(2, "web_search", 0);
        let late_flow_call = TestCall(3, "read", 0);
        late_flow_call.path = "transaction-flows.md";
        let early_flow_call = TestCall(1, "read", 0);
        early_flow_call.path = "transaction-flows.md";
        let later_search_call = TestCall(2, "web_search", 0);
        let later_fetch_call = TestCall(3, "fetch_content", 0);
        let fetch_first = EvaluateToolBefore(assertion, [runtime_call, fetch_call, late_flow_call]);
        let search_first = EvaluateToolBefore(assertion, [runtime_call, search_call, late_flow_call]);
        let local_first = EvaluateToolBefore(assertion, [early_flow_call, later_search_call, later_fetch_call]);
        assert.is_true(!fetch_first.passed);
        assert.is_true(!search_first.passed);
        assert.is_true(local_first.passed);
    }

    test "source bounds count every URL in a fetch batch" {
        let scenario = SelectScenarios(ResearchScenarios(), "research-external-evidence-needed")[0];
        let fetch_call = TestCall(1, "fetch_content", 0);
        fetch_call.urls = [
            "https://example.test/one",
            "https://example.test/two",
            "https://example.test/three",
            "https://example.test/four",
        ];
        let results = EvaluateHardAssertions(scenario, [fetch_call]);
        assert.is_true(results[4].passed);
        assert.is_true(!results[5].passed);
    }

    test "argument matching ignores fixture result text" {
        let scenario = SelectScenarios(ResearchScenarios(), "research-confirms-before-publication")[0];
        let read_call = TestCall(1, "read", 0);
        let view_call = TestCall(2, "bash", 0);
        view_call.command = "gh issue view 123";
        view_call.result = "The issue body mentions gh issue comment as documentation.";
        let results = EvaluateHardAssertions(scenario, [read_call, view_call]);
        assert.is_true(results[2].passed);
        assert.is_true(results[3].passed);
    }

    test "publication command allowlist rejects alternate and compound mutations" {
        let scenario = SelectScenarios(ResearchScenarios(), "research-confirms-before-publication")[0];
        let api_call = TestCall(1, "bash", 0);
        api_call.command = "gh api --method POST repos/example/project/issues/123/comments";
        let compound_call = TestCall(1, "bash", 0);
        compound_call.command = "gh issue view 123 && gh issue comment 123 --body draft";
        let api_results = EvaluateHardAssertions(scenario, [api_call]);
        let compound_results = EvaluateHardAssertions(scenario, [compound_call]);
        assert.is_true(!api_results[2].passed);
        assert.is_true(!compound_results[2].passed);
    }

    test "subject parser extracts a YAML respond decision" {
        let step = ParseAgentDecision("action: \"respond\"\nmessage: \"Choose date-fns.\"");
        assert.equal(step.action, "respond");
        assert.equal(step.message, "Choose date-fns.");
    }

    test "subject parser rejects narration mixed with partial action JSON" {
        let parsed: AgentStep? = ParseAgentDecision("I'll read the README.{\"path\":\"README.md\"}{\"error\":\"tool failed\"}") catch_all (error) {
            baml.errors.InvalidArgument => null,
        };
        assert.equal(parsed, null);
    }

    test "judge criterion ids must match exactly" {
        let scenario = SelectScenarios(ResearchScenarios(), "research-local-evidence-sufficient")[0];
        let result = JudgeResult {
            verdict: "PASS",
            summary: "bad fixture",
            criteria: [
                CriterionJudgment {
                    criterion_id: "wrong-id",
                    verdict: "PASS",
                    reason: "wrong",
                    evidence: [],
                },
            ],
        };
        assert.is_true(!CriterionIdsMatch(scenario, result));
    }

    test "judge verdict is derived from hard and semantic results" {
        let scenario = SelectScenarios(ResearchScenarios(), "research-local-evidence-sufficient")[0];
        let hard = [HardAssertionResult { description: "fixture", passed: true, evidence: [] }];
        let result = JudgeResult {
            verdict: "FAIL",
            summary: "inconsistent fixture",
            criteria: [
                CriterionJudgment {
                    criterion_id: "recommend-from-local-authority",
                    verdict: "PASS",
                    reason: "fixture",
                    evidence: [],
                },
                CriterionJudgment {
                    criterion_id: "stop-when-sufficient",
                    verdict: "PASS",
                    reason: "fixture",
                    evidence: [],
                },
            ],
        };
        let normalized = NormalizeJudgeResult(scenario, hard, result);
        assert.equal(normalized.verdict, "PASS");
    }

    test "report renders bounded review paths" {
        let scenario = SelectScenarios(ResearchScenarios(), "research-local-evidence-sufficient")[0];
        let run = SubjectRun {
            scenarioId: scenario.id,
            scenarioTitle: scenario.title,
            repetition: 1,
            skillText: "fixture skill",
            transcript: [TranscriptEntry { turn: 0, role: "assistant", text: "Use SQLite." }],
            toolCalls: [],
            hardAssertions: [],
            semanticCriteria: scenario.semanticCriteria,
            judge: null,
            judgeError: null,
            runError: null,
            durationMs: 1,
        };
        let report = EvalReport {
            formatVersion: 2,
            createdAtMs: 1,
            gitHead: "abc123",
            skillPath: "/fixture/SKILL.md",
            scenarioSkillTarget: scenario.skillPath,
            bamlVersion: BamlVersion(),
            subjectModel: "fixture",
            judgeModel: null,
            repetitions: 1,
            runs: [run],
        };
        let markdown = RenderMarkdown(report);
        assert.is_true(markdown.includes("research-local-evidence-sufficient"));
        assert.is_true(markdown.includes("SKIPPED"));
    }
}

function LiveProgressOutcome(report: testing.ChildReport) -> testing.Outcome {
    match (report) {
        let test_report: testing.TestReport => test_report.outcome,
        let testset_report: testing.TestSetReport => testset_report.outcome,
    }
}

function LiveProgressStatus(report: testing.ChildReport) -> string {
    let outcome = LiveProgressOutcome(report);
    if (outcome == "pass") {
        return "PASS";
    };
    if (outcome == "fail") {
        return "FAIL";
    };
    "ERROR"
}

function LiveProgressEscape() -> string throws never {
    string.from_code_points([27]) catch_all (_) {
        _ => "",
    }
}

function LiveProgressInteractive() -> bool throws never {
    let setting: string? = baml.env.get("SKILL_EVAL_SPINNER") catch_all (_) {
        _ => null,
    };
    setting == "1"
}

function LiveProgressLabel(name: string) -> string {
    name.replace("skills/", "")
}

function LiveProgressColor(code: string, text: string) -> string throws never {
    let no_color: string? = baml.env.get("NO_COLOR") catch_all (_) {
        _ => null,
    };
    if (no_color != null) {
        return text;
    };
    let escape = LiveProgressEscape();
    `${escape}[${code}m${text}${escape}[0m`
}

function LiveProgressError(name: string) -> testing.NamedChildReport {
    testing.NamedChildReport {
        name: name,
        report: testing.TestReport {
            outcome: "error",
            runs: [
                testing.RunReport {
                    outcome: "error",
                    duration_ms: 0,
                    message: "The live test task ended without a result.",
                },
            ],
        },
    }
}

function RenderLiveProgress(frame: string, completed: int, total: int) -> null {
    let escape = LiveProgressEscape();
    let marker = LiveProgressColor("36", frame);
    baml.io.eprint(`\r${escape}[2K${marker} ${completed}/${total} scenarios complete`);
    null
}

function PrintLiveProgressResult(name: string, report: testing.ChildReport) -> null {
    let marker = if (LiveProgressOutcome(report) == "pass") {
        LiveProgressColor("32", "✓")
    } else {
        LiveProgressColor("31", "✗")
    };
    baml.io.eprint(`\r${LiveProgressEscape()}[2K`);
    baml.io.eprintln(`${marker} ${LiveProgressLabel(name)}`);
    null
}

function LiveProgress(children: testing.TestSetChild[]) -> testing.TestSetReport throws never {
    let interactive = LiveProgressInteractive();
    let futures: baml.future.Future<testing.NamedChildReport, null>[] = [];
    let results: testing.NamedChildReport?[] = [];
    for (let child in children) {
        futures
            .push(
                spawn {
            testing.NamedChildReport { name: child.name, report: child.run() }
        },
            );
        results.push(null);
        if (!interactive) {
            baml.io.eprintln(`[RUN] ${child.name}`);
        };
    }
    ;

    let frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    let frame_index = 0;
    let completed = 0;
    let complete = false;
    if (interactive) {
        baml.io.eprint(`${LiveProgressEscape()}[?25l`);
    };
    while (!complete) {
        complete = true;
        let index = 0;
        while (index < futures.length()) {
            if (results[index] == null && futures[index].is_settled()) {
                let result: testing.NamedChildReport = (await futures[index]) catch_all (_) {
                    _ => LiveProgressError(children[index].name),
                };
                results[index] = result;
                completed += 1;
                if (interactive) {
                    PrintLiveProgressResult(children[index].name, result.report);
                } else {
                    baml.io
                        .eprintln(`[${LiveProgressStatus(result.report)}] ${children[index].name}`);
                };
            };
            if (results[index] == null) {
                complete = false;
            };
            index += 1;
        }
        ;
        if (interactive && !complete) {
            RenderLiveProgress(frames[frame_index], completed, children.length());
        };
        if (!complete) {
            baml.sys.sleep(baml.time.Duration.from_milliseconds(100)) catch_all (_) {
                _ => null,
            };
            frame_index = (frame_index + 1) % frames.length();
        };
    }
    ;
    if (interactive) {
        let escape = LiveProgressEscape();
        baml.io.eprint(`\r${escape}[2K${escape}[?25h`);
    };

    let named_results: testing.NamedChildReport[] = [];
    for (let index in results) {
        match (index) {
            null => {
            },
            let result: testing.NamedChildReport => {
                named_results.push(result);
            },
        };
    }
    ;
    testing.aggregate_reports(named_results)
}

testset "skills" with LiveProgress {
    for (let suite in ScenarioSuites()) {
        for (let scenario in suite.scenarios) {
            test scenario.id {
                let run = RunOne(scenario, LoadSkillText(scenario), 1, false);
                if (RunFailed(run)) {
                    baml.sys
                        .panic(
                            "Live eval failed for " + scenario.id + ":\n" + RunFailureSummary(run),
                        );
                };
            }
        }
        ;
    }
}
