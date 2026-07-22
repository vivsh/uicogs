# Architecture

This guide defines the UiCogs ownership model and data flow.

## Terms

A **definition** is immutable configuration. Schemas, views, forms, resources, operations, auth strategies, and descriptors are definitions.

A **runtime** is one `createUiCogs()` result. A runtime owns cache data, requests, authentication, context, live updates, and controller adaptation.

A **controller** is a stateful external store for one workflow. Resource, collection, object, relation, form, action, auth, and live objects are controllers.

A **snapshot** is an immutable value published by a cache entry or controller.

## Fixed Rules

1. Definitions do not access a runtime.
2. Definitions do not contain current context values.
3. Definitions are deeply immutable.
4. Every runtime has an explicit resource registry.
5. Every `api.resource(...)` call creates a fresh resource controller.
6. Resource controllers in one runtime share normalized data.
7. Resource controllers do not share loading, errors, filters, pages, or cancellation.
8. A second runtime is independent unless an adapter is explicitly shared.
9. Only resource definitions own base URLs.
10. Parsing accepts no context.
11. Authentication contributes context and cache scope automatically.
12. Framework packages observe controllers. They do not own data behavior.

## Definition Layer

The definition graph is created before the runtime.

```text
fields -> schema -> view or form
                  -> resource -> queries and operations
                              -> operation references
auth strategy ----------------> operation references
```

Definitions are created with exported factories:

```ts
schema(...)
resource(...)
operation.list(...)
fields.Str(...)
struct.toSchema(...)
```

Definitions may be reused by multiple runtimes. Reuse does not share runtime state.

The implementation is in [schema.ts](../packages/core/src/schema.ts), [field.ts](../packages/core/src/field.ts), and [resource.ts](../packages/core/src/resource.ts).

## Runtime Layer

The application normally creates one shared browser runtime.

```ts
export const api = createUiCogs({
  resources: [Users, Tasks],
  baseUrl: "/api/",
  context: { locale: "en" },
});
```

The runtime validates the complete registry at construction.

Construction rejects:

- duplicate resource names;
- different definitions with the same name;
- unregistered relation targets;
- conflicting relation targets;
- unregistered auth operation resources;
- duplicate auth lifecycle operation references.

Name lookup is typed when the resource tuple is inferred.

```ts
api.resource(Users);
api.resource("users");
```

Passing an unregistered definition throws. Resource lookup never registers a definition.

The implementation is in [factory.ts](../packages/core/src/factory.ts) and [resource.ts](../packages/core/src/resource.ts).

## State Ownership

| State                              | Owner                           | Shared within one runtime |
| ---------------------------------- | ------------------------------- | ------------------------- |
| Entity fields and freshness        | normalized cache                | yes                       |
| Collection keys and page metadata  | normalized cache                | yes                       |
| In-flight request execution        | request coordinator             | yes                       |
| Auth session and auth-owned state  | auth controller                 | yes                       |
| Application context                | context controller              | yes                       |
| SSE connection and replay IDs      | live controller                 | yes                       |
| Loading and request error          | object or collection controller | no                        |
| Filters, sorting, and current page | collection controller           | no                        |
| Form draft and field state         | form controller                 | no                        |
| Action progress and result         | action controller               | no                        |
| Vue proxy or React hook state      | framework adapter               | no data copy              |

This split allows two pages to reuse entity data without overwriting each other's workflow state.

## Entity Data Flow

Remote response flow:

```text
Fetch response
  -> operation response selection
  -> synchronous schema parsing
  -> included relation normalization
  -> scoped entity merge
  -> immutable entity snapshot
  -> object and collection notifications
  -> Vue proxy or React hook repaint
```

Local mutations, direct cache writes, and SSE events enter at the schema parsing or cache merge step. They use the same publication path.

Validation is separate:

```text
external input
  -> parse
  -> field validators
  -> schema validators
  -> form validator
  -> writer
  -> body encoding
  -> operation
```

Parsing performs no network work. Validation may perform asynchronous work.

## Cache Identity

Entity identity:

```text
scope -> resource name -> encoded key
```

Collection identity:

```text
scope -> resource name -> query name -> canonical input -> page
```

Collection entries store keys. Entity objects are not duplicated in collection entries.

Summary, detail, relation, form, direct-cache, and live responses for one key merge into the same entity entry.

See [Caching](caching.md).

## Request Coordination

Equivalent requests share one execution. The shared execution includes application middleware, auth middleware, retries, and Fetch.

Each observer keeps its own loading and error state. Cancelling one observer detaches it. The underlying request aborts when the final observer detaches.

Request coordination does not turn controllers into global state.

The implementation is in [request.ts](../packages/core/src/request.ts).

## Context

Application context is an immutable runtime-owned store.

```ts
const api = createUiCogs({
  context: { locale, timeZone },
});
```

An authenticated runtime composes this value with `auth`.

```text
runtime context = application context + current auth snapshot
```

Application context must not define an `auth` property.

Read `api.context.value`. Use `api.context.update()` or `api.context.set()` to publish application changes. There is no manual invalidation method.

Authentication has a separate store. `api.context.value.auth` references the exact `api.auth.value` snapshot. Auth changes update the composed context automatically.

Context is available to validators, computed fields, writers, access policies, local handlers, and live-source enablement. Parsing remains context-free.

Optional persistence uses one namespaced backend for application context and normalized cache records. Context and cache remain separate logical records. See [Runtime Context](context.md) and [Caching](caching.md).

## Authentication

`jwtAuth()` and `cookieAuth()` return immutable strategy definitions. Passing a strategy to `createUiCogs()` creates a runtime-owned auth controller.

The runtime automatically:

- installs auth middleware as the innermost middleware;
- injects the auth snapshot into context;
- uses the auth strategy's cache scope;
- starts initialization in a microtask;
- aborts old requests when identity changes;
- clears the previous authenticated memory scope;
- reevaluates the live source.

The core package depends on a structural auth contract. Core does not import `@uicogs/auth`.

See [Authentication](authentication.md).

## Views

A view is a read-only projection of a resource schema. A view may add synchronous computed fields.

A view has no writer. It cannot be used as a mutation payload. It does not create another entity identity.

A partial response may materialize a view before enough fields are known to materialize the full entity.

## Relations

Relation fields store target resource definition identity.

Included target objects are normalized before the parent is materialized. Direct parent values are resolved from the target cache.

To-one key relations use the target retrieve operation. Key-backed to-many relations bulk-load missing targets. Query-driven relations use one collection request. Through relations load join rows and then bulk-load missing targets.

See [Resources](resources.md#relations).

## Failures

Expected request failures are normalized into a finite failure kind.

```text
validation | authentication | permission | not-found | conflict
rate-limit | network | server | unknown
```

Forms and action controllers return discriminated results for expected failures. Programming errors still throw.

Abort is distinct from failure. Caller cancellation remains an `AbortError`.

## Framework Boundary

Controllers implement:

```ts
interface ExternalStore<T> {
  getSnapshot(): T;
  subscribe(listener: () => void): () => void;
}
```

Vue uses a readonly proxy tied to a reactive revision. React uses `useSyncExternalStore`. Quasar renders Vue controllers and semantic descriptors.

No framework package implements cache, transport, parsing, validation, auth, or SSE logic.

## Lifecycle

The application owns the runtime.

`api.dispose()`:

- aborts coordinated requests;
- disposes authentication work and timers;
- closes the live stream;
- clears runtime subscriptions;
- rejects future network work.

Page controllers do not dispose the shared runtime.

UiCogs does not provide SSR hydration or request-scope APIs. A server integration must define its own runtime ownership policy.
