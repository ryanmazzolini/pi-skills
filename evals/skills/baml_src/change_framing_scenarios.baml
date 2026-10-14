// Wording-only replays isolate framing from the full commit/PR workflow scenarios.
// Inputs deliberately retain mechanism-first drafts; criteria are judge-only.
function FramingScenario(
    id: string,
    skill_path: string,
    request: string,
    evidence: string,
    criteria: SemanticCriterion[],
) -> Scenario {
    Scenario {
        id: id,
        title: id,
        skillPath: skill_path,
        skillReferences: ["skills/ai-authoring/clear-writing/SKILL.md"],
        turns: [
            "This is a wording-only review of the supplied draft, not a commit or publication workflow. The evidence below is complete for this request; no repository inspection or new validation is needed. "
                + request
                + " Return the proposed text for approval. Do not edit files or publish anything.\n\n"
                + evidence,
        ],
        files: {},
        searchResponses: [],
        fetchResponses: {},
        bashResponses: [],
        maxToolCalls: 4,
        hardAssertions: [
            ToolCountAssertion {
                kind: "tool-count",
                tool: "bash",
                max: 0,
                description: "Wording-only review does not run shell commands.",
            },
            ToolCountAssertion {
                kind: "tool-count",
                tool: "edit",
                max: 0,
                description: "Wording-only review does not edit files.",
            },
            ToolCountAssertion {
                kind: "tool-count",
                tool: "write",
                max: 0,
                description: "Wording-only review does not write files.",
            },
            ToolCountAssertion {
                kind: "tool-count",
                tool: "public_action",
                max: 0,
                description: "Wording-only review does not publish before approval.",
            },
        ],
        semanticCriteria: criteria,
    }
}

function PlanningLockDraftEvidence() -> string {
    "
        Current PR title: [sc-10101] Acquire shelving planning locks once per operation
        Current Description: Acquire planning locks once at the outer operation, before updating shelving suggestions and holds.

        Previously, holdings updates could hold a hold row lock while waiting for the planning lock. Hold-queue refresh could hold the planning lock while waiting for the same hold row. The change acquires planning locks before hold changes on both paths and requires inner writers to use the supplied scope, rather than independently acquire planning locks. This removes that lock-order cycle. Library-wide contention and competing destination suggestions remain separate work. The selection algorithm and UI are unchanged.
    "
}

function QuantityDraftEvidence() -> string {
    "
        Current title: [sc-10102] Convert observed set quantities to single volumes
        Current Description: Convert catalog vendor holdings balances from set units to lending service single volumes before saving them, using the unit supplied with the observation when available.

        The lending service previously stored an observation of 24 sets of 6 as 24 single volumes. Shelving consequently displayed 4 sets instead of 24. The change stores 144 single volumes and displays 24 sets. Source-unit evidence takes precedence when supplied; absent/null units retain the existing fallback. Raw quantities and unit evidence are retained together so replay does not double-convert. The UI code and API shape are unchanged; the fix is in holdings normalization, not a UI rewrite. Branch feed metadata additions and deployment are separate work.
    "
}

function ItemApiContextScenario(id: string, skill_path: string, request: string) -> Scenario {
    FramingScenario(
        id,
        skill_path,
        request,
        "
            Current title/subject: Prepare searchable shelving item cards
            Current body: Add text and catalog-item filters before pagination. Expose shared item identity and shelf facts.

            Approved context: shelving is moving from source-task cards to an item-first workflow. Library staff will find an item, then choose its copy and return cart. The existing cards display item and shelf details and let staff correct shelf setup under More info. The new grouped API currently lacks search filters and shared item details needed to retain those controls.

            This backend change adds text and catalog-item filters before pagination and shared item identity, shelf setup, footprint, and configuration errors to item groups. Matching groups retain all copy/source choices. Source-task quantities, restrictions, and destination suggestions are unchanged. The frontend integration is separate and not delivered by this change. No planner changes or persistence mutations.
        ",
        [
            SemanticCriterion {
                id: "concrete-title",
                description: "The title or subject names a concrete change that this backend work delivers, such as adding search or shared item details to shelving item groups. Any concrete wording passes; it need not mention shelf setup, the API, or every added field. It fails if it only promises to prepare or support item cards, or claims the frontend workflow ships in this change.",
            },
            SemanticCriterion {
                id: "context-and-contribution",
                description: "The body explains the move to finding an item before choosing its copy/source and connects the API additions to that workflow and retaining existing item details/correction controls. Merely stating that the API lacks filters or listing fields is insufficient. It distinguishes the backend contribution from later frontend integration and preserves source-specific choices and behavior. Judge understanding across the body, not headings, word count, first sentence, exact labels, or exhaustive field lists.",
            },
        ],
    )
}

function CommitPrFramingScenarios() -> Scenario[] {
    [
        ItemApiContextScenario(
            "commit-pr-item-api-context",
            "skills/commit/commit-pr/SKILL.md",
            "Revise the PR title and Description only.",
        ),
        FramingScenario(
            "commit-pr-reframe-planning-lock-draft",
            "skills/commit/commit-pr/SKILL.md",
            "Revise the PR title and Description only.",
            PlanningLockDraftEvidence(),
            [
                SemanticCriterion {
                    id: "title-explains-why",
                    description: "The title identifies the shelving lock-order correction or deadlock prevention concretely. Accept either the technical change or the problem solved; do not require exact wording or ordering.",
                },
                SemanticCriterion {
                    id: "opening-explains-why",
                    description: "The Description connects the deadlock between holdings updates and hold-queue refresh to the previous inverse ordering and the changed ordering. Naming lock acquisition alone is insufficient. Judge the explanation as a whole, not its first sentence or sentence order.",
                },
                SemanticCriterion {
                    id: "bounded-benefit",
                    description: "The draft does not claim to eliminate all deadlocks, library-wide contention, or competing destination suggestions. It does not claim UI or selection changes.",
                },
            ],
        ),
        FramingScenario(
            "commit-pr-reframe-quantity-draft",
            "skills/commit/commit-pr/SKILL.md",
            "Revise the PR title and Description only.",
            QuantityDraftEvidence(),
            [
                SemanticCriterion {
                    id: "title-explains-why",
                    description: "The title identifies the set-unit quantity correction, whether expressed as corrected shelving quantities or a concrete holdings conversion fix. It need not lead with the downstream benefit.",
                },
                SemanticCriterion {
                    id: "opening-explains-why",
                    description: "The Description connects incorrect holdings normalization to understated shelving quantities and explains how the change corrects them. The supplied example or an equivalent explanation makes the unit mismatch understandable. Judge context and result across the Description, without requiring either in a specific sentence.",
                },
                SemanticCriterion {
                    id: "bounded-benefit",
                    description: "The draft does not claim a UI rewrite, API change, deployed fix, or completed branch feed metadata additions.",
                },
            ],
        ),
    ]
}

function CommitSimpleFramingScenarios() -> Scenario[] {
    [
        ItemApiContextScenario(
            "commit-simple-item-api-context",
            "skills/commit/commit-simple/SKILL.md",
            "Revise the Conventional Commit subject and body for this backend change only.",
        ),
        FramingScenario(
            "commit-simple-reframe-normalization-draft",
            "skills/commit/commit-simple/SKILL.md",
            "Revise the Conventional Commit subject and body for the complete normalization fix described below.",
            "Current subject: fix(shelving): normalize balances using observed units\nCurrent body: Prefer source set-unit evidence when normalizing holdings snapshots.\n\n"
                + QuantityDraftEvidence(),
            [
                SemanticCriterion {
                    id: "subject-explains-why",
                    description: "The Conventional Commit subject identifies the set-unit normalization correction or the incorrect shelving quantities it fixes. Accept a concrete backend change without requiring a downstream UI benefit in the subject.",
                },
                SemanticCriterion {
                    id: "body-explains-why",
                    description: "The body explains the previous incorrect quantity and connects source-unit conversion and raw evidence to correct shelving quantities and safe replay. Judge the connected explanation, not sentence order or whether its opening independently states the benefit.",
                },
                SemanticCriterion {
                    id: "bounded-benefit",
                    description: "The message does not claim changed UI code, completed branch feed metadata additions, or deployment.",
                },
            ],
        ),
        FramingScenario(
            "commit-simple-frame-preparatory-refactor",
            "skills/commit/commit-simple/SKILL.md",
            "Revise the Conventional Commit subject and body for this staged commit only.",
            "
                Current subject: refactor(shelving): extract planning target normalization
                Current body: Move duplicated planning target normalization into one helper.

                The broader ticket addresses deadlocks during holdings updates. This staged commit only extracts the identical branch-target normalization from observation and refresh into a shared helper. It changes no lock ordering or runtime behavior. The immediate next commit will change both callers' planning-lock acquisition order. Sharing normalization first prevents the two target lists from drifting during that edit and lets reviewers check equivalence separately. Deadlocks remain possible until the later ordering fix.
            ",
            [
                SemanticCriterion {
                    id: "subject-names-preparation",
                    description: "The refactor subject identifies shared planning-target normalization or consistent target selection concretely. Extracting the named helper is a valid description of this commit; a vague promise to prepare for later work is not sufficient. It does not claim this commit prevents deadlocks.",
                },
                SemanticCriterion {
                    id: "body-bounds-contribution",
                    description: "The body connects the shared normalization to the upcoming lock-ordering change and avoiding target-list drift. It preserves that current lock ordering and runtime behavior are unchanged and does not claim the whole ticket's deadlock fix. No particular opening or sentence order is required.",
                },
            ],
        ),
    ]
}

function ShortcutFramingScenarios() -> Scenario[] {
    [
        ItemApiContextScenario(
            "shortcut-item-api-context",
            "skills/shortcut/shortcut/SKILL.md",
            "Draft the Shortcut title and description for this backend story. The supplied backend change defines the approved acceptance boundary; it has not landed yet.",
        ),
        FramingScenario(
            "shortcut-reframe-quantity-title",
            "skills/shortcut/shortcut/SKILL.md",
            "Revise only the Shortcut story title. The supplied implementation has not landed yet; the story's acceptance boundary is the corrected boxed-set quantities. Leave the description and acceptance criteria alone.",
            QuantityDraftEvidence(),
            [
                SemanticCriterion {
                    id: "title-explains-why",
                    description: "The title identifies the set-unit quantity correction or the incorrect shelving quantities it fixes within the story's acceptance boundary. A concrete backend correction is valid; it must not suggest the fix is limited to a UI-code change.",
                },
                SemanticCriterion {
                    id: "title-only-boundary",
                    description: "The agent proposes only a title, optionally with a brief approval question. It does not rewrite the description or acceptance criteria, expand the acceptance boundary to branch feed metadata additions, or claim publication.",
                },
            ],
        ),
        FramingScenario(
            "shortcut-frame-backend-preparation",
            "skills/shortcut/shortcut/SKILL.md",
            "Revise only this Shortcut story title. Leave its description and acceptance criteria alone.",
            "
                Current title: Add optional set-unit fields to the observation contract

                This story adds optional set-unit evidence to the bridge contract for the next lending service ingestion change. The fields must remain optional so branch feeds without added metadata remain compatible during rollout. This story's acceptance boundary is the bridge contract and compatibility; lending service quantity conversion and branch feed metadata additions are separate stories. This story alone does not correct displayed shelving quantities.
            ",
            [
                SemanticCriterion {
                    id: "title-names-technical-purpose",
                    description: "The title identifies optional set-unit evidence in the observation contract concretely. That backend capability is a valid result without reframing it as preparation for lending service ingestion; it must not invent a directly delivered UI benefit.",
                },
                SemanticCriterion {
                    id: "title-only-boundary",
                    description: "The agent proposes only a title, optionally with a brief approval question. It does not rewrite the description or criteria, claim corrected displayed quantities, or claim publication.",
                },
            ],
        ),
    ]
}
