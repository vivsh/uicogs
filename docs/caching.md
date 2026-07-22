# Caching And Request Coordination

This guide defines shared data, local controller state, and publication rules.

## Ownership

Each runtime owns one cache and one request coordinator.

Resource controllers are local workflows over that shared runtime.

The cache stores data. Controllers store transient workflow state.

## Identities

Entity identity:

```text
scope -> resource name -> encoded key
```

Collection identity:

```text
scope -> resource name -> query name -> canonical parameters -> page state
```

A custom key encoder is required when a key is not already a stable string or number.

## Entity Entries

An entity entry stores:

- encoded key;
- known canonical fields;
- immutable materialized snapshot when enough fields are known;
- local version;
- optional external source version;
- update time;
- stale time;
- tombstone state.

An entity entry does not store loading or request errors.

## Collection Entries

A collection entry stores:

- canonical collection identity;
- ordered entity keys;
- page metadata;
- update time;
- stale time.

A collection entry does not store entity copies.

## Data Excluded From Cache

The cache never stores:

- controller loading;
- controller errors;
- active filters or sorting;
- current page navigation;
- cancellation state;
- form drafts;
- submission progress;
- computed view values;
- Vue proxies or React state;
- tokens, cookies, authorization headers, or CSRF values;
- SSE diagnostics or replay IDs.

## Merge Rules

Merge behavior is field-aware.

- A present field replaces the previous field.
- A missing field preserves the previous field.
- Explicit `null` replaces the previous field.
- Summary and detail responses merge into one entry.
- Included relation objects normalize into target entries.
- A stale request cannot replace a newer response or mutation.
- An equal or older live source version is ignored.
- Mixed numeric and string source versions are rejected.
- Delete writes a tombstone and removes known collection membership.

Snapshots are immutable. A change replaces the snapshot and publishes a cache notification.

## Controller Isolation

```ts
const page = api.resource(Tasks);
const sidebar = api.resource(Tasks);
```

`page` and `sidebar` have independent workflow state.

After one controller normalizes task `42`, both controllers read the same immutable value snapshot for task `42`.

One controller's request error does not overwrite another controller's error. One controller's retry does not set another controller's loading state.

## Direct Writes

Application code should use the typed resource cache facade.

```ts
const tasks = api.resource(Tasks);

tasks.cache.add(task);
tasks.cache.upsert(patch);
tasks.cache.remove(taskId);
tasks.cache.replaceAll(values);
```

These methods are synchronous.

They parse values, extract keys, normalize included relations, freeze snapshots, update membership, and publish before returning.

An existing `get(key)` controller updates immediately. An existing collection updates immediately when membership changes. Vue and React repaint from the same notifications.

`api.cache` is the adapter-level interface. Normal application code should not construct raw entries.

## Membership Modes

Direct add and upsert support membership policy.

```text
none      -> update entity data only
current   -> update the current collection
matching  -> update collections whose complete predicate proves membership
```

An uncertain remote collection keeps its current keys and becomes stale.

A paginated collection is uncertain for automatic insertion.

Deletion removes the key from all known collections.

## Local Resource Storage

A local source stores canonical entities and one master key order in the normalized cache.

Local filters, sorting, and pages are projections of the master order. They do not own entity copies.

Local resources use the current runtime scope. Auth identity changes therefore isolate local data in the same way as remote data.

## Loading Policies

Supported policies are:

```text
cache-first
network-only
stale-while-revalidate
```

`cache-first` is the runtime default.

`network-only` always requests.

`stale-while-revalidate` returns a current cached result and starts a background network request.

Resource and query TTL values determine `staleAt`.

`refresh()` uses `network-only`.

`invalidate()` removes or marks the relevant cached result so the next read reloads.

## Request Deduplication

The coordinator keys requests by scope, resource, operation, and canonical input.

Equivalent observers share one execution.

The execution includes:

- application middleware;
- auth middleware;
- default GET retry behavior;
- Fetch;
- response parsing.

Observer rules:

- each observer owns loading and error state;
- cancelling one observer detaches it;
- the transport aborts when the final observer detaches;
- disposal aborts all active executions;
- late completion cannot publish after disposal;
- retry timers are cleared when no observers remain.

The implementation is in [request.ts](../packages/core/src/request.ts).

## Authentication Scope

An auth strategy supplies cache scope automatically.

JWT default scope is `subject:<sub>` unless a `cacheScope` projection is configured.

Cookie auth default scope uses the configured `subject` callback.

A tenant-aware strategy should return both subject and tenant.

```ts
cacheScope: ({ claims }) => ({
  subject: claims.sub,
  tenant: claims.tenant,
});
```

On identity change, the runtime aborts old authenticated requests, switches scope, and clears the previous authenticated in-memory scope.

The optional runtime `cacheScope` callback is for an advanced runtime without an auth strategy. An attached auth strategy takes precedence.

## Persistent Cache

Configure one shared backend on the runtime:

```ts
const api = createUiCogs({
  persistence: {
    backend: storage.indexedDb({
      database: "application",
      store: "uicogs",
      namespace: "main-api",
    }),
  },
});
```

Context and cache persistence are enabled by default. Set either option to `false` to disable it.

The runtime automatically hydrates the active cache scope. Cache-first operations wait internally for hydration. Network-only operations do not wait.

Persistent data may contain normalized entities, collection keys, freshness, tombstones, and source versions.

Persistent data must not contain controller state, request failures, credentials, predicates, or replay cursors.

Explicit logout erases the previous authenticated durable scope by default. Set `cache: { eraseOnLogout: false }` to retain it. Expiry and tenant changes remain isolated without guessing membership across scopes.

```ts
api.cache.persistenceStatus;
api.cache.persistenceError;
api.cache.persistenceScope;
```

IndexedDB is recommended. Session storage and local storage are intended only for small caches. File and Blob values are not persistent cache data.

## SSE Membership

SSE upserts and `resource.cache.upsert({ membership: "matching" })` use the same membership evaluator.

Existing rows repaint immediately.

New rows enter only unpaginated collections with a complete client predicate that returns true.

Server-only, paginated, or incomplete predicates cause staleness instead of guessed insertion.

Invalidation preserves collection keys and marks the collections stale.

SSE replay IDs are memory-only. Scope changes clear them.
