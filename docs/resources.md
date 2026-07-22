# Resources, Operations, Views, And Relations

This guide describes resource definitions and runtime controllers.

## Resource Definition

A resource definition is the canonical identity of one entity type.

```ts
import { operation, resource } from "@uicogs/core";

const Tasks = resource({
  name: "tasks",
  url: "tasks/",
  schema: Task,
  key: "id",
  operations: {
    list: operation.list(),
    retrieve: operation.retrieve(),
    create: operation.create(),
    replace: operation.replace(),
    update: operation.patch(),
    remove: operation.remove(),
  },
});
```

The definition is immutable.

The resource owns:

- a unique name;
- one entity schema;
- one key rule;
- one source;
- an optional HTTP URL;
- views;
- named queries;
- operations;
- pagination;
- TTL;
- resource-level error adapters.

Operations own relative request behavior. Operations do not own a base URL.

## Registry

Register every resource when the runtime is created.

```ts
const api = createUiCogs({
  resources: [Users, Tasks, Comments],
  baseUrl: "/api/",
});
```

The registry validates names, relations, and auth operation references.

`api.resource(definition)` rejects an unregistered definition.

## Resource Controllers

Each lookup creates a fresh resource controller.

```ts
const page = api.resource(Tasks);
const sidebar = api.resource("tasks");

page !== sidebar; // true
```

Each controller owns its loading, error, filter, sort, page, accumulation, and cancellation state.

Controllers in one runtime share normalized entity and collection data.

One resource instance is also its default collection.

```ts
await page.filter({ complete: false }).sort("title", false).page(1, 25).load();

page.all();
page.loading;
page.error;
page.stale;
page.pageInfo;
```

Mutating chain methods return the same resource controller. They do not mutate the resource definition.

Other collection commands are:

```text
accumulate, nextPage, previousPage, hasMore, reset
refresh, invalidate, cancel
```

## Remote Sources

A resource with `url` and no explicit source uses the built-in HTTP source.

```ts
const Tasks = resource({
  name: "tasks",
  url: "tasks/",
  schema: Task,
  key: "id",
});
```

`source: http()` is the explicit equivalent.

Remote resource requests use the runtime's default Fetch transport. The final URL is `baseUrl + resource.url + operation path`.

## Local Sources

A local resource has no URL.

```ts
const Drafts = resource({
  name: "drafts",
  schema: Task,
  key: "id",
  source: local({
    initial: [{ id: 1, title: "Initial", complete: false }],
    generateKey: ({ existing }) => Math.max(0, ...existing.map(Number)) + 1,
  }),
});
```

Local resources support:

- list and object controllers;
- create, replace, update, and remove;
- generated keys;
- filters and sort descriptors;
- pagination and accumulation;
- named query predicates;
- forms;
- views;
- relations;
- bulk removal;
- direct cache writes.

Local methods remain asynchronous when the remote equivalent is asynchronous. UI and form code does not branch on source type.

A local named query must define `local(value, query, context)` when its filter-only fields cannot be evaluated from entity fields and descriptors.

## Objects

`get()` returns a local object controller.

```ts
const tasks = api.resource(Tasks);
const task = tasks.get(42);

await task.load();

task.key;
task.value;
task.loading;
task.error;
task.stale;
```

Repeated `get(42)` calls on one resource instance return the same object controller. A different resource instance returns a different controller.

Both controllers resolve the same cached snapshot.

Vue may pass a key getter.

```ts
const task = tasks.get(() => props.taskId);
```

## CRUD

```ts
await tasks.create(input);
await tasks.replace(42, replacement);
await tasks.update(42, patch);
await tasks.remove(42);
```

Mutations are pessimistic. Cache state changes after successful confirmation.

A successful response is parsed and normalized. An empty mutation response invalidates the affected entity or collections. Delete creates a tombstone and removes known collection membership.

Local CRUD uses the same schema and cache rules.

## Named Queries

Query-only fields belong to a query schema.

```ts
const SearchTasks = schema({
  text: fields.Str(),
  owner: fields.Int(),
});

const Tasks = resource({
  name: "tasks",
  url: "tasks/",
  schema: Task,
  key: "id",
  queries: {
    search: {
      input: SearchTasks,
      path: "search/",
      view: "summary",
      pagination: pagination.page(),
      sortParam: "ordering",
    },
  },
});
```

Create a collection controller with `query()`.

```ts
const search = api.resource(Tasks).query("search", {
  text: "review",
  owner: 7,
});

await search.load();
search.all();
```

Each `query()` call creates an independent collection controller. Equivalent collections may share cached results and an in-flight request.

Query fields never enter the entity type.

## Operations

Built-in operation factories are:

```text
list, retrieve, create, replace, patch, remove, action, bulk
```

An operation can define:

- method;
- relative path;
- input schema;
- output schema;
- named output view;
- custom request construction;
- body encoding;
- multipart adapter;
- pagination;
- sorter parameter;
- invalidation policy;
- error adapters;
- authentication mode;
- local handler;
- bulk behavior.

Custom action example:

```ts
const PublishInput = schema({ notify: fields.Bool({ required: true }) });

const Tasks = resource({
  name: "tasks",
  url: "tasks/",
  schema: Task,
  key: "id",
  operations: {
    publish: operation.action({
      path: "publish/",
      input: PublishInput,
      output: Task,
      invalidate: "collections",
    }),
  },
});
```

Run it directly:

```ts
const value = await tasks.action("publish", { notify: true });
```

Create a stateful action controller when the UI needs loading, failure, progress, and duplicate-execution control.

```ts
const publish = tasks.operation("publish", { notify: true });
const result = await publish.execute();
```

`ResourceDefinition.operation(name)` is different. It returns an immutable typed operation reference for auth strategy configuration.

```ts
const loginReference = Sessions.operation("login");
```

The reference contains no runtime state.

## Authentication Mode

An operation may set:

```text
auth: "required" | "optional" | "none"
```

When auth is configured, ordinary operations default to `required`. Without auth, they default to `none`.

Auth strategies assign special internal roles to login, refresh, session, current-user, and logout references.

## Bulk Actions

Declare bulk wire behavior on an action.

```ts
complete: operation.bulk({
  input: CompleteInput,
  output: Task,
  bulk: {
    path: "complete/bulk/",
  },
});
```

Execute it with keys that are independent of the loaded page.

```ts
const result = await tasks.bulk.action("complete", selectedKeys, {
  complete: true,
});
```

The result contains `succeeded`, `failed`, and `values`.

`tasks.bulk.remove(keys)` performs per-key removal and returns the same result shape.

## Views

Define a view from the entity schema.

```ts
const TaskSummary = Task.view({
  fields: ["id", "title"],
  computed: {
    shortTitle: fields.Computed({
      dependsOn: ["title"],
      get: ({ title }) => title.slice(0, 20),
    }),
  },
});
```

Register it on the resource.

```ts
views: {
  summary: TaskSummary;
}
```

Every remote view must include the resource key. Runtime construction fails when it does not.

View responses merge their known canonical fields into the resource entity cache. Computed fields are materialized from current data. They are not persisted.

Views are read-only. They cannot be mutation input schemas.

## Direct Cache Ingestion

Use the resource cache facade.

```ts
tasks.cache.add({ id: 1, title: "New", complete: false });
tasks.cache.upsert({ id: 1, title: "Changed" });
tasks.cache.remove(1);
tasks.cache.replaceAll([{ id: 2, title: "Only row", complete: false }]);
```

These methods publish synchronously.

`add` rejects a live duplicate key.

`upsert` preserves omitted known fields.

`remove` tombstones the entity and removes it from known collections.

`replaceAll` replaces the current collection's ordered membership.

Membership may be overridden with `none`, `current`, or `matching`. `matching` inserts into collections only when a complete client predicate proves membership. Uncertain remote collections become stale.

Application code should not write directly to `api.cache`.

## Relations

### Definition

Relations point to resource definitions.

```ts
const Comment = schema({
  id: fields.ID(),
  author: fields.Ref({ resource: Users, required: true }),
  reviewers: fields.RefList({ resource: Users }),
});
```

Register both the owner and target resource in the runtime.

Relation input may be a target key or an included target object. Included objects are normalized into the target cache.

Direct entity values expose materialized target values. Missing or tombstoned targets are omitted from to-many direct values.

### Relation Controllers

```ts
const comment = api.resource(Comments).get(10);
const author = comment.relation("author");
const reviewers = comment.relation("reviewers");
```

To-one controllers expose:

```text
value, loading, error, stale, load, set, clear, dispose
```

To-many controllers expose:

```text
values, entries, missingKeys, loading, error, stale
load, refresh, add, addMany, remove, removeMany, set, clear, cancel, dispose
```

Relation controllers are memoized by one object controller.

### Loading Modes

`load` may be:

```text
lazy | eager | included | manual
```

To-one key relations use the target retrieve operation.

Query-driven relations use the query returned by the relation's `query(source)` function.

Key-backed `RefList` relations bulk-load missing remote targets.

### Bulk Target Loading

The runtime default is repeated `id` parameters.

```text
GET /users/?id=3&id=7&id=12
```

Configure a runtime default:

```ts
const api = createUiCogs({
  resources: [Users, Groups],
  relationDefaults: {
    byKeys: relation.byKeys({ parameter: "id", encoding: "repeat" }),
  },
});
```

Override one relation:

```ts
members: fields.RefList({
  resource: Users,
  fetch: relation.byKeys({
    parameter: "user_id",
    encoding: "comma",
    path: "bulk/",
  }),
});
```

Built-in encodings are `repeat`, `comma`, and `brackets`.

Bulk loading:

1. Preserves parent order.
2. Deduplicates keys.
3. Skips fresh targets.
4. Canonically sorts the request key set for request deduplication.
5. Normalizes returned targets.
6. Exposes absent targets through `missingKeys`.

`load({ policy: "network-only" })` and `refresh()` force the target request.

### Plain To-Many Mutation

A plain `RefList` uses parent-list mutation by default.

```ts
members: fields.RefList({
  resource: Users,
  inverse: "groups",
  mutation: relation.parent(),
});
```

The complete key list is written through the parent schema and patch operation.

Use endpoint mutation when the server exposes relation commands.

```ts
members: fields.RefList({
  resource: Users,
  mutation: relation.endpoints({
    add: ({ sourceKey }) => `${sourceKey}/members/add/`,
    remove: ({ sourceKey }) => `${sourceKey}/members/remove/`,
    set: ({ sourceKey }) => `${sourceKey}/members/set/`,
    clear: ({ sourceKey }) => `${sourceKey}/members/clear/`,
  }),
});
```

Endpoint configuration may override method and body construction.

Mutations are pessimistic. Failed mutations leave confirmed membership unchanged.

### Attributed Many-To-Many Relations

Use an explicit join resource when the relationship has fields.

```ts
const Membership = schema({
  id: fields.ID(),
  group: fields.ID(),
  user: fields.ID(),
  position: fields.Int(),
});

const Memberships = resource({
  name: "memberships",
  url: "memberships/",
  schema: Membership,
  key: "id",
});

members: fields.RefList({
  resource: Users,
  through: {
    resource: Memberships,
    source: "group",
    target: "user",
    orderBy: "position",
  },
});
```

`values` contains target users.

`entries` contains readonly join records. The current controller declaration exposes these records structurally rather than as the inferred join schema type.

`add(userKey, membershipInput)` creates a join entity.

`remove(userKey)` removes the matching join entity.

`set(userKeys)` computes create and delete deltas.

Duplicate source-target joins are rejected unless `allowDuplicates` is true.

Join operations use ordinary resource behavior. Join forms use ordinary form definitions.

## Pagination

Core includes page and offset adapters. `@uicogs/http` adds cursor and Link header adapters.

A pagination adapter implements:

```ts
interface PaginationAdapter {
  request(page: PageState): Readonly<Record<string, unknown>>;
  response(response: TransportResponse<unknown>, page?: PageState): PaginationResult;
}
```

The controller owns current navigation and accumulation. The shared cache stores only collection keys and returned page metadata.
