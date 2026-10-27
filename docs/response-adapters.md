# Response Adapters

Response adapters describe an API's successful envelopes, pagination, and errors. They
are explicit; UiCogs never guesses a framework from a response body.

## Configure A Profile

Install `@uicogs/http`, then select the backend contract once.

```ts
import { createUiCogs } from "@uicogs/core";
import { responseAdapters } from "@uicogs/http";

export const api = createUiCogs({
  baseUrl: "/api/",
  resources: [Tasks],
  responseAdapter: responseAdapters.vyuh(),
});
```

Override it on a resource, named query, service, or operation when that endpoint uses a
different contract.

```ts
const Imports = service({
  name: "imports",
  url: "imports/",
  responseAdapter: responseAdapters.drf(),
  operations: {
    run: operation.action({
      responseAdapter: responseAdapters.jsonApi(),
    }),
  },
});

const Tasks = resource({
  name: "tasks",
  url: "tasks/",
  schema: Task,
  key: "id",
  responseAdapter: responseAdapters.vyuh(),
  queries: {
    external: {
      input: ExternalSearch,
      responseAdapter: responseAdapters.laravel(),
    },
  },
});
```

The nearest profile replaces the farther profile. Granular settings remain overrides:

```text
pagination: query/list operation -> resource -> response profile -> core page default
errors:     operation/query -> resource/service -> runtime errorAdapters -> response profile -> fallback
```

## Built-in Profiles

| Profile                      | Successful list contract                                                   | Error contract                              |
| ---------------------------- | -------------------------------------------------------------------------- | ------------------------------------------- |
| `vyuh()`                     | `{ items, total, page, per_page, total_pages }` or a direct bounded array  | Vyuh `ErrorReport`                          |
| `drf()`                      | `{ results, count, next, previous }`                                       | DRF field dictionary                        |
| `laravel()`                  | Laravel paginator `data`, page totals, and navigation URLs                 | `{ message, errors }`                       |
| `springData()`               | Spring Data `content`, `totalElements`, `totalPages`, `number`, `size`     | Problem Details                             |
| `jsonApi(options?)`          | JSON:API primary `data`, `links.next`, `links.prev`, optional `meta` count | JSON:API `errors`                           |
| `graphqlConnection(options)` | `edges[].node`, `pageInfo`, optional `totalCount`                          | GraphQL `errors`, including HTTP 200 errors |

### Vyuh

Vyuh objects and bounded lists are direct JSON. Database-backed lists use one-indexed
`page` and `per_page` parameters and this envelope:

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "per_page": 20,
  "total_pages": 0
}
```

The error profile reads `source`, `code`, `detail`, and nested `errors`. Leaf `code` and
`message` values become server issues. `non_field_errors` becomes a form-level issue.

### JSON:API

Primary resources become `{ ...attributes, id, type }`. Collections retain their
envelope long enough for pagination links and configured count metadata to be read.

```ts
responseAdapters.jsonApi({
  countKey: "total", // reads meta.total
  pageParam: "page[number]",
  sizeParam: "page[size]",
});
```

`included` relationships are not normalized automatically. Use a custom decoder when
the application needs to materialize them.

### GraphQL Connections

The connection path is required because GraphQL result field names are application
defined.

```ts
responseAdapters.graphqlConnection({
  connection: "data.users",
  cursorParam: "after",
  sizeParam: "first",
});
```

Use an array path when a field name contains a dot. The profile handles connection
responses; constructing a GraphQL document and variables remains the operation's job.

## Custom Profiles

Core exposes a domain-neutral builder.

```ts
import { pagination, responseAdapters } from "@uicogs/core";

const wrapped = responseAdapters.custom({
  name: "wrapped",
  decode: (response, context) => {
    const body = response.data as { payload?: unknown };
    return context.kind === "collection" ? response.data : body.payload;
  },
  pagination: pagination.page({ resultsKey: "items", countKey: "total" }),
  errorAdapter: customErrors,
});
```

`decode` runs only for successful responses. It receives `entity`, `collection`, or
`action` context. The runtime preserves the transport status and headers around the
decoded data. A custom pagination adapter may inspect both data and headers.

Raw transport responses, relation decoders, bulk decoders, and manually parsed action
outputs remain available for endpoints that do not fit a reusable profile.
