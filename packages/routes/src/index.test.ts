import { describe, expect, it } from "vitest";
import { createRouteRegistry } from "./index.js";

const location = { path: "/admin/users", params: {}, query: {} };

describe("route registry", () => {
  it("filters inaccessible links, preserves groups, and derives breadcrumbs", () => {
    const registry = createRouteRegistry({
      routes: [
        { path: "/login", component: "login" },
        { path: "/admin/users", component: "users", auth: { all: ["users.read"] } },
        { path: "/admin/audit", component: "audit", auth: { any: ["audit.read", "admin"] } },
      ],
      navigation: {
        sidebar: [
          {
            id: "admin",
            label: "Administration",
            children: [
              { route: "/admin/users", label: "Users" },
              { route: "/admin/audit", label: "Audit" },
            ],
          },
        ],
      },
      breadcrumbsFrom: "sidebar",
    });
    const access = { authenticated: true, permissions: new Set(["users.read"]) };

    expect(registry.navigationTree("sidebar", access, location)).toMatchObject([
      { kind: "group", id: "admin", children: [{ route: { path: "/admin/users" } }] },
    ]);
    expect(registry.breadcrumbs(access, location)).toEqual([
      { label: "Administration", current: false },
      { label: "Users", current: true },
    ]);
  });

  it("enforces guest, all, any, and authenticated-only access", () => {
    const registry = createRouteRegistry({
      routes: [
        { path: "/login", component: "login" },
        { path: "/account", component: "account", auth: { all: [] } },
        { path: "/admin", component: "admin", auth: { all: ["admin"] } },
        { path: "/help", component: "help", auth: { any: ["support", "admin"] } },
      ],
    });
    const guest = { authenticated: false, permissions: new Set<string>() };
    const user = { authenticated: true, permissions: new Set(["support"]) };

    expect(registry.hasPermission("/login", guest)).toBe(true);
    expect(registry.hasPermission("/login", user)).toBe(false);
    expect(registry.hasPermission("/account", user)).toBe(true);
    expect(registry.hasPermission("/admin", user)).toBe(false);
    expect(registry.hasPermission("/help", user)).toBe(true);
  });

  it("rejects invalid route and breadcrumb declarations", () => {
    expect(() =>
      createRouteRegistry({ routes: [{ path: "relative", component: "page" }] }),
    ).toThrow("absolute");
    expect(() =>
      createRouteRegistry({
        routes: [{ path: "/users", component: "users" }],
        navigation: { sidebar: [{ route: "/missing" }] },
      }),
    ).toThrow("not declared");
    expect(() =>
      createRouteRegistry({
        routes: [{ path: "/users", component: "users" }],
        navigation: { sidebar: [{ route: "/users" }, { route: "/users" }] },
        breadcrumbsFrom: "sidebar",
      }),
    ).toThrow("more than once");
  });

  it("normalizes flat, nested, empty, relative, and absolute child paths", () => {
    const registry = createRouteRegistry({
      routes: [
        { path: "/about/", component: "about" },
        {
          path: "/accounts",
          component: "account-layout",
          meta: { section: "accounts", tone: "quiet" },
          auth: { all: ["accounts.open"] },
          children: [
            { path: "", component: "account-home", name: "account-home" },
            {
              path: ":id(\\d+)",
              component: "account",
              auth: { any: ["accounts.read", "admin"] },
              meta: { tone: "strong" },
            },
            { path: "/login", component: "login" },
          ],
        },
      ],
    });

    expect(registry.entries.map((entry) => entry.path)).toEqual([
      "/about",
      "/accounts",
      "/accounts/:id(\\d+)",
      "/login",
    ]);
    expect(registry.tree[1]).toMatchObject({
      path: "/accounts",
      children: [{ path: "" }, { path: ":id(\\d+)" }, { path: "/login" }],
    });
    expect(registry.named("account-home")?.path).toBe("/accounts");
    expect(registry.entry("/accounts/")?.path).toBe("/accounts");
    expect(registry.entry("/accounts/:id(\\d+)")?.meta).toEqual({
      section: "accounts",
      tone: "strong",
    });
    expect(registry.entry("/accounts/:id(\\d+)")?.accessRules).toHaveLength(2);
    expect(
      registry.hasPermission("/login", {
        authenticated: true,
        permissions: new Set(["accounts.open"]),
      }),
    ).toBe(true);
    expect(
      registry.hasPermission("/login", {
        authenticated: true,
        permissions: new Set<string>(),
      }),
    ).toBe(false);
    expect(Object.isFrozen(registry.tree)).toBe(true);
    expect(Object.isFrozen(registry.tree[1])).toBe(true);
  });

  it("combines explicit ancestor and leaf access rules with AND semantics", () => {
    const registry = createRouteRegistry({
      routes: [
        {
          path: "/admin",
          auth: { all: ["admin.open"] },
          children: [
            {
              path: "audit",
              component: "audit",
              auth: { any: ["audit.read", "admin"] },
            },
          ],
        },
      ],
    });

    expect(
      registry.hasPermission("/admin/audit", {
        authenticated: true,
        permissions: new Set(["admin.open", "audit.read"]),
      }),
    ).toBe(true);
    expect(
      registry.hasPermission("/admin/audit", {
        authenticated: true,
        permissions: new Set(["audit.read"]),
      }),
    ).toBe(false);
  });

  it("matches optional, constrained, repeated, and catch-all parameters", () => {
    const registry = createRouteRegistry({
      routes: [
        { path: "/clockin/:year?/:month?/:day?", component: "clock" },
        { path: "/people/:id(\\d+)", component: "person" },
        { path: "/:catchAll(.*)*", component: "missing" },
      ],
    });

    expect(registry.match("/clockin")?.component).toBe("clock");
    expect(registry.match("/clockin/2026/08/02/")?.component).toBe("clock");
    expect(registry.match("/people/42")?.component).toBe("person");
    expect(registry.match("/people/nope")?.component).toBe("missing");
    expect(registry.match("/some/deep/path")?.component).toBe("missing");
  });

  it("prefers an explicit router pattern when route patterns overlap", () => {
    const registry = createRouteRegistry({
      routes: [
        { path: "/users/:id", component: "user" },
        { path: "/users/new", component: "new-user" },
      ],
    });

    expect(registry.match("/users/new")?.component).toBe("user");
    expect(
      registry.resolve({ path: "/users/new", pattern: "/users/new", params: {}, query: {} })
        ?.component,
    ).toBe("new-user");
  });

  it("resolves path and named redirects and applies final-target access", () => {
    const registry = createRouteRegistry({
      routes: [
        { path: "/start", redirect: { name: "account" } },
        { path: "/legacy", redirect: "/start" },
        {
          path: "/account",
          name: "account",
          component: "account",
          auth: { all: ["account.read"] },
        },
      ],
    });
    const allowed = { authenticated: true, permissions: new Set(["account.read"]) };
    const denied = { authenticated: true, permissions: new Set<string>() };

    expect(registry.entry("/legacy")?.redirect).toBe("/account");
    expect(registry.hasPermission("/legacy", allowed)).toBe(true);
    expect(registry.hasPermission("/legacy", denied)).toBe(false);
  });

  it("rejects invalid nested structures, names, patterns, and redirects", () => {
    expect(() => createRouteRegistry({ routes: [{ path: "/empty", children: [] }] })).toThrow(
      "declare children",
    );
    expect(() =>
      createRouteRegistry({
        routes: [
          {
            path: "/parent",
            children: [{ path: "", component: "home" }],
            redirect: "/target",
          } as unknown as { path: string; component: string },
        ],
      }),
    ).toThrow("cannot declare a redirect");
    expect(() =>
      createRouteRegistry({
        routes: [
          { path: "/one", component: "one", name: "same" },
          { path: "/two", component: "two", name: "same" },
        ],
      }),
    ).toThrow("name is declared more than once");
    expect(() =>
      createRouteRegistry({ routes: [{ path: "/broken/:id(", component: "broken" }] }),
    ).toThrow("malformed parameter");
    expect(() => createRouteRegistry({ routes: [{ path: "/old", redirect: "/missing" }] })).toThrow(
      "target is not declared",
    );
    expect(() =>
      createRouteRegistry({
        routes: [
          { path: "/one", redirect: "/two" },
          { path: "/two", redirect: "/one" },
        ],
      }),
    ).toThrow("redirect cycle");
  });
});
