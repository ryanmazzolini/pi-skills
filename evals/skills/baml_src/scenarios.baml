function ScenarioSuites() -> ScenarioSuite[] {
    [
        ScenarioSuite { id: "research", scenarios: ResearchScenarios() },
        ScenarioSuite { id: "hci", scenarios: HciScenarios() },
        ScenarioSuite { id: "commit-simple", scenarios: CommitSimpleScenarios() },
        ScenarioSuite { id: "commit-pr", scenarios: CommitPrScenarios() },
    ]
}

function ValidateScenarioSuites(suites: ScenarioSuite[]) -> null {
    if (suites.length() == 0) {
        baml.sys.panic("At least one scenario suite is required.");
    };
    let suite_ids: string[] = [];
    let scenario_ids: string[] = [];
    for (let suite in suites) {
        if (suite.id.length() == 0) {
            baml.sys.panic("Scenario suite ids cannot be empty.");
        };
        if (suite_ids.includes(suite.id)) {
            baml.sys.panic("Duplicate scenario suite id: " + suite.id);
        };
        suite_ids.push(suite.id);
        ValidateScenarioSkillTarget(suite.scenarios);
        for (let scenario in suite.scenarios) {
            if (scenario_ids.includes(scenario.id)) {
                baml.sys.panic("Duplicate scenario id: " + scenario.id);
            };
            scenario_ids.push(scenario.id);
        }
        ;
    }
    ;
    null
}

function SelectScenarioSuites(
    suites: ScenarioSuite[],
    suite_id: string?,
    scenario_id: string?,
) -> ScenarioSuite[] {
    ValidateScenarioSuites(suites);
    if (suite_id != null && scenario_id != null) {
        baml.sys.panic("Choose either suite_id or scenario_id, not both.");
    };
    if (suite_id == null && scenario_id == null) {
        return suites;
    };

    let selected: ScenarioSuite[] = [];
    for (let suite in suites) {
        if (suite_id == suite.id) {
            selected.push(suite);
        } else if (scenario_id != null) {
            for (let scenario in suite.scenarios) {
                if (scenario.id == scenario_id) {
                    selected.push(suite);
                };
            }
            ;
        };
    }
    ;
    if (selected.length() == 0) {
        let selector = if (suite_id != null) {
            "suite id: " + suite_id
        } else {
            "scenario id: " + (scenario_id ?? "")
        };
        baml.sys.panic("Unknown " + selector);
    };
    selected
}
