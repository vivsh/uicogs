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

`withVue()` also accepts a generic `stylebook` route integration. The optional
`@uicogs/quasar/stylebook` subpath supplies one for local development fixtures; it is
installed after Vue Router is available and before UiCogs snapshots static routes. Load
that subpath dynamically in development so production bundles omit it. See
[Quasar Stylebook](stylebook.md).

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
useUcResourceActions
useUcObjectActions
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
UcButton
UcActions
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
UcErrorPage
UcUnauthorizedPage
UcForbiddenPage
UcNotFoundPage
UcServerErrorPage
UcNavigationTree
UcNotificationList
stylebook (from @uicogs/quasar/stylebook)
UcAppLayout
quasarEditor
```

There is no `UcViewset` export.

### Error pages

`UcErrorPage` provides a safe, router-neutral default page for client-visible failures.
`UcUnauthorizedPage`, `UcForbiddenPage`, `UcNotFoundPage`, and `UcServerErrorPage` provide the
usual 401, 403, 404, and 5xx defaults. Declare them as ordinary Vue Router components; UiCogs
does not add routes or assume a login or home destination:

```ts
import { UcForbiddenPage, UcNotFoundPage, UcServerErrorPage } from "@uicogs/quasar";

const routes = [
  { path: "/forbidden", component: UcForbiddenPage },
  { path: "/unavailable", component: UcServerErrorPage },
  { path: "/:pathMatch(.*)*", component: UcNotFoundPage },
] satisfies RouteRecordRaw[];
```

Messages are rendered as text and never interpret server HTML. Set `retryable` to render the
default retry control and handle its `@retry` event in the application. Use `#actions` to replace
that region with application-owned sign-in, home, or support links; the slot receives `retry()`
and `retrying`. The pages use only default Quasar primitives and stable `uc-error-page*` hooks.

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

The shell, generated buttons, date/time controls, navigation icons, notifications, action
presentation, and generated enum-choice controls resolve string icon names through `api.icon()`.
Add semantic or application-specific replacements to `createUiCogs({ icons: ... })`; see
[Bootstrap](bootstrap.md#semantic-icons). Explicit `navigation-toggle-props.icon` and
`notifications-toggle-props.icon` remain valid and are resolved through the same map.

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

Rich-text fields use `QEditor` and expose WYSIWYG edit, optional HTML source, and read-only
sanitized preview modes through normal editor-toolbar commands. Use `quasarEditor.RichText()`
for named tools and explicit mode choices.

Manual editor-kind selection is an override.

`UcForm` displays bound and unbound issues. It does not decide which fields validate.

`UcForm` and `UcFilter` share schema-owned responsive `layout` metadata. A field can
declare separate `layout.form` and `layout.filter` widths; the Quasar adapter maps
their numeric spans and `auto`/`grow`/`shrink` values to native `col-*` classes.
`UcFilter` uses a horizontal grid by default, supports static and collapsible generated
filter fields, and exposes `v-model:expanded`. Both components expose `#actions`;
filter actions render inline while form actions render after fields by default. Set
`UcForm action-layout="inline"` when a form action row deliberately shares a grid row
with fields. Use `size="sm"` or `size="md"` to give generated fields and UiCogs action
buttons one explicit shared height; `dense` overrides the inferred compact geometry.
See
[Forms](forms.md#responsive-form-and-filter-layout) for the complete contract.

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
    layout: { filter: { gutter: "md", size: "sm", default: { xs: 12, md: 4 } } },
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
`dense`, `hideBottomSpace`, `color`, `bgColor`, and `labelColor`) plus `class` and
`style`. `hideBottomSpace` removes Quasar's empty hint/error reservation; use it for
compact layouts only when a validation message expanding the field is acceptable. A
static object or one `{ name, field, form }` resolver is supported. Skin classes and
styles merge with editor configuration; UiCogs-required model, choice, readonly, and
error bindings take precedence.

Stable CSS hooks are present without a skin: `uc-form`, `uc-form__stack`, `uc-form__grid`,
`uc-form__field`, `uc-form__actions`, `uc-filter__static`, `uc-filter__collapsible`,
`uc-filter__actions`, `uc-field`, `uc-field-<editor-kind>`, and
`uc-field-<schema-name>`.

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

`UcResourceView` composes a resource controller with `UcView`, list state, filters,
object state, create/edit forms, actions, and controlled selection. Its regions are
always rendered in this order:

```text
header row: caption (left), tools (right)
header: filters
list: list-header, list-body, list-footer
aside: create or detail, detail-actions
```

The caption and tools share one responsive header row: from `md` upward the caption
grows on the left and tools are right-aligned; below that they wrap into separate,
centered rows. This matches `mode="auto"`, which uses the dialog detail surface below
`md`.
Resource schemas supply generated create and edit forms by default. When the `create`
capability is allowed, the default tools region therefore contains a primary `Create` button.
Supply `#tools` to replace that region and call its `create()` binding when the application
wants a different control. There is no floating create button or `create` boolean prop.

Generated list/table, create, and detail surfaces use standard Quasar card structure:
`QCard` contains the default list surface, while the generated aside uses a `QCard` with
a compact `QCardSection` header, a `QSeparator`, and a `QCardSection` for its form or
detail content. `UcTable` and `UcForm` remain surface-neutral. A full `#list`, `#create`,
or `#detail` slot owns its markup and adds `QCard/QCardSection` itself when it wants the
same treatment.

The dedicated `#filters` region belongs in the header section. `#list-header` is wrapped
in a padded `QCardSection` when UiCogs renders the default list surface, so a filter form
placed there retains normal left, right, and bottom card spacing. It follows the header
without adding a second top gutter.

In split mode, the header belongs to the list pane. The create/detail aside starts
at the same top edge as that pane, rather than below the caption, tools, or filters.
Stack mode retains the normal responsive aside behavior. Dialog mode uses Quasar's standard
centered dialog position. Its carrier is intentionally transparent and padding-free: a
generated `UcResourceView` aside supplies its own `QCard`, while a custom aside slot owns
its own dialog surface.

When an aside is active, `UcResourceView` renders a compact native Quasar card header with
a state heading (`Create` or `Details`), a small resource caption, and a neutral round
close icon with an accessible `Close` label. The icon follows the installed Quasar icon set
(including Material Symbols), rather than assuming a particular icon font. It closes the
active create or detail state; it does not submit or mutate the resource. Set
`aside-caption` to replace the generated state heading; the secondary resource caption is
then omitted.
Use `aside-header` to replace that complete header. The slot receives `mode`, `caption`,
and `close`.

```vue
<UcResourceView :resource="tasks" aside-caption="Task workspace">
  <template #aside-header="{ mode, caption, close }">
    <QCardSection class="row items-center no-wrap">
      <div class="col text-subtitle1">{{ mode === "create" ? "New task" : caption }}</div>
      <UcButton flat round icon="close" aria-label="Close task" @click="close()" />
    </QCardSection>
  </template>
</UcResourceView>
```

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
  <template #tools="{ selectedKeys, refresh, create }">
    <UcAction
      label="Archive"
      :disable="selectedKeys.length === 0"
      :action="() => archive(selectedKeys)"
    />
    <QBtn label="Refresh" @click="refresh()" />
    <QBtn label="New task" @click="create()" />
  </template>

  <template #detail-actions="{ object }">
    <UcDelete :action="() => tasks.remove(object.key)" />
  </template>
</UcResourceView>
```

`UcDelete` inside `detail-actions` closes the active surface after a successful deletion.
For a `route-resource` view this means navigating back to the list URL; no page-level
success forwarding is needed.

The `create` and `detail` slots receive the resolved reactive `form` controller. UiCogs uses
an explicit `create-form`/`edit-form` prop first, then the resource's `forms` policy, then an
immutable definition derived from `resource.schema`. This is the escape hatch for a custom form
layout; `UcField` still honors the form definition's conditional-field rules.

To intentionally omit generated forms, use resource form policy. `forms.create = false` hides
the generated Create control, while `forms.edit = false` leaves a selected object readable but
without a generated edit form. A custom `#create` or `#detail` slot remains available either
way and receives `form: undefined` when a surface is explicitly disabled. Custom `#create`,
`#detail`, list, and action slots receive `can(action)` so they can use the exact same
capability policy as generated controls.

```ts
const AuditEvents = resource({
  name: "audit-events",
  url: "audit-events/",
  schema: AuditEvent,
  key: "id",
  forms: { create: false, edit: false },
});
```

```vue
<UcResourceView :route-resource="brokerAccounts" :create-form="BrokerAccountForm">
  <template #create="{ form }">
    <UcForm v-if="form" :form="form">
      <UcField name="kind" />
      <UcField name="secretRef" />
    </UcForm>
  </template>
</UcResourceView>
```

For a route-backed view, declare capability policy on `useRouteResource()` so that the
controller owns both URL recovery and permission checks:

```ts
const brokerAccounts = useRouteResource({
  route: "broker-accounts",
  resource: accounts,
  filters: BrokerAccountFilters,
  scopes: {
    view: ["broker-accounts.read"],
    create: ["broker-accounts.create"],
    edit: ["broker-accounts.update"],
  },
  permit: ({ action, value }) => action !== "edit" || value?.kind !== "paper",
});
```

For a non-routed view, pass the same `scopes` and `permit` props directly to
`UcResourceView`. Scope arrays use the existing all-of rule: omitted is unrestricted,
`[]` requires authentication, and non-empty arrays require every scope. `permit` is a
synchronous additional restriction. It receives the capability (`view`, `create`, or
`edit`), authenticated state, effective scopes, and an optional object key/value. It is
client-side presentation policy only; server endpoints remain authoritative. Form policy and
access policy are independent: a disabled form is not an authorization denial, and a denied
capability does not become available merely because a form definition exists.

Here `secretRef` can be declared with `visible: ({ values }) => values.kind !== "paper"`
in `BrokerAccountForm`; no page-level `v-if` is needed.

`UcResourceView` receives controllers and optional form overrides. A regular page supplies
`resource` (and optionally `collection`) plus explicit active/create models. A routed page
instead supplies only the `useRouteResource()` result through `route-resource`:

```vue
<UcResourceView :route-resource="taskPage" />
```

Use `:create-form` and `:edit-form` only to override schema-derived or resource-level forms.

In that form, `UcResourceView` uses the controller's resource, route-aware collection,
detail key, and create state, and invokes its `open`, `create`, and `close` operations.
Do not combine `route-resource` with `resource`, `collection`, `v-model`, or
`v-model:creating`; UiCogs rejects that ambiguous ownership at setup. It does not
construct URLs or transport requests.

Selection is opt-in and controlled. `v-model` controls the active detail record; use
`v-model:selected-keys` only when `selection="single"` or `selection="multiple"` is enabled.
`UcTable` and `UcResourceView` default to `selection="none"`.

Use explicit models for non-routed pages. For a route-backed page, `route-resource` is
the preferred contract; its route controller owns navigation.

`caption` replaces only the generated title. `tools` is the stable place for refresh,
create, export, and manually declared bulk controls. `filters` follows tools. Every
list-region slot receives the resource, collection, rows, `open`, `create`, `refresh`,
`selectedKeys`, and `selectedRows` bindings.

By default, `display="table"` renders `UcTable`, preserving sorting, paging,
route-aware collections, loading/error state, row activation, and controlled selection.
Use `display="list"` for a compact native Quasar list. Its default is intentionally
minimal; provide `card-item` for application-owned card markup:

```vue
<UcResourceView
  :resource="tasks"
  display="list"
  v-model="activeTaskId"
  v-model:selected-keys="selectedTaskIds"
  selection="multiple"
>
  <template #card-item="{ row, selected, open, toggleSelected }">
    <TaskCard :task="row" :selected="selected" @click="open()" />
    <QBtn flat label="Select" @click.stop="toggleSelected()" />
  </template>
</UcResourceView>
```

`list-header`, `list-body`, and `list-footer` are the ordered list-surface regions.
`list-body` replaces only the table/list body and takes precedence over `display`,
`row-item`, and `card-item`. `row-item` owns custom Quasar table-row markup in table mode;
`card-item` owns item/card markup in list mode. Both receive `row`, `key`, `selected`,
`open`, and `toggleSelected`.

For one release cycle, the legacy `header`, `actions`, `list`, `before-list`, and
`after-list` slots are retained. They warn in development: `header` acts as `caption`,
`actions` as `tools`, `list` remains a full-list replacement with precedence over the
explicit list regions, and `before-list`/`after-list` map to `list-header`/`list-footer`.
Migrate to `caption`, `tools`, `list-header`, `list-body`, and `list-footer` before the
next breaking release.

Object-specific actions belong in `detail-actions`. This keeps them inside the responsive detail surface.

Declared object actions can also render automatically. Give an object operation a
`presentation.placement` of `aside` for the normal detail surface or `edit` for an
edit-form surface. `UcResourceView` renders inputless actions with `UcAction`; it
forwards their semantic icon and confirmation and emits success, failure, and cancel
events. Actions with an input schema never make a request automatically: they emit
`object-action` so the application can open its own form or dialog.

```vue
<UcResourceView
  v-model="activeTaskId"
  :resource="tasks"
  :edit-form="TaskEdit"
  :object-actions="['archive', 'assign']"
  @object-action="openActionDialog"
/>
```

Set `:object-actions="false"` to disable generated object actions. An ordered name
list both selects and orders them. The `detail-actions` slot remains the full escape
hatch and replaces the generated region; it receives `actions` in addition to
`resource`, `object`, `value`, `close`, and `refresh`.

For custom Vue detail views, resolve the same presentation safely and reactively:

```ts
const actions = useUcObjectActions(tasks, task, {
  placement: "aside",
  actions: ["archive", "assign"],
});
```

`@uicogs/react` supplies the matching `useResourceActions()` and
`useObjectActions()` hooks. Overrides can remove or reorder declared names, but never
restore actions hidden by scopes or `visible`.

## Actions And Feedback

`UcAction` executes a supplied callback or action controller.

It owns component pending state, optional confirmation, and success or failure events.

`UcButton` is the presentation-only Quasar button primitive for custom controls.
`UcActions` is the shared action-row container used automatically by forms and filters.
Use `UcButton` in custom action slots when it should receive UiCogs' stable button hook;
raw `QBtn` remains valid and application-owned. `UcSubmit` defaults to `primary`, while
`UcAction`, `UcDelete`, and `UcCancel` retain their existing semantic defaults.

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
