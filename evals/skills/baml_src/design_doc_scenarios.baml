function DesignDocScenarios() -> Scenario[] {
    [
        Scenario {
            id: "design-doc-backend-preserves-decision-shape",
            title: "Keeps a backend design outcome-led without hiding enforceable contracts",
            skillPath: "skills/ship/design-doc/SKILL.md",
            skillReferences: [
                "skills/ship/design-doc/design-format.md",
                "skills/ship/design-doc/references/technical-shapes.md",
                "skills/ship/design-doc/references/boundary-contracts.md",
                "skills/ship/design-doc/references/build-rollout.md",
            ],
            readableReferences: ["skills/ship/design-doc/references/ownership-state.md"],
            turns: [
                "Draft a compact reservation-creation design before implementation. Read product-contract.md and current-architecture.md. Return the complete design inline for review. Do not edit files.",
            ],
            files: {
                "product-contract.md": "# Reservation outcome\n\nAPI clients can safely retry reservation creation without creating duplicate work. For account `acct_7`, item `SKU-42`, and request `req_19`, the first successful request returns reservation `res_84`; retrying `req_19` returns `res_84` again. A concurrent request with a different request id for the same account and item returns `409 active_reservation_exists`. Zero or negative quantity returns `422 invalid_quantity`.\n\nAt most one `active` reservation may exist for an account and item. The database must enforce this during concurrent requests. Existing clients cannot switch request and response formats atomically. The current table has 1.8 million rows, and a verified production query found no duplicate active account/item pairs. Exact backfill batch size remains unresolved and must not be invented.",
                "current-architecture.md": "# Current architecture\n\nThe service is Rails 8 with PostgreSQL. `Api::ReservationsController#create` calls `Reservations::Create.call`. Repository migrations use Active Record migration syntax and add indexes concurrently with `disable_ddl_transaction!`.\n\n`reservations` currently has `id`, `account_id`, `sku`, `quantity`, and `status`; status is `active`, `fulfilled`, or `cancelled`. JSON errors use `{ error: { code: string } }`. Services lock the account row before inventory rows, and inventory rows are locked by ascending primary key.\n\nThe endpoint has no retry key today. The deployed API can accept an optional field before it becomes required. Rollout checks use a duplicate-active-row query and error-rate alarms. Operators can stop a backfill without rolling back already written keys.",
            },
            searchResponses: [],
            fetchResponses: {},
            bashResponses: [],
            maxToolCalls: 8,
            hardAssertions: [
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "read",
                    argumentIncludes: "product-contract.md",
                    min: 1,
                    description: "The agent reads the settled product and failure contract.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "read",
                    argumentIncludes: "current-architecture.md",
                    min: 1,
                    description: "The agent reads repository conventions and current constraints.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "edit",
                    max: 0,
                    description: "The agent honors the inline, read-only design request.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "write",
                    max: 0,
                    description: "The agent honors the inline, read-only design request.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "bash",
                    max: 0,
                    description: "The named fixture files provide the required local evidence.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "web_search",
                    max: 0,
                    description: "The local product and repository evidence is sufficient.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "fetch_content",
                    max: 0,
                    description: "The local product and repository evidence is sufficient.",
                },
            ],
            semanticCriteria: [
                SemanticCriterion {
                    id: "outcome-led-concrete-opening",
                    description: "Opens with the caller's retry-safe outcome in one concrete example that reuses the supplied identifiers rather than inventing new ones, covers the same-key replay and the different-key conflict, and comes before any Rails, PostgreSQL, or workflow detail in the body. The short recommendation line above it may name the proposed mechanism.",
                },
                SemanticCriterion {
                    id: "decisions-not-generic-inventories",
                    description: "Body headings are proposed choices, or one build and rollout transition the evidence qualifies, not generic Product, System, Program, data-model, API, file-tree, or test-inventory sections. The main enforcement decision states its stakes: the invariant it protects, or what approved behavior, contract, migration, or substantial work would be invalidated if it were wrong.",
                },
                SemanticCriterion {
                    id: "repository-native-enforcement-shape",
                    description: "Makes the one-active-reservation-per-account-and-item enforcement reviewable with at least one compact proposed fragment in the repository's form (an Active Record migration or index fragment, or an equivalent SQL constraint or index), rather than prose alone. A production-sized implementation body does not pass.",
                },
                SemanticCriterion {
                    id: "honest-uncertainty-and-operations",
                    description: "Leaves the backfill batch size unresolved rather than inventing a number, and invents no other numbers, timings, or sizes absent from the supplied evidence.",
                },
                SemanticCriterion {
                    id: "compact-and-evidence-bound",
                    description: "Any build and rollout content names the compatibility transition that qualifies it, such as accepting the request key as optional before requiring it or adding the index only after the duplicate check, and does not become a generic build plan, PR boundaries, a risk catalogue, or an exhaustive file or test inventory. It need not prescribe a backfill the evidence does not require.",
                },
            ],
        },
        Scenario {
            id: "design-doc-user-surface-preserves-experience-shape",
            title: "Keeps a user-facing design grounded in the approved experience",
            skillPath: "skills/ship/design-doc/SKILL.md",
            skillReferences: [
                "skills/ship/design-doc/design-format.md",
                "skills/ship/design-doc/references/experience-shapes.md",
                "skills/ship/design-doc/references/technical-shapes.md",
                "skills/ship/design-doc/references/ownership-state.md",
            ],
            turns: [
                "Draft a compact upload experience design before implementation. Read approved-product.md and current-architecture.md. Return the complete design inline for review and make any deviation from the approved product artifact explicit. Do not edit files.",
            ],
            files: {
                "approved-product.md": "# Approved upload experience\n\nThe upload panel accepts one document at a time. After selection it shows the filename, an Uploading state, useful progress, and a Cancel action. Losing the network changes the row to Paused; reconnecting resumes the same upload automatically. Cancellation ends in Cancelled and offers Remove. Completion ends in Uploaded.\n\nA user may close and reopen the upload panel while the upload continues in the same browser tab; reopening shows the same row and current state. On narrow screens the filename, status, and action stack without horizontal scrolling. Screen readers announce state changes but not every progress update. Closing or reloading the browser tab remains outside this release.",
                "current-architecture.md": "# Current upload surface\n\nThe React application already has an `UploadRow` component with filename, progress, status, and action slots. The panel conditionally mounts `UploadRow`, which currently owns its upload state; closing the panel unmounts the row and loses that state. No upload-session owner exists above the panel. The signed-upload endpoint supports resumable chunks for a live upload id, cancellation, and retry after a network interruption. It cannot resume after the browser tab is closed.\n\nExisting interface copy uses Uploading, Paused, Cancel, Cancelled, Remove, and Uploaded. The current desktop row is horizontal and has no narrow-screen layout or live-region behavior.",
            },
            searchResponses: [],
            fetchResponses: {},
            bashResponses: [],
            maxToolCalls: 8,
            hardAssertions: [
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "read",
                    argumentIncludes: "approved-product.md",
                    min: 1,
                    description: "The agent reads the authoritative product behavior.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "read",
                    argumentIncludes: "current-architecture.md",
                    min: 1,
                    description: "The agent reads the current surface and implementation boundary.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "edit",
                    max: 0,
                    description: "The agent honors the inline, read-only design request.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "write",
                    max: 0,
                    description: "The agent honors the inline, read-only design request.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "bash",
                    max: 0,
                    description: "The named fixture files provide the required local evidence.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "web_search",
                    max: 0,
                    description: "The approved product artifact and current architecture are sufficient.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "fetch_content",
                    max: 0,
                    description: "The approved product artifact and current architecture are sufficient.",
                },
            ],
            semanticCriteria: [
                SemanticCriterion {
                    id: "future-state-shows-visible-behavior",
                    description: "A short opening leads with the person's upload result and concretely covers completion, network-loss recovery, and closing then reopening the panel, without implementation rationale or internal workflow language.",
                },
                SemanticCriterion {
                    id: "approved-states-preserved",
                    description: "Presents the approved states and transitions as supporting material a reviewer can check against approved-product.md, using the approved vocabulary (Uploading, Paused and automatic resume, Cancelled and Remove, Uploaded, panel close and reopen), in compact shape or brief prose, with no renamed, added, or dropped states.",
                },
                SemanticCriterion {
                    id: "approved-artifact-and-deviations-are-explicit",
                    description: "Names approved-product.md as authoritative, states whether the proposal intentionally deviates from it, and does not silently promise resume after the browser tab closes.",
                },
                SemanticCriterion {
                    id: "costly-choices-not-requirement-headings",
                    description: "The body's decision headings are limited to the one genuine ownership choice that keeps an upload alive while the panel unmounts, with a reversal cost grounded in the current React boundary. The approved visible states, panel behavior, narrow-screen behavior, screen-reader announcements, and tab-close non-goal appear as supporting shape, not as separate decision headings.",
                },
                SemanticCriterion {
                    id: "no-invented-precision-or-scope",
                    description: "Does not invent a numeric breakpoint, multi-file support, or persistence across browser-tab close or reload; the tab-close limit stays an explicit non-goal.",
                },
                SemanticCriterion {
                    id: "no-unnecessary-delivery-plan",
                    description: "Has no Build and rollout section, PR boundaries, or exhaustive implementation, test, telemetry, or future-work inventory, because the evidence identifies no costly sequencing or rollout transition. A brief line naming checks or documentation to promote after delivery is fine.",
                },
            ],
        },
        Scenario {
            id: "design-doc-skips-cheap-repository-native-choice",
            title: "Skips a design document when repository patterns settle the change",
            skillPath: "skills/ship/design-doc/SKILL.md",
            skillReferences: [],
            turns: [
                "Decide whether adding JSON output to the inspect command warrants a design document. Read request.md and current-cli.md, then give me the decision inline. Do not edit files.",
            ],
            files: {
                "request.md": "# Inspect JSON output\n\nAutomation callers need `tool inspect --json` to print the same fields as the existing human-readable output as one JSON object. On success it exits 0. Existing validation and not-found failures keep their current exit codes and write the existing error to stderr. The default human-readable output must not change.",
                "current-cli.md": "# CLI conventions\n\nFour sibling commands already implement `--json` through `OutputRenderer.render(record, json: options.json)`. Their contract tests verify the JSON object, unchanged default text, exit 0 on success, and preserved error exit codes and stderr. `inspect` already produces the same record type and uses `OutputRenderer` for text output. No public schema, migration, concurrency, or rollout choice is introduced.",
            },
            searchResponses: [],
            fetchResponses: {},
            bashResponses: [],
            maxToolCalls: 6,
            hardAssertions: [
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "read",
                    argumentIncludes: "request.md",
                    min: 1,
                    description: "The agent reads the settled caller outcome.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "read",
                    argumentIncludes: "current-cli.md",
                    min: 1,
                    description: "The agent reads the established repository pattern.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "edit",
                    max: 0,
                    description: "The agent does not implement while deciding whether design review is warranted.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "write",
                    max: 0,
                    description: "The agent does not manufacture a design document.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "bash",
                    max: 0,
                    description: "The named fixture files provide the required local evidence.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "web_search",
                    max: 0,
                    description: "The repository evidence settles the choice.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "fetch_content",
                    max: 0,
                    description: "The repository evidence settles the choice.",
                },
            ],
            semanticCriteria: [
                SemanticCriterion {
                    id: "skip-design-review",
                    description: "Says no design document is warranted and gives a sufficient reason grounded in the supplied evidence: relevant choices are already authoritative, obvious from repository patterns, trivial, or cheaply reversible, without requiring all these reasons or any stock phrase.",
                },
                SemanticCriterion {
                    id: "no-manufactured-decisions",
                    description: "Does not create costly-decision headings, alternatives, architecture scaffolding, or speculative concerns for the routine CLI change.",
                },
                SemanticCriterion {
                    id: "concise-next-step",
                    description: "Returns one brief decision and sends the settled change back toward direct implementation. It does not expand into an implementation or test checklist, hypothetical conditions for future design review, a design draft, or reopened intent.",
                },
            ],
        },
        Scenario {
            id: "design-doc-loads-only-applicable-shape-guides",
            title: "Chooses shape guides from the skill's pointers instead of preloaded references",
            skillPath: "skills/ship/design-doc/SKILL.md",
            skillReferences: [],
            readableReferences: [
                "skills/ship/design-doc/design-format.md",
                "skills/ship/design-doc/references/experience-shapes.md",
                "skills/ship/design-doc/references/technical-shapes.md",
                "skills/ship/design-doc/references/boundary-contracts.md",
                "skills/ship/design-doc/references/ownership-state.md",
                "skills/ship/design-doc/references/build-rollout.md",
            ],
            turns: [
                "Draft a compact design for signed outbound webhooks before implementation. Read request.md and current-architecture.md. Return the complete design inline for review. Do not edit files.",
            ],
            files: {
                "request.md": "# Signed outbound webhooks\n\nIntegrators will receive a POST for each order event and must be able to verify that Acme sent it and that the body was not altered. Verification uses a per-integration shared secret that the existing integration credentials flow already issues to the integrator; no user-facing screen changes in this release. The feature is not yet announced; no integrator receives webhooks today. Integrator documentation will describe the verification steps exactly, so the header and signing contract must be settled before the first delivery ships. Secret rotation is wanted later but not in this release.",
                "current-architecture.md": "# Current delivery path\n\nThe Rails app already has an `OutboundDelivery` Sidekiq job that POSTs a JSON body with Faraday to the integration's `endpoint_url`, retries on 5xx, and records each attempt in `delivery_attempts`. Integrations store credentials in `integrations.credentials`, an encrypted JSON attribute, and no integration currently holds a webhook secret. Outbound headers follow the existing `X-Acme-*` convention. The app has no HMAC helper of its own; `OpenSSL::HMAC` is used in one place for SSO. No compatibility window exists because no receiver depends on the current unsigned body.",
            },
            searchResponses: [],
            fetchResponses: {},
            bashResponses: [],
            maxToolCalls: 8,
            hardAssertions: [
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "read",
                    argumentIncludes: "design-format.md",
                    min: 1,
                    description: "The skill points to the format before drafting.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "read",
                    argumentIncludes: "boundary-contracts.md",
                    min: 1,
                    description: "The external header and signing contract is the costly boundary.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "read",
                    argumentIncludes: "build-rollout.md",
                    max: 0,
                    description: "No receiver exists, so there is no costly or unsafe sequence.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "web_search",
                    max: 0,
                    description: "The local evidence settles the scope.",
                },
            ],
            semanticCriteria: [
                SemanticCriterion {
                    id: "one-costly-contract-decision",
                    description: "Centers the body on the header and signing contract integrators will implement, with the reversal cost that changing it later breaks every published verifier. It does not create decision headings for where the secret is stored, which job signs, or other choices the current architecture already settles.",
                },
                SemanticCriterion {
                    id: "proposed-contract-is-reviewable",
                    description: "States the proposed header name, its value format, and exactly what bytes are signed as concrete literals a receiver could implement from, whether in a fenced fragment or inline code, not as vague prose. No production-sized implementation or invented timing, size, or retry numbers. An example delivery, if shown, uses dummy values; an abbreviated digest is fine.",
                },
                SemanticCriterion {
                    id: "no-unwarranted-sections",
                    description: "Has no Build and rollout section, no experience shape, no PR boundaries, and no exhaustive test or file inventory. Secret rotation stays explicitly out of this release rather than becoming a decision or an invented policy.",
                },
                SemanticCriterion {
                    id: "quiet-guide-selection",
                    description: "The response never narrates which guides or sections were loaded and does not mention skill mechanics; it reads as a design for a reviewer.",
                },
            ],
        },
    ]
}
