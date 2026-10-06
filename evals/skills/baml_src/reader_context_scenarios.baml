// Four wording-only cases cover both artifacts, the short-output edge, and request deviations.
// Review inspection is supplied evidence: these do not test defect detection.
function PutawayFlowEvidence() -> string {
    #"
        Draft Description/summary: Choose the quantity first, then scan or enter a destination and explicitly confirm Put away. Previously, quantity details and bin entry shared one long sheet.

        Inspected change and approved intent: warehouse associates put received inventory into storage bins. Previously quantity controls, pallet details, and destination entry shared one long sheet, so associates worked through the amount and destination decisions together. The new quantity screen shows the recommended amount, available inventory, and existing quantity limits. The destination screen then shows the item, lot, carrying quantity, and suggested bin. Change amount returns to quantity selection without losing the entered bin.

        Scanning or typing a valid bin now enables Put away immediately, without a separate Enter or Tab validation step. Matching the suggested bin turns the field green and briefly shows a tick. This feedback confirms the match, not an inventory movement: the associate must still press Put away explicitly. Selecting a different bin retains the existing warning. Manual entry when no bin is suggested, item-setup correction warnings, blocked states, exceptions, and acknowledgement behavior are preserved. No backend changes.

        Completed inspection: all changed files and acceptance criteria checked; no introduced defects or open questions. All 2,504 tests, TypeScript, lint, and build passed; navigation and bin feedback were browser-checked. Local diff only; no PR or issue URL exists in this fixture.
    "#
}

function PutawayContextCriteria() -> SemanticCriterion[] {
    [
        SemanticCriterion {
            id: "self-contained-workflow",
            description: "The Description or review summary itself explains that associates are choosing how much inventory to put away and where, why the previous combined sheet was awkward, and how the two-screen flow works. It explains what the destination screen retains or displays and how Change amount preserves bin input. Merely naming a split into quantity and destination steps, or leaving the explanation to Details/findings, is insufficient. Judge understanding, not word count or exact wording.",
        },
        SemanticCriterion {
            id: "feedback-versus-mutation",
            description: "The reader can distinguish immediate bin validation or match feedback from recording inventory, which still requires explicit confirmation. Accept equivalent explanations without requiring specific keys, control labels, visual details, headings, or sentence order. The explanation establishes the frontend-only boundary and that existing warnings and safeguards remain; it need not enumerate each warning or fallback. Fail if it implies that scanning, validation, or match feedback alone records inventory, or invents changed backend behavior.",
        },
    ]
}

function CommitPrReaderContextScenarios() -> Scenario[] {
    let scenarios = [
        FramingScenario(
            "commit-pr-putaway-reader-context",
            "skills/commit/commit-pr/SKILL.md",
            "Revise the PR Description only.",
            PutawayFlowEvidence(),
            PutawayContextCriteria(),
        ),
    ];
    scenarios[0].skillReferences.push("skills/ai-authoring/explain-code/SKILL.md");
    scenarios
}

function CodeReviewReaderContextScenarios() -> Scenario[] {
    let criteria = PutawayContextCriteria();
    criteria
        .push(
            SemanticCriterion {
                id: "clean-review",
                description: "Returns a clean Approve recommendation consistent with supplied inspection and a self-contained change summary even though there are no findings. Does not invent defects, ask to repeat the completed investigation, or claim publication.",
            },
        );
    let scenarios = [
        FramingScenario(
            "code-review-putaway-reader-context",
            "skills/review/code-review/SKILL.md",
            "Write the final local-diff review from the completed inspection below, replacing the draft summary.",
            PutawayFlowEvidence(),
            criteria,
        ),
        FramingScenario(
            "code-review-simple-change-stays-short",
            "skills/review/code-review/SKILL.md",
            "Write the final local-diff review from this completed inspection.",
            #"
                Intent and inspected diff: people downloading the daily inventory CSV currently receive inventory.csv, which is hard to distinguish from downloads from other days. The change uses inventory-YYYY-MM-DD.csv, with the same warehouse-local report date already displayed in the page heading. Rows, permissions, and date selection are unchanged. The filename helper and its call site are the only code changes. A regression test proves the filename uses the warehouse-local date across a UTC midnight boundary. Required checks passed. No introduced defects or open questions; no PR or issue URL is available.
            "#,
            [
                SemanticCriterion {
                    id: "complete-but-proportional",
                    description: "Explains the download-identification problem, old versus dated filename, and warehouse-local report-date source in a compact connected explanation, without repeating them across boilerplate sections or expanding into a CSV tutorial. Preserves unchanged report contents and does not invent download-collision, timezone, or security defects. No minimum word or paragraph count.",
                },
                SemanticCriterion {
                    id: "clean-review",
                    description: "Returns exactly one Approve recommendation with no invented findings or confidence gaps. It does not omit the change explanation merely because approval is clean, or ask to rerun the supplied inspection.",
                },
            ],
        ),
        FramingScenario(
            "code-review-reports-request-deviations",
            "skills/review/code-review/SKILL.md",
            "Write the final local-diff review from this completed inspection.",
            #"
                Story 4821: the replenishment worklist compares remaining order demand with stock on hand, and planners use it to decide what to move into pick locations. Previously the demand side summed order-line counts as though every line used the item's stock unit, so for an item stocked in eaches with twelve eaches per case, two cases plus six eaches became eight units instead of 30 eaches. The story asks that demand and stock be compared in the same unit, with three acceptance criteria: (1) each CASE order line converts to the item's stock unit using the sale-unit size captured on the line; (2) when several item records carry different conversions, use the record with the lowest UUID so demand and stock agree; (3) the worklist is compared before and after against the live dashboard for two warehouses. The story says nothing about logging.

                Story comments: the author proposed reusing the stock side's existing most-recently-updated-record rule instead of the lowest UUID, because the stock side already uses it and switching both sides would widen the change; the product owner accepted this. The same thread defers the live-dashboard comparison to follow-up story 4836 after the author's own comparison found identical rows across six warehouses. The change does not claim to close story 4821.

                Inspected diff: the demand aggregator converts each CASE line by its captured sale-unit size, divides by the item's stock-unit size, and rounds once after grouping to six decimals to match the stock side. The conversion lookup previously embedded in the stock calculator is extracted into one shared lookup used by both sides; its query, parsing, and fallback behavior are unchanged apart from a log prefix. A warning for mixed sale units is replaced by a warning for lines lacking a usable conversion, and a new structured log line records the conversion source for each line so operators can trace that warning. Non-CASE lines keep their counts. Manual-order demand is already in stock units and is not converted again. Demand and stock still query item metadata separately, so a concurrent item sync can make one refresh inconsistent; the worklist already read separate snapshots before this change. The author's production preflight found no current lines where sale and stock units disagree.

                Completed inspection: all five changed files, the acceptance criteria, and existing callers of the extracted lookup were checked. Focused lint and the full test suite passed, and a focused reproduction confirmed the conversion arithmetic. No introduced defects or open questions. Local diff with the story text and comments supplied above; no URLs are available in this fixture.
            "#,
            [
                SemanticCriterion {
                    id: "request-versus-result",
                    description: "The summary states what story 4821 asked for and explicitly compares the result with it: the per-line conversion is delivered; the lowest-UUID rule was replaced by the most-recently-updated-record rule, with the stated reason and the product owner's acceptance; the live-dashboard comparison is deferred to story 4836 with its stated reason; and the conversion-source log line is an addition the story did not ask for. A review that describes the change without naming each deviation, or that presents the accepted deferral or accepted rule change as an introduced defect, fails. Accept any order, wording, or heading choice.",
                },
                SemanticCriterion {
                    id: "decisions-and-reviewer-context",
                    description: "The summary explains the trade-off behind reusing the existing conversion-selection rule rather than the lowest UUID, and tells the reviewer about the implementation details most likely to be misread as defects: the extracted shared lookup preserving the old query and fallback behavior, and the separate non-atomic snapshots that predate the change. Mentioning the replaced warning or the single rounding step is welcome but not required. These appear as context, not as findings or confidence gaps. Fail if the review invents a race, rounding, or logging defect from them.",
                },
                SemanticCriterion {
                    id: "clean-review",
                    description: "Returns exactly one Approve recommendation with no invented findings or confidence gaps. The accepted deferral, the accepted rule change, and the added log line do not lower the recommendation. It does not ask to rerun the supplied inspection or claim publication.",
                },
            ],
        ),
    ];
    for (let scenario in scenarios) {
        scenario.skillReferences.push("skills/ai-authoring/explain-code/SKILL.md");
    }
    ;
    scenarios
}
