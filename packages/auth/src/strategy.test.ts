import {
  createUiCogs,
  fields,
  memoryCache,
  operation,
  resource,
  schema as defineSchema,
  type TransportRequest,
} from "@uicogs/core";
import { describe, expect, it } from "vitest";
import {
  browserAuthStorage,
  cookieAuth,
  jwtAuth,
  memoryAuthStorage,
  type JwtClaims,
} from "./index.js";

interface Claims extends JwtClaims {
  readonly tenant: string;
  readonly permissions: readonly string[];
}

const User = defineSchema({
  id: fields.ID(),
  name: fields.Str({ required: true }),
});
const Credentials = defineSchema({ email: fields.Email({ required: true }) });
const Tokens = defineSchema({
  access: fields.Str({ required: true }),
  refresh: fields.Str(),
});
const Refresh = defineSchema({ refresh: fields.Str({ required: true }) });
const ClaimsSchema = defineSchema({
  sub: fields.Str({ required: true }),
  tenant: fields.Str({ required: true }),
  permissions: fields.StrList({ required: true }),
  exp: fields.Int(),
});
const Users = resource({
  name: "strategy-users",
  url: "users/",
  schema: User,
  key: "id",
  operations: {
    current: operation.retrieve({ path: "current/", output: User }),
  },
});
const Sessions = resource({
  name: "strategy-sessions",
  url: "sessions/",
  schema: User,
  key: "id",
  operations: {
    login: operation.action({ path: "login/", input: Credentials, output: Tokens }),
    refresh: operation.action({ path: "refresh/", input: Refresh, output: Tokens }),
    logout: operation.action({ path: "logout/" }),
  },
});
const CookieSessions = resource({
  name: "cookie-sessions",
  url: "cookie-sessions/",
  schema: User,
  key: "id",
  operations: {
    login: operation.action({ path: "login/", input: Credentials }),
    logout: operation.action({ path: "logout/" }),
  },
});
const RawSession = defineSchema({
  id: fields.ID(),
  access: fields.Unknown(),
  refresh: fields.Unknown(),
});
const RawSessions = resource({
  name: "raw-sessions",
  url: "raw-sessions/",
  schema: RawSession,
  key: "id",
  operations: {
    login: operation.action({ path: "login/" }),
    refresh: operation.action({ path: "refresh/" }),
    logout: operation.action({ path: "logout/" }),
  },
});

describe("runtime authentication strategies", () => {
  it("instantiates JWT auth, executes operation references, and owns credentials", async () => {
    const requests: TransportRequest[] = [];
    const cache = memoryCache();
    const access = token({
      sub: "42",
      tenant: "a",
      permissions: ["users.read"],
      exp: Math.floor(Date.now() / 1000) + 600,
    });
    const strategy = jwtAuth({
      claims: ClaimsSchema,
      login: Sessions.operation("login"),
      refresh: Sessions.operation("refresh"),
      logout: Sessions.operation("logout"),
      currentUser: Users.operation("current"),
      storage: memoryAuthStorage(),
      state: () => ({ selected: undefined as number | undefined }),
      scopes: ({ claims }) => claims.permissions,
      cacheScope: ({ claims }) => ({ subject: claims.sub, tenant: claims.tenant }),
    });
    const api = createUiCogs({
      resources: [Users, Sessions],
      auth: strategy,
      cache,
      context: { locale: "en" },
      transport: {
        request: async (request) => {
          requests.push(request);
          if (request.url.endsWith("sessions/login/"))
            return { status: 200, data: { access, refresh: "refresh-token" } };
          if (request.url.endsWith("users/current/"))
            return { status: 200, data: { id: 42, name: "Ada" } };
          return { status: 204, data: undefined };
        },
      },
    });

    await api.auth.initialize();
    const result = await api.auth.login({ email: "ada@example.test" });
    expect(result.ok).toBe(true);
    expect(api.auth.value).toBe(api.auth.getSnapshot());
    expect(api.context.value.auth).toBe(api.auth.value);
    expect(api.context.value.locale).toBe("en");
    expect(api.auth.user?.name).toBe("Ada");
    expect(api.auth.claims?.tenant).toBe("a");
    expect(api.auth.scopes.has("users.read")).toBe(true);
    expect(api.auth.cacheScope()).toContain("42");
    const authenticatedScope = api.auth.cacheScope();
    api.resource(Users).cache.add({ id: 99, name: "Cached user" });
    expect(cache.dump(authenticatedScope).entities).toHaveLength(1);
    expect(cache.dump("anonymous").entities).toHaveLength(0);
    expect(requests[0]?.credentials).toBe("omit");
    expect(requests[1]?.headers?.Authorization).toBe(`Bearer ${access}`);

    api.auth.updateState({ selected: 7 });
    expect(api.auth.state.selected).toBe(7);
    expect(api.context.value.auth.state.selected).toBe(7);
    await api.auth.logout();
    expect(api.auth.status).toBe("anonymous");
    expect(api.auth.state.selected).toBeUndefined();
    expect(cache.dump(authenticatedScope).entities).toHaveLength(0);
    expect(requests.at(-1)?.headers?.Authorization).toBe(`Bearer ${access}`);
    api.dispose();
  });

  it("discovers cookie sessions and applies credentials and CSRF", async () => {
    let authenticated = false;
    const requests: TransportRequest[] = [];
    const strategy = cookieAuth({
      login: CookieSessions.operation("login"),
      logout: CookieSessions.operation("logout"),
      session: Users.operation("current"),
      credentials: "same-origin",
      csrf: { header: "X-CSRFToken", token: () => "csrf" },
      state: () => ({ selected: undefined as number | undefined }),
      subject: ({ user }) => user.id,
    });
    const api = createUiCogs({
      resources: [Users, CookieSessions],
      auth: strategy,
      transport: {
        request: async (request) => {
          requests.push(request);
          if (request.url.endsWith("cookie-sessions/login/")) {
            authenticated = true;
            return { status: 204, data: undefined };
          }
          if (request.url.endsWith("users/current/"))
            return authenticated
              ? { status: 200, data: { id: 7, name: "Cookie User" } }
              : { status: 401, data: { detail: "Anonymous" } };
          return { status: 204, data: undefined };
        },
      },
    });

    await api.auth.initialize();
    expect(api.auth.status).toBe("anonymous");
    const result = await api.auth.login({ email: "cookie@example.test" });
    if (!result.ok) throw new Error(JSON.stringify(result.failure));
    expect(result.ok).toBe(true);
    expect(api.auth.user?.name).toBe("Cookie User");
    const loginRequest = requests.find((request) => request.url.endsWith("cookie-sessions/login/"));
    expect(loginRequest?.credentials).toBe("same-origin");
    expect(loginRequest?.headers?.["X-CSRFToken"]).toBe("csrf");
    expect("claims" in api.auth).toBe(false);
    api.dispose();
  });

  it("refreshes one unauthorized request and replays it once", async () => {
    const initial = token({
      sub: "42",
      tenant: "a",
      permissions: [],
      exp: Math.floor(Date.now() / 1000) + 600,
    });
    const rotated = token({
      sub: "42",
      tenant: "a",
      permissions: ["refreshed"],
      exp: Math.floor(Date.now() / 1000) + 1_200,
    });
    let listRequests = 0;
    let refreshRequests = 0;
    const strategy = jwtAuth({
      claims: ClaimsSchema,
      login: Sessions.operation("login"),
      refresh: Sessions.operation("refresh"),
      logout: Sessions.operation("logout"),
      currentUser: Users.operation("current"),
      storage: memoryAuthStorage(),
    });
    const api = createUiCogs({
      resources: [Users, Sessions],
      auth: strategy,
      transport: {
        request: async (request) => {
          if (request.url.endsWith("sessions/login/"))
            return { status: 200, data: { access: initial, refresh: "refresh-token" } };
          if (request.url.endsWith("sessions/refresh/")) {
            refreshRequests += 1;
            expect(request.authentication).toBe("refresh");
            expect(request.headers?.Authorization).toBeUndefined();
            return { status: 200, data: { access: rotated } };
          }
          if (request.url.endsWith("users/current/"))
            return { status: 200, data: { id: 42, name: "Ada" } };
          if (request.url.endsWith("users/")) {
            listRequests += 1;
            return listRequests === 1
              ? { status: 401, data: undefined }
              : { status: 200, data: [] };
          }
          return { status: 404, data: undefined };
        },
      },
    });

    await api.auth.initialize();
    await api.auth.login({ email: "ada@example.test" });
    await api.resource(Users).load();
    expect(refreshRequests).toBe(1);
    expect(listRequests).toBe(2);
    expect(api.auth.claims?.permissions).toEqual(["refreshed"]);
    api.dispose();
  });

  it("prevents late login completion from restoring a logged-out session", async () => {
    const access = token({
      sub: "42",
      tenant: "a",
      permissions: [],
      exp: Math.floor(Date.now() / 1000) + 600,
    });
    let resolveLogin: ((value: { status: number; data: unknown }) => void) | undefined;
    const strategy = jwtAuth({
      claims: ClaimsSchema,
      login: Sessions.operation("login"),
      refresh: Sessions.operation("refresh"),
      logout: Sessions.operation("logout"),
      storage: memoryAuthStorage(),
    });
    const api = createUiCogs({
      resources: [Users, Sessions],
      auth: strategy,
      transport: {
        request: async (request) => {
          if (request.url.endsWith("sessions/login/"))
            return new Promise((resolve) => {
              resolveLogin = resolve;
            });
          return { status: 204, data: undefined };
        },
      },
    });
    await api.auth.initialize();
    const login = api.auth.login({ email: "late@example.test" });
    await Promise.resolve();
    await api.auth.logout();
    resolveLogin?.({ status: 200, data: { access, refresh: "refresh" } });
    expect((await login).ok).toBe(false);
    expect(api.auth.status).toBe("anonymous");
    expect(api.auth.claims).toBeUndefined();
    api.dispose();
  });

  it("validates and isolates memory and browser token storage", async () => {
    const memory = memoryAuthStorage({ access: "one" });
    expect(await memory.read()).toEqual({ access: "one" });
    await memory.write({ access: "two", refresh: "refresh" });
    expect(await memory.read()).toEqual({ access: "two", refresh: "refresh" });
    await memory.clear();
    expect(await memory.read()).toBeUndefined();

    const values = new Map<string, string>();
    const browser = browserAuthStorage(
      {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => void values.set(key, value),
        removeItem: (key) => void values.delete(key),
      } as Storage,
      "session",
    );
    expect(await browser.read()).toBeUndefined();
    await browser.write({ access: "access", refresh: "refresh" });
    expect(await browser.read()).toEqual({ access: "access", refresh: "refresh" });
    values.set("session", '{"access":1}');
    await expect(browser.read()).rejects.toThrow("Stored access token is invalid");
    values.set("session", "null");
    await expect(browser.read()).rejects.toThrow("Stored authentication data is invalid");
    values.set("session", '{"access":"ok","refresh":1}');
    await expect(browser.read()).rejects.toThrow("Stored refresh token is invalid");
    await browser.clear();
    expect(values.has("session")).toBe(false);
  });

  it("covers controller attachment, disposal, and anonymous request guards", async () => {
    const strategy = jwtAuth({
      claims: ClaimsSchema,
      login: Sessions.operation("login"),
      refresh: Sessions.operation("refresh"),
      logout: Sessions.operation("logout"),
      storage: memoryAuthStorage(),
    });
    const controller = strategy.create();
    const unattached = await controller.login({ email: "missing@example.test" });
    expect(unattached.ok).toBe(false);
    const bindings = {
      execute: async () => undefined,
    } as never;
    controller.attach(bindings);
    expect(() => controller.attach(bindings)).toThrow("already attached");
    await controller.initialize();
    const middleware = controller.middleware();
    await expect(
      middleware.request(
        {
          method: "GET",
          url: "/private/",
          authentication: "required",
          signal: new AbortController().signal,
        },
        async () => ({ status: 200, data: undefined }),
      ),
    ).rejects.toThrow("Authentication is required");
    const optional = await middleware.request(
      {
        method: "GET",
        url: "/optional/",
        authentication: "optional",
        signal: new AbortController().signal,
      },
      async (request) => ({ status: 200, data: request.credentials }),
    );
    expect(optional.data).toBe("omit");
    controller.dispose();
    controller.dispose();
    await expect(controller.login({ email: "disposed@example.test" })).rejects.toThrow("disposed");
  });

  it.each([
    [
      "expired",
      { sub: "42", tenant: "a", permissions: [], exp: Math.floor(Date.now() / 1000) - 60 },
    ],
    [
      "not active",
      { sub: "42", tenant: "a", permissions: [], nbf: Math.floor(Date.now() / 1000) + 60 },
    ],
    ["issuer", { sub: "42", tenant: "a", permissions: [], iss: "wrong" }],
    ["audience", { sub: "42", tenant: "a", permissions: [], iss: "trusted", aud: "wrong" }],
  ])("rejects JWT claims with an invalid %s", async (_name, claims) => {
    const strategy = jwtAuth({
      claims: { parse: (value) => value as Claims },
      login: Sessions.operation("login"),
      refresh: Sessions.operation("refresh"),
      logout: Sessions.operation("logout"),
      storage: memoryAuthStorage(),
      clockSkewSeconds: 0,
      issuer: "trusted",
      audience: "client",
    });
    const api = createUiCogs({
      resources: [Users, Sessions],
      auth: strategy,
      transport: {
        request: async () => ({ status: 200, data: { access: token(claims as Claims) } }),
      },
    });
    await api.auth.initialize();
    const result = await api.auth.login({ email: "invalid@example.test" });
    expect(result.ok).toBe(false);
    expect(api.auth.status).toBe("error");
    expect(api.auth.error).toBeDefined();
    api.dispose();
  });

  it("expires when refresh is unavailable and suppresses changed subjects", async () => {
    const initial = token({
      sub: "42",
      tenant: "a",
      permissions: [],
      exp: Math.floor(Date.now() / 1000) + 600,
    });
    const changed = token({
      sub: "91",
      tenant: "a",
      permissions: [],
      exp: Math.floor(Date.now() / 1000) + 600,
    });
    let includeRefresh = false;
    const strategy = jwtAuth({
      claims: ClaimsSchema,
      login: Sessions.operation("login"),
      refresh: Sessions.operation("refresh"),
      logout: Sessions.operation("logout"),
      storage: memoryAuthStorage(),
    });
    const api = createUiCogs({
      resources: [Users, Sessions],
      auth: strategy,
      transport: {
        request: async (request) => {
          if (request.url.endsWith("sessions/login/"))
            return {
              status: 200,
              data: { access: initial, ...(includeRefresh ? { refresh: "refresh" } : {}) },
            };
          if (request.url.endsWith("sessions/refresh/"))
            return { status: 200, data: { access: changed } };
          return { status: 401, data: undefined };
        },
      },
    });
    await api.auth.initialize();
    await api.auth.login({ email: "first@example.test" });
    await expect(api.resource(Users).load()).rejects.toBeDefined();
    expect(api.auth.status).toBe("expired");

    includeRefresh = true;
    await api.auth.login({ email: "second@example.test" });
    await expect(api.resource(Users).load()).rejects.toBeDefined();
    expect(api.auth.status).toBe("expired");
    api.dispose();
  });

  it("supports cookie permissions, scope, state updates, expiry, and logout failures", async () => {
    let authenticated = true;
    let failLogout = false;
    const strategy = cookieAuth({
      login: CookieSessions.operation("login"),
      logout: CookieSessions.operation("logout"),
      session: Users.operation("current"),
      csrf: { header: "X-CSRFToken", token: () => "csrf" },
      state: () => ({ selected: 0 }),
      subject: ({ user }) => user.id,
      scopes: () => ["users.read", "users.write"],
      cacheScope: ({ user }) => `account:${user.id}`,
    });
    const api = createUiCogs({
      resources: [Users, CookieSessions],
      auth: strategy,
      transport: {
        request: async (request) => {
          if (request.url.endsWith("users/current/"))
            return authenticated
              ? { status: 200, data: { id: 7, name: "Cookie User" } }
              : { status: 401, data: undefined };
          if (request.url.endsWith("users/"))
            return authenticated ? { status: 200, data: [] } : { status: 401, data: undefined };
          if (request.url.endsWith("cookie-sessions/logout/") && failLogout)
            return { status: 500, data: undefined };
          return { status: 204, data: undefined };
        },
      },
    });
    await api.auth.initialize();
    expect(api.auth.scopes.size).toBe(2);
    expect([...api.auth.scopes.keys()]).toEqual(["users.read", "users.write"]);
    expect([...api.auth.scopes.values()]).toEqual(["users.read", "users.write"]);
    expect([...api.auth.scopes.entries()]).toHaveLength(2);
    const visited: string[] = [];
    api.auth.scopes.forEach((scope) => visited.push(scope));
    expect(visited).toEqual(["users.read", "users.write"]);
    expect(api.auth.cacheScope()).toBe("account:7");
    api.auth.updateUser({ id: 8, name: "Updated" });
    api.auth.updateState({ selected: 3 });
    expect(api.auth.user?.id).toBe(8);
    expect(api.auth.state.selected).toBe(3);

    authenticated = false;
    await expect(api.resource(Users).load({ policy: "network-only" })).rejects.toBeDefined();
    expect(api.auth.status).toBe("expired");

    authenticated = true;
    await api.auth.login({ email: "again@example.test" });
    failLogout = true;
    expect((await api.auth.logout()).ok).toBe(false);
    expect(api.auth.status).toBe("anonymous");
    api.dispose();
  });

  it("fails unsafe cookie requests without a CSRF token", async () => {
    const strategy = cookieAuth({
      login: CookieSessions.operation("login"),
      logout: CookieSessions.operation("logout"),
      session: Users.operation("current"),
      csrf: { header: "X-CSRFToken", token: () => undefined },
      subject: ({ user }) => user.id,
    });
    const api = createUiCogs({
      resources: [Users, CookieSessions],
      auth: strategy,
      transport: {
        request: async (request) =>
          request.url.endsWith("users/current/")
            ? { status: 200, data: { id: 1, name: "User" } }
            : { status: 204, data: undefined },
      },
    });
    await api.auth.initialize();
    const result = await api.auth.login({ email: "csrf@example.test" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected CSRF login to fail");
    expect(result.failure.message).toContain("CSRF token");
    expect(api.auth.error).toBe(result.failure);
    api.dispose();
  });

  it("restores and rejects persisted JWT sessions", async () => {
    const access = token({
      sub: "42",
      tenant: "a",
      permissions: [],
      exp: Math.floor(Date.now() / 1000) + 600,
    });
    const restoredStrategy = jwtAuth({
      claims: ClaimsSchema,
      login: Sessions.operation("login"),
      refresh: Sessions.operation("refresh"),
      logout: Sessions.operation("logout"),
      storage: memoryAuthStorage({ access }),
    });
    const restored = createUiCogs({
      resources: [Users, Sessions],
      auth: restoredStrategy,
      transport: { request: async () => ({ status: 204, data: undefined }) },
    });
    await restored.auth.initialize();
    expect(restored.auth.status).toBe("authenticated");
    expect(restored.auth.user).toBeUndefined();
    restored.dispose();

    const invalidStrategy = jwtAuth({
      claims: ClaimsSchema,
      login: Sessions.operation("login"),
      refresh: Sessions.operation("refresh"),
      logout: Sessions.operation("logout"),
      storage: memoryAuthStorage({ access: "invalid" }),
    });
    const invalid = createUiCogs({
      resources: [Users, Sessions],
      auth: invalidStrategy,
      transport: { request: async () => ({ status: 204, data: undefined }) },
    });
    await invalid.auth.initialize();
    expect(invalid.auth.status).toBe("expired");
    invalid.dispose();
  });

  it.each([
    [undefined, "access token"],
    [{ id: 1, access: 1 }, "Access token"],
    [{ id: 1, access: "invalid", refresh: 1 }, "Refresh token"],
  ])("normalizes invalid token responses", async (payload, message) => {
    const strategy = jwtAuth({
      claims: ClaimsSchema,
      login: RawSessions.operation("login"),
      refresh: RawSessions.operation("refresh"),
      logout: RawSessions.operation("logout"),
      storage: memoryAuthStorage(),
    });
    const api = createUiCogs({
      resources: [RawSessions],
      auth: strategy,
      transport: { request: async () => ({ status: 200, data: payload }) },
    });
    await api.auth.initialize();
    const result = await api.auth.login({ email: "invalid@example.test" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected token parsing to fail");
    expect(result.failure.message).toContain(message);
    api.dispose();
  });

  it("handles user loading and JWT logout failures", async () => {
    const access = token({
      sub: "42",
      tenant: "a",
      permissions: [],
      exp: Math.floor(Date.now() / 1000) + 600,
    });
    let failUser = true;
    let failLogout = false;
    const strategy = jwtAuth({
      claims: ClaimsSchema,
      login: Sessions.operation("login"),
      refresh: Sessions.operation("refresh"),
      logout: Sessions.operation("logout"),
      currentUser: Users.operation("current"),
      storage: memoryAuthStorage(),
    });
    const api = createUiCogs({
      resources: [Users, Sessions],
      auth: strategy,
      transport: {
        request: async (request) => {
          if (request.url.endsWith("sessions/login/"))
            return { status: 200, data: { access, refresh: "refresh" } };
          if (request.url.endsWith("users/current/"))
            return failUser
              ? { status: 500, data: undefined }
              : { status: 200, data: { id: 1, name: "User" } };
          if (request.url.endsWith("sessions/logout/") && failLogout)
            return { status: 500, data: undefined };
          return { status: 204, data: undefined };
        },
      },
    });
    await api.auth.initialize();
    expect((await api.auth.login({ email: "fail@example.test" })).ok).toBe(false);
    failUser = false;
    expect((await api.auth.login({ email: "ok@example.test" })).ok).toBe(true);
    api.auth.updateUser({ id: 2, name: "Updated" });
    expect(api.auth.user?.id).toBe(2);
    failLogout = true;
    expect((await api.auth.logout()).ok).toBe(false);
    expect(api.auth.status).toBe("anonymous");
    api.dispose();
  });

  it("refreshes proactively and closes a rejected authenticated stream", async () => {
    const now = Math.floor(Date.now() / 1000);
    const initial = token({ sub: "42", tenant: "a", permissions: [], exp: now + 120 });
    const rotated = token({ sub: "42", tenant: "a", permissions: [], exp: now + 600 });
    let refreshes = 0;
    const strategy = jwtAuth({
      claims: ClaimsSchema,
      login: Sessions.operation("login"),
      refresh: Sessions.operation("refresh"),
      logout: Sessions.operation("logout"),
      storage: memoryAuthStorage(),
      refreshBeforeExpirySeconds: 60,
    });
    const api = createUiCogs({
      resources: [Users, Sessions],
      auth: strategy,
      transport: {
        request: async (request) => {
          if (request.url.endsWith("sessions/login/"))
            return { status: 200, data: { access: initial, refresh: "refresh" } };
          if (request.url.endsWith("sessions/refresh/")) {
            refreshes += 1;
            return { status: 200, data: { access: rotated } };
          }
          return { status: 204, data: undefined };
        },
      },
    });
    await api.auth.initialize();
    await api.auth.login({ email: "timer@example.test" });
    const middleware = api.auth.middleware();
    let streamCalls = 0;
    let closed = false;
    const stream = await middleware.openStream!(
      {
        method: "GET",
        url: "/events/",
        authentication: "required",
        signal: new AbortController().signal,
      },
      async () => {
        streamCalls += 1;
        return {
          status: streamCalls === 1 ? 401 : 200,
          body: {
            [Symbol.asyncIterator]() {
              return {
                next: async () => ({ done: true as const, value: undefined }),
                return: async () => {
                  closed = true;
                  return { done: true as const, value: undefined };
                },
              };
            },
          },
        };
      },
    );
    expect(stream.status).toBe(200);
    expect(closed).toBe(true);
    expect(refreshes).toBe(1);
    api.dispose();
  });

  it("covers cookie anonymous guards and object cache scopes", async () => {
    const strategy = cookieAuth({
      login: CookieSessions.operation("login"),
      logout: CookieSessions.operation("logout"),
      session: Users.operation("current"),
      subject: ({ user }) => user.id,
      cacheScope: ({ user }) => ({ subject: user.id }),
    });
    let authenticated = false;
    const api = createUiCogs({
      resources: [Users, CookieSessions],
      auth: strategy,
      transport: {
        request: async (request) => {
          if (request.url.endsWith("users/current/"))
            return authenticated
              ? { status: 200, data: { id: 1, name: "User" } }
              : { status: 401, data: undefined };
          if (request.url.endsWith("cookie-sessions/login/")) authenticated = true;
          return { status: 204, data: undefined };
        },
      },
    });
    await api.auth.initialize();
    const middleware = api.auth.middleware();
    await expect(
      middleware.request(
        {
          method: "GET",
          url: "/private/",
          authentication: "required",
          signal: new AbortController().signal,
        },
        async () => ({ status: 200, data: undefined }),
      ),
    ).rejects.toThrow("Authentication is required");
    const publicResponse = await middleware.request(
      {
        method: "GET",
        url: "/public/",
        authentication: "none",
        signal: new AbortController().signal,
      },
      async (request) => ({ status: 200, data: request.credentials }),
    );
    expect(publicResponse.data).toBe("omit");
    await api.auth.login({ email: "cookie@example.test" });
    expect(api.auth.cacheScope()).toContain("subject");
    expect([...api.auth.scopes]).toEqual([]);
    expect((await api.auth.logout()).ok).toBe(true);
    api.dispose();
    api.auth.updateState({});
  });

  it("erases an authenticated durable cache scope on explicit logout", async () => {
    const values = new Map<string, unknown>();
    const backend = {
      read: async (key: string) => values.get(key),
      write: async (key: string, value: unknown) => void values.set(key, value),
      remove: async (key: string) => void values.delete(key),
    };
    const access = token({
      sub: "42",
      tenant: "a",
      permissions: [],
      exp: Math.floor(Date.now() / 1000) + 600,
    });
    const strategy = jwtAuth({
      claims: ClaimsSchema,
      login: Sessions.operation("login"),
      refresh: Sessions.operation("refresh"),
      logout: Sessions.operation("logout"),
      storage: memoryAuthStorage(),
      cacheScope: ({ claims }) => ({ subject: claims.sub, tenant: claims.tenant }),
    });
    const api = createUiCogs({
      resources: [Users, Sessions],
      auth: strategy,
      persistence: { backend, context: false },
      transport: {
        request: async (request) =>
          request.url.endsWith("sessions/login/")
            ? { status: 200, data: { access, refresh: "refresh" } }
            : { status: 204, data: undefined },
      },
    });
    await api.auth.initialize();
    await api.auth.login({ email: "user@example.test" });
    const scopeKey = `cache/${encodeURIComponent(api.auth.cacheScope())}`;
    api.resource(Users).cache.add({ id: 42, name: "Cached" });
    await eventually(() => values.has(scopeKey));

    await api.auth.logout();
    await eventually(() => !values.has(scopeKey));
    expect(api.cache.persistenceScope).toBe("anonymous");
    api.dispose();
  });
});

function token(claims: Claims): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode(claims)}.`;
}

async function eventually(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Condition was not reached");
}
