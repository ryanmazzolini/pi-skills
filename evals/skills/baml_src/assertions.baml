function EvaluateHardAssertions(
    scenario: Scenario,
    calls: ToolCallRecord[],
) -> HardAssertionResult[] {
    let results: HardAssertionResult[] = [];
    for (let assertion in scenario.hardAssertions) {
        results.push(EvaluateHardAssertion(assertion, calls));
    }
    ;
    results
}

function EvaluateHardAssertion(
    assertion: HardAssertion,
    calls: ToolCallRecord[],
) -> HardAssertionResult {
    match (assertion) {
        let value: ToolCountAssertion => EvaluateToolCount(value, calls),
        let value: ToolBeforeAssertion => EvaluateToolBefore(value, calls),
        let value: QueryBatchAssertion => EvaluateQueryBatch(value, calls),
        let value: CommandAllowlistAssertion => EvaluateCommandAllowlist(value, calls),
        let value: UrlCountAssertion => EvaluateUrlCount(value, calls),
    }
}

function ToolArgumentText(call: ToolCallRecord) -> string {
    let queries: string[] = call.queries ?? [];
    let urls: string[] = call.urls ?? [];
    [
        call.path ?? "",
        call.query ?? "",
        queries.join("\n"),
        call.url ?? "",
        urls.join("\n"),
        call.command ?? "",
        call.content ?? "",
    ]
    .join("\n")
}

function CommandHasMatchingSegment(
    command: string,
    included_text: string,
    excluded_text: string,
) -> bool {
    for (let and_group in command.split("&&")) {
        for (let segment in and_group.split(";")) {
            let includes_required = segment.includes(included_text);
            let includes_excluded
                = excluded_text.length() > 0
                && segment.includes(excluded_text);
            if (includes_required && !includes_excluded) {
                return true;
            };
        }
        ;
    }
    ;
    false
}

function EvaluateToolCount(
    assertion: ToolCountAssertion,
    calls: ToolCallRecord[],
) -> HardAssertionResult {
    let matching: ToolCallRecord[] = [];
    let from_turn = assertion.fromTurn ?? -1;
    let argument_text = assertion.argumentIncludes ?? "";
    for (let call in calls) {
        let call_arguments = ToolArgumentText(call);
        let after_turn = call.turn >= from_turn;
        let argument_matches = argument_text.length() == 0 || call_arguments.includes(argument_text);
        let segment_matches = if (assertion.commandSegmentIncludes == null) {
            true
        } else {
            CommandHasMatchingSegment(
                call.command ?? "",
                assertion.commandSegmentIncludes ?? "",
                assertion.commandSegmentExcludes ?? "",
            )
        };
        if (call.tool == assertion.tool && after_turn && argument_matches && segment_matches) {
            matching.push(call);
        };
    }
    ;
    let minimum = assertion.min ?? 0;
    let maximum = assertion.max ?? 2147483647;
    let passed = matching.length() >= minimum && matching.length() <= maximum;
    let expected: string[] = [];
    if (assertion.min != null) {
        expected.push("at least " + assertion.min.to_string());
    };
    if (assertion.max != null) {
        expected.push("at most " + assertion.max.to_string());
    };
    let scope = if (from_turn < 0) {
        "all turns"
    } else {
        "turn " + (from_turn + 1).to_string() + " onward"
    };
    let evidence = [
        `Observed ${matching.length()} matching ${assertion.tool} call(s) across ${scope}; expected ${expected.join(" and ")}.`,
    ];
    for (let call in matching) {
        evidence
            .push(`tool call ${call.index} (turn ${call.turn + 1}): ${baml.json.to_string(call)}`);
    }
    ;
    HardAssertionResult { description: assertion.description, passed: passed, evidence: evidence }
}

function EvaluateToolBefore(
    assertion: ToolBeforeAssertion,
    calls: ToolCallRecord[],
) -> HardAssertionResult {
    let required_index = -1;
    let later_index = -1;
    for (let call in calls) {
        if (required_index < 0 && call.tool == assertion.tool) {
            required_index = call.index;
        };
        if (later_index < 0 && assertion.beforeTools.includes(call.tool)) {
            later_index = call.index;
        };
    }
    ;
    let passed = required_index >= 0 && (later_index < 0 || required_index < later_index);
    HardAssertionResult {
        description: assertion.description,
        passed: passed,
        evidence: [
            if (required_index < 0) {
                `No ${assertion.tool} call was observed.`
            } else {
                `First ${assertion.tool} call: tool call ${required_index}.`
            },
            if (later_index < 0) {
                `No ${assertion.beforeTools.join("/")} call was observed.`
            } else {
                `First ${assertion.beforeTools.join("/")} call: tool call ${later_index}.`
            },
        ],
    }
}

function DistinctCount(values: string[]) -> int {
    let seen: string[] = [];
    for (let value in values) {
        if (!seen.includes(value)) {
            seen.push(value);
        };
    }
    ;
    seen.length()
}

function EvaluateQueryBatch(
    assertion: QueryBatchAssertion,
    calls: ToolCallRecord[],
) -> HardAssertionResult {
    let matching: ToolCallRecord[] = [];
    for (let call in calls) {
        if (call.tool == assertion.tool) {
            matching.push(call);
        };
    }
    ;
    let queries: string[] = if (matching.length() == 0) {
        []
    } else {
        matching[0].queries ?? []
    };
    let distinct = DistinctCount(queries);
    let passed = matching.length() >= 1
        && queries.length() >= assertion.minQueries
        && queries.length() <= assertion.maxQueries
        && distinct == queries.length();
    let evidence = [
        `Observed ${matching.length()} ${assertion.tool} call(s).`,
        `First call contained ${queries.length()} queries (${distinct} distinct); expected ${assertion.minQueries}–${assertion.maxQueries} distinct queries in one call.`,
    ];
    if (matching.length() > 0) {
        evidence.push(`tool call ${matching[0].index}: ${baml.json.to_string(matching[0])}`);
    };
    HardAssertionResult { description: assertion.description, passed: passed, evidence: evidence }
}

function EvaluateCommandAllowlist(
    assertion: CommandAllowlistAssertion,
    calls: ToolCallRecord[],
) -> HardAssertionResult {
    let unexpected: ToolCallRecord[] = [];
    for (let call in calls) {
        if (
            call.tool == assertion.tool
                && !assertion.allowedCommands.includes((call.command ?? "").trim())
        ) {
            unexpected.push(call);
        };
    }
    ;
    let evidence = [`Observed ${unexpected.length()} ${assertion.tool} command(s) outside the exact allowlist.`];
    for (let call in unexpected) {
        evidence.push(`tool call ${call.index}: ${call.command ?? ""}`);
    }
    ;
    HardAssertionResult {
        description: assertion.description,
        passed: unexpected.length() == 0,
        evidence: evidence,
    }
}

function EvaluateUrlCount(
    assertion: UrlCountAssertion,
    calls: ToolCallRecord[],
) -> HardAssertionResult {
    let matching: ToolCallRecord[] = [];
    let url_count = 0;
    for (let call in calls) {
        if (call.tool == assertion.tool) {
            matching.push(call);
            let urls: string[] = call.urls ?? [];
            if (urls.length() > 0) {
                url_count += urls.length();
            } else if (call.url != null) {
                url_count += 1;
            };
        };
    }
    ;
    let minimum = assertion.min ?? 0;
    let maximum = assertion.max ?? 2147483647;
    let passed = url_count >= minimum && url_count <= maximum;
    let expected: string[] = [];
    if (assertion.min != null) {
        expected.push("at least " + assertion.min.to_string());
    };
    if (assertion.max != null) {
        expected.push("at most " + assertion.max.to_string());
    };
    let evidence = [
        `Observed ${url_count} URL entry or entries across ${matching.length()} ${assertion.tool} call(s); expected ${expected.join(" and ")}.`,
    ];
    for (let call in matching) {
        evidence.push(`tool call ${call.index}: ${baml.json.to_string(call)}`);
    }
    ;
    HardAssertionResult { description: assertion.description, passed: passed, evidence: evidence }
}

function AllHardAssertionsPass(results: HardAssertionResult[]) -> bool {
    for (let result in results) {
        if (!result.passed) {
            return false;
        };
    }
    ;
    true
}
