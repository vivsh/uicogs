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
});
