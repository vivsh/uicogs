# Troubleshooting

## Fetch Is Unavailable

Remote work resolves Fetch when the first request starts.

Use a supported browser, Node.js 22 or 24, `http.fetch`, or a custom structural transport. Local resources and schema operations do not require Fetch.

## A Protected Request Waits

Protected requests wait for automatic authentication initialization.

Check `api.auth.status`. Call `api.auth.initialize()` only when a deterministic test or unusual bootstrap flow needs an explicit boundary.

Local resources and operations with `auth: "none"` do not wait.

## Persisted Context Is Not Applied

Read `api.context.persistenceStatus` and `api.context.persistenceError`.

Local and session storage require JSON-compatible context. IndexedDB requires browser structured-clone compatibility.

A context update made while persistence is loading intentionally wins over the older stored value.

Read `api.cache.persistenceStatus`, `api.cache.persistenceError`, and `api.cache.persistenceScope` for normalized-cache persistence. A cache-first load waits internally for active-scope hydration. A network-only load does not wait.

When a schema is configured, parse failure preserves the initial context.

## A Cookie Request Does Not Include The Session

Set `credentials` on `cookieAuth()`.

Use `"same-origin"` for same-origin APIs. Use `"include"` only when the server and CORS policy support cross-origin credentials.

Do not set credentials in general HTTP options.

## A JWT Request Returns 401 Repeatedly

UiCogs performs at most one refresh and replay.

Verify token expiry, refresh output, claim parsing, and the authorization scheme. A failed refresh ends the authenticated session. UiCogs does not send a required request anonymously after refresh failure.

## A Request Times Out During Retry

The timeout is one total deadline. It includes all attempts and retry delays.

Reduce retries, reduce backoff, or increase `timeoutMs`. Use `timeoutMs: 0` only when another layer always enforces a deadline.

## Multipart Reaches The Server Without Files

Use `encoding: "auto"` or `"multipart"`.

Preserve `File` and `Blob` values through the schema writer. Remove an application-supplied multipart `Content-Type`. Fetch must create the boundary.

Verify that the server expects the configured dotted, bracket, or custom path convention.

## A Server Field Error Is Unbound

Error adapters emit wire paths. Schema aliases then map wire paths to form paths.

Verify the field alias and adapter shape. Unknown paths remain in `form.unboundIssues` by design.

## A Relation Omits Values

Read `relation.missingKeys`.

Bulk loading preserves declared order. Missing and tombstoned targets remain absent from `relation.values`.

Verify the repeated-key parameter, relation-level fetch override, and server response keys.

## A Collection Does Not Insert A Live Entity

Existing keys repaint immediately.

A new key enters only an unpaginated collection with a complete client predicate. Paginated and server-only collections keep their rows and become stale.

## A Direct Cache Write Does Not Change `all()`

`upsert` preserves membership by default for existing keys. A new key joins the current collection by default.

Use `membership: "current"` for the current controller. Use `membership: "matching"` only when query predicates can prove membership.

## State Changes After Disposal

This is a defect.

Confirm that the same runtime is disposed once. Confirm that custom transports honor abort. Confirm that controllers are not retained past their owner.

Request observers must reject after disposal even when an underlying custom transport ignores abort.
