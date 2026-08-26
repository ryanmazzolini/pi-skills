function RepoRoot() -> string {
    let output = baml
        .sys
        .exec(
            "git",
            ["rev-parse", "--show-toplevel"],
            baml.sys.ProcessOptions { cwd: null, env: null, timeout_ms: 10000, stdin: null },
        );
    if (!output.ok()) {
        baml.sys.panic("Unable to resolve the repository root: " + output.stderr.to_string());
    };
    output.stdout.to_string().trim()
}

function ResolveRepoPath(path: string) -> string {
    if (path.starts_with("/")) {
        path
    } else if (path.starts_with("./")) {
        RepoRoot() + "/" + path.substring(2, path.length())
    } else {
        RepoRoot() + "/" + path
    }
}

function DefaultScenarioPath() -> string {
    RepoRoot() + "/evals/skills/scenarios/research.json"
}

function DefaultSkillPath() -> string {
    RepoRoot() + "/skills/ship/research/SKILL.md"
}

function LoadScenarios(path: string) -> Scenario[] {
    baml.json.from_string<Scenario[]>(baml.fs.read(path))
}

function BamlVersion() -> string {
    let output = baml
        .sys
        .exec(
            "baml",
            ["--version"],
            baml.sys.ProcessOptions {
                cwd: RepoRoot() + "/evals/skills",
                env: null,
                timeout_ms: 10000,
                stdin: null,
            },
        );
    if (!output.ok()) {
        baml.sys.panic("Unable to read the pinned BAML version: " + output.stderr.to_string());
    };
    let lines = output.stdout.to_string().trim().lines();
    if (lines.length() < 2) {
        baml.sys.panic("Unexpected baml --version output.");
    };
    lines[1].split(" (")[0]
}

function GitHead() -> string {
    let output = baml
        .sys
        .exec(
            "git",
            ["rev-parse", "HEAD"],
            baml.sys.ProcessOptions { cwd: RepoRoot(), env: null, timeout_ms: 10000, stdin: null },
        );
    if (!output.ok()) {
        baml.sys.panic("Unable to read Git HEAD: " + output.stderr.to_string());
    };
    output.stdout.to_string().trim()
}

function ValidateSkillTargetPath(path: string) -> string {
    if (
        !path.starts_with("skills/")
            || !path.ends_with("/SKILL.md")
            || path.includes("..")
            || path.starts_with("/")
    ) {
        baml.sys
            .panic(
                "Scenario skill targets must be repository-relative skills/<namespace>/<skill>/SKILL.md paths: "
                    + path,
            );
    };
    path
}

function ValidateScenarioSkillTarget(scenarios: Scenario[]) -> string {
    if (scenarios.length() == 0) {
        baml.sys.panic("At least one scenario is required.");
    };
    let target = scenarios[0].skillPath;
    for (let scenario in scenarios) {
        if (scenario.skillPath != target) {
            baml.sys
                .panic(
                    "Selected scenarios target multiple skills: "
                        + target
                        + " and "
                        + scenario.skillPath,
                );
        };
    }
    ;
    ValidateSkillTargetPath(target)
}

function SelectScenarios(scenarios: Scenario[], scenario_id: string?) -> Scenario[] {
    if (scenario_id == null) {
        return scenarios;
    };
    let selected: Scenario[] = [];
    for (let scenario in scenarios) {
        if (scenario.id == scenario_id) {
            selected.push(scenario);
        };
    }
    ;
    if (selected.length() == 0) {
        baml.sys.panic("Unknown scenario id: " + scenario_id);
    };
    selected
}
