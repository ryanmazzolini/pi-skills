# Argo CD and GitOps Security Review

Use this reference for Argo CD `Application`, `ApplicationSet`, `AppProject`, RBAC config, repository/cluster configuration, sync hooks, Config Management Plugins, Helm/Kustomize/Jsonnet GitOps manifests, and scripts invoked by Argo CD rendering or sync flows.

## Review Map

1. Identify who controls the Git source, chart, values, generator input, or manifest path. Distinguish trusted platform repos from app repos writable by lower-privileged teams or fork/PR automation.
2. Identify the deployment boundary: Argo CD project, destination cluster/server, namespace, service account, cluster-scoped resources, repo credentials, and sync permissions.
3. Follow render and sync execution: Helm/Kustomize/Jsonnet, Config Management Plugins, ApplicationSet generators/templates, hooks/waves, automated sync/prune/self-heal, and namespace creation.
4. Report only when lower-privileged source or input can deploy to a more privileged destination, execute code in repo-server or cluster, expose credentials/secrets, or bypass intended project/RBAC boundaries.

## High-Signal Patterns

| Area | Report when | Safer shape |
|---|---|---|
| Over-permissive AppProject boundary | A project allows lower-privileged app sources to deploy to privileged clusters/namespaces or cluster-scoped resources via broad `sourceRepos`, `destinations`, or resource allowlists | Restrict source repos, destinations, namespaces, and cluster resource kinds per trust boundary |
| Untrusted Application source | An `Application` points to a repo/chart/revision/path controlled by lower-privileged users while targeting production, platform, or shared namespaces | Use trusted promotion repos/refs, reviewed generated manifests, or separate low-privilege projects |
| ApplicationSet template escape | Generators use PR/list/SCM/cluster data to template `project`, `source.repoURL`, `path`, `targetRevision`, `destination`, or `namespace` without allowlists | Template only safe fields; constrain generated apps to fixed projects/repos/destinations; review generator input trust |
| Config Management Plugins | A CMP executes commands against repo-controlled files in a repo-server context that has broad repo credentials or network access | Run plugins in isolated sidecars with least privilege; enable only for trusted repos; avoid exposing secrets to plugin commands |
| Helm/Kustomize execution trust | Untrusted charts, values, Kustomize bases, remote bases, or plugins can render privileged Kubernetes resources in a high-privilege project | Treat render source as deployment code; restrict repos/refs and project resource permissions |
| Sync hooks and jobs | Repo-controlled hooks create Jobs/Pods or run commands with powerful service accounts, secrets, or cluster permissions | Limit who can change hook source; restrict service accounts/RBAC; avoid hooks for untrusted app repos |
| Automated prune/self-heal | Lower-privileged source can automatically delete or overwrite resources outside its intended ownership or namespace | Narrow project destinations/resources; require manual gates for privileged apps; use resource tracking/ownership carefully |
| Argo CD RBAC | RBAC grants lower-privileged users/groups `applications, sync`, `override`, `exec`, `clusters`, `repositories`, or project role token powers beyond their boundary | Scope policies by project/app; avoid wildcard actions/resources; protect terminal/exec and repository/cluster admin actions |
| Secrets in GitOps repos | Real Kubernetes Secrets, repo credentials, cluster secrets, tokens, kubeconfigs, or private keys are committed without encryption or external secret flow | Use sealed/encrypted secrets or external secret operators; keep Argo CD repo/cluster credentials out of app repos |
| Namespace or cluster-resource escalation | App authors can create namespaces, Roles/ClusterRoles, RoleBindings/ClusterRoleBindings, CRDs, webhooks, or privileged workloads in shared/prod projects | Restrict cluster resource allowlists/denylists and destination namespaces; enforce policy admission where needed |

## False-Positive Controls

- GitOps intentionally deploys what is in Git. The finding is not “repo can deploy manifests”; the finding is a crossed trust boundary where the repo/input is lower-privileged than the destination or permissions.
- Broad AppProject settings are not automatically vulnerabilities in a single trusted platform repo. Tie them to who can modify the source and what destination/resources they can affect.
- Kubernetes RBAC, Roles, hooks, and CRDs can be legitimate. Report only when changed Argo CD project/app wiring lets an unintended actor deploy or modify them.
- Automated sync, prune, and self-heal are normal Argo CD features. They become findings when untrusted source can automatically mutate/delete privileged resources.
- Helm/Kustomize/Jsonnet are not code execution in the cluster by themselves, but rendered manifests can create jobs, hooks, RBAC, webhooks, and workloads with real impact.
- Config Management Plugins are expected to run commands during manifest generation. Focus on untrusted repo content, exposed credentials, repo-server isolation, and privileged output.

## Minimal Examples

### Report: app-team repo can deploy cluster-admin resources

```yaml
kind: AppProject
spec:
  sourceRepos:
    - https://github.com/example/app-team/*
  destinations:
    - server: https://kubernetes.default.svc
      namespace: '*'
  clusterResourceWhitelist:
    - group: '*'
      kind: '*'
```

If app-team authors are lower-privileged than cluster admins, they can sync cluster-scoped or privileged resources. Restrict destinations and resource kinds for that project.

### Report: ApplicationSet lets PR input choose production path/ref

```yaml
kind: ApplicationSet
spec:
  generators:
    - pullRequest:
        github:
          owner: example
          repo: app
  template:
    spec:
      project: prod
      source:
        repoURL: https://github.com/example/app.git
        targetRevision: '{{branch}}'
        path: '{{path}}'
      destination:
        server: https://kubernetes.default.svc
        namespace: prod
```

PR-controlled branch/path can define what prod syncs. Pin trusted refs/paths or generate only low-privilege preview apps.

### Report: untrusted repo uses config management plugin with repo credentials

```yaml
kind: Application
spec:
  project: prod
  source:
    repoURL: https://github.com/example/app-team.git
    path: manifests
    plugin:
      name: custom-renderer
```

If `custom-renderer` executes repo-controlled scripts in a repo-server context with broad repo credentials or network access, app authors may exfiltrate credentials or render privileged resources. Limit CMP usage to trusted repos and isolate credentials.

### Do not report: trusted platform repo owns prod app

```yaml
kind: Application
spec:
  project: platform-prod
  source:
    repoURL: https://github.com/example/platform-deployments.git
    targetRevision: main
    path: apps/api
  destination:
    server: https://kubernetes.default.svc
    namespace: api-prod
```

This is acceptable when only trusted deploy maintainers can modify the repo/path and the project boundary matches that trust level.
