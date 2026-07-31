import { createUiCogs } from "@uicogs/core";
import { createApp, defineComponent } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it } from "vitest";
import { buildPlugin, toRoutes, useUiCogs } from "./index.js";

describe("buildPlugin route binding", () => {
  /** Verifies that an externally installed router drives UiCogs navigation. */
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
    app.use(router).use(buildPlugin(core));
    const cogs = app.runWithContext(() => useUiCogs());
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
    app.runWithContext(() => expect(useUiCogs().core).toBe(core));
    core.dispose();
  });

  /** Verifies that route declarations require Vue Router before the plugin installs. */
  it("rejects declared routes when Vue Router is not installed", () => {
    const app = createApp(defineComponent({ setup: () => () => null }));
    const core = createUiCogs({
      routes: [{ path: "/login", component: defineComponent({ setup: () => () => null }) }],
    });
    expect(() => app.use(buildPlugin(core))).toThrow("Vue Router must be installed before buildPlugin");
    core.dispose();
  });

  /** Verifies that the plugin redirects an unauthorized route through its own callback. */
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
    const router = createRouter({ history: createMemoryHistory(), routes: toRoutes(core.routes) });
    const denied: string[] = [];
    app.use(router).use(
      buildPlugin(core, {
        onDenied: ({ location }) => {
          denied.push(location.path);
          return "/login";
        },
      }),
    );

    await router.push("/tasks");
    expect(denied).toEqual(["/tasks"]);
    expect(router.currentRoute.value.path).toBe("/login");
    core.dispose();
  });
});
