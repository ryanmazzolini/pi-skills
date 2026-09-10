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

function CommitPrFramingScenarios() -> Scenario[] {
    [
        FramingScenario(
            "commit-pr-reframe-planning-lock-draft",
            "skills/commit/commit-pr/SKILL.md",
            "Revise the PR title and Description only.",
            PlanningLockDraftEvidence(),
            [
                SemanticCriterion { id: "title-explains-why", description: "The title leads with preventing the putaway lock-order deadlock, not acquiring locks once or centralizing ownership. A mechanism may follow the purpose. Do not require exact wording." },
                SemanticCriterion { id: "opening-explains-why", description: "The opening sentence independently explains the deadlock problem between inventory updates and suggestion refresh, or its prevention. Describing the two paths waiting on each other is sufficient; a problem-first opening need not use the word 'prevents'. Merely naming lock acquisition or ordering without the consequence is insufficient. The Description also explains the previous inverse ordering and the changed ordering." },
                SemanticCriterion { id: "bounded-benefit", description: "The draft does not claim to eliminate all deadlocks, warehouse-wide contention, or competing destination suggestions. It does not claim UI or selection changes." },
            ],
        ),
        FramingScenario(
            "commit-pr-reframe-quantity-draft",
            "skills/commit/commit-pr/SKILL.md",
            "Revise the PR title and Description only.",
            QuantityDraftEvidence(),
            [
                SemanticCriterion { id: "title-explains-why", description: "The title leads with correct putaway quantities or preventing understated stock-case quantities, not conversion to base units." },
                SemanticCriterion { id: "opening-explains-why", description: "The Description's first sentence independently states the quantity correction or failure prevented. It does not merely start with conversion mechanics and rely on a later sentence for the why. The body preserves the example: 96 cases of 12 were displayed as 8; 1,152 base units now display as 96 cases." },
                SemanticCriterion { id: "bounded-benefit", description: "The draft does not claim a UI rewrite, API change, deployed fix, or completed producer enrichment." },
            ],
        ),
    ]
}

function CommitSimpleFramingScenarios() -> Scenario[] {
    [
        FramingScenario(
            "commit-simple-reframe-normalization-draft",
            "skills/commit/commit-simple/SKILL.md",
            "Revise the Conventional Commit subject and body for the complete normalization fix described below.",
            "Current subject: fix(putaway): normalize balances using observed units\nCurrent body: Prefer source stock-unit evidence when normalizing inventory observations.\n\n" + QuantityDraftEvidence(),
            [
                SemanticCriterion { id: "subject-explains-why", description: "The Conventional Commit subject names correct putaway quantities or preventing understated stock-case quantities rather than just normalization or observed units." },
                SemanticCriterion { id: "body-explains-why", description: "The body's first sentence independently explains the quantity correction or failure prevented, with conversion mechanics after the purpose. The body explains the previous incorrect quantity and connects source-unit conversion and raw evidence to correct quantities and safe replay." },
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
                SemanticCriterion { id: "subject-names-preparation", description: "The refactor subject describes preparing for the planning-lock ordering change or keeping its target selection consistent, not merely extracting a helper. It does not claim this commit prevents deadlocks." },
                SemanticCriterion { id: "body-bounds-contribution", description: "The body opens with the preparation's purpose, identifies the immediate lock-ordering change and target-list drift risk, and preserves that current lock ordering and runtime behavior are unchanged. It does not claim the whole ticket's deadlock fix." },
            ],
        ),
    ]
}

function ShortcutFramingScenarios() -> Scenario[] {
    [
        FramingScenario(
            "shortcut-reframe-quantity-title",
            "skills/shortcut/shortcut/SKILL.md",
            "Revise only the Shortcut story title. The supplied implementation has not landed yet; the story's acceptance boundary is the corrected stock-case quantities. Leave the description and acceptance criteria alone.",
            QuantityDraftEvidence(),
            [
                SemanticCriterion { id: "title-explains-why", description: "The title names correct putaway quantities or preventing understated stock-case quantities rather than conversion to base units. It does not suggest the fix is limited to a UI-code change." },
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
                SemanticCriterion { id: "title-names-technical-purpose", description: "The title names enabling or preparing source-unit-aware LDS ingestion, ideally with backward compatibility, rather than merely adding fields. A backend capability is a valid result; it must not invent a directly delivered UI benefit." },
                SemanticCriterion { id: "title-only-boundary", description: "The agent proposes only a title, optionally with a brief approval question. It does not rewrite the description or criteria, claim corrected displayed quantities, or claim publication." },
            ],
        ),
    ]
}
