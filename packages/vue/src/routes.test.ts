import { createUiCogs } from "@uicogs/core";
import { createApp, defineComponent } from "vue";
import { createMemoryHistory, createRouter, type RouteRecordRaw } from "vue-router";
import { describe, expect, it } from "vitest";
import { canAccessRoute, withVue } from "./index.js";

const Page = defineComponent({ setup: () => () => null });

describe("withVue route binding", () => {
  /** Verifies that standard Vue Router records produce independent grouped navigation. */
  it("derives navigation and breadcrumbs from Vue Router metadata", async () => {
    const routes = [
      {
        path: "/login",
        name: "login",
        component: Page,
        meta: {
          uicogs: {
            navigation: {
              side: { parent: "account", label: ({ route }) => `Sign in from ${route.path}` },
            },
          },
        },
      },
    ] satisfies RouteRecordRaw[];
    const app = createApp(defineComponent({ setup: () => () => null }));
    const router = createRouter({ history: createMemoryHistory(), routes });
    const core = createUiCogs();
    const binding = await withVue(core, {
      navigation: { side: { groups: [{ id: "account", label: "Account" }] } },
    });
    app.use(router).use(binding.uiCogs);
    const cogs = app.runWithContext(() => binding.useUiCogs());
    const side = app.runWithContext(() => cogs.navigation("side"));
    const breadcrumbs = app.runWithContext(() => cogs.breadcrumbs("side"));

    await router.push("/login");
    expect(side.value).toMatchObject([
      {
        kind: "group",
        id: "account",
        children: [{ kind: "route", label: "Sign in from /login", current: true }],
      },
    ]);
    expect(breadcrumbs.value).toEqual([
      { label: "Account", current: false },
      { label: "Sign in from /login", current: true, to: { name: "login" } },
    ]);
    router.addRoute({
      path: "/later",
      component: Page,
      meta: { uicogs: { navigation: { side: { label: "Added later" } } } },
    });
    await router.push("/later");
    expect(side.value).toHaveLength(1);
    core.dispose();
  });

  /** Verifies that the native guard receives native Vue Router target data on denial. */
  it("denies scoped routes through the native Vue Router guard", async () => {
    const routes = [
      { path: "/login", component: Page },
      {
        path: "/tasks",
        component: Page,
        meta: { uicogs: { scopes: ["tasks.read"] } },
      },
    ] satisfies RouteRecordRaw[];
    const app = createApp(defineComponent({ setup: () => () => null }));
    const router = createRouter({ history: createMemoryHistory(), routes });
    const core = createUiCogs();
    const denied: string[] = [];
    const binding = await withVue(core, {
      onDenied: ({ to, scopes }) => {
        denied.push(`${to.path}:${scopes.join(",")}`);
        return "/login";
      },
    });
    app.use(router).use(binding.uiCogs);

    await router.push("/tasks");
    expect(denied).toEqual(["/tasks:tasks.read"]);
    expect(router.currentRoute.value.path).toBe("/login");
    core.dispose();
  });

  /** Verifies guest-only, authenticated, and additive scope policies from matched records. */
  it("applies additive matched-route scopes", () => {
    const routes = [
      {
        path: "/admin",
        component: Page,
        meta: { uicogs: { scopes: ["admin.read"] } },
        children: [
          {
            path: "users",
            component: Page,
            meta: { uicogs: { scopes: ["users.read"] } },
          },
        ],
      },
      { path: "/guest", component: Page },
      { path: "/account", component: Page, meta: { uicogs: { scopes: [] } } },
    ] satisfies RouteRecordRaw[];
    const router = createRouter({ history: createMemoryHistory(), routes });
    const adminUsers = router.resolve("/admin/users").matched;
    expect(
      canAccessRoute(adminUsers, { authenticated: true, scopes: new Set(["admin.read"]) }),
    ).toBe(false);
    expect(
      canAccessRoute(adminUsers, {
        authenticated: true,
        scopes: new Set(["admin.read", "users.read"]),
      }),
    ).toBe(true);
    expect(
      canAccessRoute(router.resolve("/guest").matched, { authenticated: false, scopes: new Set() }),
    ).toBe(true);
    expect(
      canAccessRoute(router.resolve("/guest").matched, { authenticated: true, scopes: new Set() }),
    ).toBe(false);
    expect(
      canAccessRoute(router.resolve("/account").matched, {
        authenticated: true,
        scopes: new Set(),
      }),
    ).toBe(true);
  });

  /** Verifies invalid named menu group declarations fail when the plugin is installed. */
  it("rejects an unknown navigation group parent", async () => {
    const app = createApp(defineComponent({ setup: () => () => null }));
    const router = createRouter({ history: createMemoryHistory(), routes: [] });
    const binding = await withVue(createUiCogs(), {
      navigation: { side: { groups: [{ id: "users", parent: "missing", label: "Users" }] } },
    });
    app.use(router);
    expect(() => app.use(binding.uiCogs)).toThrow("Unknown UiCogs navigation group parent");
  });
});
