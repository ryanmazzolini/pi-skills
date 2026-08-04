# Explore, Then Verify and Reduce

Use this loop when the starting frame, assumptions, or candidate approaches may be incomplete. A narrow lookup or technical experiment with one clear hypothesis does not need it. The phases separate finding possibilities from judging them; they do not require a user checkpoint between them.

## Orient

Inspect the relevant code, documentation, tests, history, workflow, and observed behavior before relying on external sources. State:

- the provisional question and the decision or understanding it could affect
- observed facts, current assumptions, and terms that may hide disagreement
- constraints and what evidence could change the answer or reframe the question
- the destination and checkpoint to resume when one exists

## Phase 1 — Fan out

Choose evidence paths that could reveal a materially different explanation or approach:

- **System:** code, docs, tests, history, issues, observed behavior, and operational evidence.
- **Topic:** varied terminology across authoritative documentation, standards, literature, and the relevant ecosystem.
- **Lineage:** backward references, forward citations, later replications or criticism, and related work from central authors or maintainers.
- **Neighborhood:** related or co-cited work, adjacent fields, and mechanisms that might transfer across domains.
- **Challenge:** contrary results, failure reports, limitations, competing explanations, and viable alternatives.

When external evidence is needed for an ordinary technical decision, start with 2–4 genuinely different queries and 2–4 strong seed artifacts. Add a lineage pass and a challenge or adjacent-domain pass when they could expose a blind spot. Use more than one seed when practical because citation and related-author searches inherit the seed's vocabulary, network, popularity, language, and disciplinary biases.

Use the model to locate terminology, authors, artifacts, and possible connections. During this phase, verify only that candidate artifacts, authors, links, dates, and attributions exist. Carry plausible candidates forward without recommending or eliminating a direction from unverified claims.

Stop expanding when you can name the materially different candidate families, a useful seed or observation for each, and at least one challenge path. Also stop when another pass adds examples within existing families but no new concept, contradiction, method, or viable option.

## Phase 2 — Verify and reduce

Read the original artifacts and inspect the live system. Verify the claims that could change the decision. An artifact becomes evidence because its method, authority, direct observation, or implementation is relevant—not because the model recommended it or its author is prominent.

Compare candidates using only dimensions that matter to the question, such as evidentiary strength, relevance, feasibility, reversibility, differentiation, or testability. Look for evidence that would falsify the emerging view. Remove candidates whose important claims fail, and prefer the simpler supported direction when it preserves the needed outcome.

When documents cannot settle the uncertainty, identify the smallest bounded experiment and observation that could. The owning skill decides whether the experiment is technical or experiential and what authority or cleanup it requires. Resume verification with the observation; an experiment plan alone does not satisfy this phase. When comparison is the experiment, evaluate alternatives under the same conditions before refining one.

Stop when the evidence supports a next action, material disagreement and gaps are explicit, and more checking is unlikely to change the frame or result. A claim-checking pass that adds no decision-relevant concept, contradiction, method, or option is a practical signal of diminishing returns, not proof of completeness.

Return this package to the calling skill:

- whether the starting question was answered, reframed, or rejected
- the recommendation or map of viable directions
- the strongest evidence and material counterevidence
- remaining assumptions and uncertainty
- the exact workflow checkpoint to resume when one exists
