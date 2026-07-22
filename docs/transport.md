# Default Fetch Transport

This guide describes the transport created by `createUiCogs()`.

## Normal Configuration

Remote resources use Fetch automatically.

```ts
const api = createUiCogs({
  resources: [Tasks],
  baseUrl: "/api/",
  http: {
    timeoutMs: 30_000,
    retry: {
      maximumRetries: 2,
      initialDelayMs: 250,
      maximumDelayMs: 2_000,
      jitter: 0.2,
      respectRetryAfter: true,
    },
  },
});
```

Normal applications do not create a transport.

Global `fetch` is resolved when the first remote request starts. Schema and local-resource workflows work without Fetch.

`http.fetch` may supply a compatible Fetch implementation for deterministic tests or a specialized runtime.

## Custom Transport

A structural custom `Transport` remains an advanced escape hatch.

```ts
createUiCogs({
  resources: [Tasks],
  transport: customTransport,
});
```

`http` and `transport` are mutually exclusive.

UiCogs maintains only the Fetch implementation. Axios is not supported.

## Timeout

The default timeout is 30 seconds.

The timeout is one total deadline. It includes attempts, response parsing, and retry delays.

`timeoutMs: 0` disables the deadline.

Caller cancellation remains an `AbortError`.

A deadline produces `TransportExecutionError` with code `timeout`.

Timeout and caller signals are combined. Timers and listeners are released after completion.

## Retry

Only `GET` requests retry automatically.

The default is two retries after the initial attempt.

Default retry conditions are network failure and these statuses:

```text
408, 425, 429, 500, 502, 503, 504
```

UiCogs does not retry:

- mutation methods;
- cancellation;
- protocol errors;
- `401`;
- `403`.

Auth middleware may perform one separate JWT refresh replay for `401`.

Retry uses bounded exponential delay and jitter.

A valid `Retry-After` value is respected only when it fits inside the remaining deadline.

SSE does not use ordinary request retry. The live controller owns reconnect behavior.

## URLs And Queries

The transport preserves existing query parameters.

New query parameters are appended before a URL fragment.

Arrays use repeated keys.

```text
?id=3&id=7&id=12
```

Supported values are strings, finite numbers, booleans, and arrays of those values.

`undefined`, `null`, and empty strings are omitted.

Nested query objects are protocol errors. Use a field query writer or operation request builder to encode them explicitly.

Unicode is preserved.

A `GET` request body is a protocol error.

## Headers

Headers merge case-insensitively.

The transport adds `Accept: application/json` only when the application did not supply `Accept`.

Generated auth and CSRF headers are applied by the auth strategy as the innermost middleware. Application middleware does not receive those generated values.

## Credentials

General HTTP configuration has no credentials option.

Auth owns credential policy.

```text
JWT request                 -> omit
cookie authenticated       -> same-origin or configured include
auth:none                   -> omit
runtime without auth        -> Fetch default same-origin behavior
```

A custom transport must honor `TransportRequest.credentials`.

## Request Bodies

Schema and form writers run before body encoding.

`auto` uses JSON unless binary data remains.

`auto` uses multipart when binary data remains.

Supported body workflows include:

- JSON objects and arrays;
- direct `FormData`;
- dotted multipart paths;
- bracket multipart paths;
- custom multipart adapters;
- nested binary objects;
- object arrays containing files;
- repeated file lists;
- remote file omission;
- explicit file removal.

The transport rejects:

- forced JSON with remaining binary values;
- cyclic payloads;
- unsupported raw body values;
- manually supplied multipart `Content-Type`.

Fetch must create the multipart boundary.

## Upload Progress

Fetch upload progress is indeterminate.

UiCogs emits start and successful completion states. It does not emit a false percentage.

## Responses

`204`, `205`, and empty bodies return `undefined`.

`application/json` and `application/*+json` parse as JSON.

A UTF-8 BOM is removed before JSON parsing.

Valid JSON `null` remains `null`.

Text and unknown non-binary content types return text.

Malformed declared JSON on a successful response is a protocol error.

Malformed JSON on an error response remains raw text so error adapters can inspect it.

Binary download modes are not supported in 1.0.

## Non-2xx Responses

The transport returns non-2xx `TransportResponse` values to the runtime.

Failure adaptation then uses operation, resource, runtime, and fallback adapters in that order.

This preserves server field errors and operation-specific failure formats.

## Transport Errors

Execution failures use:

```ts
class TransportExecutionError extends Error {
  readonly code: "network" | "timeout" | "protocol";
  readonly retryable: boolean;
  readonly status?: number;
}
```

Failures are sanitized. They do not include request bodies, authorization headers, or complete URLs with query data.

## Middleware

Application middleware is optional.

```ts
interface TransportMiddleware {
  request(request, next): Promise<TransportResponse<unknown>>;
  openStream?(request, next): Promise<StreamResponse>;
}
```

Middleware order is declaration order. The first middleware is outermost.

Request coordination wraps the complete middleware and transport execution.

Do not use application middleware to implement first-party auth. Pass an auth strategy to the runtime.

## Streaming

The default transport implements `openStream()` with Fetch.

A successful stream must use `text/event-stream`.

The response body is exposed as an unbuffered async byte iterable.

Abort, retry, iterator return, and disposal cancel the reader and release its lock.

HTTP `204` stops SSE reconnection.

`Last-Event-ID` is preserved for same-scope reconnects.

See [Authentication](authentication.md) for authenticated streams and [Caching](caching.md) for live cache behavior.
