# UiCogs

**One definition for the data work your application repeats everywhere.**

UiCogs is a TypeScript library for operational applications: the products with lists, filters, forms, detail screens, relations, authentication, and APIs that all need to agree about the same entities.

Describe an entity once. UiCogs carries that definition through parsing, validation, API payloads, filters, editors, formatting, resources, forms, relations, caching, and framework bindings—without turning your application into a global state store.

```text
fields + schema + resource
          │
          ├── forms and validation
          ├── lists, filters, sorting, and pagination
          ├── normalized cache and relations
          ├── local or remote operations
          └── Vue, React, and Quasar interfaces
```

> **Status:** UiCogs is `0.1.0`. It is usable as a workspace or packed artifact, but its public API can change before 1.0.

## Why UiCogs?

Most client applications repeat the same knowledge in several places: a type, validation rules, form configuration, a table column list, a filter, payload mapping, endpoint code, and cache updates. They gradually drift apart.

UiCogs gives that knowledge one immutable home.

It is a good fit for admin tools, back-office products, CRUD-heavy SaaS applications, internal platforms, and schema-driven interfaces where entities appear in more than one workflow.

It is not a replacement for a small `fetch()` call, a validation-only library, an ORM, a server framework, or general view-state management. Use it when repeated entity workflows are the problem.

## A complete small example

Start with pure definitions. They have no cache, network client, auth session, or framework state, so they can live anywhere and be reused by more than one runtime.

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

Create one application-owned runtime.

```ts
import { createUiCogs } from "@uicogs/core";
import { Tasks } from "./definitions.js";

export const api = createUiCogs({
  baseUrl: "/api/",
  resources: [Tasks],
  context: { locale: "en", timeZone: "UTC" },
});
```

Use fresh controllers for each workflow. They share entity data, but never page-local loading, errors, filters, pagination, drafts, or cancellation.

```ts
const tasks = api.resource(Tasks);

await tasks.filter({ complete: false }).sort("title").page(1, 25).load();

tasks.all();
tasks.loading;
tasks.error;

const task = tasks.get(42);
await task.load();

const edit = task.form(Task.keep("title", "complete").toForm({ mode: "patch" }));
edit.set("title", "Ship UiCogs");
await edit.submit();
```

## The model: definitions, runtime, controllers

UiCogs stays predictable because its ownership boundaries are explicit.

| Layer           | Owns                                                                                 | Does not own                                             |
| --------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| **Definitions** | fields, schemas, resources, operations, forms, views                                 | a network client, cache, current user, or reactive state |
| **Runtime**     | registry, Fetch requests, normalized cache, auth, context, persistence, live updates | a process-global singleton                               |
| **Controllers** | one list, object, form, relation, or action workflow                                 | another controller's loading state or draft              |

Within one runtime, these are shared:

- immutable normalized entity snapshots and collection keys;
- request execution for equivalent in-flight requests;
- application context, authentication state and cache scope;
- optional persistence and server-sent events.

These remain local to each controller:

- loading and request errors;
- filters, sorting, pagination, and cancellation;
- form drafts, dirty state, validation, and submission progress;
- action progress and result state.

Two screens can therefore show the same task without fighting over each other's pagination spinner or unsaved form draft.

## What it handles

### Typed, immutable schemas

Fields carry runtime parsing and semantic metadata for forms and displays. Schemas can be composed with `keep`, `drop`, `extend`, `modify`, `partial`, `required`, `view`, `toQuery`, and `toForm`; every operation returns a new immutable definition.

Parsing is synchronous and context-free. Validation always returns a promise, so a field can perform a cancellable server check while preserving one API:

```ts
const Account = schema.withContext<AppContext>()({
  username: fields.Str({
    validate: [
      async ({ value, context, signal }) =>
        (await context.names.isAvailable(value, signal))
          ? undefined
          : "This username is already taken",
    ],
  }),
});
```

Interactive form validation can be debounced; a newer validation cancels the old generation. Submit validation runs immediately.

### Resources that work locally or remotely

Resources are the home for base URLs, operations, request/response schemas, pagination, encodings, and failure mapping. Remote resources use Fetch; local resources expose the same controller and form APIs, so UI code does not branch by source.

Payload writers run before JSON or multipart selection. File values automatically select multipart encoding when necessary.

### A cache designed for UI workflows

Entity identity is scoped by resource and key. Collections hold ordered keys rather than duplicate entity objects. Detail responses, lists, relations, mutations, direct writes, and live events all normalize through the same cache entry.

```ts
const tasks = api.resource(Tasks);

tasks.cache.add(value);
tasks.cache.upsert(patch);
tasks.cache.remove(id);
tasks.cache.replaceAll(values);
```

Those writes synchronously notify existing controllers. Vue and React views update without an extra `load()`.

Cache policies include `cache-first`, `network-only`, and `stale-while-revalidate`. Equivalent concurrent requests share one network execution while each controller retains its own loading and error state.

### Relations, auth, persistence, and live data

- To-one, key-backed to-many, query-driven, and explicit join-resource relations.
- Page, offset, cursor, link-header, client, and custom pagination adapters.
- JWT and cookie authentication strategies with auth-owned cache scope.
- Local storage, session storage, and IndexedDB persistence backends.
- Optional Fetch-stream server-sent events that update the normalized cache.
- OpenAPI 3.0 and 3.1 definition and operation generation at build time.

## Frameworks

The core owns behavior; framework packages observe controllers rather than duplicating cache or request logic.

| Package              | Use it for                                                                |
| -------------------- | ------------------------------------------------------------------------- |
| `@uicogs/core`       | definitions, runtime, Fetch transport, cache, resources, forms, relations |
| `@uicogs/vue`        | Vue-reactive controllers and an application-bound injection plugin        |
| `@uicogs/react`      | React hooks built on `useSyncExternalStore`                               |
| `@uicogs/quasar`     | Quasar fields, forms, tables, actions, and resource views                 |
| `@uicogs/vue-router` | controlled resource workflow state in Vue Router                          |
| `@uicogs/auth`       | JWT and cookie auth strategies                                            |
| `@uicogs/http`       | SSE, pagination adapters, multipart conventions, server-error adapters    |
| `@uicogs/storage`    | local, session, and IndexedDB persistence                                 |
| `@uicogs/openapi`    | OpenAPI reader, generator, and CLI                                        |
| `@uicogs/legacy`     | migration adapters for older mutable data-source code                     |

Vue applications can bind the exact runtime they created, without a package-global singleton:

```ts
import { bindUiCogs, createUiCogs } from "@uicogs/vue";

export const api = createUiCogs({ resources: [Tasks], baseUrl: "/api/" });
export const { UiCogsPlugin, useUiCogs } = bindUiCogs(api);

// main.ts
app.use(UiCogsPlugin);

// a component
const api = useUiCogs();
```

## Installation

Install only the runtime and adapters your application uses once packages are published:

```sh
pnpm add @uicogs/core
pnpm add @uicogs/vue vue       # or @uicogs/react react
pnpm add @uicogs/auth @uicogs/storage  # optional
```

Until publication, use workspace links or packed artifacts.

## Choose UiCogs when

- one entity needs to drive forms, tables, filters, payloads, and detail views;
- list and detail views should share data but not their temporary UI state;
- local and remote data need the same workflow interface;
- forms need async validation, server issues, or file uploads;
- relations must remain current as target entities change;
- a Vue and React product should share one data engine.

## Read next

- [Architecture](docs/architecture.md) — runtime lifecycle, ownership, data flow, and cache identity.
- [Schemas](docs/schemas.md) and [Validation](docs/validation.md) — fields, composition, parsing, and async checks.
- [Resources](docs/resources.md), [Forms](docs/forms.md), and [Caching](docs/caching.md) — the primary application workflow.
- [Authentication](docs/authentication.md), [Context](docs/context.md), and [Transport](docs/transport.md) — runtime services and request behavior.
- [Frameworks](docs/frameworks.md) — Vue, React, Quasar, and Vue Router.
- [OpenAPI](docs/openapi.md), [Migration](docs/migration.md), and [Production](docs/production.md) — generation, adoption, and release readiness.

## Development

The repository uses Node.js 22+ and pnpm 11.15.1.

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm test:types
pnpm build
```

Run `pnpm release:check` before a release. It includes formatting, linting, type checks, coverage, browser tests, packed-consumer tests, public API and package checks, production dependency audit, and SBOM generation.
