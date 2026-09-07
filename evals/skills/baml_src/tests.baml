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

function HerdrCreationScenario(new_workspace: bool) -> Scenario {
    SelectScenarios(
        HerdrScenarios(),
        if (new_workspace) {
            "herdr-creates-new-workspace-with-explicit-tab"
        } else {
            "herdr-creates-approved-existing-workspace-tab"
        },
    )[
        0
    ]
}

function HerdrCreationTrace(new_workspace: bool) -> ToolCallRecord[] {
    let scenario = HerdrCreationScenario(new_workspace);
    let calls: ToolCallRecord[] = [];
    let proposal = ["echo $HERDR_ENV", "herdr --help", "herdr pane current --current", "herdr workspace list"];
    let approved = ["herdr pane current --current", "test -e /fixture/source.jsonl", "herdr workspace list"];
    let destination = if (new_workspace) {
        "w40:p1"
    } else {
        "w30:p9"
    };
    if (new_workspace) {
        approved
            .push(
                "herdr workspace create --cwd /Users/ryan/git/api --label incident-response --no-focus",
            );
        approved.push("herdr tab rename w40:t1 cache-timeouts");
        approved.push("herdr tab get w40:t1");
    } else {
        approved.push("herdr tab list --workspace w30");
        approved
            .push(
                "herdr tab create --workspace w30 --cwd /Users/ryan/git/ai-oncall-workflow-scripts --label 12934387102 --no-focus",
            );
    };
    approved.push(`herdr agent start pi_fixture --kind pi --pane ${destination} -- brief`);
    approved.push(`herdr agent wait ${destination} --timeout 120000`);
    approved.push(`herdr pane get ${destination}`);
    approved.push("herdr pane get w18:p1");
    approved.push("test -f /fixture/destination.jsonl && test -f /fixture/source.jsonl");
    for (let turn in [0, 1]) {
        for (
            let command in if (turn == 0) {
                proposal
            } else {
                approved
            }
        ) {
            let call = TestCall(calls.length(), "bash", turn);
            call.command = command;
            call.result = FixtureBash(scenario, command);
            calls.push(call);
        }
        ;
    }
    ;
    calls
}

function HerdrCreationPasses(new_workspace: bool, calls: ToolCallRecord[]) -> bool {
    AllHardAssertionsPass(EvaluateHardAssertions(HerdrCreationScenario(new_workspace), calls))
}

// Move one command before an anchor, adopting the anchor's turn. Optionally
// keep the original to prove later compliant calls cannot hide an early one.
function HerdrMoveCall(
    calls: ToolCallRecord[],
    command_text: string,
    before_text: string,
    keep_original: bool,
) -> ToolCallRecord[] {
    let selected_index = -1;
    for (let call in calls) {
        if ((call.command ?? "").includes(command_text)) {
            selected_index = call.index;
        };
    }
    ;
    if (selected_index < 0) {
        baml.sys.panic("Missing trace command: " + command_text);
    };
    let moved = calls[selected_index];
    let result: ToolCallRecord[] = [];
    let inserted = false;
    for (let call in calls) {
        if (!inserted && (call.command ?? "").includes(before_text)) {
            let copy = TestCall(result.length(), moved.tool, call.turn);
            copy.command = moved.command;
            copy.result = moved.result;
            result.push(copy);
            inserted = true;
        };
        if (keep_original || call.index != moved.index) {
            let copy = TestCall(result.length(), call.tool, call.turn);
            copy.command = call.command;
            copy.result = call.result;
            result.push(copy);
        };
    }
    ;
    if (!inserted) {
        baml.sys.panic("Missing trace anchor: " + before_text);
    };
    result
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

    test "defines the commit-simple scenario in BAML" {
        let scenarios = CommitSimpleScenarios();
        let scenario = SelectScenarios(scenarios, "commit-simple-result-first-context")[0];
        assert.equal(ValidateScenarioSkillTarget(scenarios), "skills/commit/commit-simple/SKILL.md");
        let commit_call = TestCall(1, "bash", 0);
        commit_call.command = "git commit -m draft";
        let assertions = EvaluateHardAssertions(scenario, [commit_call]);
        let rejected_commit = false;
        for (let assertion in assertions) {
            if (assertion.description.includes("does not commit")) {
                assert.equal(assertion.passed, false);
                rejected_commit = true;
            };
        }
        ;
        assert.is_true(rejected_commit);
    }

    test "defines the commit-pr scenario in BAML" {
        let scenarios = CommitPrScenarios();
        let scenario = SelectScenarios(scenarios, "commit-pr-result-first-description")[0];
        assert.equal(ValidateScenarioSkillTarget(scenarios), "skills/commit/commit-pr/SKILL.md");
        let create_call = TestCall(1, "bash", 0);
        create_call.command = "gh pr create --draft";
        let assertions = EvaluateHardAssertions(scenario, [create_call]);
        let rejected_creation = false;
        for (let assertion in assertions) {
            if (assertion.description.includes("does not create the PR")) {
                assert.equal(assertion.passed, false);
                rejected_creation = true;
            };
        }
        ;
        assert.is_true(rejected_creation);
    }

    test "selects a suite or one globally unique scenario" {
        let suites = ScenarioSuites();
        let hci = SelectScenarioSuites(suites, "hci", null);
        let research_case = SelectScenarioSuites(suites, null, "research-local-evidence-sufficient");
        assert.equal(hci[0].id, "hci");
        assert.equal(research_case[0].id, "research");
    }

    test "ticket-workspace handoff scenarios enter through the calling skill" {
        let suites = SelectScenarioSuites(ScenarioSuites(), "ticket-workspace", null);
        let scenario = suites[0].scenarios[0];
        assert.equal(scenario.skillPath, "skills/ticket-workspace/ticket-workspace/SKILL.md");
        assert.is_true(scenario.skillReferences.includes("skills/herdr/SKILL.md"));
        assert
            .is_true(
                scenario.skillReferences.includes("skills/herdr/references/pi-session-transfer.md"),
            );
    }

    test "new-workspace assertions require initial-tab naming and reject an extra tab" {
        let scenario = SelectScenarios(HerdrScenarios(), "herdr-creates-new-workspace-with-explicit-tab")[0];
        let extra_tab = TestCall(1, "bash", 0);
        extra_tab.command = "herdr tab create --workspace w40 --label cache-timeouts --no-focus";
        let results = EvaluateHardAssertions(scenario, [extra_tab]);
        let rejected_extra_tab = false;
        let missing_rename = false;
        for (let result in results) {
            if (result.description.includes("without creating an extra tab")) {
                rejected_extra_tab = !result.passed;
            };
            if (result.description.includes("assigns the requested label")) {
                missing_rename = !result.passed;
            };
        }
        ;
        assert.is_true(rejected_extra_tab);
        assert.is_true(missing_rename);
    }

    test "Herdr proposal assertions reject agent startup" {
        let scenario = SelectScenarios(HerdrScenarios(), "herdr-infer-review-tab")[0];
        let startup = TestCall(1, "bash", 0);
        startup.command = "herdr agent start pi_unapproved --kind pi --pane w11:p2";
        let found_guard = false;
        for (let result in EvaluateHardAssertions(scenario, [startup])) {
            if (result.description.includes("does not start an agent")) {
                assert.is_true(!result.passed);
                found_guard = true;
            };
        }
        ;
        assert.is_true(found_guard);
        for (let result in EvaluateHardAssertions(scenario, [])) {
            if (result.description.includes("does not start an agent")) {
                assert.is_true(result.passed);
            };
        }
        ;
    }

    test "Herdr complete fixture traces satisfy every creation assertion" {
        for (let new_workspace in [false, true]) {
            assert.is_true(HerdrCreationPasses(new_workspace, HerdrCreationTrace(new_workspace)));
        }
        ;
    }

    test "Herdr creation rejects early mutations even when repeated after approval" {
        for (let new_workspace in [false, true]) {
            let mutations = [
                "herdr agent start",
                if (new_workspace) {
                    "herdr workspace create"
                } else {
                    "herdr tab create"
                },
            ];
            if (new_workspace) {
                mutations.push("herdr tab rename");
            };
            for (let mutation in mutations) {
                for (let keep_original in [false, true]) {
                    let calls = HerdrMoveCall(HerdrCreationTrace(new_workspace), mutation, "herdr --help", keep_original);
                    assert.is_true(!HerdrCreationPasses(new_workspace, calls));
                    let found_sequence = false;
                    for (let result in EvaluateHardAssertions(HerdrCreationScenario(new_workspace), calls)) {
                        if (result.description.includes("approved creation sequence")) {
                            assert.is_true(!result.passed);
                            found_sequence = true;
                        };
                    };
                    assert.is_true(found_sequence);
                }
                ;
            }
            ;
        }
        ;
    }

    test "Herdr creation requires refreshed source and topology before mutation" {
        for (let new_workspace in [false, true]) {
            for (let prerequisite in ["HERDR_ENV", "herdr --help"]) {
                let calls = HerdrMoveCall(HerdrCreationTrace(new_workspace), prerequisite, "herdr agent start", false);
                assert.is_true(!HerdrCreationPasses(new_workspace, calls));
            };
            for (let read in ["herdr pane current", "herdr workspace list"]) {
                for (let anchor in ["herdr --help", "herdr agent start"]) {
                    let calls = HerdrMoveCall(HerdrCreationTrace(new_workspace), read, anchor, false);
                    assert.is_true(!HerdrCreationPasses(new_workspace, calls));
                }
                ;
            }
            ;
        }
        ;
    }

    test "Herdr creation requires a fresh destination-tab inventory" {
        for (let anchor in ["herdr --help", "herdr agent start"]) {
            let calls = HerdrMoveCall(HerdrCreationTrace(false), "herdr tab list", anchor, false);
            assert.is_true(!HerdrCreationPasses(false, calls));
        }
        ;
        for (let command in ["echo missing-tab-list", "herdr tab list --workspace w99"]) {
            let calls = HerdrCreationTrace(false);
            for (let call in calls) {
                if ((call.command ?? "").includes("herdr tab list")) {
                    call.command = command;
                };
            }
            ;
            assert.is_true(!HerdrCreationPasses(false, calls));
        }
        ;
        for (
            let result in [
                "unavailable",
                "{\"result\":{}}",
                "{\"result\":{\"tabs\":[{\"workspace_id\":\"w99\"}]}}",
                "{\"result\":{\"tabs\":[]}}",
            ]
        ) {
            let calls = HerdrCreationTrace(false);
            for (let call in calls) {
                if ((call.command ?? "").includes("herdr tab list")) {
                    call.result = result;
                };
            }
            ;
            assert.equal(HerdrCreationPasses(false, calls), result.includes("\"tabs\":[]"));
        }
        ;
    }

    test "Herdr creation checks the refreshed source file before mutation" {
        let source_check = "test -e /fixture/source.jsonl";
        for (let new_workspace in [false, true]) {
            for (let anchor in ["herdr --help", "herdr agent start"]) {
                let calls = HerdrMoveCall(HerdrCreationTrace(new_workspace), source_check, anchor, false);
                assert.is_true(!HerdrCreationPasses(new_workspace, calls));
            }
            ;
            let create = if (new_workspace) {
                "herdr workspace create"
            } else {
                "herdr tab create"
            };
            for (let keep_original in [false, true]) {
                let calls = HerdrMoveCall(HerdrCreationTrace(new_workspace), "herdr pane current", create, keep_original);
                assert.is_true(!HerdrCreationPasses(new_workspace, calls));
            }
            ;
            for (
                let command in [
                    "echo missing-source-check",
                    "test -e /fixture/unrelated.jsonl",
                    "test -f '/fixture/source.jsonl'",
                ]
            ) {
                let calls = HerdrCreationTrace(new_workspace);
                for (let call in calls) {
                    if (call.command == source_check) {
                        call.command = command;
                        call.result = FixtureBash(HerdrCreationScenario(new_workspace), command);
                    };
                }
                ;
                assert
                    .equal(
                        HerdrCreationPasses(new_workspace, calls),
                        command == "test -f '/fixture/source.jsonl'",
                    );
            }
            ;
            let failed = HerdrCreationTrace(new_workspace);
            for (let call in failed) {
                if (call.command == source_check) {
                    call.result = "source file missing";
                };
            }
            ;
            assert.is_true(!HerdrCreationPasses(new_workspace, failed));
        }
        ;
    }

    test "Herdr quoted pane commands return the correct fixture evidence" {
        for (let new_workspace in [false, true]) {
            let scenario = HerdrCreationScenario(new_workspace);
            let destination = if (new_workspace) {
                "w40:p1"
            } else {
                "w30:p9"
            };
            for (let pane in ["w18:p1", destination]) {
                let expected = FixtureBash(scenario, `herdr pane get ${pane}`);
                assert.is_true(expected.includes(`"pane_id":"${pane}"`));
                for (
                    let command in [
                        `herdr pane get '${pane}'`,
                        `herdr pane get "${pane}"`,
                        `  herdr  pane\tget '${pane}'  `,
                    ]
                ) {
                    assert.equal(FixtureBash(scenario, command), expected);
                }
                ;
            }
            ;
        }
        ;
    }

    test "Herdr startup follows creation and verified initial-tab naming" {
        for (let new_workspace in [false, true]) {
            let create = if (new_workspace) {
                "herdr workspace create"
            } else {
                "herdr tab create"
            };
            let calls = HerdrMoveCall(HerdrCreationTrace(new_workspace), "herdr agent start", create, false);
            assert.is_true(!HerdrCreationPasses(new_workspace, calls));
        }
        ;
        for (
            let pair in [
                ["herdr tab rename", "herdr workspace create"],
                ["herdr tab get", "herdr tab rename"],
                ["herdr agent start", "herdr tab get"],
                ["herdr tab rename", "herdr agent wait"],
            ]
        ) {
            assert
                .is_true(
                    !HerdrCreationPasses(true, HerdrMoveCall(HerdrCreationTrace(true), pair[0], pair[1], false)),
                );
        }
        ;
    }

    test "Herdr file checks follow successful wait and both expected pane reads" {
        for (let new_workspace in [false, true]) {
            let destination = if (new_workspace) {
                "w40:p1"
            } else {
                "w30:p9"
            };
            for (
                let anchor in [
                    "herdr --help",
                    "herdr agent start",
                    "herdr agent wait",
                    `herdr pane get ${destination}`,
                    "herdr pane get w18:p1",
                ]
            ) {
                let calls = HerdrMoveCall(HerdrCreationTrace(new_workspace), "test -f", anchor, false);
                assert.is_true(!HerdrCreationPasses(new_workspace, calls));
            }
            ;
            // Early reads are harmless, but they do not replace the final file check.
            let repeated = HerdrMoveCall(HerdrCreationTrace(new_workspace), "test -f", "herdr agent start", true);
            assert.is_true(HerdrCreationPasses(new_workspace, repeated));
            for (
                let command in [
                    "test -f /fixture/destination.jsonl",
                    "test -f /fixture/source.jsonl",
                    "test -f /fixture/unrelated.jsonl",
                    "test -f /fixture/destination.jsonl && test -f /fixture/destination.jsonl",
                ]
            ) {
                let calls = HerdrCreationTrace(new_workspace);
                calls[calls.length() - 1].command = command;
                assert.is_true(!HerdrCreationPasses(new_workspace, calls));
            }
            ;
            let failed = HerdrCreationTrace(new_workspace);
            failed[failed.length() - 1].result = "file check failed";
            assert.is_true(!HerdrCreationPasses(new_workspace, failed));
        }
        ;
    }

    test "Herdr creation rejects stale missing and duplicate pane reads" {
        for (let new_workspace in [false, true]) {
            let destination = if (new_workspace) {
                "w40:p1"
            } else {
                "w30:p9"
            };
            for (let read in ["herdr pane get w18:p1", `herdr pane get ${destination}`]) {
                for (let anchor in ["herdr agent start", "herdr agent wait"]) {
                    assert
                        .is_true(
                            !HerdrCreationPasses(
                                new_workspace,
                                HerdrMoveCall(HerdrCreationTrace(new_workspace), read, anchor, false),
                            ),
                        );
                }
                ;
                for (
                    let replacement in [
                        "echo missing-read",
                        "herdr pane get w99:p1",
                        if (read == "herdr pane get w18:p1") {
                            `herdr pane get ${destination}`
                        } else {
                            "herdr pane get w18:p1"
                        },
                    ]
                ) {
                    let calls = HerdrCreationTrace(new_workspace);
                    for (let call in calls) {
                        if (call.command == read) {
                            call.command = replacement;
                        };
                    }
                    ;
                    assert.is_true(!HerdrCreationPasses(new_workspace, calls));
                }
                ;
            }
            ;
            assert
                .is_true(
                    !HerdrCreationPasses(
                        new_workspace,
                        HerdrMoveCall(
                            HerdrCreationTrace(new_workspace),
                            "herdr agent wait",
                            "herdr agent start",
                            false,
                        ),
                    ),
                );
        }
        ;
    }

    test "Herdr creation rejects unsuccessful or wrong-pane waits" {
        for (
            let result in [
                "timeout",
                "not-json",
                "{\"result\":{\"agent_status\":\"blocked\",\"pane_id\":\"w30:p9\"}}",
                "{\"result\":{\"agent_status\":\"working\",\"pane_id\":\"w30:p9\"}}",
                "{\"result\":{\"agent_status\":\"idle\",\"pane_id\":\"w99:p1\"}}",
                "{\"result\":{\"agent_status\":\"idle\"}}",
            ]
        ) {
            let calls = HerdrCreationTrace(false);
            for (let call in calls) {
                if ((call.command ?? "").includes("herdr agent wait")) {
                    call.result = result;
                };
            }
            ;
            assert.is_true(!HerdrCreationPasses(false, calls));
        }
        ;
        let wrong_wait = HerdrCreationTrace(false);
        for (let call in wrong_wait) {
            if ((call.command ?? "").includes("herdr agent wait")) {
                call.command = "herdr agent wait w99:p1";
            };
        }
        ;
        assert.is_true(!HerdrCreationPasses(false, wrong_wait));
    }

    test "Herdr creation accepts reversed reads quotes and repeated successful waits" {
        for (let new_workspace in [false, true]) {
            let destination = if (new_workspace) {
                "w40:p1"
            } else {
                "w30:p9"
            };
            let calls = HerdrMoveCall(
                HerdrCreationTrace(new_workspace),
                "herdr pane get w18:p1",
                `herdr pane get ${destination}`,
                false,
            );
            for (let call in calls) {
                call.command
                    = (call.command ?? "")
                        .replace(destination, `"${destination}"`)
                        .replace("w18:p1", "'w18:p1'");
                call.result = FixtureBash(HerdrCreationScenario(new_workspace), call.command ?? "");
            }
            ;
            calls[calls.length() - 1].command
                = "test -f '/fixture/source.jsonl' && test -f \"/fixture/destination.jsonl\"";
            calls[calls.length() - 1].result
                = FixtureBash(HerdrCreationScenario(new_workspace), calls[calls.length() - 1].command ?? "");
            assert.is_true(HerdrCreationPasses(new_workspace, calls));
            let extra = TestCall(calls.length(), "bash", 1);
            extra.command = `herdr agent wait ${destination} --timeout 120000`;
            extra.result = `{"result":{"agent_status":"done","pane_id":"${destination}"}}`;
            calls.push(extra);
            assert.is_true(HerdrCreationPasses(new_workspace, calls));
            extra.result = `{"result":{"agent_status":"blocked","pane_id":"${destination}"}}`;
            assert.is_true(!HerdrCreationPasses(new_workspace, calls));
        }
        ;
        let mentioned = HerdrCreationTrace(false);
        for (let call in mentioned) {
            if (call.command == "herdr pane get w18:p1") {
                call.command = "echo 'herdr pane get w18:p1'";
            };
        }
        ;
        assert.is_true(!HerdrCreationPasses(false, mentioned));
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

    test "tool count exclusions distinguish full diffs from stats" {
        let assertion = ToolCountAssertion {
            kind: "tool-count",
            tool: "bash",
            commandSegmentIncludes: "git diff main...HEAD",
            commandSegmentExcludes: "--stat",
            min: 1,
            description: "The agent inspects the full branch diff.",
        };
        let stat_call = TestCall(1, "bash", 0);
        stat_call.command = "git diff main...HEAD --stat";
        let full_call = TestCall(2, "bash", 0);
        full_call.command = "git diff main...HEAD";
        let combined_call = TestCall(3, "bash", 0);
        combined_call.command = "git diff main...HEAD --stat && git diff main...HEAD";
        assert.is_true(!EvaluateToolCount(assertion, [stat_call]).passed);
        assert.is_true(EvaluateToolCount(assertion, [full_call]).passed);
        assert.is_true(EvaluateToolCount(assertion, [combined_call]).passed);
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
