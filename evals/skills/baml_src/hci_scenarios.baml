function HciScenarios() -> Scenario[] {
    [
        Scenario {
            id: "hci-quantity-preview-without-disclaimer",
            title: "Makes a partial-quantity flow explain itself without a disclaimer",
            skillPath: "skills/ux-accessibility/hci/SKILL.md",
            skillReferences: [
                "skills/ux-accessibility/hci/references/HEURISTICS.md",
                "skills/ux-accessibility/hci/references/INTERACTION-STATES.md",
            ],
            turns: [
                "Design the associate-facing structure and copy for the partial putaway quantity slice before implementation. Read product-slice.md and current-ui.md. Return the exact visible UI you recommend and call out any flow problem that the slice must resolve. Do not edit files.",
            ],
            files: {
                "product-slice.md": "# Partial putaway quantity\n\nWarehouse associates can enter a positive quantity up to the recommended amount and see how much inventory would remain. The field defaults to the recommended quantity. Invalid input must show a useful field error and prevent continuation.\n\nThis incremental slice cannot move or save inventory yet. The draft acceptance criteria say the screen should persistently explain that it is only a preview and does not move or save inventory.",
                "current-ui.md": "# Current sheet\n\nThe sheet shows `Quantity to put away — 85 stock cases`, a destination selector, and a primary `Put away` button. The proposed form repeats `Recommended quantity — 85 stock cases`, adds a quantity input, shows `Preview: 45 stock cases would remain`, and ends with `Preview only. Changing this quantity does not move or save inventory.`\n\nIn this slice, the existing `Put away` button only enters a waiting state. It does not persist a putaway.",
            },
            searchResponses: [],
            fetchResponses: {},
            bashResponses: [],
            maxToolCalls: 8,
            hardAssertions: [
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "read",
                    argumentIncludes: "product-slice.md",
                    min: 1,
                    description: "The agent reads the product slice before recommending the UI.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "read",
                    argumentIncludes: "current-ui.md",
                    min: 1,
                    description: "The agent reads the current surface before recommending the UI.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "edit",
                    max: 0,
                    description: "The agent does not edit before the design is agreed.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "write",
                    max: 0,
                    description: "The agent does not write files before the design is agreed.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "bash",
                    max: 0,
                    description: "The agent does not use shell commands to bypass the read-only design review.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "web_search",
                    max: 0,
                    description: "The local product evidence is sufficient.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "fetch_content",
                    max: 0,
                    description: "The local product evidence is sufficient.",
                },
            ],
            semanticCriteria: [
                SemanticCriterion {
                    id: "quantity-state-through-structure",
                    description: "Uses one clear set of labels and values for recommended quantity, editable quantity to put away, and projected remaining quantity instead of repeating the recommendation or prefixing ordinary values with Preview.",
                },
                SemanticCriterion {
                    id: "challenge-misleading-action",
                    description: "Identifies that a Put away action which does not put anything away is a flow or action-label problem; it does not use persistent preview-only or does-not-move-or-save copy to compensate for that mismatch.",
                },
                SemanticCriterion {
                    id: "preserve-useful-validation",
                    description: "Keeps concise field-level validation for zero, negative, or excessive quantities rather than removing useful error guidance in pursuit of less copy.",
                },
            ],
        },
        Scenario {
            id: "hci-unavailable-destination-as-first-class-state",
            title: "Presents a missing recommendation without jargon or invented recovery",
            skillPath: "skills/ux-accessibility/hci/SKILL.md",
            skillReferences: [
                "skills/ux-accessibility/hci/references/HEURISTICS.md",
                "skills/ux-accessibility/hci/references/INTERACTION-STATES.md",
            ],
            turns: [
                "Design the worklist card and detail state for an unavailable destination recommendation before implementation. Read state-contract.md and current-ui.md. Return the exact associate-facing structure and copy. Do not edit files or invent product behavior.",
            ],
            files: {
                "state-contract.md": "# Unavailable recommendation contract\n\n`NO_ELIGIBLE_DESTINATION` means the planning service completed without returning a destination recommendation. It does not prove that no physically suitable or safe bin exists.\n\nA genuine item-setup problem is a different state with its own correction flow. There is no verified instruction to retry, notify a lead, or contact another team.\n\nSome responses may include a material reason more specific than the missing recommendation. Show such a reason as a first-class part of the UI when it adds useful information; do not reduce it to an unexplained blank.",
                "current-ui.md": "# Current proposal\n\nWorklist card:\n- Status: `No safe destination`\n- Suggested bin: `Not available`\n- Action: `View item issue`\n\nDetail:\n- Badge: `No destination`\n- Quantity context: `No actionable allocation`\n- Explanation: `This session pallet build does not have a server-owned destination allocation.`\n- Recovery: `Ask a warehouse lead where to put this pallet.`",
            },
            searchResponses: [],
            fetchResponses: {},
            bashResponses: [],
            maxToolCalls: 8,
            hardAssertions: [
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "read",
                    argumentIncludes: "state-contract.md",
                    min: 1,
                    description: "The agent reads the exact meaning and recovery boundary of the state.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "read",
                    argumentIncludes: "current-ui.md",
                    min: 1,
                    description: "The agent reads the current customer-facing proposal.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "edit",
                    max: 0,
                    description: "The agent does not edit before the design is agreed.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "write",
                    max: 0,
                    description: "The agent does not write files before the design is agreed.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "bash",
                    max: 0,
                    description: "The agent does not use shell commands to bypass the read-only design review.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "web_search",
                    max: 0,
                    description: "The local state contract is sufficient.",
                },
                ToolCountAssertion {
                    kind: "tool-count",
                    tool: "fetch_content",
                    max: 0,
                    description: "The local state contract is sufficient.",
                },
            ],
            semanticCriteria: [
                SemanticCriterion {
                    id: "recommendation-state-through-structure",
                    description: "Presents No recommendation as the state and uses clear destination labels with an empty value such as an em dash plus a neutral details action, rather than repeating the missing state in explanatory sentences.",
                },
                SemanticCriterion {
                    id: "no-overclaim-jargon-or-invented-recovery",
                    description: "Does not claim that no safe or suitable bin exists, expose allocation/server/planner terminology, mislabel the state as an item issue, or invent a warehouse-lead, retry, or escalation step.",
                },
                SemanticCriterion {
                    id: "preserve-material-reasons-and-distinct-issues",
                    description: "Keeps genuine item-setup failures on their distinct correction path and preserves a material unavailable reason when it adds information beyond the ordinary missing-recommendation state.",
                },
            ],
        },
    ]
}
