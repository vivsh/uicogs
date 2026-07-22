# Authentication And Context

This guide describes first-class JWT and cookie authentication.

## Ownership

`jwtAuth()` and `cookieAuth()` create immutable strategy definitions.

`createUiCogs({ auth })` creates the stateful auth controller.

The runtime owns:

- initialization;
- login and logout;
- request preparation;
- JWT refresh when applicable;
- auth-owned state;
- auth context contribution;
- cache scope;
- identity-change cancellation;
- disposal.

The application does not install auth middleware manually.

The application does not copy auth state into its application context.

## Operation References

Auth lifecycle requests use resource operation references.

```ts
const login = Sessions.operation("login");
const refresh = Sessions.operation("refresh");
const logout = Sessions.operation("logout");
const currentUser = Users.operation("current");
```

An operation reference is immutable. It contains the resource definition and operation name. It contains no runtime or transport state.

Every referenced resource must be registered in the runtime.

## JWT Definitions

Define the wire schemas and resources first.

```ts
const Credentials = schema({
  email: fields.Email({ required: true }),
  password: fields.Password({ required: true }),
});

const Tokens = schema({
  access: fields.Str({ required: true }),
  refresh: fields.Str(),
});

const Claims = schema({
  sub: fields.Str({ required: true }),
  tenant: fields.Str({ required: true }),
  permissions: fields.StrList({ required: true }),
  exp: fields.Int(),
  nbf: fields.Int(),
});

const Sessions = resource({
  name: "sessions",
  url: "sessions/",
  schema: User,
  key: "id",
  operations: {
    login: operation.action({
      path: "login/",
      input: Credentials,
      output: Tokens,
      auth: "none",
    }),
    refresh: operation.action({
      path: "refresh/",
      input: schema({ refresh: fields.Str({ required: true }) }),
      output: Tokens,
      auth: "none",
    }),
    logout: operation.action({ path: "logout/" }),
  },
});
```

Create the strategy.

```ts
import { jwtAuth, memoryAuthStorage } from "@uicogs/auth";

const auth = jwtAuth({
  claims: Claims,
  login: Sessions.operation("login"),
  refresh: Sessions.operation("refresh"),
  logout: Sessions.operation("logout"),
  currentUser: Users.operation("current"),
  storage: memoryAuthStorage(),
  state: () => ({ selectedProject: undefined as number | undefined }),
  permissions: ({ claims }) => claims.permissions,
  cacheScope: ({ claims }) => ({
    subject: claims.sub,
    tenant: claims.tenant,
  }),
});
```

Create the runtime.

```ts
const api = createUiCogs({
  baseUrl: "/api/",
  resources: [Users, Sessions],
  auth,
  context: { locale: "en", timeZone: "UTC" },
});
```

## JWT Behavior

JWT auth:

- stores access and optional refresh tokens through `AuthStorage`;
- decodes the access-token payload;
- parses claims with the claims schema;
- checks `exp` and `nbf` with configured clock skew;
- optionally checks issuer and audience;
- refreshes before expiry when configured;
- deduplicates concurrent refresh;
- replays one authenticated `401` once;
- never replays `403`;
- prevents recursive refresh;
- accepts rotated refresh tokens;
- expires the session when refresh fails.

Client decoding does not verify a JWT signature. The server remains authoritative.

JWT authenticated requests use `credentials: "omit"`. The access token is sent in the authorization header. The default scheme is `Bearer`.

Tokens do not appear in runtime context, cache keys, failures, events, diagnostics, request identities, or SSE URLs.

## JWT Storage

Memory storage is the default.

```ts
memoryAuthStorage();
```

Browser storage is explicit.

```ts
browserAuthStorage(sessionStorage, "example.session");
```

Browser storage makes tokens available to JavaScript. Choose it only after evaluating the application's XSS and persistence risks.

## Cookie Authentication

Cookie auth lets the browser own an HttpOnly session cookie.

```ts
import { cookieAuth } from "@uicogs/auth";

const auth = cookieAuth({
  login: Sessions.operation("login"),
  logout: Sessions.operation("logout"),
  session: Users.operation("current"),
  credentials: "same-origin",
  csrf: {
    header: "X-CSRFToken",
    token: () => readCookie("csrftoken"),
  },
  state: () => ({ selectedProject: undefined as number | undefined }),
  permissions: ({ user }) => user.permissions,
  subject: ({ user }) => user.id,
  cacheScope: ({ user }) => ({
    subject: user.id,
    tenant: user.tenantId,
  }),
});
```

Cookie auth:

- stores no access or refresh token;
- never reads an HttpOnly cookie;
- uses `same-origin` credentials by default;
- supports explicit `include` for a cross-origin cookie deployment;
- adds the configured CSRF header to unsafe credentialed methods;
- fails locally when CSRF is configured but no token is available;
- treats an authenticated `401` as session expiry;
- does not perform JWT-style replay.

Cookie attributes and CORS response headers are server responsibilities.

## Automatic Initialization

Initialization starts in a microtask after runtime construction and resource validation.

JWT initialization reads persisted tokens and restores a valid session.

Cookie initialization calls the configured session operation.

Protected requests wait for initialization.

Operations with `auth: "none"` do not wait.

Local resources do not wait.

A cookie session `401` produces anonymous state. Other initialization failures produce error state.

There is no `api.ready` promise.

`api.auth.initialize()` remains public and idempotent for deterministic tests and unusual bootstrapping.

## Controller Surface

Shared JWT and cookie state:

```ts
api.auth.value;
api.auth.status;
api.auth.user;
api.auth.permissions;
api.auth.state;
api.auth.error;
api.auth.sessionGeneration;
```

JWT controllers also expose `claims`.

Cookie controllers do not expose a fake claims value.

Commands:

```ts
await api.auth.initialize();
const login = await api.auth.login(credentials);
const logout = await api.auth.logout();

api.auth.updateUser(user);
api.auth.updateState({ selectedProject: 4 });
```

Expected login and logout failures return:

```ts
type AuthResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: NormalizedFailure };
```

Invalid strategy configuration throws.

Statuses are:

```text
initializing | anonymous | authenticating | authenticated
refreshing | expired | error
```

## Context Composition

The application context store contains application-owned values only.

```ts
context: {
  (locale, timeZone);
}
```

The runtime composes:

```text
{ ...applicationContext, auth: api.auth.value }
```

`auth` is a reserved context key. Application context cannot define or update it.

The composed context uses the exact auth snapshot.

```ts
api.context.value.auth === api.auth.value;
```

Auth changes notify context-sensitive validators, writers, computed values, access policies, and live-source enablement automatically.

Shared persistence never stores auth context. JWT token storage, cookie sessions, and auth-owned state follow separate auth policies. Normalized cache records are keyed by the auth-provided scope.

## Cache Scope

The auth strategy controls cache scope.

JWT defaults to the `sub` claim. Cookie auth uses the required `subject` callback.

Use `cacheScope` to include tenant or another identity partition.

On login, logout, expiry, or identity change, the runtime:

1. Invalidates the old session generation.
2. Aborts old authenticated requests.
3. Publishes the new auth snapshot.
4. Switches cache scope.
5. Clears the previous authenticated in-memory scope.
6. Erases the previous durable scope on explicit logout unless configured otherwise.
7. Hydrates the new durable scope.
8. Resets live replay state.
9. Reevaluates context-sensitive behavior.

Application code does not pass a separate auth `cacheScope` callback to `createUiCogs()`.

## Auth-Owned State

Use strategy `state()` for state that must reset between identities.

```ts
state: () => ({ selectedProject: undefined as number | undefined });
```

`updateState()` replaces fields in an immutable state snapshot.

Logout and expiry recreate the state from the factory.

General application state does not belong here.

## Lifecycle Safety

Auth uses a monotonically increasing session generation.

Initialization, login, refresh, and current-user loading capture their generation. A late result from an older generation cannot restore an old session.

Logout clears local credentials and state before remote revocation can complete. Revocation failure does not restore the session.

`api.dispose()` aborts auth work and clears refresh timers.

## Authenticated SSE

Use composed auth context in `enabled`.

```ts
live: sse({
  url: "events/",
  enabled: ({ context }) => context.auth.status === "authenticated",
});
```

Auth middleware also wraps `openStream`. JWT streams receive authorization headers. Cookie streams receive cookie credentials and applicable request preparation.

An auth scope change aborts the old stream before more events can enter the cache.
