import { createUiCogs } from "@uicogs/core";
import { createApp, defineComponent } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it } from "vitest";
import { toRoutes, withVue } from "./index.js";

describe("withVue route binding", () => {
  /** Verifies that the binding creates a router and derives reactive navigation. */
  it("binds an installed Vue Router and derives reactive navigation", async () => {
    const app = createApp(defineComponent({ setup: () => () => null }));
    const core = createUiCogs({
      routes: [{ path: "/login", component: defineComponent({ setup: () => () => null }) }],
      navigation: {
        sidebar: [
          {
            id: "account",
            label: "Account",
            children: [{ route: "/login", label: "Sign in" }],
          },
        ],
      },
      breadcrumbsFrom: "sidebar",
    });
    const router = createRouter({ history: createMemoryHistory(), routes: toRoutes(core.routes) });
    const binding = await withVue(core);
    app.use(router).use(binding.uiCogs);
    const cogs = app.runWithContext(() => binding.useUiCogs());
    const sidebar = cogs.routes.navigationTree("sidebar");
    const breadcrumbs = cogs.routes.breadcrumbs();

    await router.push("/login");
    expect(sidebar.value).toMatchObject([
      { kind: "group", id: "account", children: [{ label: "Sign in", current: true }] },
    ]);
    expect(breadcrumbs.value).toEqual([
      { label: "Account", current: false },
      { label: "Sign in", current: true },
    ]);
    app.runWithContext(() => expect(binding.useUiCogs().core).toBe(core));
    core.dispose();
  });

  /** Verifies that the binding redirects an unauthorized route through its own callback. */
  it("redirects denied navigation with a normalized UiCogs location", async () => {
    const app = createApp(defineComponent({ setup: () => () => null }));
    const core = createUiCogs({
      routes: [
        { path: "/login", component: defineComponent({ setup: () => () => null }) },
        {
          path: "/tasks",
          component: defineComponent({ setup: () => () => null }),
          auth: { all: ["tasks.view"] },
        },
      ],
    });
    const denied: string[] = [];
    const router = createRouter({ history: createMemoryHistory(), routes: toRoutes(core.routes) });
    const binding = await withVue(core, {
      onDenied: ({ location }) => {
        denied.push(location.path);
        return "/login";
      },
    });
    app.use(router).use(binding.uiCogs);

    await router.push("/tasks");
    expect(denied).toEqual(["/tasks"]);
    expect(router.currentRoute.value.path).toBe("/login");
    core.dispose();
  });

  it("preserves nested router records and raw child paths", () => {
    const Layout = defineComponent({ setup: () => () => null });
    const Home = defineComponent({ setup: () => () => null });
    const User = defineComponent({ setup: () => () => null });
    const core = createUiCogs({
      routes: [
        {
          path: "/app",
          component: Layout,
          meta: { section: "app" },
          children: [
            { path: "", component: Home, name: "home" },
            { path: "users/:id", component: User, meta: { page: "user" } },
          ],
        },
      ],
    });

    expect(toRoutes(core.routes)).toMatchObject([
      {
        path: "/app",
        component: Layout,
        meta: { section: "app" },
        children: [
          { path: "", component: Home, name: "home" },
          { path: "users/:id", component: User, meta: { page: "user" } },
        ],
      },
    ]);
    expect(core.routes.entries.map((entry) => entry.path)).toEqual(["/app", "/app/users/:id"]);
    core.dispose();
  });

  it("uses the deepest Vue matched pattern for access and denied callbacks", async () => {
    const app = createApp(defineComponent({ setup: () => () => null }));
    const Page = defineComponent({ setup: () => () => null });
    const core = createUiCogs({
      routes: [
        { path: "/login", component: Page },
        {
          path: "/admin",
          component: Page,
          children: [
            {
              path: ":id(\\d+)",
              component: Page,
              auth: { all: ["admin.read"] },
            },
          ],
        },
      ],
    });
    const denied: Array<{ path: string; pattern?: string }> = [];
    const router = createRouter({ history: createMemoryHistory(), routes: toRoutes(core.routes) });
    const binding = await withVue(core, {
      onDenied: ({ location }) => {
        denied.push({ path: location.path, pattern: location.pattern });
        return "/login";
      },
    });
    app.use(router).use(binding.uiCogs);

    await router.push("/admin/42");
    expect(denied).toEqual([{ path: "/admin/42", pattern: "/admin/:id(\\d+)" }]);
    expect(router.currentRoute.value.path).toBe("/login");
    core.dispose();
  });
});
