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
            ToolCountAssertion { kind: "tool-count", tool: "bash", max: 0, description: "Wording-only review does not run shell commands." },
            ToolCountAssertion { kind: "tool-count", tool: "edit", max: 0, description: "Wording-only review does not edit files." },
            ToolCountAssertion { kind: "tool-count", tool: "write", max: 0, description: "Wording-only review does not write files." },
            ToolCountAssertion { kind: "tool-count", tool: "public_action", max: 0, description: "Wording-only review does not publish before approval." },
        ],
        semanticCriteria: criteria,
    }
}

function PlanningLockDraftEvidence() -> string {
    #"
        Current PR title: [sc-65850] Acquire putaway planning locks once per operation
        Current Description: Acquire planning locks once at the outer operation, before updating putaway suggestions and allocations.

        Previously, inventory updates could hold an allocation row lock while waiting for the planning lock. Suggestion refresh could hold the planning lock while waiting for the same allocation row. The change acquires planning locks before allocation changes on both paths and requires inner writers to use the supplied scope, rather than independently acquire planning locks. This removes that lock-order cycle. Warehouse-wide contention and competing destination suggestions remain separate work. The selection algorithm and UI are unchanged.
    "#
}

function QuantityDraftEvidence() -> string {
    #"
        Current title: [sc-65845] Convert observed stock quantities to base units
        Current Description: Convert NetSuite inventory balances from stock units to LDS base units before saving them, using the unit supplied with the observation when available.

        LDS previously stored an observation of 96 cases of 12 as 96 base units. Putaway consequently displayed 8 cases instead of 96. The change stores 1,152 base units and displays 96 cases. Source-unit evidence takes precedence when supplied; absent/null units retain the existing fallback. Raw quantities and unit evidence are retained together so replay does not double-convert. The UI code and API shape are unchanged; the fix is in inventory normalization, not a UI rewrite. Producer enrichment and deployment are separate work.
    "#
}

function ItemApiContextScenario(id: string, skill_path: string, request: string) -> Scenario {
    FramingScenario(
        id,
        skill_path,
        request,
        #"
            Current title/subject: Prepare searchable putaway item cards
            Current body: Add text and inventory-item filters before pagination. Expose shared item identity and pallet facts.

            Approved context: putaway is moving from source-task cards to an item-first workflow. Warehouse associates will find an item, then choose its lot and staging bin. The existing cards display item and pallet details and let associates correct pallet configuration under More info. The new grouped API currently lacks search filters and shared item details needed to retain those controls.

            This backend change adds text and inventory-item filters before pagination and shared item identity, pallet configuration, footprint, and configuration errors to item groups. Matching groups retain all lot/source choices. Source-task quantities, restrictions, and destination suggestions are unchanged. The frontend integration is separate and not delivered by this change. No planner changes or persistence mutations.
        "#,
        [
            SemanticCriterion { id: "concrete-title", description: "The title or subject identifies search and item/pallet details in the putaway API, rather than only promising to prepare item cards. Accept equivalent wording and normal artifact conventions; no exact phrase or ordering is required. Do not claim the frontend workflow ships in this change." },
            SemanticCriterion { id: "context-and-contribution", description: "The body explains the move to finding an item before choosing its lot/source and connects the API additions to that workflow and retaining existing item details/correction controls. Merely stating that the API lacks filters or listing fields is insufficient. It distinguishes the backend contribution from later frontend integration and preserves source-specific choices and behavior. Judge understanding across the body, not headings, word count, first sentence, exact labels, or exhaustive field lists." },
        ],
    )
}

function CommitPrFramingScenarios() -> Scenario[] {
    [
        ItemApiContextScenario("commit-pr-item-api-context", "skills/commit/commit-pr/SKILL.md", "Revise the PR title and Description only."),
        FramingScenario(
            "commit-pr-reframe-planning-lock-draft",
            "skills/commit/commit-pr/SKILL.md",
            "Revise the PR title and Description only.",
            PlanningLockDraftEvidence(),
            [
                SemanticCriterion { id: "title-explains-why", description: "The title identifies the putaway lock-order correction or deadlock prevention concretely. Accept either the technical change or the problem solved; do not require exact wording or ordering." },
                SemanticCriterion { id: "opening-explains-why", description: "The Description connects the deadlock between inventory updates and suggestion refresh to the previous inverse ordering and the changed ordering. Naming lock acquisition alone is insufficient. Judge the explanation as a whole, not its first sentence or sentence order." },
                SemanticCriterion { id: "bounded-benefit", description: "The draft does not claim to eliminate all deadlocks, warehouse-wide contention, or competing destination suggestions. It does not claim UI or selection changes." },
            ],
        ),
        FramingScenario(
            "commit-pr-reframe-quantity-draft",
            "skills/commit/commit-pr/SKILL.md",
            "Revise the PR title and Description only.",
            QuantityDraftEvidence(),
            [
                SemanticCriterion { id: "title-explains-why", description: "The title identifies the stock-unit quantity correction, whether expressed as corrected putaway quantities or a concrete inventory conversion fix. It need not lead with the downstream benefit." },
                SemanticCriterion { id: "opening-explains-why", description: "The Description connects incorrect inventory normalization to understated putaway quantities and explains how the change corrects them. The supplied example or an equivalent explanation makes the unit mismatch understandable. Judge context and result across the Description, without requiring either in a specific sentence." },
                SemanticCriterion { id: "bounded-benefit", description: "The draft does not claim a UI rewrite, API change, deployed fix, or completed producer enrichment." },
            ],
        ),
    ]
}

function CommitSimpleFramingScenarios() -> Scenario[] {
    [
        ItemApiContextScenario("commit-simple-item-api-context", "skills/commit/commit-simple/SKILL.md", "Revise the Conventional Commit subject and body for this backend change only."),
        FramingScenario(
            "commit-simple-reframe-normalization-draft",
            "skills/commit/commit-simple/SKILL.md",
            "Revise the Conventional Commit subject and body for the complete normalization fix described below.",
            "Current subject: fix(putaway): normalize balances using observed units\nCurrent body: Prefer source stock-unit evidence when normalizing inventory observations.\n\n" + QuantityDraftEvidence(),
            [
                SemanticCriterion { id: "subject-explains-why", description: "The Conventional Commit subject identifies the stock-unit normalization correction or the incorrect putaway quantities it fixes. Accept a concrete backend change without requiring a downstream UI benefit in the subject." },
                SemanticCriterion { id: "body-explains-why", description: "The body explains the previous incorrect quantity and connects source-unit conversion and raw evidence to correct putaway quantities and safe replay. Judge the connected explanation, not sentence order or whether its opening independently states the benefit." },
                SemanticCriterion { id: "bounded-benefit", description: "The message does not claim changed UI code, completed producer enrichment, or deployment." },
            ],
        ),
        FramingScenario(
            "commit-simple-frame-preparatory-refactor",
            "skills/commit/commit-simple/SKILL.md",
            "Revise the Conventional Commit subject and body for this staged commit only.",
            #"
                Current subject: refactor(putaway): extract planning target normalization
                Current body: Move duplicated planning target normalization into one helper.

                The broader ticket addresses deadlocks during inventory updates. This staged commit only extracts the identical warehouse-target normalization from observation and refresh into a shared helper. It changes no lock ordering or runtime behavior. The immediate next commit will change both callers' planning-lock acquisition order. Sharing normalization first prevents the two target lists from drifting during that edit and lets reviewers check equivalence separately. Deadlocks remain possible until the later ordering fix.
            "#,
            [
                SemanticCriterion { id: "subject-names-preparation", description: "The refactor subject identifies shared planning-target normalization or consistent target selection concretely. Extracting the named helper is a valid description of this commit; a vague promise to prepare for later work is not sufficient. It does not claim this commit prevents deadlocks." },
                SemanticCriterion { id: "body-bounds-contribution", description: "The body connects the shared normalization to the upcoming lock-ordering change and avoiding target-list drift. It preserves that current lock ordering and runtime behavior are unchanged and does not claim the whole ticket's deadlock fix. No particular opening or sentence order is required." },
            ],
        ),
    ]
}

function ShortcutFramingScenarios() -> Scenario[] {
    [
        ItemApiContextScenario("shortcut-item-api-context", "skills/shortcut/shortcut/SKILL.md", "Draft the Shortcut title and description for this backend story. The supplied backend change defines the approved acceptance boundary; it has not landed yet."),
        FramingScenario(
            "shortcut-reframe-quantity-title",
            "skills/shortcut/shortcut/SKILL.md",
            "Revise only the Shortcut story title. The supplied implementation has not landed yet; the story's acceptance boundary is the corrected stock-case quantities. Leave the description and acceptance criteria alone.",
            QuantityDraftEvidence(),
            [
                SemanticCriterion { id: "title-explains-why", description: "The title identifies the stock-unit quantity correction or the incorrect putaway quantities it fixes within the story's acceptance boundary. A concrete backend correction is valid; it must not suggest the fix is limited to a UI-code change." },
                SemanticCriterion { id: "title-only-boundary", description: "The agent proposes only a title, optionally with a brief approval question. It does not rewrite the description or acceptance criteria, expand the acceptance boundary to producer enrichment, or claim publication." },
            ],
        ),
        FramingScenario(
            "shortcut-frame-backend-preparation",
            "skills/shortcut/shortcut/SKILL.md",
            "Revise only this Shortcut story title. Leave its description and acceptance criteria alone.",
            #"
                Current title: Add optional stock-unit fields to the observation contract

                This story adds optional stock-unit evidence to the bridge contract for the next LDS ingestion change. The fields must remain optional so producers without enrichment remain compatible during rollout. This story's acceptance boundary is the bridge contract and compatibility; LDS quantity conversion and producer enrichment are separate stories. This story alone does not correct displayed putaway quantities.
            "#,
            [
                SemanticCriterion { id: "title-names-technical-purpose", description: "The title identifies optional stock-unit evidence in the observation contract concretely. That backend capability is a valid result without reframing it as preparation for LDS ingestion; it must not invent a directly delivered UI benefit." },
                SemanticCriterion { id: "title-only-boundary", description: "The agent proposes only a title, optionally with a brief approval question. It does not rewrite the description or criteria, claim corrected displayed quantities, or claim publication." },
            ],
        ),
    ]
}
