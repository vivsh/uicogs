# Routing

UiCogs does not declare, convert, or retain application routes. Declare normal Vue
Router records, create the router exactly as Vue Router documents, then install the
UiCogs plugin after it.

## Vue Router Records And Scopes

Attach optional UiCogs metadata under `meta.uicogs`. `path` and `component` remain
ordinary Vue Router fields; everything else in `meta` remains available to the app.

```ts
import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";

export const routes = [
  { path: "/login", name: "login", component: LoginPage },
  {
    path: "/admin",
    component: AdminLayout,
    meta: { uicogs: { scopes: ["admin.read"] } },
    children: [
      {
        path: "users",
        name: "users",
        component: UsersPage,
        meta: {
          uicogs: {
            scopes: ["users.read"],
            navigation: {
              side: { parent: "administration", label: "Users", icon: UsersIcon, order: 10 },
              shortcuts: { label: "Find users", icon: SearchIcon },
            },
          },
        },
      },
    ],
  },
] satisfies RouteRecordRaw[];

export const router = createRouter({ history: createWebHistory(), routes });
```

Scope declarations are additive across Vue Router's matched chain:

- no declaration in the entire chain permits guests only;
- `scopes: []` permits every authenticated user;
- a non-empty list requires every listed scope;
- parent and child scopes combine.

The auth strategy derives one effective `api.auth.scopes` set. Map roles, claims, or
the current user to stable scopes there; routes never need to know how roles work.
The client only controls visibility and client navigation. Server endpoints remain the
authorization authority.

## Independent Menus

Router nesting describes rendering. Menu nesting describes presentation and is entirely
separate. Declare non-link groups once when binding UiCogs; each route link selects its
group by id for each placement.

```ts
import { createNavigation } from "@uicogs/routes";

export const navigation = createNavigation({
  side: {
    groups: [
      { id: "administration", label: "Administration", icon: ShieldIcon, order: 20 },
      { id: "security", parent: "administration", label: "Security", order: 30 },
    ],
  },
});

const { uiCogs, useUiCogs } = await withVue(api, { navigation });

app.use(router).use(uiCogs).mount("#app");
```

A route can appear in several placements with different labels, icons, parents, and
orders. `label` and `icon` may be callbacks receiving the current route. Group ids are
unique per placement. Invalid parents and cycles fail while the plugin installs.
Inaccessible links disappear, followed by empty groups. Parameterized route records
with required parameters have no generated destination because a concrete parameter value
is application state. A named route whose parameters are all optional, such as
`/tasks/:id?`, receives a generated destination with those parameters omitted, so its
navigation link opens the list location.

Within a component, navigation and breadcrumbs are reactive computed values:

```ts
const cogs = useUiCogs();
const side = cogs.navigation("side");
const breadcrumbs = cogs.breadcrumbs("side");
const canEdit = cogs.hasScopes(["tasks.update"]);
```

Breadcrumbs are derived from the selected placement's group ancestry, not Vue Router
parent records. This makes a side-menu breadcrumb trail match the visible menu even
when layouts and menu groups have different shapes.

## Native Denial Handling

`withVue()` adds a normal `beforeEach` guard after Vue Router is installed. Provide
`onDenied` when an application should redirect instead of cancelling navigation:

```ts
const { uiCogs } = await withVue(api, {
  onDenied: ({ to, scopes }) =>
    to.path === "/login"
      ? false
      : { name: "login", query: { next: to.fullPath, scopes: scopes.join(",") } },
});
```

The callback receives Vue Router's native normalized target and the required combined
scopes. It may return any normal Vue Router location, `false`, or `void`.

## React Router

React Router remains application-owned. Put the same scope declaration in its native
route `handle`, pass React Router's `useMatches` hook while binding, and use the
returned hooks in an application route boundary:

```tsx
const routes = [
  { path: "/login", element: <LoginPage /> },
  { path: "/tasks", element: <TasksPage />, handle: { uicogs: { scopes: ["tasks.read"] } } },
] satisfies RouteObject[];

const cogs = withReact(api, { useMatches, routes, navigation });

function ScopedOutlet() {
  return cogs.useCanAccessRoute() ? <Outlet /> : <Navigate to="/login" replace />;
}
```

`useCanAccessRoute()`, `useHasScope()`, and `useHasScopes()` rerender when the auth
controller changes. React Router's application-specific redirects and route rendering
remain native React Router concerns.

## Shareable List And Detail State

`useRouteCollection()` supports collections configured with `accumulate()`. Moving
between pages, changing page size, and browser back/forward retain previously loaded
records and append unseen keys. Changing filters or ordering resets accumulation.
Going back does not truncate the accumulated list; opening page N directly loads only
that page, without prefetching earlier pages.

Only changes to effective filters, ordering, or page state trigger an automatic list
load. Detail parameters, hashes, unrelated query values, and equivalent URL encodings
do not reset or reload the collection. Use `load()` or `refresh()` explicitly to retry
a failure or request a reload. Generated filter submissions and sort changes select
page one. Direct URLs and history entries restore the supplied position.

The default `standardRoutePagination` codec uses `page`, `page_size`, and `ordering`.
Navigation methods accept a complete `PageState` and await the URL change and its
collection load:

```ts
await collection.page({ index: 2, size: 25 });
await collection.nextPage();
await collection.previousPage();
```

Route methods return promises; do not chain `.nextPage().load()` on a route facade.
That chain is for direct core collections. `await collection.load()` remains valid
and joins an in-flight route load, or explicitly loads the current page when idle.

Route-state helpers use the router you installed. A single named route with an optional
key parameter gives a list, active detail, and creation one shareable location:

```ts
{ name: "tasks", path: "/tasks/:id?", component: TasksPage }
```

```ts
const route = useRouteState({ route: "tasks", query: TaskFilters, params: TaskRouteParams });
const filterForm = useRouteForm({ route, schema: TaskFilters });
const collection = useRouteCollection({ route, collection: tasks, filters: TaskFilters });
const page = useRouteResource({
  route: "tasks",
  resource: tasks,
  filters: TaskFilters,
  scopes: {
    view: ["tasks.read"],
    create: ["tasks.create"],
    edit: ["tasks.update"],
  },
  permit: ({ action, value }) => action !== "edit" || value?.locked !== true,
});
```

`useRouteState()` owns only declared query and parameter fields and preserves foreign
URL state. `useRouteForm()` writes submit-only canonical URLs. `useRouteCollection()`
owns standard `page`, `page_size`, and `ordering` URL state. `useRouteResource()` adds
an active record plus `open()`, `create()`, and `close()`. Pass the resulting controller
directly to `UcResourceView`; the view delegates its row opening, creation, close, and
successful form navigation to that controller. Page code does not bind the route-owned
detail key or creation state:

```vue
<UcResourceView :route-resource="page" :columns="taskColumns" />
```

When a keyed resource declares `operations.retrieve: false`, the same controller resolves an
active `:id` from its route-bound list collection instead of requesting an inferred item endpoint.
The list is loaded first; an absent key becomes the view's standard not-found detail state.

`UcResourceView` derives immutable create and edit form definitions from the resource schema
by default. Supply `create-form` or `edit-form` only when a page needs a narrower schema,
different write behavior, or form-specific presentation:

```vue
<UcResourceView :route-resource="page" :create-form="TaskCreate" :edit-form="TaskEdit" />
```

`/tasks` is the list, `/tasks/42` is detail key `42`, and `/tasks/new` is creation.
`new` is reserved; numeric key `0` remains a normal detail route. Resources with a
functional key provide only `{ key: { parseKey, formatKey } }`; ordinary named schema
keys need no route configuration.
Back/forward, pasted URLs, and refresh restore list, detail, or creation state without
feedback loops. The route-resource controller remains the one source of truth; do not
also pass `resource`, `collection`, `v-model`, or `v-model:creating` to that view.

`meta.uicogs.scopes` remains responsible for entering the page route. Route-resource
`scopes` and `permit` govern the resource surfaces inside it: `view` controls row/detail
navigation, `create` controls creation, and `edit` controls the generated edit form.
Omit a capability to leave it unrestricted; `[]` requires any authenticated user; a
non-empty list requires every scope. `permit` is a synchronous, additional restriction
which receives the capability, current auth state/scopes, and optional key/value. It can
close over the application's typed `useUiCogs()` runtime when it needs additional state.
Form configuration never grants or removes those capabilities. Set a resource form policy to
`false` only when a generated form is intentionally unavailable; access checks still decide
whether a route can open or recover.

Denied direct `/:id` and `/new` locations are replaced with the list location while
preserving the query state. `useRouteResource()` also exposes `can()` for a custom page,
and accepts `{ history: "replace" }` on `open()`, `create()`, or `close()` when application
code performs an internal canonicalization rather than a user navigation.

For a non-routed page, keep the explicit controller contract instead:

```vue
<UcResourceView
  :resource="tasks"
  :collection="taskSearch"
  v-model="activeTaskId"
  v-model:creating="creatingTask"
/>
```

Route-driven loads retain the collection's normal error state. To render a custom
page-level notification as well, pass `onFailure` to `useRouteCollection()` or
`onCollectionFailure` to `useRouteResource()`. The callback observes failures; it does
not replace the collection's error state.

## Cursor Pagination

Use `cursorRoutePagination` with a cursor-based resource. The resource's pagination
adapter defines the HTTP request/response contract; the route codec defines the URL.
Both must describe cursor pagination.

```ts
import { operation, pagination, resource } from "@uicogs/core";
import { cursorRoutePagination, useRouteResource } from "@uicogs/vue";

const Tasks = resource({
  name: "tasks",
  url: "tasks",
  schema: Task,
  key: "id",
  operations: {
    list: operation.list({ input: TaskFilters, pagination: pagination.cursor() }),
  },
});

const page = useRouteResource({
  route: "tasks",
  resource: cogs.resource(Tasks).accumulate(),
  filters: TaskFilters,
  pagination: cursorRoutePagination,
});

await page.collection.nextPage();
// URL: /tasks?cursor=opaque-bookmark
// HTTP: GET /tasks?cursor=opaque-bookmark&page_size=25
await page.collection.previousPage();
```

The URL stores the cursor used to fetch the **current** batch. `nextPage()` and
`previousPage()` take their destination tokens from the current response. There is
no page index in cursor mode. A direct `/tasks?cursor=...` link needs only its token.
The built-in codec removes conflicting `page` query input through `replace()` before loading.
Detail selection changes only `:id`, preserving the cursor and filters.

For custom pages, share the same codec with the collection and its filter form:

```ts
const route = useRouteState({ route: "tasks", query: TaskFilters });
const collection = useRouteCollection({
  route,
  collection: cogs.resource(Tasks).accumulate(),
  pagination: cursorRoutePagination,
});
const form = useRouteForm({ route, schema: TaskFilters, pagination: cursorRoutePagination });
```

`useRouteResource()` passes the codec to its generated filter form automatically.
Filter submissions and changed ordering clear the cursor and select the first batch.
Changing page size through `page({ size })` also restarts at the first batch.
Full URLs supplied through the router or browser history restore their explicit
cursor, filters, and size together; the watcher does not erase historical cursors.
Unrelated query values are preserved.

Cursor endpoints generally cannot jump to an arbitrary numbered page. Use
`UcTable` with `infinite`, or hide numbered pagination with `no-pagination` and provide
Next/Previous controls. `UcTable` awaits route navigation before loading. A route
cursor collection rejects any `index`, including `page({ index: 5, size: 25 })`, instead of
silently fetching the first batch. It also rejects next/previous metadata that claims
an adjacent page exists but omits its token. Custom navigation controls should handle
the returned promise's rejection; collection request failures remain in `error`.

The built-in codec accepts non-empty string tokens and writes `cursor`, `page_size`,
and `ordering`. It also owns `page` solely to remove conflicting numbered input.
Keep tokens opaque; Vue Router handles URL encoding.
For alternative URL keys or JSON-serializable token shapes, supply a `RoutePaginationCodec`:

```ts
import { cursorRoutePagination, type RoutePaginationCodec } from "@uicogs/vue";

const afterPagination: RoutePaginationCodec = {
  mode: "cursor",
  keys: ["after", "limit", "page", "ordering"],
  read: (query) =>
    cursorRoutePagination.read({
      cursor: query.after,
      page_size: query.limit,
      page: query.page,
      ordering: query.ordering,
    }),
  write: (state) => {
    const query = cursorRoutePagination.write(state);
    return {
      after: query.cursor,
      limit: query.page_size,
      page: query.page,
      ordering: query.ordering,
    };
  },
};
```

Annotate an object with the exported `RoutePaginationCodec` type to infer its query
parameter types. Its `read`/`write` pair must round-trip tokens and write `undefined`
for owned keys that should be removed. `mode: "cursor"` enables token-based navigation
and reset rules; `mode: "page"` enables numbered navigation. The collection's HTTP
adapter must accept the decoded token format.

Cursors can expire. UiCogs retains the URL and displays the ordinary collection
failure; it does not silently navigate elsewhere. Retry with `collection.refresh()`
or explicitly return to the first batch:

```ts
await page.collection.page({ size: 25 });
```

Restoring a cursor URL loads that batch, not all preceding batches. Previously
accumulated records remain available within the live controller until filters or
ordering change. No separate cursor-history cache is maintained.
