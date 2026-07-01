# Concourse CI Security Review

Use this reference for Concourse `pipeline.yml`, task configs, custom resource types, deployment/publish jobs, and scripts invoked by Concourse tasks.

## Review Map

1. Identify the trust boundary: who can change the pipeline/task/script, who can trigger the job, and whether inputs come from trusted branches, fork PRs, external resources, manual vars, or resource metadata.
2. Mark secret and privilege points: credential-manager vars `((...))`, resource `source` credentials, task `params`, registry/cloud/deploy credentials, worker access, `privileged: true`, and jobs with `put` side effects.
3. Follow the execution graph: `get` resources, task inputs, `file:` task configs loaded from repos, custom `resource_types`, scripts invoked by `run`, and `put` steps.
4. Report only when lower-privileged code/data can reach secrets, privileged workers, deploy/publish side effects, trusted artifacts, or mutable resource definitions.

## High-Signal Patterns

| Area | Report when | Safer shape |
|---|---|---|
| Untrusted code with secrets | A task runs fork/PR/user-controlled repo code with secret-bearing `params`, resource credentials, deploy tokens, registry tokens, or cloud creds available | Separate untrusted validation from trusted deploy jobs; run PR code without secrets; gate promotion through trusted artifacts |
| Untrusted task config | `file:` loads task config or scripts from a repo/ref controlled by a lower-privileged author, and that task receives secrets or deploy authority | Keep secret-bearing task configs/scripts in a trusted repo/ref; pass only reviewed artifacts across the boundary |
| Privileged tasks | `privileged: true` is enabled for code or images controlled by lower-privileged users, or on shared workers where it can break isolation | Avoid privileged mode; isolate trusted workers; require strong review for privileged image/build tasks |
| Custom resource types | `resource_types` use mutable/untrusted images or PR-controlled definitions while `check`, `get`, or `put` receives credentials in `source` | Use trusted resource types pinned to immutable digests; keep resource type definitions in trusted pipeline config |
| Dangerous `put` side effects | Untrusted inputs flow into `put` steps that push Git refs, publish images/packages, deploy to Kubernetes/Cloud Foundry/cloud, rotate versions, or mutate production | Require trusted promotion jobs, explicit approvals, immutable artifact provenance, and scoped deploy credentials |
| Hardcoded secrets | Real credentials, tokens, private keys, kubeconfigs, registry passwords, or cloud secrets are committed in pipeline/task files or scripts | Use Concourse credential management vars `((secret-path))` and external secret stores |
| Secret disclosure in logs | Tasks echo, `set -x`, print env, upload artifacts, or write outputs containing secret vars/resource credentials | Disable tracing around secrets; redact logs; avoid writing secrets to outputs/artifacts |
| Mutable build images | Secret-bearing tasks run mutable task images or resource images from untrusted registries/tags | Pin trusted images by digest and restrict registry credentials to the minimum needed |
| Cache/artifact trust crossing | Untrusted build outputs, caches, or version files are later consumed by trusted deploy/publish jobs without provenance checks | Promote immutable artifacts with checksums/signatures; rebuild trusted artifacts from reviewed refs |
| Manual var injection | Operator-supplied or pipeline vars reach shell commands, refs, image names, or deploy parameters without allowlisting | Treat vars as data; validate against finite choices; pass via argv/env with quoting |

## False-Positive Controls

- Concourse pipelines commonly use vars and `params`. Report only when a secret is hardcoded, exposed, or passed into a task that lower-privileged code can influence.
- A `put` step is expected to have side effects. It becomes a finding when untrusted code/data controls what is published/deployed or when credentials are broader than the crossed boundary requires.
- `privileged: true` is not automatically a finding for a trusted, isolated image-build job. It is high risk when combined with untrusted code/images or shared workers.
- Mutable tags are not enough by themselves. Tie them to secret-bearing or privileged jobs, deploy/publish authority, or trusted artifact production.
- Do not report every broad Concourse team/worker caveat. Anchor findings to changed pipeline code and a concrete exploit path.

## Minimal Examples

### Report: PR code runs with deploy credentials

```yaml
jobs:
- name: pr-test-and-deploy
  plan:
  - get: pr
    trigger: true
  - task: deploy
    file: pr/ci/deploy.yml
    params:
      KUBECONFIG: ((prod-kubeconfig))
```

The task config and scripts come from PR-controlled code while production credentials are present. Split PR tests from trusted deploy jobs.

### Report: untrusted custom resource type handles secrets

```yaml
resource_types:
- name: custom-registry
  type: registry-image
  source:
    repository: ((dev-controlled-resource-image))

resources:
- name: prod-image
  type: custom-registry
  source:
    username: ((registry-user))
    password: ((registry-password))
```

A lower-privileged image can run resource `check`/`get`/`put` code with registry credentials. Use a trusted, pinned resource type image.

### Report: privileged untrusted image build

```yaml
- task: build-image
  privileged: true
  file: repo/ci/build-image.yml
```

If `repo` is PR-controlled or writable by lower-privileged users, privileged mode can break worker isolation. Keep privileged build logic trusted and isolated.

### Do not report: trusted deploy pipeline uses vars

```yaml
- task: deploy
  file: ci/deploy.yml
  params:
    TOKEN: ((prod/deploy-token))
```

This is acceptable when `ci/deploy.yml` and its inputs are trusted and the token is supplied by a credential manager rather than committed in the pipeline.
