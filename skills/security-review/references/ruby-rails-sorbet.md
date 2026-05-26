# Ruby, Rails, and Sorbet Security Review

Use this reference for Ruby, Rails, ActiveRecord, ActionController, ActionJob, GraphQL Ruby, Sidekiq, ActionCable, ActiveStorage, Sorbet-heavy Ruby, and Ruby service code.

## Entry Points

- Rails controllers, API controllers, GraphQL resolvers/mutations, ActionCable channels, jobs/workers, mailer previews with side effects, rake tasks invoked by users or CI, webhook endpoints, admin endpoints, and service objects called by any of those.
- Background jobs are not automatically trusted. Check who can enqueue them, which IDs or arguments are caller-controlled, and whether the job re-checks actor, tenant, and permission context before side effects.
- Strong Parameters and Sorbet types prove shape, not authorization. Pundit/CanCan policies prove authorization only when applied to the effective record/scope and action.

## High-Signal Checks

| Area | Risk pattern | Safer shape |
|---|---|---|
| Authorization | `Model.find(params[:id])`, GraphQL lookup by `id`, or job mutation by caller-provided ID without tenant/user scope | Use policy scopes, trusted tenant/account filters, and explicit authorize checks on the effective record/action |
| Mass assignment | Permitting sensitive fields such as `role`, `admin`, `account_id`, `owner_id`, `price_cents`, or state-machine columns from user params | Derive sensitive fields server-side; permit only user-owned editable fields; enforce transitions in service/policy code |
| SQL injection | String interpolation in `where`, `order`, `joins`, `find_by_sql`, `Arel.sql`, or raw connection calls | Hash conditions, bind parameters, sanitized SQL arrays, and enum allowlists for identifiers/order fields |
| Command execution | Backticks, `%x`, `system`, `exec`, `Open3`, or shell strings using params/job data | Fixed executable plus argv array; no shell; strict allowlists for options and refs |
| XSS | `html_safe`, `raw`, unsafe helpers, untrusted Markdown/HTML, JSON embedded in scripts | Default escaping, vetted sanitizer for the target context, safe JSON serialization for script contexts |
| SSRF/open redirect | `Net::HTTP`, Faraday, HTTParty, image/preview/proxy fetchers, `redirect_to params[:next]`, weak host checks | Exact host allowlists, private/link-local IP blocking, redirect revalidation, relative-path redirect allowlists |
| Files/uploads | `send_file params[...]`, path joins without containment, archive extraction, ActiveStorage blobs exposed across tenants | Generate server-side paths, resolve and compare containment, policy-check blobs/attachments before serving |
| Deserialization | `Marshal.load`, unsafe YAML/Psych load, object deserialization from params/uploads/cache/job payloads | JSON/typed schemas; safe YAML loading; deserialize only trusted, integrity-protected artifacts |
| Secrets/data | Logs or responses containing tokens, cookies, auth headers, signed URLs, PII, exception backtraces, or Rails credentials | Filter parameters, redacted logs, generic errors, server-only secret access, short-lived scoped URLs |
| Sorbet escape hatches | `T.unsafe`, broad `T.cast`, `T.must`, or generated RBI assumptions hide unchecked user input before a security-sensitive operation | Treat untyped input as untrusted; validate and authorize before casts; keep RBI changes aligned with runtime behavior |
| CSRF/webhooks | State-changing browser endpoints without CSRF protection, webhook side effects before signature verification | Keep Rails CSRF protections for browser sessions; verify raw body signatures and replay windows before side effects |

## False-Positive Controls

- ActiveRecord hash conditions and sanitized SQL arrays parameterize values. Verify the exact API before reporting SQL injection.
- `order(params[:sort])`, `Arel.sql`, and dynamic column/table names are not protected by ordinary value parameterization; require allowlists.
- ERB escapes `<%= %>` output by default. Report `raw`, `html_safe`, unsafe sanitization, or dangerous script/URL contexts.
- `params.require(...).permit(...)` is not an authorization boundary. It only constrains accepted fields.
- Sorbet signatures, `T::Struct`, GraphQL type definitions, and generated RBIs are not trust boundaries. They help model shape and nilability, not caller authority or tenant ownership.
- `T.must`, `T.cast`, and `T.unsafe` are not security findings by themselves. Report them only when they enable unchecked untrusted data to reach a security-sensitive sink or bypass a guard.
- Rails CSRF defaults can protect browser form/session endpoints, but API-only endpoints, JSON APIs, skipped CSRF filters, and webhook endpoints need separate reasoning.
- Signed IDs, GlobalID, and ActiveStorage signed URLs can be safe when scoped, unexpired where needed, and still checked against tenant/permission for sensitive resources.
- Pundit/CanCan checks are only effective if they run on the same record/scope being read or mutated.

## Minimal Examples

### Report: cross-tenant lookup

```ruby
invoice = Invoice.find(params[:id])
render json: { total: invoice.total, customer_email: invoice.customer.email }
```

If invoices belong to accounts or organizations, require a trusted tenant scope such as `current_account.invoices.find(params[:id])` plus an authorization check where appropriate.

### Report: mass assignment privilege escalation

```ruby
def user_params
  params.require(:user).permit(:name, :email, :role, :account_id)
end

current_account.users.create!(user_params)
```

A caller can choose sensitive ownership or privilege fields. Derive account and role server-side and authorize role changes explicitly.

### Report: SQL injection through dynamic ordering

```ruby
Project.where(account_id: current_account.id).order(params[:sort])
```

`order` can interpret SQL fragments. Use an allowlist mapping from accepted sort keys to known columns/directions.

### Report: Sorbet cast hides untrusted state before authorization

```ruby
payload = T.cast(JSON.parse(params[:payload]), T::Hash[String, String])
Project.find(payload.fetch("project_id")).update!(visibility: payload.fetch("visibility"))
```

The cast does not prove authority over the project. Scope the lookup by trusted tenant/account and authorize the mutation before applying caller-controlled state.

### Report: unsafe file send

```ruby
send_file Rails.root.join("exports", params[:filename])
```

Caller-controlled path segments can escape the intended directory. Resolve the path and verify containment, or look up generated export records by ID and owner.

### Do not report: scoped ActiveRecord query

```ruby
invoice = current_account.invoices.find(params[:id])
authorize invoice, :show?
```

This is not an authorization bypass when `current_account` is trusted and the policy applies to the same record/action.
