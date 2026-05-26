# Python Security Review

Use this reference for Python, Django, Flask, FastAPI, Celery, and Python service code.

## Entry Surface

Review trust boundaries in:

- Django views, DRF viewsets/serializers/actions, Flask/FastAPI routes, GraphQL resolvers, webhook handlers, and service methods reached from those entry points.
- Celery/background tasks, management commands, import jobs, and worker code when users, queues, webhooks, or CI can influence the payload.
- Template rendering, file serving, archive handling, network fetchers, and integrations that return or mutate tenant data.

Background work is not automatically trusted. Check who can enqueue the job, which arguments are attacker-influenced, and whether actor/tenant authorization is re-established inside the job.

## Checks by Boundary

### Identity, ownership, and jobs

- Lookups such as `Model.objects.get(...)` or service methods that accept IDs need trusted user/account/org scope before returning or mutating tenant data.
- Decorators and FastAPI dependencies can prove identity only for the wrapped handler; they do not prove ownership of route params, body IDs, or job arguments.
- Worker tasks that mutate by ID need trusted actor/tenant context, not just a queued identifier.

### Interpreters and unsafe loaders

- Raw SQL built with f-strings, `%`, `.format`, concatenation, or dynamic identifiers needs parameterization or strict enum allowlists.
- Shell execution through `os.system`, shell strings, or `subprocess.*(..., shell=True)` is risky when request/job data reaches the command.
- `pickle.loads`, unsafe `yaml.load`, and uploaded model/job artifacts require a trusted, integrity-protected source. Prefer JSON or typed schemas for caller input.

### Web, files, and outbound network

- Django/Jinja escape ordinary template interpolation; focus on `safe`, `Markup`, disabled autoescape, raw Markdown/HTML, or context-confused sanitization.
- File serving, archive extraction, and path-based exports need resolved containment checks or server-generated storage names.
- Preview/proxy/fetch features need exact host allowlists, private/link-local IP blocking, and redirect handling that does not bypass the first-hop check.

### Secrets and crypto

- Logs and error responses should not include tokens, cookies, auth headers, signed URLs, stack traces, or environment secrets.
- `secrets` and `os.urandom` are appropriate for security tokens; `random` is not.
- Prefer maintained password hashing, signing, and crypto libraries over custom constructions.

## Calibration Notes

- Django ORM and SQLAlchemy expression APIs usually bind values safely; raw SQL and string-built identifiers need closer review.
- `yaml.safe_load` is suitable for untrusted YAML. `yaml.load` is acceptable only with an explicitly safe loader.
- Path containment works only when both the allowed root and candidate path are resolved before comparison.
- Shape validation from serializers or Pydantic models does not authorize access to the referenced object.

## Examples

### Report: tenant document read without scoped lookup

```python
document = Document.objects.get(pk=request.GET["document_id"])
return JsonResponse({"owner_email": document.owner.email, "download_url": document.url})
```

If documents are tenant data, scope the lookup to the authenticated account or organization and enforce read permission before returning sensitive fields.

### Report: worker task trusts queued ID

```python
@shared_task
def cancel_subscription(subscription_id: str):
    Subscription.objects.filter(id=subscription_id).update(cancelled=True)
```

If lower-privileged users can enqueue or influence the task, reload trusted actor/tenant context and check permission before mutation.

### Report: uploaded pickle payload

```python
profile = pickle.loads(request.FILES["profile"].read())
```

Untrusted pickle can execute code. Use a typed format such as JSON, or only deserialize artifacts produced and signed by trusted code.

### Do not report: scoped ORM lookup

```python
document = Document.objects.get(pk=document_id, organization_id=request.user.organization_id)
```

This is not an authorization bypass when the caller is authenticated and `request.user.organization_id` is trusted for the tenant boundary.
