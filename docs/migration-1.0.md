# Migration From UiCogs 0.x To 1.0

UiCogs 1.0 separates pure definitions from application runtime state.

## ECharts package

`@uicogs/echarts` is additive. Existing applications need no migration; install
it with Vue and ECharts only when adding schema-bound charts.

## Definitions

Create schemas, resources, operations, descriptors, and decorators with package-level factories.

```ts
import { fields, operation, resource, schema } from "@uicogs/core";
```

Runtime authoring methods were removed. There is one definition implementation and one runtime implementation.

## Runtime Registry

Pass every resource definition to `createUiCogs()`.

```ts
export const api = createUiCogs({
  baseUrl: "/api/",
  resources: [Users, Sessions],
  context: { locale: "en" },
});
```

`api.resource()` creates controllers only. It does not declare or register a new resource.

## Vue Router Plugin

Replace the older Vue setup helpers with `await withVue(api)`:

```ts
const router = createRouter({
  history: createWebHistory(),
  routes,
});
export const { uiCogs } = await withVue(api, { navigation });
app.use(router).use(uiCogs);
```

The application owns the real Vue Router and declares standard records with optional
`meta.uicogs` scopes and menu presentation. `withVue()` returns the plugin, controller
reactivity, access-aware navigation, and breadcrumbs; it does not own Vue Router, its
records, or `<RouterView>`. Keep a page-safe typed
`useUiCogs` wrapper in a module that imports `api` only as a type.

## Runtime Context

Pass the initial application context value directly. Context callbacks and manual context invalidation were removed.

```ts
const api = createUiCogs({
  context: { locale: "en", timeZone: "UTC" },
});

api.context.update({ locale: "fr" });
```

`api.context.value` is deeply readonly. Authenticated runtimes compose `api.auth.value` automatically.

Optional local, session, and IndexedDB persistence is provided by `@uicogs/storage`.

## Default Fetch

Remove normal transport construction.

```ts
const api = createUiCogs({
  baseUrl: "/api/",
  resources: [Users],
  http: {
    timeoutMs: 30_000,
  },
});
```

The Fetch factory and Axios adapter were removed. A custom structural transport remains available for specialized runtimes and tests.

Only GET requests retry automatically. The timeout is one total deadline for attempts and retry delays.

## Authentication

Create an immutable strategy definition.

```ts
const auth = jwtAuth({
  claims: Claims,
  login: Sessions.operation("login"),
  refresh: Sessions.operation("refresh"),
  logout: Sessions.operation("logout"),
  currentUser: Users.operation("current"),
  cacheScope: ({ claims }) => ({ subject: claims.sub }),
});

export const api = createUiCogs({
  baseUrl: "/api/",
  resources: [Users, Sessions],
  auth,
  context: { locale: "en" },
});
```

Manual auth middleware, manual auth cache-scope callbacks, and transport wrappers were removed.

The application context contains application data only. UiCogs adds typed auth context automatically.

There is no `api.ready`. Authentication initializes automatically. Protected operations wait for initialization.

## Credentials

General HTTP credentials configuration was removed.

JWT auth uses `credentials: "omit"`. Cookie auth owns its `"same-origin"` or `"include"` policy. A runtime without auth uses Fetch defaults.

## Failure Differences

Transport execution failures use `TransportExecutionError`.

Successful responses that declare JSON fail on malformed JSON. Malformed JSON error responses remain text for server-error adapters.

GET bodies, nested query objects, forced JSON with binary values, unsupported raw bodies, and manual multipart content types fail before dispatch.

Caller cancellation remains an `AbortError`.

## Lifecycle

Call `api.dispose()` when the application-owned runtime ends.

Disposal aborts requests, live streams, auth work, timers, and context subscriptions. No controller may publish new state after disposal.
