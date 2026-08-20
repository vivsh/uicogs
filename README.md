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

Before mounting an application, await the one startup boundary. It restores persisted
context, resolves authentication, and hydrates the active cache scope:

```ts
await api.ready;
app.mount("#app");
```

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

### Optional Quasar stylebook

Quasar applications can opt into a fixture-only visual review route. It uses the same
public UiCogs and Quasar components while deliberately avoiding application data,
resources, network calls, storage, and live effects. Dynamically import it only during
development:

```ts
const stylebook = import.meta.env.DEV
  ? (await import("@uicogs/quasar/stylebook")).stylebook()
  : undefined;
const { uiCogs } = await withVue(api, { navigation, stylebook });
```

The built-in overview includes palette, typography, component states, and static pie,
bar, and line chart fixtures. See [Quasar Stylebook](docs/stylebook.md).

### Services for operation-first APIs

Use a service when an API has actions but no managed entity: sign-in, password reset,
checkout, uploads, imports, or report generation. A service has the same typed action,
request, cancellation, and form behavior as a resource, but deliberately has no cache,
collection, object, or CRUD controller.

```ts
import { createUiCogs, operation, service } from "@uicogs/core";

const Authentication = service({
  name: "authentication",
  url: "auth/",
  actions: {
    passwordLogin: operation.action({
      path: "login/",
      input: PasswordLogin,
      output: Session,
      auth: "none",
    }),
  },
});

const api = createUiCogs({ services: [Authentication] });
const login = api.service(Authentication).actionForm("passwordLogin", PasswordLogin.toForm());
await login.submit();
```

Resource create and edit forms stay concise with `.form(...)`. Bind a non-CRUD resource
action explicitly with `.actionForm("invite", InviteUser.toForm())`; use the identical
method on services.

Object and bulk actions can additionally opt into framework-neutral presentation without
coupling a resource to a component library. `operation.object()` binds a path to one
object URL; its optional `presentation` declares semantic label, icon, confirmation,
scope requirements, visibility, disabled state, and one or more view placements.

```ts
archive: operation.object({
  path: "archive/",
  presentation: {
    placement: ["aside", "edit"],
    label: "Archive",
    icon: "archive",
    confirmation: "Archive this task?",
    scopes: ["tasks.archive"],
  },
}),
```

The resolved action is client presentation only—the server remains the authorization
authority. See [Resources](docs/resources.md#presented-resource-actions) and
[framework integration](docs/frameworks.md#ucresourceview) for headless, Vue, React,
and Quasar usage.

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
- Explicit Vyuh, DRF, Laravel, Spring Data, JSON:API, GraphQL, and custom response profiles.
- JWT and cookie authentication strategies with auth-owned cache scope.
- Local storage, session storage, and IndexedDB persistence backends.
- Optional SSE, WebSocket, and polling live sources that update the normalized cache,
  persistent inbox, and transient alert queue through one effect pipeline.
- OpenAPI 3.0 and 3.1 definition and operation generation at build time.

## Frameworks

The core owns behavior; framework packages observe controllers rather than duplicating cache or request logic.

| Package           | Use it for                                                                |
| ----------------- | ------------------------------------------------------------------------- |
| `@uicogs/core`    | definitions, runtime, Fetch transport, cache, resources, forms, relations |
| `@uicogs/echarts` | schema-bound ECharts definitions, reactive bindings, and Vue components   |
| `@uicogs/routes`  | framework-neutral scope resolution used by framework bindings             |
| `@uicogs/vue`     | `withVue()`, Vue Router binding, reactive controllers, and injection      |
| `@uicogs/react`   | `withReact()` and React hooks built on `useSyncExternalStore`             |
| `@uicogs/quasar`  | Quasar forms, resource views, application layout, navigation, and inboxes |
| `@uicogs/auth`    | JWT and cookie auth strategies                                            |
| `@uicogs/http`    | response profiles, SSE, pagination, multipart, and server errors          |
| `@uicogs/storage` | local, session, and IndexedDB persistence                                 |
| `@uicogs/openapi` | OpenAPI reader, generator, and CLI                                        |
| `@uicogs/legacy`  | migration adapters for older mutable data-source code                     |

Vue applications create the same core runtime as every other application, then bind it once:

```ts
import { createUiCogs } from "@uicogs/core";
import { withVue } from "@uicogs/vue";
import { createRouter, createWebHistory } from "vue-router";

export const api = createUiCogs({ resources: [Tasks], baseUrl: "/api/" });
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/tasks",
      component: TasksPage,
      meta: { uicogs: { scopes: ["tasks.read"], navigation: { side: { label: "Tasks" } } } },
    },
  ],
});
const { uiCogs } = await withVue(api, { navigation: { side: { groups: [] } } });
app.use(router).use(uiCogs);

// a component
const cogs = useUiCogs();
```

Export a page-safe typed composable from a module that imports the core runtime only as
a type, avoiding bootstrap and route-component cycles:

```ts
import { useUiCogs as useInjectedUiCogs } from "@uicogs/vue";
import type { api } from "./api";

export const useUiCogs = () => useInjectedUiCogs<typeof api>();
```

`withVue()` awaits safe runtime initialization before the application mounts.

For a ready Quasar shell, use `UcAppLayout`. It renders named UiCogs side/top
navigation, an optional notification drawer, and page content while leaving all
styling and notification persistence to the application. Its public drawer-width,
header-control props, and `topbar-actions` slot support compact shells without
targeting Quasar internals. See [Frameworks](docs/frameworks.md#quasar-application-layout).

Configure semantic icon overrides once in `createUiCogs()` to switch string-based icon packs
without changing generated controls or presentation declarations:

```ts
createUiCogs({ icons: { create: "plus", close: "xmark", archive: "box-archive" } });
```

`archive` is an application-defined presentation name; UiCogs-owned names include `create`,
`close`, `delete`, `refresh`, `menu`, `notifications`, `date`, and `time`.

Generated Quasar forms can stay stacked while filters use responsive native Quasar
grid columns. Declare separate field `layout.form` and `layout.filter` metadata,
configure app-wide defaults through `defineSkin({ layout: ... })`. Set a generated
control `size` (`"sm"` or `"md"`) to keep filter inputs and UiCogs action buttons at
the same explicit height, and use
`UcFilter #actions` for Apply, Reset, and optional-filter controls. See
[Forms](docs/forms.md#responsive-form-and-filter-layout).

Core schemas also include date/time, date-range, rich-text, and nullable Boolean semantics.
The Quasar adapter supplies popup temporal pickers and three-state nullable Boolean controls.
It also exports route-friendly `UcUnauthorizedPage`, `UcForbiddenPage`, `UcNotFoundPage`, and
`UcServerErrorPage` components; applications add them to normal Vue Router records and own their
retry and navigation actions.

Enums can stay concise with raw values or carry UI-only presentation and application `meta`:

```ts
const AccountKind = fields.Enum([
  {
    value: "paper",
    presentation: { label: "Paper account", icon: "science", tone: "info" },
    meta: { requiresCredential: false },
  },
] as const);
```

Only `value` is parsed and serialized. Generated Quasar selectors, radios, and formatters use
`presentation`; `meta` remains application-owned.

## Installation

Install only the runtime and adapters your application uses once packages are published:

```sh
pnpm add @uicogs/core
pnpm add @uicogs/vue vue             # or @uicogs/react react
pnpm add vue-router                  # when the Vue app declares UiCogs routes
pnpm add @uicogs/echarts echarts      # optional Vue ECharts integration
pnpm add @uicogs/auth @uicogs/storage  # optional
pnpm add @uicogs/http                   # response profiles and HTTP adapters
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
- [Getting started](docs/getting-started.md) — build a Vue and Quasar resource, form, validation flow, and data table.
- [Application bootstrap](docs/bootstrap.md) — definitions, runtime creation, optional services, framework binding, and shutdown.
- [Schemas](docs/schemas.md) and [Validation](docs/validation.md) — fields, composition, parsing, and async checks.
- [Resources](docs/resources.md), [Forms](docs/forms.md), and [Caching](docs/caching.md) — the primary application workflow.
- [Authentication](docs/authentication.md), [Context](docs/context.md), [Storage](docs/storage.md), [Transport](docs/transport.md), and [Response adapters](docs/response-adapters.md) — runtime services and request behavior.
- [Routing](docs/routing.md) — flat and nested routes, access inheritance, matching, redirects, and router conversion.
- [Frameworks](docs/frameworks.md) — Vue, React, Quasar, and Vue Router.
- [Charts](docs/charts.md) — schema-bound collection and entity chart concepts.
- [ECharts](docs/echarts.md) — Vue rendering, engine setup, and native ECharts options.
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
