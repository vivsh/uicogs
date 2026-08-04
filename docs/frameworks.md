# Vue, React, Routing, And Quasar

This guide describes framework adapters. Core owns all data behavior.

## External Store Contract

Every controller implements:

```ts
interface ExternalStore<T> {
  getSnapshot(): T;
  subscribe(listener: () => void): () => void;
}
```

Framework adapters observe controller revisions. They do not copy normalized data into another cache.

Direct cache writes, local mutations, remote responses, relation loads, context updates, auth changes, and SSE events all reach frameworks through this contract.

The Vue runtime adapts `api.context` through the same external-store mechanism. React may observe it with `useController(api.context)`.

## Vue Runtime

Create the common runtime from core. The application owns Vue Router, then installs
the UiCogs Vue plugin.

```ts
import { createUiCogs } from "@uicogs/core";
import { toRoutes, withVue } from "@uicogs/vue";
import { createRouter, createWebHistory } from "vue-router";

export const api = createUiCogs({ resources: [Tasks], baseUrl: "/api/" });
export const { uiCogs } = await withVue(api);
const router = createRouter({
  history: createWebHistory(),
  routes: toRoutes(api.routes),
});
app.use(router).use(uiCogs);
```

The Vue adapter returns readonly proxies. A controller property read tracks one shallow reactive revision.

```ts
const tasks = api.resource(Tasks);
const task = tasks.get(() => props.taskId);

watchEffect(() => {
  console.log(task.loading, task.value?.title);
});
```

Getter functions may drive object keys and named-query input.

Chain methods that return `this` return the reactive proxy.

```ts
tasks.filter({ complete: false }).sort("title").page(1, 25);
```

## Vue Application Binding

`withVue(api)` is the safe Vue binding boundary. It awaits `api.ready`, returns a Vue
plugin, and provides an application-specific typed component composable. The application
creates and owns the real Vue Router with native Vue Router options, then installs
`uiCogs` after that router.

```ts
// a component
const cogs = useUiCogs();
const tasks = cogs.resource(Tasks);
```

For page-safe typing, export one local wrapper that imports the core runtime as a type:

```ts
import { useUiCogs as useInjectedUiCogs } from "@uicogs/vue";
import type { api } from "./api";

export const useUiCogs = () => useInjectedUiCogs<typeof api>();
```

This preserves exact application types without importing the bootstrap module, avoiding
route-component cycles. Calling it before `uiCogs` installs throws a clear error.

## Vue Adapter Functions

Use these functions for controllers created by a headless runtime:

```text
vueReactive
useUcController
useUcResource
useUcObject
useUcCollection
useUcForm
useUcAction
useUcSnapshot
```

Headless view models are:

```text
useUcFormModel
useUcTableModel
useUcResourceView
```

These view models derive rendering state. They do not own request or cache logic.

## Vue Route State

`@uicogs/vue` also supplies Vue Router 4 composables for shareable page state:

```text
useRouteState
useRouteForm
useRouteCollection
useRouteResource
```

They require an application-installed Vue Router and a named route, normally one
optional detail parameter such as `/tasks/:id?`. `useRouteState` is the low-level typed
query/parameter bridge. `useRouteForm` writes submitted filters. `useRouteCollection`
owns URL-driven list filters, sorting, and pagination. `useRouteResource` composes those
pieces for `UcResourceView`-style list/detail pages. See [Routing](routing.md#shareable-list-and-detail-state)
for the complete pattern.

## React

`@uicogs/react` provides `withReact()` and hooks around the same core runtime.

Create the application runtime normally.

```ts
import { createUiCogs } from "@uicogs/core";
import { withReact } from "@uicogs/react";

export const api = withReact(
  createUiCogs({
    resources: [Tasks],
    baseUrl: "/api/",
  }),
  {
    router,
    useLocation,
  },
);
```

Memoize controller creation by logical identity.

```tsx
function TaskDetail({ taskId }: { readonly taskId: number }) {
  const tasks = useMemo(() => api.resource(Tasks), []);
  const object = useMemo(() => tasks.get(taskId), [tasks, taskId]);
  const task = useObject(object);

  useEffect(() => {
    void object.load();
    return () => object.cancel();
  }, [object]);

  return <article>{task.value?.title ?? "Loading"}</article>;
}
```

Hooks are:

```text
useController
useResource
useObject
useCollection
useForm
useAction
useAuth
```

The hooks use `useSyncExternalStore`.

React Strict Mode may mount effects more than once. Equivalent requests still deduplicate in the shared runtime. Memoization avoids unnecessary controller replacement.

Render the application beneath `api.Provider`; `useUiCogs()` then exposes the same
React-bound runtime, including reactive route navigation and breadcrumbs.

For typed application access, export the same small wrapper pattern:

```tsx
import { useUiCogs as useInjectedUiCogs } from "@uicogs/react";

export const useUiCogs = () => useInjectedUiCogs<typeof api.core>();
```

## Routing

Pass immutable flat, nested, or mixed `routes` plus independent `navigation` and
`breadcrumbsFrom` to `createUiCogs()`. A node with `children` is a structural group;
an empty child gives its parent URL a page. Access rules inherit through the declaration
tree.

Vue's `toRoutes(api.routes)` and React's `toReactRoutes(api.routes)` preserve nested
records. The bindings add access checks and expose reactive `navigationTree()`,
`breadcrumbs()`, and `hasPermission()`. React redirects require an explicit conversion
callback. See [Routing](routing.md) for the complete contract. The server remains
responsible for endpoint authorization.

## Quasar Package

`@uicogs/quasar` requires Vue 3 and Quasar 2.

It exports:

```text
UcForm
UcField
UcFilter
UcSubmit
UcFormAction
UcTable
UcView
UcResourceView
UcAction
UcDelete
UcCancel
UcAlert
UcConfirm
UcAlertSuccess
UcAlertFailure
```

There is no `UcViewset` export.

## Quasar Forms

Field selection and writing belong to the immutable form definition passed to the
controller. Define `Task.keep("title", "complete").toForm(...)` for an edit surface
with those fields. `UcForm` also accepts an optional view to select only its generated
controls; it must be a subset of that form definition and never changes validation or
the payload writer.

```vue
<UcForm :form="form" @success="saved">
  <UcField name="title" />
  <UcField name="complete" />
  <UcSubmit />
</UcForm>
```

`UcField` resolves the field's editor descriptor automatically.

Manual editor-kind selection is an override.

`UcForm` displays bound and unbound issues. It does not decide which fields validate.

File and image fields use the form's typed file values and progress state.

## Quasar Table

`UcTable` derives columns from the resource schema unless its optional immutable view
declares the table projection. Pass a resource controller for its default collection,
or pass a named collection directly:

```vue
<UcTable :resource="tasks" />
<UcTable :collection="searchResults" />
<UcTable :resource="tasks" :view="TaskSummary" />
```

```ts
const searchResults = api.resource(Tasks).query("search", { text: "review" });
```

In both forms, the collection controller is the source of truth for filtering,
sorting, paging, loading, and errors. A query collection carries the resource schema
and key metadata required for generated columns and key-based selection.

`UcTable` has no `include` or `exclude` props. Define and pass a view instead, so field
selection remains immutable and reusable across tables, detail panels, and query output.

Controlled pagination passes page size and page metadata to Quasar. Quasar does not silently replace the server page size.

Selection is key-based. Bulk selection is independent of the loaded page.

Infinite loading uses explicit collection accumulation.

Columns and cells can be overridden without changing cached entities.

## UcView

`UcView` is a resource-independent shell.

It supports:

- title and header content;
- loading overlay;
- pull-to-refresh;
- responsive aside content;
- controlled aside visibility.

It contains no router behavior.

```vue
<UcView v-model:aside="detailsOpen" title="Tasks" :refresh="() => tasks.refresh()">
  <TaskList />
  <template #aside="{ close }">
    <TaskDetails @close="close" />
  </template>
</UcView>
```

## UcResourceView

`UcResourceView` composes a resource controller with `UcView`, table state, filters, object state, create/edit forms, actions, and selection.

```vue
<UcResourceView
  v-model="activeTaskId"
  v-model:selected-keys="selectedTaskIds"
  :resource="tasks"
  :create-form="TaskCreate"
  :edit-form="TaskEdit"
  title="Tasks"
  selection="multiple"
>
  <template #actions="{ selectedKeys }">
    <UcAction
      label="Archive"
      :disable="selectedKeys.length === 0"
      :action="() => archive(selectedKeys)"
    />
  </template>

  <template #detail-actions="{ object, close }">
    <UcDelete :action="() => tasks.remove(object.key)" @success="close" />
  </template>
</UcResourceView>
```

`UcResourceView` receives controllers and form definitions. It does not construct URLs or transport requests.

Selection is opt-in and controlled. `v-model` controls the active detail record; use
`v-model:selected-keys` only when `selection="single"` or `selection="multiple"` is enabled.
`UcTable` and `UcResourceView` default to `selection="none"`.

Routing is controlled through model state or the optional router adapter.

Object-specific actions belong in `detail-actions`. This keeps them inside the responsive detail surface.

## Actions And Feedback

`UcAction` executes a supplied callback or action controller.

It owns component pending state, optional confirmation, and success or failure events.

`UcDelete` is the destructive specialization.

`UcCancel` emits `cancel`. It has no router side effect.

Imperative feedback requires the corresponding Quasar Dialog or Notify plugin.

```ts
await UcAlert("Export complete");

if (await UcConfirm("Run this action?")) {
  await runAction();
}

UcAlertSuccess("Saved");
UcAlertFailure("Save failed");
```

## Disposal

Component unmount should dispose component-owned relation or form controllers when they have explicit disposal methods.

Application shutdown should call `api.dispose()` once.

The Vue plugin does not dispose the runtime automatically.

UiCogs does not provide SSR hydration APIs in this release.

## Browser Verification

The browser fixture is [examples/vue-quasar](../examples/vue-quasar).

The suite covers list loading, filtering, pagination, relations, forms, file input, bulk actions, deletion, local cache writes, SSE, and responsive detail views.

Run:

```sh
pnpm test:browser
```
