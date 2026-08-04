# Routing

UiCogs stores framework-neutral route declarations. The application still owns its
router, history, route rendering, links, scroll behavior, and router plugins.

## Declare Flat Or Nested Routes

`routes` accepts one recursive tree, so flat, nested, and mixed declarations use the
same API.

```ts
const api = createUiCogs({
  routes: [
    { path: "/about", component: AboutPage },
    {
      path: "/accounts",
      component: AccountLayout,
      auth: { all: ["accounts.open"] },
      meta: { section: "accounts" },
      children: [
        { path: "", component: AccountHome, name: "account-home" },
        {
          path: ":id(\\d+)",
          component: AccountPage,
          auth: { any: ["accounts.read", "admin"] },
        },
        { path: "/login", component: LoginPage },
      ],
    },
    { path: "/old-account", redirect: { name: "account-home" } },
  ],
});
```

A node with `children` is a structural group. Its component is normally a layout. It
does not create a UiCogs leaf entry; use an empty child when the group URL also renders
a page. Componentless groups are valid.

Path rules are deterministic:

- top-level paths are absolute;
- child paths may be empty, relative, or absolute;
- empty children resolve to the parent URL;
- relative children append to the parent; absolute children keep their URL but remain
  in the declaration and access hierarchy;
- normalized leaf paths have one leading slash and no trailing slash except `/`;
- query strings and fragments do not belong in route declarations;
- duplicate normalized leaf paths and duplicate leaf names fail at startup.

`api.routes.tree` retains source paths and nesting for router conversion.
`api.routes.entries` is the frozen, depth-first leaf index with resolved paths,
inherited access rules, merged metadata, and final redirect paths.

## Access And Metadata

An omitted `auth` on the entire route chain means guest-only. `{ all: [] }` means any
authenticated user. `all` requires every permission; `any` requires one.

Explicit rules on a group and its descendants are combined with AND semantics. An
omitted group rule is neutral. An absolute child still inherits its declaration
ancestors. Redirect access is determined by the final target.

Metadata is shallow-merged from parent to child; child keys win. Framework converters
receive each node's local metadata so their router can perform its normal merge.

Client route checks only control presentation and navigation. The server must enforce
endpoint authorization.

## Lookup And Matching

```ts
api.routes.entry("/accounts/:id(\\d+)");
api.routes.named("account-home");
api.routes.match("/accounts/42");
api.routes.resolve({
  path: "/accounts/42",
  pattern: "/accounts/:id(\\d+)",
  params: { id: "42" },
  query: {},
});
```

`resolve()` prefers `location.pattern`, supplied by a framework router, then falls back
to the portable matcher. Declaration order breaks overlaps. The matcher supports:

- static segments and `:id` parameters;
- optional parameters such as `:year?`;
- repeated parameters with `*` or `+`;
- constraints such as `:category(personal|business)`;
- catch-alls such as `:catchAll(.*)*`;
- an optional trailing slash in concrete locations.

Malformed parameter patterns fail when the registry is created. Use the framework
router directly for syntax outside this portable subset.

## Redirects

Portable redirects are absolute paths or names:

```ts
{ path: "/old", redirect: "/new" }
{ path: "/start", redirect: { name: "home" } }
```

Targets must be declared leaves. UiCogs resolves redirect chains to their final
absolute path and rejects missing targets, self-redirects, and cycles.

## Vue Router

Build and install Vue Router normally. `toRoutes()` recursively preserves layouts,
componentless groups, local paths, lazy components, names, redirects, metadata, and
child order.

```ts
const router = createRouter({
  history: createWebHistory(),
  routes: toRoutes(api.routes),
});
const { uiCogs } = await withVue(api);

createApp(App).use(router).use(uiCogs).mount("#app");
```

`<RouterView>` and `<RouterLink>` bind to the Vue Router installed on that Vue app.
The UiCogs plugin reads the deepest record in `to.matched` to identify the declared
leaf, adds access checks, and exposes reactive navigation and breadcrumbs. Install Vue
Router before the UiCogs plugin when routes exist.

## Shareable List And Detail State

For a resource page, use one named route with an optional key parameter. The path owns
the active detail record; the query owns submitted filters, page, page size, and sort.
That makes a copied URL reproduce the same list and open detail.

```ts
{ name: "tasks", path: "/tasks/:id?", component: TasksPage }
```

`@uicogs/vue` provides four composable layers. Use the smallest one that fits the page:

```ts
const route = useRouteState({
  route: "tasks",
  query: TaskFilters,
  params: schema({ id: fields.ID() }),
});

const filterForm = useRouteForm({ route, schema: TaskFilters });
const collection = useRouteCollection({ route, collection: tasks, filters: TaskFilters });

const page = useRouteResource({
  route: "tasks",
  resource: tasks,
  filters: TaskFilters,
  detail: { param: "id" },
});
```

`useRouteState()` is useful on custom pages. It exposes typed reactive `query` and
`params`, recoverable `issues`, and explicit `push()` and `replace()` methods. It owns
only fields declared by its schemas and preserves every unrelated query parameter.
Schema `wireName` values are used for both reading and canonical URL output.

`useRouteForm()` is submit-only by default: submitting valid filters pushes one URL;
typing does not create history entries. Back/forward and pasted locations reset the form
from the location. `useRouteCollection()` applies the standard `page`, `page_size`, and
`ordering` convention. Its sort and page methods are awaitable so tables load only after
the route navigation settles. Supply a pure `RoutePaginationCodec` for a different
pagination convention.

`useRouteResource()` combines all three and returns the original resource for objects,
forms, and actions, plus a route-aware `collection`, `filterForm`, `activeKey`, active
object, `open(key)`, and `close()`. A string resource key is decoded through that schema
field automatically. A functional key must declare both `detail.parseKey` and
`detail.formatKey`.

Malformed values owned by these helpers are ignored for page state and removed with
`router.replace()`. Valid values and foreign query state survive. Deliberate filter,
sort, page, and detail actions use `router.push()`.

With Quasar, keep the detail model and table selection distinct:

```vue
<UcResourceView :resource="page.resource" :collection="page.collection" v-model="page.activeKey">
  <template #filters>
    <UcFilter :form="page.filterForm" />
  </template>
</UcResourceView>
```

The optional `collection` supplies list rows, loading state, pagination, sorting, and
post-mutation refreshes. The `resource` remains the owner of detail objects, forms, and
actions. `UcFilter` has no `collection` here because route changes already own loading.

## React Router

`toReactRoutes()` recursively returns `path`, optional `Component`, `children`, `name`,
and local `meta`. Because React Router redirect elements are application-specific,
provide a converter when the tree declares redirects:

```tsx
const records = toReactRoutes(api.routes, {
  redirect: (target) => () => <Navigate to={target} replace />,
});
```

The callback receives the final absolute target. Conversion throws if a redirect is
present without an adapter. Pass `pattern` from the matched React route in
`useLocation()` when available; otherwise UiCogs uses portable path matching.

## Navigation And Breadcrumbs

Navigation remains independent of route nesting and refers to canonical leaf paths.

```ts
navigation: {
  sidebar: [
    {
      id: "accounts",
      label: "Accounts",
      children: [{ route: "/accounts", label: "Overview" }],
    },
  ],
},
breadcrumbsFrom: "sidebar",
```

`navigationTree()` removes inaccessible leaves and empty navigation groups.
`breadcrumbs()` derives the active trail from `breadcrumbsFrom`. Parameterized links
do not receive a generated `to`; build concrete destinations with the application
router.
