# Production Checklist

UiCogs is currently at version `0.1.0`. Complete an application-specific pilot before production use.

## Runtime Ownership

- Create one application-owned runtime module.
- Register every resource when the runtime is created.
- Dispose the runtime when the application lifecycle ends.
- Do not share one runtime between unrelated applications or users.
- Keep transient UI state outside runtime context.
- Use IndexedDB instead of local storage for large context values.
- Change the persistence namespace when intentionally abandoning incompatible stored data.
- Add an optional persistence schema when stored data may come from older or external code.

## HTTP

- Use a stable `baseUrl`.
- Keep credentials and tokens out of URLs.
- Select a timeout that covers attempts and retry delays.
- Confirm that every automatically retried GET endpoint is safe to repeat.
- Configure server-error adapters for the API's actual error shapes.
- Keep mutation retries in application code when the operation is explicitly idempotent.

## Authentication

- Pass one immutable `jwtAuth()` or `cookieAuth()` strategy to `createUiCogs()`.
- Derive the cache scope from stable user and tenant identifiers.
- Test initialization, expiry, identity changes, and logout races.
- Keep JWTs in memory unless persistence is required and reviewed.
- Use secure, HttpOnly cookies for cookie sessions.
- Confirm CSRF handling for every unsafe cookie-authenticated request.

UiCogs applies authentication, credentials, context contribution, and cache scope automatically. Do not duplicate those responsibilities in application middleware.

## Cache And Live Data

- Verify that users and tenants never share a cache scope.
- Authenticated durable scopes are erased on explicit logout by default. Review any decision to retain them.
- Prefer IndexedDB for normalized cache persistence. Use local or session storage only for small caches.
- Gate authenticated SSE with the composed auth context.
- Test reconnects, scope changes, replay IDs, malformed events, and disposal.
- Do not record event payloads or complete request URLs in diagnostics.

## Forms And Files

- Validate files on the server.
- Enforce server-side size and content limits.
- Verify the selected multipart path convention against the server parser.
- Test cancellation and duplicate submission.
- Verify server field aliases and unbound errors.

## Verification

- Exercise list, detail, local resource, direct cache, mutation, relation, upload, auth, live, and disposal workflows against production-equivalent endpoints.
- Run `corepack pnpm release:check`.
- Inspect the generated software bill of materials.
- Resolve every high or critical production dependency advisory.
- Review bundle and performance changes above the repository thresholds.

## Monitoring

Record normalized failure kinds, status codes, retry counts, and live connection status.

Do not record request bodies, authorization headers, CSRF values, tokens, cookies, SSE payloads, or complete URLs containing query data.
