# Workflow Coverage

This table records the implemented workflow surface. `Equivalent` means the workflow has a direct UiCogs counterpart. `Superseded` means UiCogs uses a different contract to remove shared mutable state or ambiguous behavior.

| Capability                    | Status     | UiCogs contract                                                                                                   | Evidence                                                             |
| ----------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Object schemas                | Equivalent | Configuration fields and decorators produce the same immutable schema representation.                             | [schema contracts](../packages/core/src/schema-contract.test.ts)     |
| Schema composition            | Equivalent | `keep`, `drop`, `extend`, `modify`, `merge`, `reorder`, `partial`, `required`, and `view` return new definitions. | [schema tests](../packages/core/src/schema.test.ts)                  |
| Parsing and validation        | Superseded | `parse` is synchronous and context-free. `validate` is asynchronous and cancellable.                              | [validation guide](validation.md)                                    |
| Field catalog                 | Equivalent | Scalar, temporal, list, nested, binary, relation, and computed fields are typed.                                  | [field matrix](../packages/core/src/field-matrix.test.ts)            |
| Presentation metadata         | Superseded | Framework-neutral descriptors are resolved by renderer registries.                                                | [descriptor tests](../packages/core/src/support.test.ts)             |
| Filter-only fields            | Superseded | Query schemas belong to queries and never alter entity types.                                                     | [resource contracts](../packages/core/src/resource-contract.test.ts) |
| Resource chaining             | Equivalent | Fresh controllers expose local filter, sort, page, load, all, and get workflows.                                  | [resource tests](../packages/core/src/resource.test.ts)              |
| Local resources               | Superseded | URL-free sources use the same asynchronous controllers, forms, cache, and framework adapters.                     | [resource tests](../packages/core/src/resource.test.ts)              |
| Direct cache writes           | Superseded | Typed resource facades parse and publish add, upsert, remove, and replace-all changes immediately.                | [cache guide](caching.md)                                            |
| Operations and actions        | Superseded | Typed CRUD, custom, and bulk operations use paths relative to one resource URL.                                   | [workflow tests](../packages/core/src/workflow.test.ts)              |
| Pagination                    | Equivalent | Page, offset, cursor, link-header, client, and custom adapters are available.                                     | [HTTP tests](../packages/http/src/http.test.ts)                      |
| Relations                     | Superseded | Cardinality-aware controllers support bulk loading, endpoints, parent lists, and explicit join resources.         | [relation tests](../packages/core/src/relation.test.ts)              |
| Shared caching                | Superseded | One runtime shares scoped normalized entities and coordinated requests while controllers keep local state.        | [cache tests](../packages/core/src/cache.test.ts)                    |
| Runtime context               | Superseded | One immutable store publishes application and auth context without manual invalidation.                           | [context tests](../packages/core/src/context.test.ts)                |
| Shared persistence            | Superseded | One local, session, IndexedDB, or custom backend persists context and scoped normalized cache records.            | [persistence tests](../packages/core/src/persistence.test.ts)        |
| Forms                         | Equivalent | Isolated drafts support validation, server issues, operation binding, cancellation, and progress.                 | [form tests](../packages/core/src/form.test.ts)                      |
| JSON and file submission      | Superseded | Schema writers run before automatic JSON or multipart selection.                                                  | [form contracts](../packages/core/src/form-contract.test.ts)         |
| Server errors                 | Superseded | Ordered adapters emit structured bound and unbound issues.                                                        | [forms guide](forms.md)                                              |
| JWT and cookie authentication | Superseded | Immutable strategies create runtime-owned auth controllers and automatic cache scopes.                            | [auth tests](../packages/auth/src/strategy.test.ts)                  |
| Typed events                  | Equivalent | Application and lifecycle events support subscribe, unsubscribe, and once behavior.                               | [support tests](../packages/core/src/support.test.ts)                |
| Vue                           | Superseded | External-store controllers expose readonly Vue-reactive state.                                                    | [Vue tests](../packages/vue/src/vue.test.ts)                         |
| Routes and Vue binding        | Superseded | Core owns immutable access-aware route definitions; the app installs Vue Router and `buildPlugin()` adds guards.  | [route tests](../packages/vue/src/routes.test.ts)                    |
| React                         | Superseded | React consumes shared controllers through `useSyncExternalStore`.                                                 | [React tests](../packages/react/src/react.test.ts)                   |
| Quasar forms                  | Equivalent | `UcForm` and `UcField` resolve descriptors, issues, access, and binary state.                                     | [Quasar tests](../packages/quasar/src/index.test.ts)                 |
| Resource tables and views     | Equivalent | `UcTable`, `UcView`, and `UcResourceView` compose controller workflows.                                           | [component tests](../packages/quasar/src/components.test.ts)         |
| Actions and feedback          | Equivalent | `UcAction`, `UcDelete`, `UcCancel`, alerts, and confirmations consume controllers or callbacks.                   | [component tests](../packages/quasar/src/components.test.ts)         |
| OpenAPI import                | Superseded | Deterministic OpenAPI 3.0 and 3.1 generation produces pure definitions and warnings.                              | [generator tests](../packages/openapi/src/generator.test.ts)         |
| Constructor migration         | Superseded | `@uicogs/legacy` maps transitional constructor and mutable data workflows to the shared runtime.                  | [legacy tests](../packages/legacy/src/legacy.test.ts)                |

## Excluded Surfaces

UiCogs does not include:

- calendar or timetable UI
- page metadata management
- decorative panel or feature-card helpers
- asset URL helpers
- application themes
- global router, loading, notification, or reload side effects
- an SSR hydration protocol
- an Axios transport

Date, time, and context-aware time-zone formatting remain included.

## Completion Rules

- Public declarations contain no `any` for normal workflows.
- Core contains no framework, router, storage, or third-party transport runtime dependency.
- Persistent cache records contain no controller state, request failures, drafts, framework proxies, or credentials.
- Tests contain no focused, skipped, or placeholder cases.
