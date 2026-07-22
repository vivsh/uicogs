# Runtime Context

Runtime context contains application-owned values used by UiCogs definitions and operations.

Context is runtime state. Schema and resource definitions remain pure.

## Initial Context

Pass the initial value to `createUiCogs()`.

```ts
const api = createUiCogs({
  context: {
    locale: "en",
    timeZone: "UTC",
    project: initialProject,
  },
});
```

The runtime copies and deeply freezes the value.

```ts
api.context.value.locale;
api.context.value.locale = "fr"; // TypeScript error
```

Existing snapshots never change.

## Updates

Use `update()` for a shallow patch.

```ts
api.context.update({ locale: "fr" });
```

Use `set()` for complete replacement.

```ts
api.context.set({
  locale: "fr",
  timeZone: "Europe/Paris",
  project: nextProject,
});
```

Both methods publish synchronously. Validators, formatters, computed fields, access rules, local handlers, live-source enablement, Vue, and React observe the new snapshot.

There is no public `contextChanged()` method.

## Store Contract

The context controller is an external store.

```ts
api.context.value;
api.context.getSnapshot();

const unsubscribe = api.context.subscribe(listener);
unsubscribe();
```

`getSnapshot()` contains a revision, the composed value, and persistence state.

## Authentication Composition

Authentication has a separate runtime-owned store.

An authenticated runtime composes the exact auth snapshot into context.

```ts
api.context.value.auth === api.auth.value; // true
```

Application context cannot define or update `auth`.

```ts
api.context.update({ auth: value }); // TypeScript error
```

Auth changes automatically publish a new composed context. The application does not repeat auth state or notify UiCogs manually.

A runtime without authentication has no `auth` context property.

## Persistence

Persistence is optional. One backend stores application context and normalized cache records under separate keys.

```ts
import { storage } from "@uicogs/storage";

const api = createUiCogs({
  context: {
    locale: "en",
    timeZone: "UTC",
  },
  persistence: {
    backend: storage.indexedDb({
      database: "application",
      store: "uicogs",
      namespace: "main-api",
    }),
  },
});
```

The complete application context is persisted. The composed auth snapshot is never passed to the backend. Context and cache persistence default to enabled.

The backend receives separate logical keys. They are `context`, `cache/anonymous`, and one encoded `cache/<scope>` key for each authenticated subject and tenant. Storage factories prefix those keys with their configured namespace.

Disable either record family explicitly when needed:

```ts
persistence: {
  backend,
  context: false,
  cache: true,
}
```

A custom cache can share the backend for context only by setting `cache: false`. A custom cache and built-in persistent cache cannot both be active.

Built-in adapters are:

```ts
storage.local({ namespace: "main-api" });
storage.session({ namespace: "main-api" });
storage.indexedDb({
  database: "application",
  store: "uicogs",
  namespace: "main-api",
  version: 1,
});
```

Local and session storage use JSON. IndexedDB uses the browser's structured-clone behavior.

Use IndexedDB for values that may exceed local-storage limits.

Opening a new database creates the configured store. If an existing database does not contain that store, increase `version` so IndexedDB runs an upgrade.

## Optional Schema

A persistence schema is optional.

```ts
persistence: {
  backend,
  context: { schema: PersistedContext },
  cache: true,
}
```

Without a schema, UiCogs requires the stored value to be an object and trusts its fields.

With a schema, the stored value is parsed before publication. A parse failure preserves the initial context and reports a persistence error.

## Hydration

The initial context is available immediately.

Persistence loads automatically in a microtask. A valid stored value replaces the application context and publishes a new snapshot.

Context hydration does not block unrelated work. Cache-first operations internally wait for active-scope cache hydration. There is no public readiness call.

```ts
api.context.persistenceStatus;
// "memory" | "loading" | "ready" | "error"

api.context.persistenceError;
```

A local update made before loading completes wins over the older stored value.

## Writes

Context updates publish in memory before persistence starts.

Persistence writes are serialized. Multiple queued updates are coalesced to the latest value. An older write cannot complete after a newer write.

A storage failure does not roll back the in-memory context.

## Reset

`reset()` restores the original context and clears persisted context.

```ts
await api.context.reset();
```

## Transient State

Do not put temporary component state in runtime context.

Use Vue reactivity, React state, or another application store for dialog state, hover state, temporary selections, and other UI-only values.

Use runtime context for application values consumed by UiCogs workflows.

## Custom Backend

A custom backend implements the core contract.

```ts
interface PersistenceBackend {
  read(key: string): Promise<unknown | undefined>;
  write(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}
```

Backends receive portable context and normalized-cache records under separate keys. They never receive auth context, tokens, cookies, materialized snapshots, or controller state.
