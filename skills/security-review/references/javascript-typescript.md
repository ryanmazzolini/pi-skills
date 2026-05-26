# JavaScript and TypeScript Security Review

Use this reference for JavaScript, TypeScript, Node, React, Next.js, and browser code.

## Entry Surface

Treat these as security entry points when they touch sensitive data or side effects:

- Next.js Route Handlers, Server Actions, API routes, middleware, edge/runtime handlers, and server component data loaders.
- Express/Fastify/Koa routes, tRPC/RPC handlers, GraphQL resolvers, webhook handlers, queue consumers, CLIs, and service methods called by those paths.
- Browser code that moves tokens, handles `postMessage`, renders untrusted content, follows redirects, performs uploads, or relies on trusted-origin assumptions.

Server Actions are callable server endpoints. Hidden form fields, UI visibility, and TypeScript annotations do not prove authorization.

## Checks by Boundary

### Identity, tenant, and state changes

- Caller-supplied `userId`, `orgId`, `workspaceId`, `role`, hidden fields, or route/body resource IDs must be re-derived or scoped from trusted server session state before sensitive reads or writes.
- Next.js middleware can establish coarse identity, but mutations and sensitive reads still need handler/service-level object authorization.
- Webhook handlers should verify raw-body signatures, timestamp freshness, and replay/idempotency before parsing side-effecting payloads.

### Interpreters and execution

- Review string-built SQL, `$queryRawUnsafe`, dynamic filters/sorts, `eval`, template execution, dynamic import paths, and child-process calls.
- Prefer parameterized APIs, ORM filters, fixed binaries with argv arrays, and enum allowlists for identifiers, refs, flags, or sort fields.
- `spawn(..., { shell: true })` and `exec` deserve extra scrutiny when any argument is caller-controlled.

### Browser and content sinks

- React text interpolation is escaped by default; focus on `dangerouslySetInnerHTML`, direct DOM writes, unsafe Markdown/HTML, inline script data, and dangerous URL schemes.
- Sanitizers must be appropriate for the output context. A sanitizer for HTML body content is not automatically safe for attributes, URLs, scripts, or CSS.
- Inline JSON in `<script>` needs script-context-safe serialization, including protection against `</script>` breakouts.

### Network, files, and secrets

- URL preview/proxy/fetch flows need exact allowlists, private/link-local IP blocking, and redirect revalidation when redirects are followed.
- Path joins and archive extraction need generated filenames or resolved containment checks before reading, writing, or serving files.
- Server secrets should not appear in Client Components, `NEXT_PUBLIC_*`, serialized props, client bundles, logs, fallback config, or user-visible errors.

## Calibration Notes

- Prisma, Drizzle, Knex, and other query builders often parameterize values; verify the exact raw/query API before reporting injection.
- `crypto.randomUUID()` and `crypto.getRandomValues()` are usually appropriate randomness sources for application tokens. `Math.random()` is not.
- JWT verification can be acceptable when algorithm, issuer/audience, expiry, and key selection are pinned for the boundary being protected.
- TypeScript types, Zod schemas, and validation libraries prove shape, not caller authority or tenant ownership.

## Examples

### Report: tenant data read without scope

```ts
const report = await db.report.findFirst({
  where: { id: searchParams.get("reportId") },
});
return Response.json({ downloadUrl: report?.downloadUrl });
```

If reports belong to a workspace or account, filter by trusted tenant context and authorize the read before returning the URL.

### Report: Server Action trusts caller-selected workspace

```ts
"use server";
export async function updateWorkspacePlan(workspaceId: string, plan: string) {
  await db.workspace.update({ where: { id: workspaceId }, data: { plan } });
}
```

A caller can invoke the action directly. Load the session server-side, verify membership/admin rights for the workspace, and validate the allowed plan transition.

### Report: script-context serialization bug

```tsx
<script dangerouslySetInnerHTML={{ __html: `window.DATA=${JSON.stringify(data)}` }} />
```

If `data` contains user-controlled strings, script termination can break out of the intended assignment. Use a safe serialization helper for script contexts.

### Do not report: parameterized raw query

```ts
await db.$queryRaw`SELECT * FROM reports WHERE slug = ${slug} AND workspace_id = ${workspaceId}`;
```

This is not SQL injection when the tagged template parameterizes values and `workspaceId` comes from trusted session state.
