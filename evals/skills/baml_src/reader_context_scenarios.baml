// Three wording-only cases cover both artifacts and the short-output edge.
// Review inspection is supplied evidence: these do not test defect detection.
function ShelvingFlowEvidence() -> string {
    #"
        Draft Description/summary: Choose the quantity first, then scan or enter a destination and explicitly confirm Shelve. Previously, quantity details and shelf entry shared one long sheet.

        Inspected change and approved intent: library staff shelve returned books on library shelves. Previously quantity controls, shelf details, and destination entry shared one long sheet, so staff worked through the amount and destination decisions together. The new quantity screen shows the recommended amount, available books, and existing quantity limits. The destination screen then shows the item, copy, carrying quantity, and suggested shelf. Change amount returns to quantity selection without losing the entered shelf.

        Scanning or typing a valid shelf now enables Shelve immediately, without a separate Enter or Tab validation step. Matching the suggested shelf turns the field green and briefly shows a tick. This feedback confirms the match, not a shelving action: the staff member must still press Shelve explicitly. Selecting a different shelf retains the existing warning. Manual entry when no shelf is suggested, item-setup correction warnings, blocked states, exceptions, and acknowledgement behavior are preserved. No backend changes.

        Completed inspection: all changed files and acceptance criteria checked; no introduced defects or open questions. All 684 tests, TypeScript, lint, and build passed; navigation and shelf feedback were browser-checked. Local diff only; no PR or issue URL exists in this fixture.
    "#
}

function ShelvingContextCriteria() -> SemanticCriterion[] {
    [
        SemanticCriterion {
            id: "self-contained-workflow",
            description: "The Description or review summary itself explains that staff are choosing how many books to shelve and where, why the previous combined sheet was awkward, and how the two-screen flow works. It explains what the destination screen retains or displays and how Change amount preserves shelf input. Merely naming a split into quantity and destination steps, or leaving the explanation to Details/findings, is insufficient. Judge understanding, not word count or exact wording.",
        },
        SemanticCriterion {
            id: "feedback-versus-mutation",
            description: "The reader can distinguish immediate shelf validation or match feedback from recording book locations, which still requires explicit confirmation. Accept equivalent explanations without requiring specific keys, control labels, visual details, headings, or sentence order. The explanation establishes the frontend-only boundary and that existing warnings and safeguards remain; it need not enumerate each warning or fallback. Fail if it implies that scanning, validation, or match feedback alone records book locations, or invents changed backend behavior.",
        },
    ]
}

function CommitPrReaderContextScenarios() -> Scenario[] {
    let scenarios = [
        FramingScenario(
            "commit-pr-shelving-reader-context",
            "skills/commit/commit-pr/SKILL.md",
            "Revise the PR Description only.",
            ShelvingFlowEvidence(),
            ShelvingContextCriteria(),
        ),
    ];
    scenarios[0].skillReferences.push("skills/ai-authoring/explain-code/SKILL.md");
    scenarios
}

function CodeReviewReaderContextScenarios() -> Scenario[] {
    let criteria = ShelvingContextCriteria();
    criteria
        .push(
            SemanticCriterion {
                id: "clean-review",
                description: "Returns a clean Approve recommendation consistent with supplied inspection and a self-contained change summary even though there are no findings. Does not invent defects, ask to repeat the completed investigation, or claim publication.",
            },
        );
    let scenarios = [
        FramingScenario(
            "code-review-shelving-reader-context",
            "skills/review/code-review/SKILL.md",
            "Write the final local-diff review from the completed inspection below, replacing the draft summary.",
            ShelvingFlowEvidence(),
            criteria,
        ),
        FramingScenario(
            "code-review-simple-change-stays-short",
            "skills/review/code-review/SKILL.md",
            "Write the final local-diff review from this completed inspection.",
            #"
                Intent and inspected diff: people downloading the daily holdings CSV currently receive holdings.csv, which is hard to distinguish from downloads from other days. The change uses holdings-YYYY-MM-DD.csv, with the same branch-local report date already displayed in the page heading. Rows, permissions, and date selection are unchanged. The filename helper and its call site are the only code changes. A regression test proves the filename uses the branch-local date across a UTC midnight boundary. Required checks passed. No introduced defects or open questions; no PR or issue URL is available.
            "#,
            [
                SemanticCriterion {
                    id: "complete-but-proportional",
                    description: "Explains the download-identification problem, old versus dated filename, and branch-local report-date source in a compact connected explanation, without repeating them across template sections or expanding into a CSV tutorial. Preserves unchanged report contents and does not invent download-collision, timezone, or security defects. No minimum word or paragraph count.",
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
