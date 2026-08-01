# Getting Started

This Vue + Quasar example defines a resource, form, table, validation, and router.
Definitions are immutable; `createUiCogs()` creates the one application runtime.

## Install

```sh
pnpm add @uicogs/core @uicogs/http @uicogs/vue @uicogs/quasar vue vue-router quasar
```

Install `vue-router` when the application declares UiCogs routes.

## Define The Resource

```ts
// src/definitions/tasks.ts
import { fields, operation, pagination, resource, schema, sort } from "@uicogs/core";

export const Task = schema({
  id: fields.ID(),
  title: fields.Str({
    required: true,
    label: "Title",
    sort: sort.Value(),
    validate: [({ value }) => value.trim().length >= 3 || "Use at least 3 characters."],
  }),
  complete: fields.Bool({ label: "Complete" }),
});

export const TaskSearch = schema({ text: fields.Str() });
export const TaskTable = Task.view({ fields: ["id", "title", "complete"] as const });
export const TaskCreate = Task.keep("title", "complete").toForm({ mode: "create" });

export const Tasks = resource({
  name: "tasks",
  url: "tasks/",
  schema: Task,
  key: "id",
  operations: {
    list: operation.list({ pagination: pagination.page() }),
    retrieve: operation.retrieve(),
    create: operation.create(),
    update: operation.patch(),
    remove: operation.remove(),
  },
  queries: {
    search: { input: TaskSearch, path: "search/", pagination: pagination.page() },
  },
});
```

`TaskCreate` defines the editable fields and payload. `TaskTable` defines table
columns. Neither holds cache, network, or component state.

## Declare Routes And Runtime

Routes are pure core definitions. This flat route is also the smallest valid route
tree. Layouts may instead declare `children` with empty, relative, or absolute paths;
navigation always refers to normalized leaf paths.

```ts
// src/api.ts
import { createUiCogs } from "@uicogs/core";
import { responseAdapters } from "@uicogs/http";
import TasksPage from "./pages/TasksPage.vue";
import { Tasks } from "./definitions/tasks.js";

export const api = createUiCogs({
  baseUrl: "/api/",
  resources: [Tasks],
  responseAdapter: responseAdapters.vyuh(),
  context: { locale: "en", timeZone: "UTC" },
  routes: [{ path: "/tasks", component: TasksPage }],
  navigation: {
    sidebar: [{ route: "/tasks", label: "Tasks" }],
  },
  breadcrumbsFrom: "sidebar",
});
```

## Start Vue And The Router

`withVue()` awaits safe runtime bootstrap and returns the reactive plugin and typed
composable. The application creates and installs the real Vue Router, then installs that
plugin for UiCogs access-aware navigation.

```ts
// src/main.ts
import { createApp } from "vue";
import { Quasar } from "quasar";
import { createRouter, createWebHistory } from "vue-router";
import { toRoutes, withVue } from "@uicogs/vue";
import "quasar/dist/quasar.css";
import App from "./App.vue";
import { api } from "./api.js";

const app = createApp(App).use(Quasar);
const { uiCogs } = await withVue(api);
const router = createRouter({
  history: createWebHistory(),
  routes: toRoutes(api.routes),
});
app.use(router).use(uiCogs);
app.mount("#app");
```

The root component renders the active route:

```vue
<!-- src/App.vue -->
<template><RouterView /></template>
```

Use the bound router or reactive navigation in components:

```vue
<script setup lang="ts">
import { useUiCogs } from "../uicogs.js";

const api = useUiCogs();
const sidebar = api.routes.navigationTree("sidebar");
</script>

<template>
  <RouterLink v-for="item in sidebar" :key="item.label" :to="item.to!">
    {{ item.label }}
  </RouterLink>
</template>
```

`navigationTree()` and `breadcrumbs()` are reactive. Protected routes declare
`auth: { all: ["tasks.view"] }` or `auth: { any: [...] }`; configure an auth strategy
before using them. See [Routing](routing.md) for layouts, inherited access, matching,
and redirects.

## Render A Resource, Form, And Table

Controllers belong to the screen. Their loading, errors, paging, drafts, and
validation are local; normalized entities and request execution are shared.

```vue
<!-- src/pages/TasksPage.vue -->
<script setup lang="ts">
import { UcField, UcForm, UcSubmit, UcTable } from "@uicogs/quasar";
import { useUiCogs } from "../api.js";
import { TaskCreate, TaskTable, Tasks } from "../definitions/tasks.js";

const api = useUiCogs();
const tasks = api.resource(Tasks).sort("title").page(1, 25);
const form = tasks.form(TaskCreate);

async function saved(): Promise<void> {
  form.reset();
  await tasks.refresh();
}
</script>

<template>
  <UcForm :form="form" @success="saved">
    <UcField name="title" />
    <UcField name="complete" />
    <UcSubmit label="Create task" />
  </UcForm>

  <UcTable :resource="tasks" :view="TaskTable" auto-load serial :page-size="25" />
</template>
```

`UcTable` accepts either the resource's default collection (`resource`) or a named
query collection (`collection`). It sends sort and page changes through that same
controller. The optional immutable `view` replaces ad-hoc field lists.

```ts
const results = api.resource(Tasks).query("search", { text: "review" });
```

```vue
<UcTable :collection="results" :view="TaskTable" auto-load />
```

## Validation

`UcForm` shows issues beside `UcField` and form-level issues in its summary. Editing a
field clears its previous server issue. Async validators receive `context` and an
`AbortSignal`; stale validations are cancelled.

```ts
title: fields.Str({
  validate: [async ({ value, context, signal }) =>
    (await context.tasks.titleAvailable(value, signal)) || "That title is already used."],
}),
```

The configured Vyuh response profile supplies `page`/`per_page` pagination and maps
Vyuh `ErrorReport` field messages into the same form issues. Use `drf()`, `laravel()`,
`springData()`, `jsonApi()`, or `graphqlConnection()` for their documented contracts.
UiCogs does not infer a profile from a response body.

See [Resources](resources.md), [Forms](forms.md), [Validation](validation.md),
[Response adapters](response-adapters.md), [Frameworks](frameworks.md), and
[Application bootstrap](bootstrap.md).
