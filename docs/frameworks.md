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
import { withVue } from "@uicogs/vue";
import { createRouter, createWebHistory } from "vue-router";

export const api = createUiCogs({ resources: [Tasks], baseUrl: "/api/" });
const router = createRouter({
  history: createWebHistory(),
  routes,
});
export const { uiCogs } = await withVue(api, { navigation });
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

export const api = withReact(createUiCogs({ resources: [Tasks], baseUrl: "/api/" }));
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
React-bound runtime. React Router records remain application-owned.

For typed application access, export the same small wrapper pattern:

```tsx
import { useUiCogs as useInjectedUiCogs } from "@uicogs/react";

export const useUiCogs = () => useInjectedUiCogs<typeof api.core>();
```

## Routing

Vue applications use normal Vue Router records with typed `meta.uicogs` scopes and
placement-specific navigation metadata. `withVue()` adds the native guard and exposes
reactive `navigation()`, `breadcrumbs()`, `hasScope()`, and `hasScopes()` helpers.
Menu groups are declared separately from router nesting. React Router remains
application-owned. See [Routing](routing.md) for the complete Vue contract. The server
remains responsible for endpoint authorization.

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
UcNavigationTree
UcNotificationList
UcAppLayout
```

There is no `UcViewset` export.

## Quasar Application Layout

`UcAppLayout` is an unstyled Quasar shell for applications that already install the
UiCogs Vue binding and Vue Router. It resolves named navigation placements through
`useUiCogs()`; it does not create routes, own authentication, or load application data.

```vue
<UcAppLayout
  :brand="{ label: 'Example', to: { name: 'home' } }"
  :navigation-width="216"
  :notifications-width="320"
  :navigation-toggle-props="{ flat: true, round: true, dense: true, icon: 'menu_open' }"
  :notifications-toggle-props="{ flat: true, round: true, dense: true, icon: 'inbox' }"
  drawer-footer-placement="session"
  :navigation-badges="{
    notifications: { value: unreadCount, label: `${unreadCount} unread notifications` },
  }"
  :notifications="notifications"
  v-model:navigation-open="navigationOpen"
  v-model:notifications-open="notificationsOpen"
  @notification-mark-read="markRead"
  @notification-action="runNotificationAction"
>
  <template #topbar-actions><ThemeToggle /></template>
  <template #drawer-footer><AccountLinks /></template>
  <router-view />
</UcAppLayout>
```

The default placements are `sidebar` and `topbar`; `drawer-footer-placement` is
optional. `UcNavigationTree` can also render any `cogs.navigation(placement)` result
directly. Its `navigation-badges` keys are route/navigation node ids, so a standard
Notifications route can show an unread count in the side menu.

`navigation-width` and `notifications-width` forward to the corresponding native
`QDrawer` only when supplied, retaining Quasar's defaults otherwise. The two
`*-toggle-props` fields intentionally expose only safe `QBtn` presentation properties:
`flat`, `round`, `dense`, `size`, `color`, `icon`, and `aria-label`. UiCogs keeps the
controlled drawer click behavior; consumers cannot accidentally replace it.

Header content is ordered as navigation toggle, brand, `topbar-before`, generated
topbar links, notification toggle, then `topbar-actions`. This makes
`topbar-actions` the app-specific extension point after the built-in controls.

`UcNotificationList` reads `useUiCogs().notifications` by default. Pass `items` or a
`source` only for a controlled alternate inbox, tests, or Storybook. It emits open,
action, mark-read, dismiss, and retry intent; resources or services still own backend
persistence and authorization. `UcAlertHost` consumes `cogs.alerts` exactly once via
Quasar Notify, and `UcAppLayout` mounts it automatically. Mount `UcAlertHost` once on
applications that do not use the shell.

`UcNotificationList` also exposes `notification`, `leading`, `actions`, `empty`, and
`error` slots. `UcAppLayout` forwards these as `notification`, `notification-leading`,
`notification-actions`, `notifications-empty`, and `notifications-error`.

The components add only stable empty hooks. UiCogs supplies no shell CSS, spacing,
palette, or inline styles; applications choose those through Quasar and their own
stylesheet.

- Layout: `uc-app-layout`, `uc-app-layout__header`, `__toolbar`, `__brand`,
  `__topbar-links`, `__topbar-actions`, `__drawer`, `__navigation`,
  `__drawer-footer`, `__navigation-drawer`, `__notifications-drawer`,
  `__navigation-toggle`, `__notifications-toggle`, and `__page`.
- Navigation: `uc-navigation-tree`, `__item`, `__item--active`, `__group`,
  `__group-label`, and `__badge`.
- Notifications: `uc-notification-list`, `__item`, `__item--read`,
  `__item--unread`, `__item--info`, `__item--positive`, `__item--warning`,
  `__item--negative`, `__leading`, `__content`, `__title`, `__message`,
  `__timestamp`, `__actions`, `__empty`, and `__error`.

Slots own their custom markup and should apply these hooks when they need the same
styling contract.

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

### Quasar skin

Use `defineSkin()` and `injectSkin(app, skin)` to set Quasar-native presentation
defaults for one Vue application. Install the skin before mounting the app.

```ts
import { defineSkin, injectSkin } from "@uicogs/quasar";

injectSkin(
  app,
  defineSkin({
    palette: { primary: "#5b4bdb" },
    form: { class: "app-form" },
    field: { outlined: true, bgColor: "grey-2" },
  }),
);
```

Only recognised palette roles (`primary`, `secondary`, `accent`, `dark`, `positive`,
`negative`, `info`, and `warning`) are accepted. They become scoped Quasar `--q-*`
variables on that app root. UiCogs does not expose arbitrary CSS-variable names or
create `--uc-*` variables.

`UcForm` accepts a local `skin` prop for form and field overrides. Field skins allow
common Quasar appearance props (`outlined`, `filled`, `standout`, `borderless`,
`dense`, `color`, `bgColor`, and `labelColor`) plus `class` and `style`. A static
object or one `{ name, field, form }` resolver is supported. Skin classes and styles
merge with editor configuration; UiCogs-required model, choice, readonly, and error
bindings take precedence.

Stable CSS hooks are present without a skin: `uc-form`, `uc-field`,
`uc-field-<editor-kind>`, and `uc-field-<schema-name>`.

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

### Table CSS hooks

Generated Quasar tables always include `uc-table` and `uc-table-<resource-name>`.
Generated rows include `uc-table-row`; generated column headers and cells include
`uc-table-column-<column-name>`. Custom `UcTable` columns retain their Quasar
`classes` and `headerClasses` alongside these hooks. A custom body or header slot owns
its own markup, so it should apply the relevant stable classes explicitly.

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
