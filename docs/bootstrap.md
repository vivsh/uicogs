# Application Bootstrap

UiCogs starts with immutable definitions and one application-owned runtime. Define
schemas, resources, forms, operations, and auth strategies before the runtime; then
create the runtime once in a dedicated application module. Components create their
own workflow controllers from that shared runtime.

```text
immutable definitions -> api.ts creates one runtime -> framework binding -> components
```

There is no library-global runtime, `api.ready` promise, or manual cache/auth
bootstrap sequence.

## 1. Define The API Surface

Keep definitions in modules that do not import the runtime. Register every resource
and service that can be loaded directly or referenced by a relation or auth operation.

```ts
// definitions/tasks.ts
import { fields, operation, resource, schema, service } from "@uicogs/core";

export const Task = schema({
  id: fields.ID(),
  title: fields.Str({ required: true }),
  complete: fields.Bool(),
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

export const Authentication = service({
  name: "authentication",
  url: "auth/",
  actions: {
    login: operation.action({ path: "login/", auth: "none" }),
    refresh: operation.action({ path: "refresh/", auth: "none" }),
    logout: operation.action({ path: "logout/" }),
  },
});
```

Definitions are reusable, deeply immutable configuration. They must not receive a
runtime, current user, Fetch client, cache, or browser state.

## 2. Create The Runtime Once

Export the runtime from one module, usually `src/api.ts`. The minimal remote setup is
the following:

```ts
// api.ts
import { createUiCogs } from "@uicogs/core";
import { Tasks } from "./definitions/tasks.js";

export const api = createUiCogs({
  baseUrl: "/api/",
  resources: [Tasks],
  context: { locale: "en", timeZone: "UTC" },
});
```

`baseUrl` is optional and defaults to `""`. Core creates its Fetch transport by
default, so a normal application does not configure `transport`. Use either `http`
to tune the built-in Fetch behavior or `transport` for a structural custom transport;
they are mutually exclusive. Axios is not a supported transport.

The constructor validates the complete resource and service registry immediately. It
rejects duplicate names across both kinds, relation targets that were not registered,
and invalid auth operation references.

## 3. Add Only The Runtime Services Needed

All options below belong in the same `createUiCogs()` call. They are optional unless
the application needs their capability.

| Need                                   | Initialization                                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Application values used by definitions | `context: { locale, timeZone }`; do not include `auth`.                                                            |
| Persistent context and cache           | `persistence: { backend: storage.indexedDb(...) }`. Context and cache are both enabled by default.                 |
| Authentication                         | `auth: jwtAuth(...)` or `auth: cookieAuth(...)`, using operation references from registered resources or services. |
| Custom cache                           | `cache`, with `persistence.cache: false`; it cannot coexist with the built-in durable cache.                       |
| Cache behaviour                        | `cachePolicy: "cache-first"`, `"network-only"`, or `"stale-while-revalidate"`.                                     |
| Error normalization                    | `errorAdapters: [...]`.                                                                                            |
| Live cache, inbox, and alerts          | `live: { sources: [sse(...)], adapters: [...] }` from `@uicogs/http`.                                              |
| Relation key loading                   | `relationDefaults: { byKeys: ... }`.                                                                               |
| Unauthenticated but partitioned cache  | `cacheScope: () => scope`. Auth strategies own scope when `auth` is configured.                                    |

For example, a browser runtime with persistence and authentication can be assembled
without manually wiring middleware or cache scope:

```ts
import { createUiCogs } from "@uicogs/core";
import { jwtAuth } from "@uicogs/auth";
import { storage } from "@uicogs/storage";
import { Authentication, Claims, Tasks, Users } from "./definitions/index.js";

export const api = createUiCogs({
  baseUrl: "/api/",
  resources: [Tasks, Users],
  services: [Authentication],
  context: { locale: "en", timeZone: "UTC" },
  persistence: {
    backend: storage.indexedDb({
      database: "application",
      store: "uicogs",
      namespace: "main-api",
    }),
  },
  auth: jwtAuth({
    claims: Claims,
    login: Authentication.operation("login"),
    refresh: Authentication.operation("refresh"),
    logout: Authentication.operation("logout"),
    currentUser: Users.operation("current"),
  }),
});
```

Choose `storage.indexedDb` for normal persistent caches. `storage.local` and
`storage.session` are for small values. Authentication storage is separate from the
shared persistence backend.

## 4. Let Automatic Initialization Run

Runtime construction starts persistence and auth initialization in a microtask after
registry validation. Do not block application mounting for it.

- Initial application context is available immediately; a valid persisted context
  subsequently replaces it.
- The active cache scope hydrates automatically. Cache-first operations wait for it;
  network-only operations do not.
- JWT auth restores persisted tokens; cookie auth runs its configured session
  operation. Protected remote operations wait for this work. Local resources and
  operations marked `auth: "none"` do not.
- Read `api.context.persistenceStatus`, `api.cache.persistenceStatus`, and
  `api.auth.status` for visible bootstrap diagnostics.

`withVue()` is the safe Vue binding boundary. It awaits `api.ready`, which restores
persistent context, resolves authentication, and hydrates the resulting cache scope,
before returning the plugin and typed component composable. Components must not make
their own decisions from transient initialization states.

```ts
export const api = createUiCogs({ resources: [Tasks], baseUrl: "/api/" });
export const { uiCogs } = await withVue(api);
app.use(router).use(uiCogs);
app.mount("#app");
```

`api.auth.initialize()` remains public and idempotent for deterministic tests, but is
not the normal application entry point.

## 5. Bind To The UI Framework

Core is headless. The runtime stays application-owned regardless of framework.

### Vue

Create the common runtime from `@uicogs/core`. The application creates and installs
Vue Router; `withVue()` adds UiCogs reactivity, injection, and route access setup.

```ts
// uicogs.ts
import { createUiCogs } from "@uicogs/core";
import { withVue } from "@uicogs/vue";
import { createRouter, createWebHistory } from "vue-router";

export const api = createUiCogs({ resources: [Tasks], baseUrl: "/api/" });
export const router = createRouter({
  history: createWebHistory(),
  routes,
});
export const { uiCogs } = await withVue(api, { navigation });

// main.ts
import { createApp } from "vue";
import { router, uiCogs } from "./uicogs.js";

const app = createApp(App);
app.use(router).use(uiCogs);
app.mount("#app");
```

Export a small typed `useUiCogs` wrapper from a page-safe module that imports `api` only
as a type, then import that wrapper in components. It retains exact application types
without creating a bootstrap cycle. Its
`navigation()`, `breadcrumbs()`, `hasScope()`, and `hasScopes()` are reactive.
`withVue()` never disposes the application-owned core runtime.

### Quasar Application Shell

When using Quasar, install `@uicogs/quasar` after the Vue binding and render the
application-owned page route inside `UcAppLayout`:

```vue
<UcAppLayout
  :brand="{ label: 'Example' }"
  :navigation-width="216"
  :notifications-width="320"
  :navigation-toggle-props="{ flat: true, round: true, dense: true }"
  :notifications-toggle-props="{ flat: true, round: true, dense: true }"
  :notifications="notifications"
  v-model:navigation-open="navigationOpen"
  v-model:notifications-open="notificationsOpen"
  @notification-mark-read="markRead"
>
  <template #topbar-actions><ThemeToggle /></template>
  <router-view />
</UcAppLayout>
```

The component reads the `sidebar` and `topbar` named navigation placements by default.
Notification data remains an application resource/service concern; the layout only
renders it and emits user intent. Width props are forwarded to native drawers only when
set. `topbar-actions` renders after the built-in notification button; `topbar-before`
renders before generated topbar links.

### React

Create the same core runtime and bind it once with `withReact()`. Render below the
returned provider, then memoize controllers by logical identity and observe them
with hooks.

```tsx
const cogs = withReact(createUiCogs({ resources: [Tasks], baseUrl: "/api/" }), {
  router,
  useLocation,
});

root.render(
  <cogs.Provider>
    <App />
  </cogs.Provider>,
);

const tasks = useMemo(() => cogs.resource(Tasks), []);
const list = useCollection(tasks);
```

## 6. Start Workflows In Controllers

Do not create controllers in `api.ts`. A view creates its own controller, applies its
local query state, and begins loading when that view is ready:

```ts
const tasks = api.resource(Tasks).filter({ complete: false }).page(1, 25);
await tasks.load();
```

Controllers share normalized entity data, request coordination, context, auth, and
live updates. Their loading state, errors, filters, pagination, cancellation, drafts,
validation, and action progress remain local.

## Shutdown

Call `api.dispose()` once when the application-owned runtime ends, such as teardown
of an independently mounted application. It aborts coordinated requests, disposes auth
work and timers, closes live updates, clears subscriptions, and prevents subsequent
network work. Components must not dispose the shared runtime; they may dispose their
own relation or form controllers when appropriate.
