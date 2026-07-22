# Migration From QStruts

UiCogs preserves the schema-driven workflow. UiCogs changes definition ownership, cache identity, validation, and runtime state.

## Authoring

Use pure factories.

```ts
import { fields, resource, schema } from "@uicogs/core";

export const User = schema({
  id: fields.ID(),
  name: fields.Str({ required: true }),
});

export const Users = resource({
  name: "users",
  url: "users/",
  schema: User,
  key: "id",
});
```

Do not create definitions from a runtime. Definitions contain no application state.

Class and decorator schemas remain first-class. Use them when parsed values need class methods.

## Entity And Query Fields

Keep persisted entity fields in the resource schema.

Put filter-only values in a query schema. Query fields do not become entity properties.

Use views for readonly subsets and synchronous computed display values.

## Schema Composition

Schemas are immutable.

Use `keep`, `drop`, `extend`, `modify`, `merge`, and `reorder`. Every method returns a new schema.

## Parsing And Validation

Use synchronous `schema.parse(input)` for structural conversion.

Use `await schema.validate(value)` for all validation. One validator list may contain synchronous and asynchronous functions.

Do not pass application context to `parse`. A bound runtime supplies context to validation, formatting, access rules, computed values, writers, and operations.

## Runtime

Create one application-owned runtime.

```ts
export const api = createUiCogs({
  baseUrl: "/api/",
  resources: [Users],
  context: { locale: "en" },
});
```

Read application context from `api.context.value`. Use `set()` or `update()` for changes. Do not mutate context values or send manual invalidation notifications.

Create a fresh resource controller for each page or workflow.

```ts
const pageUsers = api.resource(Users);
const sidebarUsers = api.resource(Users);
```

The controllers keep independent loading, errors, filters, sort, and pagination. The controllers share normalized immutable entities through `api`.

## URLs And Operations

Only a resource definition owns a base URL.

Operations define methods and paths relative to that resource URL. Use typed operation references for authentication lifecycle operations.

## Forms

Derive an immutable form schema from entity fields. Bind the form definition to a resource or object controller.

Form drafts never mutate cached values. Successful operations normalize the confirmed server result into the cache.

## Relations

Replace nested data-source instances with `fields.Ref` and `fields.RefList` definitions.

Relations refer to resource definitions. Runtime relation controllers load and mutate normalized target data.

Use an explicit join resource when a many-to-many relation contains attributes.

## Authentication

Pass `jwtAuth()` or `cookieAuth()` directly to `createUiCogs()`.

Do not install auth middleware manually. Do not place auth in application context. Do not manage auth cache scope separately.

UiCogs composes auth into runtime context and switches cache scope when identity changes.

## UI Names

UiCogs Quasar components use the `Uc` prefix.

The package does not export old UI aliases. Rename consuming templates directly.

## Compatibility Package

`@uicogs/legacy` supports constructor schemas, model schemas, decorators, and mutable data-source chaining during migration.

It does not restore weak object containers, independent caches, or old UI component names.

## Recommended Order

1. Define canonical schemas and resource identities.
2. Register all resources in one application runtime.
3. Move filter-only fields into query schemas.
4. Create fresh resource controllers per workflow.
5. Move forms to immutable form definitions.
6. Add views and relations after canonical cache identity is stable.
7. Add a first-class auth strategy.
8. Remove the compatibility package after all consumers use public UiCogs APIs.
