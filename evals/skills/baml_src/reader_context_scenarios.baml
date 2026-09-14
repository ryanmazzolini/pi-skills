// Three wording-only cases cover both artifacts and the short-output edge.
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
    ];
    for (let scenario in scenarios) {
        scenario.skillReferences.push("skills/ai-authoring/explain-code/SKILL.md");
    }
    ;
    scenarios
}
