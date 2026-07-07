---
name: "security-review"
description: High-signal application security review that reports only proven, exploitable findings. Use when reviewing code changes for security or OWASP-style risks, or when CI/CD or GitOps changes touch deploy authority.
---

# Security Review

Use this skill to find exploitable security issues in code changes. Optimize for a few proven, actionable findings instead of broad hardening advice.

## Reportability Gate

File a finding only when the changed code creates a complete exploit story:

- **Reachability**: the changed path runs in production or privileged automation, not only in tests, fixtures, generated output, or dead examples.
- **Attacker influence**: a lower-privileged actor controls the relevant value, file, ref, payload, callback, persisted record, workflow input, or service parameter.
- **Boundary crossed**: the path crosses a meaningful boundary such as account, tenant, org, project, role, session, webhook identity, filesystem root, internal network, secret, paid quota, deploy authority, or CI/GitOps privilege.
- **Security effect**: the result is unauthorized access or mutation, privilege escalation, tenant escape, credential exposure, code execution, data exfiltration, forged side effect, quota abuse, or release/deploy compromise.

If the story is incomplete, keep investigating or return no finding.

## Risk Sweep

Use OWASP Top 10 and ASVS ideas as a map, not as a checklist. Prioritize these clusters when the diff touches them:

- **Identity and ownership**: login/session/token/OAuth/webhook identity, object-level authorization, tenant scoping, role transitions, caller-provided actor IDs, service-to-service trust.
- **Data access and disclosure**: sensitive records, PII, signed URLs, cookies, auth headers, stack traces, internal fields, redaction, logging, and response serialization.
- **Interpreter and parser boundaries**: SQL/NoSQL, shell, templates, eval, dynamic imports, deserialization, expression languages, unsafe YAML/pickle/Marshal-like formats.
- **Browser and content boundaries**: HTML/Markdown/DOM/script contexts, framework escape hatches, dangerous URL schemes, inline script data, CSP/CORS changes with demonstrated impact.
- **Network and filesystem boundaries**: SSRF, redirects, proxies, metadata/internal networks, path traversal, archive extraction, uploads, object keys, executable artifacts.
- **Secrets, crypto, and abuse controls**: hardcoded real credentials, weak token generation/verification, custom crypto, replay gaps, missing idempotency/rate/quota controls on sensitive actions.
- **CI/CD and GitOps authority**: untrusted code or data reaching secrets, write tokens, OIDC, releases, packages, deployments, privileged workers/runners, trusted artifacts, cluster credentials, or Argo/Concourse/GitHub deploy authority.

## Reference Routing

Load only references that match the changed code:

- [references/javascript-typescript.md](references/javascript-typescript.md) for JavaScript, TypeScript, Node, React, Next.js, or browser code.
- [references/python.md](references/python.md) for Python, Django, Flask, FastAPI, Celery, or Python service code.
- [references/ruby-rails-sorbet.md](references/ruby-rails-sorbet.md) for Ruby, Rails, ActiveRecord, GraphQL Ruby, background jobs, or Sorbet-heavy Ruby code.
- [references/github-actions.md](references/github-actions.md) for GitHub Actions workflows, local actions, reusable workflows, or scripts/config invoked by workflows.
- [references/concourse-ci.md](references/concourse-ci.md) for Concourse pipelines, task configs, custom resource types, privileged tasks, or scripts invoked by Concourse.
- [references/argocd-gitops.md](references/argocd-gitops.md) for Argo CD Applications, ApplicationSets, AppProjects, RBAC, Config Management Plugins, sync hooks, or GitOps deployment manifests.

## Investigation Moves

- Start from changed files and map the effective entry point: route, server action, RPC handler, job, webhook, serializer, service method, CLI command, workflow, render plugin, or deployment hook.
- Follow the actual call path through helpers, middleware, decorators, validators, authorization utilities, serializers, schema checks, and sibling patterns.
- Confirm that the changed path is production-reachable or privileged-automation-reachable.
- Verify mitigations where they actually execute: parameter binding, escaping/sanitization, exact allowlists, trusted tenant filters, permission checks, signature verification, realpath containment, safe URL fetching, token validation, replay/idempotency/rate controls, or CI/GitOps privilege gates.
- Cite the smallest file/line evidence that proves the exploit story and the smallest safe remediation.

## Non-Findings

Do not report:

- pattern-only concerns where reachability, attacker influence, boundary, or impact is unproven;
- generic best-practice advice, style, maintainability, performance, or non-security correctness feedback;
- intentionally public data with no sensitive side effect;
- secret-looking placeholders such as `example`, `dummy`, `test`, documented fake keys, or local-only fixtures;
- broad automation permissions, mutable refs, or missing headers unless the changed path reaches credential exposure, privileged execution, or sensitive side effects;
- framework defaults that already escape, parameterize, authorize, validate, or sandbox the path unless the change bypasses those defaults.

## Severity and Output

Severity should follow demonstrated impact:

- **Critical/High**: broad auth bypass, cross-tenant data access, privilege escalation, production credential exposure, RCE, unsafe deserialization, sensitive-data injection, SSRF to internal/cloud metadata, or privileged CI/CD/GitOps compromise.
- **Medium**: bounded unauthorized data access/mutation, real XSS, webhook forgery with side effects, meaningful token/session weakness, limited path traversal, auth-flow open redirect, or expensive-operation abuse.
- **Low**: concrete defense-in-depth issue with a plausible exploit path and limited impact. Do not use low for vague hardening.

When impact depends on an unproven assumption, lower severity or keep investigating.

If findings exist:

```markdown
## Security Review

### [severity] [short title]
- Location: `path:line`
- Evidence: [attacker influence] crosses [boundary] and reaches [dangerous operation or missing guard].
- Impact: [what a lower-privileged actor can do].
- Fix: [smallest safe remediation].
- Confidence: high|medium, with any assumptions.
```

If no findings are proven:

```markdown
## Security Review
No high-confidence security findings in the reviewed scope.
Checked: [brief files/paths or risk areas inspected].
```
