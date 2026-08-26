function HasSemanticFailure(run: SubjectRun) -> bool {
    let judge = run.judge;
    match (judge) {
        null => false,
        let value: JudgeResult => {
            if (value.verdict == "FAIL") {
                return true;
            };
            for (let criterion in value.criteria) {
                if (criterion.verdict == "FAIL") {
                    return true;
                };
            }
            ;
            false
        },
    }
}

function RunFailed(run: SubjectRun) -> bool {
    !AllHardAssertionsPass(run.hardAssertions)
        || HasSemanticFailure(run)
        || run.judgeError != null
        || run.runError != null
}

function RunFailureSummary(run: SubjectRun) -> string {
    let failures: string[] = [];
    match (run.runError) {
        null => {
        },
        let value: string => failures.push("Subject: " + value),
    };
    for (let assertion in run.hardAssertions) {
        if (!assertion.passed) {
            failures
                .push(
                    "Hard assertion: "
                        + assertion.description
                        + if (assertion.evidence.length() == 0) {
                            ""
                        } else {
                            " — " + assertion.evidence.join(" | ")
                        },
                );
        };
    }
    ;
    match (run.judgeError) {
        null => {
        },
        let value: string => failures.push("Judge: " + value),
    };
    match (run.judge) {
        null => {
        },
        let value: JudgeResult => {
            if (value.verdict == "FAIL") {
                failures.push("Judge verdict: " + value.summary);
            };
            for (let criterion in value.criteria) {
                if (criterion.verdict == "FAIL") {
                    failures
                        .push(
                            "Semantic criterion " + criterion.criterion_id + ": " + criterion.reason,
                        );
                };
            }
            ;
        },
    };
    failures.join("\n")
}

function CountFailures(runs: SubjectRun[]) -> int {
    let count = 0;
    for (let run in runs) {
        if (RunFailed(run)) {
            count += 1;
        };
    }
    ;
    count
}

function EscapeMarkdownCell(value: string) -> string {
    value.replace("|", "\\|")
}

function RenderMarkdown(report: EvalReport) -> string {
    let lines = [
        "# Skill behavior eval report",
        "",
        `- Created: ${report.createdAtMs} ms since Unix epoch`,
        `- Git HEAD: \`${report.gitHead}\``,
        `- Skill source: \`${report.skillPath}\``,
        `- Scenario target: \`${report.scenarioSkillTarget}\``,
        `- BAML: \`${report.bamlVersion}\``,
        `- Subject: \`${report.subjectModel}\``,
        if (report.judgeModel == null) {
            "- Judge: skipped"
        } else {
            `- Judge: \`${report.judgeModel ?? "unknown"}\``
        },
        `- Repetitions: ${report.repetitions}`,
        "",
        "## Results",
        "",
        "| Scenario | Run | Hard assertions | Semantic judge | Duration |",
        "| --- | ---: | --- | --- | ---: |",
    ];
    for (let run in report.runs) {
        let hard_passed = 0;
        for (let assertion in run.hardAssertions) {
            if (assertion.passed) {
                hard_passed += 1;
            };
        }
        ;
        let semantic = if (run.runError != null || run.judgeError != null) {
            "ERROR"
        } else if (run.judge == null) {
            "SKIPPED"
        } else if (HasSemanticFailure(run)) {
            "FAIL"
        } else {
            "PASS"
        };
        lines
            .push(
                `| ${EscapeMarkdownCell(run.scenarioId)} | ${run.repetition} | ${hard_passed}/${run.hardAssertions.length()} | ${semantic} | ${run.durationMs}ms |`,
            );
    }
    ;
    for (let run in report.runs) {
        if (RunFailed(run)) {
            lines.push("");
            lines.push(`## ${run.scenarioId} — run ${run.repetition}`);
            lines.push("");
            for (let assertion in run.hardAssertions) {
                if (!assertion.passed) {
                    lines.push(`- **Hard failure:** ${assertion.description}`);
                    for (let evidence in assertion.evidence) {
                        lines.push("  - " + evidence);
                    }
                    ;
                };
            }
            ;
            if (run.runError != null) {
                lines.push("- **Subject error:** " + run.runError);
            };
            if (run.judgeError != null) {
                lines.push("- **Judge error:** " + run.judgeError);
            };
            let criteria: CriterionJudgment[] = run.judge?.criteria ?? [];
            for (let criterion in criteria) {
                if (criterion.verdict == "FAIL") {
                    lines
                        .push(
                            `- **Semantic failure ${criterion.criterion_id}:** ${criterion.reason}`,
                        );
                    for (let evidence in criterion.evidence) {
                        lines.push("  - " + evidence);
                    }
                    ;
                };
            }
            ;
            let final_response = "";
            let has_final_response = false;
            for (let entry in run.transcript) {
                if (entry.role == "assistant" && !entry.text.starts_with("Tool call:")) {
                    final_response = entry.text;
                    has_final_response = true;
                };
            }
            ;
            if (has_final_response) {
                lines.push("");
                lines.push("Final assistant response:");
                lines.push("");
                lines.push("```text");
                lines.push(final_response);
                lines.push("```");
            };
        };
    }
    ;
    lines.join("\n") + "\n"
}

function WriteReport(output_dir: string, report: EvalReport) -> RunSummary {
    baml.fs.mkdir(output_dir, baml.fs.MkdirOptions { recursive: true });
    let json_path = output_dir + "/report.json";
    let markdown_path = output_dir + "/report.md";
    let report_json = baml.json.stringify_pretty(baml.json.to_json(report));
    baml.fs.write(json_path, report_json + "\n");
    baml.fs.write(markdown_path, RenderMarkdown(report));
    RunSummary {
        jsonPath: json_path,
        markdownPath: markdown_path,
        failures: CountFailures(report.runs),
        totalRuns: report.runs.length(),
    }
}
