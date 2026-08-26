function RunOne(
    scenario: Scenario,
    skill_text: string,
    repetition: int,
    skip_judge: bool,
) -> SubjectRun {
    let started = baml.sys.now_ms();
    if (baml.env.get("OPENAI_API_KEY") == null) {
        return SubjectRun {
            scenarioId: scenario.id,
            scenarioTitle: scenario.title,
            repetition: repetition,
            skillText: skill_text,
            transcript: [],
            toolCalls: [],
            hardAssertions: EvaluateHardAssertions(scenario, []),
            semanticCriteria: scenario.semanticCriteria,
            judge: null,
            judgeError: null,
            runError: "OPENAI_API_KEY is required for live subject and judge calls.",
            durationMs: baml.sys.now_ms() - started,
        };
    };
    let partial_state = NewHarnessState();
    let state: HarnessState? = RunSubjectIntoState(scenario, skill_text, partial_state) catch_all (error) {
        _ => null,
    };
    match (state) {
        null => {
            let duration = baml.sys.now_ms() - started;
            SubjectRun {
                scenarioId: scenario.id,
                scenarioTitle: scenario.title,
                repetition: repetition,
                skillText: skill_text,
                transcript: partial_state.transcript,
                toolCalls: partial_state.toolCalls,
                hardAssertions: EvaluateHardAssertions(scenario, partial_state.toolCalls),
                semanticCriteria: scenario.semanticCriteria,
                judge: null,
                judgeError: null,
                runError: "The subject harness failed unexpectedly after the recorded trace.",
                durationMs: duration,
            }
        },
        let value: HarnessState => {
            let hard = EvaluateHardAssertions(scenario, value.toolCalls);
            let judge: JudgeResult? = null;
            let judge_error: string? = null;
            if (!skip_judge && value.error == null) {
                let provider_error: string? = null;
                let raw: JudgeResult? = JudgeCase(scenario, skill_text, value.transcript, value.toolCalls, hard) catch_all (error) {
                    let failure: baml.errors.LlmClient => {
                        provider_error
                            = "Judge provider error: " + SafeRuntimeError(failure.message);
                        null
                    },
                    let failure: baml.errors.RenderPrompt => {
                        provider_error = "Judge prompt error: " + SafeRuntimeError(failure.message);
                        null
                    },
                    let failure: baml.errors.Timeout => {
                        provider_error
                            = "Judge provider timeout: " + SafeRuntimeError(failure.message);
                        null
                    },
                    _ => {
                        provider_error = "The judge model call or response parser failed.";
                        null
                    },
                };
                match (raw) {
                    null => {
                        judge_error = provider_error;
                    },
                    let result: JudgeResult => {
                        if (!CriterionIdsMatch(scenario, result)) {
                            judge_error = "The judge returned malformed semantic criterion ids.";
                        } else {
                            judge = NormalizeJudgeResult(scenario, hard, result);
                        };
                    },
                };
            };
            let run = SubjectRun {
                scenarioId: scenario.id,
                scenarioTitle: scenario.title,
                repetition: repetition,
                skillText: skill_text,
                transcript: value.transcript,
                toolCalls: value.toolCalls,
                hardAssertions: hard,
                semanticCriteria: scenario.semanticCriteria,
                judge: judge,
                judgeError: judge_error,
                runError: value.error,
                durationMs: baml.sys.now_ms() - started,
            };
            run
        },
    }
}

function BuildEvalReport(
    scenario_path: string,
    scenario_id: string?,
    repetitions: int,
    skip_judge: bool,
) -> EvalReport {
    if (repetitions < 1) {
        baml.sys.panic("repetitions must be a positive integer");
    };
    let scenarios = SelectScenarios(LoadScenarios(scenario_path), scenario_id);
    let scenario_skill_target = ValidateScenarioSkillTarget(scenarios);
    let skill_path = ResolveRepoPath(scenario_skill_target);
    let skill_text = baml.fs.read(skill_path);
    let runs: SubjectRun[] = [];
    for (let scenario in scenarios) {
        let repetition = 1;
        while (repetition <= repetitions) {
            runs.push(RunOne(scenario, skill_text, repetition, skip_judge));
            repetition += 1;
        }
        ;
    }
    ;
    EvalReport {
        formatVersion: 2,
        createdAtMs: baml.sys.now_ms(),
        gitHead: GitHead(),
        skillPath: skill_path,
        scenarioSkillTarget: scenario_skill_target,
        bamlVersion: BamlVersion(),
        subjectModel: "openai-responses/gpt-5-mini",
        judgeModel: if (skip_judge) {
            null
        } else {
            "openai-responses/gpt-5"
        },
        repetitions: repetitions,
        runs: runs,
    }
}

function RunEval(
    scenario_path: string? = null,
    scenario_id: string? = null,
    repetitions: int = 1,
    output_dir: string? = null,
    skip_judge: bool = false,
) -> RunSummary {
    let resolved_scenario_path = if (scenario_path == null) {
        DefaultScenarioPath()
    } else {
        ResolveRepoPath(scenario_path)
    };
    let report = BuildEvalReport(resolved_scenario_path, scenario_id, repetitions, skip_judge);
    let destination = if (output_dir == null) {
        RepoRoot() + "/.skill-eval-results/" + report.createdAtMs.to_string()
    } else {
        ResolveRepoPath(output_dir)
    };
    let summary = WriteReport(destination, report);
    baml.io.eprintln("JSON report: " + summary.jsonPath);
    baml.io.eprintln("Markdown report: " + summary.markdownPath);
    baml.io.eprintln(`Failures: ${summary.failures}/${summary.totalRuns}`);
    if (summary.failures > 0) {
        baml.sys.exit(1);
    };
    summary
}
