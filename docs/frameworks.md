# Vue, React, Vue Router, And Quasar

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

Import `createUiCogs` from `@uicogs/vue` when controllers should be directly Vue-reactive.

```ts
import { createUiCogs } from "@uicogs/vue";

export const api = createUiCogs({
  resources: [Tasks],
  baseUrl: "/api/",
});
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

## Application-Owned Vue Binding

The application owns the runtime. Bind that exact object to Vue injection.

```ts
import { bindUiCogs } from "@uicogs/vue";
import { api } from "./api.js";

export const { UiCogsPlugin, useUiCogs } = bindUiCogs(api);
```

Install the bound plugin.

```ts
app.use(UiCogsPlugin);
```

Use the exact runtime type in components.

```ts
const api = useUiCogs();
const tasks = api.resource(Tasks);
```

`bindUiCogs(api)` creates a unique injection key.

Two runtimes can be bound independently.

Calling `useUiCogs()` without installing its plugin throws a clear error.

The plugin does not create or dispose the runtime. Application bootstrap owns final disposal.

There is no package-global Vue runtime or injection key.

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

## React

`@uicogs/react` re-exports core and provides hooks.

Create the application runtime normally.

```ts
import { createUiCogs } from "@uicogs/react";

export const api = createUiCogs({
  resources: [Tasks],
  baseUrl: "/api/",
});
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

React has no package-global runtime.

## Vue Router

`@uicogs/vue-router` provides `useUcResourceRoute()`.

It maps controlled route state to:

- active object key;
- create mode;
- action mode;
- query values.

The adapter accepts structural router and route interfaces. Core and Quasar do not import Vue Router.

The application remains responsible for its route names, path structure, and navigation policy.

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

`UcTable` derives columns from schema fields and format descriptors.

The collection controller remains the source of truth for sorting and pagination.

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
corepack pnpm test:browser
```
