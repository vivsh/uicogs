# UiCogs

UiCogs is a TypeScript library for client-side data workflows.

A schema describes how data is parsed, validated, written, filtered, sorted, formatted, and edited. A resource connects that schema to local or remote data. Runtime controllers add loading state, errors, forms, pagination, relations, caching, authentication, and live updates.

The same declaration is used across these workflows. This reduces repeated field lists, payload mapping, form rules, table configuration, and response handling.

UiCogs is currently `0.1.0`. The API may change before a stable 1.0 release.

## Highlights

- Definitions are pure, typed, deeply immutable, and reusable across runtimes.
- Fields hold runtime type data and semantic editor, formatter, filter, and sorter descriptors.
- Parsing is synchronous. Validation has one asynchronous API.
- Remote resources use the built-in Fetch transport. Normal applications do not create a transport.
- Local resources use the same controllers and forms as remote resources.
- Entity data is normalized and shared. Loading state and errors remain local to each controller.
- Direct cache writes synchronously update existing object and collection controllers.
- Application context is an immutable store with automatic auth composition.
- One optional local, session, or IndexedDB backend can persist application context and normalized cache data.
- Forms select JSON or multipart encoding after schema writers run.
- Relations support to-one, to-many, bulk target loading, endpoint mutations, and explicit join resources.
- JWT and cookie authentication are runtime strategies. Authentication contributes context and cache scope automatically.
- SSE events update the same normalized cache used by requests and direct writes.
- Vue, React, and Quasar use the same framework-neutral controllers.
- OpenAPI 3.0 and 3.1 documents can generate definitions and operations at build time.

## When To Use UiCogs

Use UiCogs when an application has structured entities and repeated data workflows.

It is a good fit when several of these statements are true:

- The same fields appear in forms, tables, filters, detail views, and API payloads.
- List and detail screens must share entity data without sharing page loading or error state.
- The application needs local and remote resources with the same API.
- Forms need asynchronous validation, server field errors, or automatic file uploads.
- Relations must stay reactive when target entities change.
- Authentication must isolate cached data by user or tenant.
- The UI should be generated from semantic field metadata.
- Vue and React consumers must share the same data engine.

UiCogs is designed for operational applications, administration interfaces, CRUD-heavy products, and schema-driven tools.

## When Not To Use UiCogs

Do not use UiCogs only for runtime validation. A dedicated validation library has a smaller surface.

Do not use UiCogs as a general replacement for Pinia, Redux, or Zustand. It models resource workflows, auth-owned state, and a small runtime context consumed by those workflows. It does not model arbitrary view state.

Do not use UiCogs when the application has a few requests and no repeated field behavior. Direct Fetch calls and local component state will be simpler.

Do not use UiCogs as an ORM or server framework. It does not own a database, server authorization, routing, or business transactions.

Do not use the OpenAPI generator when unsupported schema constructs must be reproduced without review. Strict generation fails instead of guessing.

Do not assume final 1.0 stability while the package version is below 1.0.

## Packages

Install only the runtime and adapters used by the application.

This work does not publish packages automatically. Use workspace links or packed artifacts until a package release is published. The commands below show the package installation surface after publication.

```sh
# Headless runtime
pnpm add @uicogs/core

# Vue runtime
pnpm add @uicogs/vue vue

# React runtime
pnpm add @uicogs/react react

# Optional packages
pnpm add @uicogs/auth @uicogs/http
pnpm add @uicogs/storage
pnpm add @uicogs/quasar quasar
```

| Package              | Responsibility                                                                          |
| -------------------- | --------------------------------------------------------------------------------------- |
| `@uicogs/core`       | Definitions, runtime, Fetch transport, cache, controllers, forms, relations, and events |
| `@uicogs/auth`       | JWT and cookie auth strategies, token storage adapters, and auth-owned state            |
| `@uicogs/http`       | SSE, additional pagination adapters, multipart exports, and server-error adapters       |
| `@uicogs/vue`        | Vue-reactive controller adapter, view models, and runtime binding                       |
| `@uicogs/vue-router` | Controlled Vue Router state for resource workflows                                      |
| `@uicogs/react`      | React hooks based on `useSyncExternalStore`                                             |
| `@uicogs/quasar`     | Quasar editors, formatters, forms, tables, actions, and resource views                  |
| `@uicogs/openapi`    | OpenAPI reader, generator, and CLI                                                      |
| `@uicogs/storage`    | Shared local, session, and IndexedDB persistence backends                               |
| `@uicogs/legacy`     | Migration adapters for older constructor and mutable data-source code                   |

The Vue and React packages re-export the core authoring surface.

## First Example

Definitions do not need a runtime.

```ts
import { fields, filter, format, operation, resource, schema } from "@uicogs/core";

export const Task = schema({
  id: fields.ID(),
  title: fields.Str({
    required: true,
    minLength: 2,
    format: format.Text(),
    filter: filter.Contains(),
  }),
  complete: fields.Bool({ default: false }),
});

export const Tasks = resource({
  name: "tasks",
  url: "tasks/",
  schema: Task,
  key: "id",
  operations: {
    list: operation.list(),
    retrieve: operation.retrieve(),
    create: operation.create(),
    update: operation.patch(),
    remove: operation.remove(),
  },
});
```

The application creates one shared runtime.

```ts
import { createUiCogs } from "@uicogs/core";
import { Tasks } from "./definitions.js";

export const api = createUiCogs({
  baseUrl: "/api/",
  resources: [Tasks],
  context: { locale: "en", timeZone: "UTC" },
});
```

Each resource lookup creates a fresh workflow controller.

```ts
const pageTasks = api.resource(Tasks);
const sidebarTasks = api.resource(Tasks);

pageTasks !== sidebarTasks; // true

await pageTasks.filter({ complete: false }).sort("title").page(1, 25).load();

pageTasks.all();
pageTasks.loading;
pageTasks.error;
pageTasks.pageInfo;

const task = pageTasks.get(42);
await task.load();

task.value;
task.loading;
task.error;
```

The two resource controllers do not share loading, errors, filters, or pagination. They do share immutable cached entity snapshots.

## Definitions And Runtime

UiCogs has two layers.

```text
definition layer
  schema -> view/form -> resource -> operation reference

runtime layer
  createUiCogs -> cache -> requests -> auth/live -> controllers
```

Definitions are safe to import from any module. They contain no cache, Fetch client, auth session, reactive state, or current context value.

`createUiCogs()` creates an application-owned runtime. The package does not create a process-global runtime. A second call creates an independent cache, request coordinator, auth controller, and live connection.

The application should export its normal runtime from one module.

```ts
// api.ts
export const api = createUiCogs({ ... });
```

Call `api.dispose()` when that runtime is permanently shut down.

## Runtime Context

Application context is an immutable external store.

```ts
api.context.value.locale;

api.context.update({ locale: "fr" });

api.context.set({
  locale: "fr",
  timeZone: "Europe/Paris",
});
```

`value` is deeply readonly. Updates replace the snapshot and notify context-sensitive workflows automatically. There is no `contextChanged()` call.

An authenticated runtime composes the exact auth snapshot into context:

```ts
api.context.value.auth === api.auth.value;
```

One optional backend can persist application context and normalized cache data. It never stores composed auth context.

```ts
import { storage } from "@uicogs/storage";

const api = createUiCogs({
  context: { locale: "en", timeZone: "UTC" },
  persistence: {
    backend: storage.indexedDb({
      database: "application",
      store: "uicogs",
      namespace: "main-api",
    }),
  },
});
```

Context and cache persistence are enabled by default when a backend is configured. Local storage, session storage, and IndexedDB backends are available. A context parsing schema is optional.

See [Runtime Context](docs/context.md).

## Schemas

Object and decorator syntax produce the same immutable `Schema` implementation.

```ts
const parsed = Task.parse({ id: "42", title: "Review" });
const result = await Task.validate(parsed);
const payload = Task.write(parsed);
```

`parse()` performs deterministic structural conversion. It accepts no context. It throws `ParseError` for invalid external data.

`validate()` always returns a promise. Validators may be synchronous or asynchronous. Rule failures are returned as structured issues.

`write()` applies field aliases and writers. Read-only and computed fields are omitted.

Schema composition never mutates the source.

```ts
const TaskSummary = Task.keep("id", "title");
const TaskEdit = Task.drop("id").toForm({ mode: "patch" });
const ExtendedTask = Task.extend({ note: fields.Text() });
```

See [Schemas](docs/schemas.md) and [Validation](docs/validation.md).

## Resources And Cache

A resource definition owns one canonical entity identity. It defines the schema, key, source, URL, views, queries, and operations.

A resource controller owns one local workflow. The default controller is also a collection.

The normalized cache uses this entity identity:

```text
authentication scope -> resource name -> encoded key
```

Collections store ordered entity keys. They do not store entity copies.

Use the typed resource cache facade for synchronous ingestion.

```ts
const tasks = api.resource(Tasks);

tasks.cache.add({ id: 1, title: "Draft", complete: false });
tasks.cache.upsert({ id: 1, title: "Reviewed" });
tasks.cache.remove(1);
```

Existing object and collection controllers repaint immediately after these calls. A follow-up `load()` is not required.

See [Resources](docs/resources.md) and [Caching](docs/caching.md).

## Local Resources

A local resource has no URL.

```ts
import { local, resource } from "@uicogs/core";

const SelectedTasks = resource({
  name: "selected-tasks",
  schema: Task,
  key: "id",
  source: local({
    initial: [{ id: 1, title: "Review", complete: false }],
    generateKey: ({ existing }) => Math.max(0, ...existing.map(Number)) + 1,
  }),
});
```

Local CRUD methods remain asynchronous. Forms and framework adapters do not branch on the source type.

## Forms And Uploads

Forms own isolated drafts. Editing a form never mutates the cache.

```ts
const TaskEdit = Task.keep("title", "complete")
  .extend({ attachment: fields.File() })
  .toForm({ mode: "patch", encoding: "auto" });

const form = api.resource(Tasks).get(42).form(TaskEdit);

form.set("title", "Updated title");
const result = await form.submit();

if (!result.success) {
  console.log(result.failure.issues);
}
```

`encoding: "auto"` runs schema and form writers first. It sends JSON when no binary value remains. It sends `FormData` when a file or blob remains.

Nested file paths, file lists, unchanged remote files, replacements, and removals are handled by multipart adapters. Fetch upload progress is indeterminate because Fetch does not expose reliable upload progress.

See [Forms](docs/forms.md) and [Transport](docs/transport.md).

## Relations And Views

Relations refer to resource definitions.

```ts
const Comment = schema({
  id: fields.ID(),
  author: fields.Ref({ resource: Users, required: true }),
  reviewers: fields.RefList({ resource: Users }),
});
```

Included target objects are normalized into the target resource cache. Key-backed `RefList` relations load missing remote targets with one configurable list request. The default encoding is `?id=3&id=7&id=12`.

Attributed many-to-many relations use an explicit join resource. Relation controllers expose target values and join entries separately.

Views select read-only resource fields and may add synchronous computed fields. Views do not create another entity cache and cannot be mutation payloads.

See [Resources](docs/resources.md#relations).

## Authentication

Authentication is an immutable strategy passed to the runtime.

```ts
import { jwtAuth, memoryAuthStorage } from "@uicogs/auth";

const auth = jwtAuth({
  claims: Claims,
  login: Sessions.operation("login"),
  refresh: Sessions.operation("refresh"),
  logout: Sessions.operation("logout"),
  currentUser: Users.operation("current"),
  storage: memoryAuthStorage(),
  permissions: ({ claims }) => claims.permissions,
  cacheScope: ({ claims }) => ({ subject: claims.sub, tenant: claims.tenant }),
});

export const api = createUiCogs({
  baseUrl: "/api/",
  resources: [Users, Sessions],
  auth,
  context: { locale: "en" },
});
```

The runtime creates and owns the auth controller. It injects the auth snapshot into runtime context. It applies auth request middleware. It derives cache scope from the strategy. Application context does not repeat auth state.

Cookie auth uses the same runtime integration. It manages Fetch credentials and optional CSRF headers. It does not read or store HttpOnly cookies.

Initialization starts automatically. There is no runtime `ready` promise. Protected requests wait for initialization. Local and unauthenticated operations do not wait.

Client-side JWT parsing does not verify a token signature. Server authentication and authorization remain authoritative.

See [Authentication](docs/authentication.md).

## Live Updates

`@uicogs/http` provides a Fetch-based SSE source.

```ts
import { sse } from "@uicogs/http";

const api = createUiCogs({
  baseUrl: "/api/",
  resources: [Tasks],
  live: sse({ url: "events/" }),
});
```

Default event names are `<resource>`, `<resource>:delete`, and `<resource>:invalidate`. Upserts, tombstones, and invalidations use the same cache paths as ordinary resource writes.

SSE is one-way. Creates, updates, relation mutations, and actions still use normal operations.

## Vue, React, And Quasar

Vue is the primary reactive integration.

```ts
import { bindUiCogs, createUiCogs } from "@uicogs/vue";

export const api = createUiCogs({ resources: [Tasks], baseUrl: "/api/" });
export const { UiCogsPlugin, useUiCogs } = bindUiCogs(api);
```

The plugin provides the exact application-owned runtime. It does not create or dispose another runtime.

React hooks observe the same controllers through `useSyncExternalStore`. Controller creation should be memoized by logical identity.

Quasar provides schema-driven fields, forms, tables, resource views, actions, deletion, cancellation, alerts, and confirmations. Quasar components do not construct URLs or own cache logic.

See [Frameworks](docs/frameworks.md).

## Current Limits

- Binary download response modes are not part of 1.0.
- Fetch upload progress is indeterminate.
- One live source is supported per runtime.
- SSE replay IDs survive reconnects in one process only. They are not persisted across reloads.
- Client predicates can update collection membership only when membership is provable. Uncertain collections become stale.
- SSR-specific hydration and request-lifecycle APIs are not provided.
- Axios is not supported. A structural custom transport exists for specialized environments and tests.
- The legacy package is a migration tool. It is not the preferred authoring API.

## Documentation

The guides use short, literal statements. Each guide defines terms before using them. Code examples use public exports.

- [Architecture](docs/architecture.md)
- [Schemas](docs/schemas.md)
- [Validation](docs/validation.md)
- [Runtime context and persistence](docs/context.md)
- [Resources, operations, views, and relations](docs/resources.md)
- [Caching and request coordination](docs/caching.md)
- [Forms, files, and server failures](docs/forms.md)
- [Authentication and context](docs/authentication.md)
- [Default Fetch transport](docs/transport.md)
- [Vue, React, Vue Router, and Quasar](docs/frameworks.md)
- [OpenAPI generation](docs/openapi.md)
- [Runtime compatibility](docs/compatibility.md)
- [Production checklist](docs/production.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Migration](docs/migration.md)
- [Package stability](docs/stability.md)
- [Implemented workflow matrix](docs/parity.md)

## Repository Verification

Run the deterministic release gate:

```sh
corepack pnpm release:check
```

It runs formatting, linting, TypeScript, runtime coverage, type assertions, builds, API reports, bundle budgets, browser workflows, packed consumers, standalone-content checks, package audits, dependency audit, and SBOM generation.

The browser suite covers Chromium, Firefox, WebKit, and mobile Chromium. Packed consumers cover ESM, CommonJS, and strict TypeScript.
