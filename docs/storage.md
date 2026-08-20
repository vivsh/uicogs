# Storage

`@uicogs/storage` supplies browser implementations of the core `PersistenceBackend`
contract. It owns no cache policy, application state, authentication, or controller
state. `@uicogs/core` decides which records to persist and when; this package reads,
writes, and removes those records under a namespace.

## Runtime Configuration

```ts
import { createUiCogs } from "@uicogs/core";
import { storage } from "@uicogs/storage";

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

This enables persistence for application context and normalized cache data. Disable
either independently with `context: false` or `cache: false`. A supplied custom
cache requires `cache: false`; it cannot be combined with the built-in durable cache.

## Record Boundaries

Core sends logical keys that this package prefixes as `<namespace>/<key>`:

| Logical key             | Contents                                                  |
| ----------------------- | --------------------------------------------------------- |
| `context`               | Application context, excluding the auth-composed context. |
| `cache/anonymous`       | Normalized anonymous-scope data.                          |
| `cache/<encoded scope>` | Normalized data for one authenticated scope.              |

Cache records can contain entity snapshots, collection keys, freshness, tombstones,
and source versions. They exclude controller loading/error state, drafts,
validation, request failures, predicates, files, blobs, credentials, tokens, cookies,
auth snapshots, and SSE replay IDs. Authentication token storage belongs to
`@uicogs/auth`, not this package.

Core hydrates the active cache scope automatically. Cache-first requests wait for
hydration; network-only requests do not. Use `api.context.persistenceStatus` and
`persistenceError`, plus `api.cache.persistenceStatus`, `persistenceError`, and
`persistenceScope`, for diagnostics. Persistence failure never rolls back an
already-applied in-memory update.

Explicit logout removes the prior authenticated durable scope by default. Use
`cache: { eraseOnLogout: false }` only as an intentional retention policy.

## IndexedDB

```ts
storage.indexedDb({
  database: "application",
  store: "uicogs",
  namespace: "main-api",
  version: 1, // optional
});
```

This is the recommended backend, particularly for normalized caches or larger
context values. Each operation opens the database, creates a missing store during an
upgrade, runs a readonly or readwrite transaction, then closes the database. Omit
`version` for the browser default. If an existing database lacks the store, specify a
newer version so IndexedDB can upgrade it.

Provide `indexedDB` to inject an `IDBFactory` for tests or unusual runtimes. Without
it, the backend resolves `globalThis.indexedDB` lazily. Operations reject when
IndexedDB is unavailable or blocked, opening fails, a request fails, or a transaction
errors or aborts.

## Local And Session Storage

```ts
storage.local({ namespace: "main-api" });
storage.session({ namespace: "main-api" });
```

These are JSON adapters for Web Storage and suit small values only. Local storage
survives browser sessions; session storage follows the browser session. The browser
global is resolved lazily, so construction is safe without it but the first operation
rejects if it is unavailable.

Pass a compatible implementation to use another store or test without browser globals:

```ts
const backend = storage.local({ namespace: "main-api", storage: myStorage });
```

```ts
interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
```

Missing keys resolve to `undefined`. A write rejects if `JSON.stringify` returns
`undefined`; other serialization, storage, and stored-JSON parse failures propagate.

## Custom Backends

Any asynchronous backend may be used without this package:

```ts
import type { PersistenceBackend } from "@uicogs/core";

const backend: PersistenceBackend = {
  async read(key) {
    /* return a value, or undefined when absent */
  },
  async write(key, value) {
    /* persist value */
  },
  async remove(key) {
    /* remove value */
  },
};
```

Core encodes context and cache values before calling the backend. Its encoding supports
`undefined`, finite numbers, strings, booleans, `null`, arrays, plain objects, and
valid `Date` values; it also preserves objects with an own `$uicogs` key. It rejects
non-finite numbers, invalid dates, cycles, non-plain objects (including `Map`, `Set`,
files, and blobs), functions, symbols, bigints, and other unsupported values. A
backend must preserve what it receives sufficiently for core to decode it.

Use a new namespace when intentionally abandoning incompatible stored data. For
possibly old or externally written context, configure `persistence.context.schema`;
core parses before publishing and keeps the initial context if parsing fails.

## Public API

```ts
storage.local(options);
storage.session(options);
storage.indexedDb(options);
```

The three functions are also named exports. Every factory returns an immutable
`PersistenceBackend` with asynchronous `read`, `write`, and `remove`; the `storage`
namespace is immutable too. The package is browser-focused and side-effect free.
