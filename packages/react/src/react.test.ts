import { defineSchema, registerResource } from "../../core/src/test-utils.js";

// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { StrictMode, createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Store, fields, type LiveSource } from "@uicogs/core";
import {
  createUiCogs,
  useUiCogs,
  withReact,
  useAction,
  useAuth,
  useCollection,
  useController,
  useForm,
  useObject,
  useResource,
  toReactRoutes,
} from "./index.js";

afterEach(cleanup);

describe("React controller integration", () => {
  it("binds one core runtime and resolves route navigation through React hooks", () => {
    const core = createUiCogs({
      routes: [{ path: "/login", component: () => null }],
      navigation: { shortcuts: [{ route: "/login", label: "Sign in" }] },
    });
    const cogs = withReact(core, {
      router: {},
      useLocation: () => ({ path: "/login", params: {}, query: {} }),
    });
    function View() {
      const runtime = useUiCogs();
      const links = runtime.routes.useNavigationTree("shortcuts");
      return createElement("span", null, links[0]?.kind === "route" ? links[0].label : "none");
    }

    render(createElement(cogs.Provider, null, createElement(View)));
    expect(screen.getByText("Sign in")).toBeDefined();
    core.dispose();
  });

  it("preserves nested records and supports componentless route groups", () => {
    const Layout = () => null;
    const Home = () => null;
    const core = createUiCogs({
      routes: [
        {
          path: "/app",
          component: Layout,
          children: [{ path: "", component: Home, name: "home" }],
        },
        {
          path: "/settings",
          children: [{ path: "profile", component: Home }],
        },
      ],
    });

    expect(toReactRoutes(core.routes)).toMatchObject([
      { path: "/app", Component: Layout, children: [{ path: "", Component: Home }] },
      { path: "/settings", children: [{ path: "profile", Component: Home }] },
    ]);
    core.dispose();
  });

  it("requires an explicit React redirect adapter and receives the final target", () => {
    const Page = () => null;
    const core = createUiCogs({
      routes: [
        { path: "/old", redirect: "/middle" },
        { path: "/middle", redirect: { name: "new" } },
        { path: "/new", name: "new", component: Page },
      ],
    });

    expect(() => toReactRoutes(core.routes)).toThrow("redirect adapter");
    expect(
      toReactRoutes(core.routes, { redirect: (target) => `redirect:${target}` }),
    ).toMatchObject([
      { path: "/old", Component: "redirect:/new" },
      { path: "/middle", Component: "redirect:/new" },
      { path: "/new", Component: Page },
    ]);
    core.dispose();
  });

  it("rerenders from runtime context updates", () => {
    const api = createUiCogs({ context: { locale: "en" } });
    function View() {
      const context = useController(api.context);
      return createElement("span", null, context.value.locale);
    }

    const mounted = render(createElement(View));
    expect(screen.getByText("en")).toBeDefined();
    act(() => api.context.update({ locale: "fr" }));
    expect(screen.getByText("fr")).toBeDefined();
    mounted.unmount();
    api.dispose();
  });

  it("uses the controller snapshot during server rendering", () => {
    const store = new Store({ value: "server" });
    const controller = {
      getSnapshot: () => store.getSnapshot(),
      subscribe: (listener: () => void) => store.subscribe(listener),
    };
    function View() {
      return createElement("span", null, useController(controller).getSnapshot().value);
    }
    expect(renderToString(createElement(View))).toContain("server");
  });

  it("updates from external stores and balances Strict Mode subscriptions", () => {
    const store = new Store({ value: 1 });
    let subscriptions = 0;
    let unsubscriptions = 0;
    const controller = {
      get value() {
        return store.getSnapshot().value;
      },
      getSnapshot: () => store.getSnapshot(),
      subscribe(listener: () => void) {
        subscriptions += 1;
        const unsubscribe = store.subscribe(listener);
        return () => {
          unsubscriptions += 1;
          unsubscribe();
        };
      },
    };
    function View() {
      const current = useController(controller);
      return createElement("span", null, current.value);
    }
    const mounted = render(createElement(StrictMode, null, createElement(View)));
    expect(screen.getByText("1")).toBeDefined();
    act(() => store.setSnapshot({ value: 2 }));
    expect(screen.getByText("2")).toBeDefined();
    mounted.unmount();
    expect(subscriptions).toBeGreaterThan(1);
    expect(unsubscriptions).toBe(subscriptions);
  });

  it("exposes every controller hook as the same typed external-store binding", () => {
    const store = new Store({ revision: 0 });
    const controller = {
      getSnapshot: () => store.getSnapshot(),
      subscribe: (listener: () => void) => store.subscribe(listener),
    };
    function View() {
      const values = [
        useResource(controller),
        useObject(controller),
        useCollection(controller),
        useForm(controller),
        useAction(controller),
        useAuth(controller),
      ];
      return createElement(
        "span",
        null,
        values.every((value) => value === controller) ? "same" : "different",
      );
    }
    render(createElement(View));
    expect(screen.getByText("same")).toBeDefined();
  });

  it("does not duplicate or start requests during Strict Mode rendering", async () => {
    let requests = 0;
    const cogs = createUiCogs({
      context: undefined,
      transport: {
        request: async () => {
          requests += 1;
          return { status: 200, data: [{ id: 1, name: "One" }] };
        },
      },
    });
    const schema = defineSchema({ id: fields.ID(), name: fields.Str({ required: true }) });
    const definition = registerResource(cogs)({ name: "items", url: "items/", schema, key: "id" });
    const resource = cogs.resource(definition);
    function View() {
      const current = useResource(resource);
      return createElement(
        "button",
        { type: "button", onClick: () => void current.load() },
        String(current.all().length),
      );
    }
    render(createElement(StrictMode, null, createElement(View)));
    expect(requests).toBe(0);
    act(() => screen.getByRole("button").click());
    await waitFor(() => expect(screen.getByRole("button").textContent).toBe("1"));
    expect(requests).toBe(1);
  });

  it("rerenders local resources after synchronous cache facade writes", () => {
    const cogs = createUiCogs({ context: undefined });
    const schema = defineSchema({ id: fields.ID(), name: fields.Str({ required: true }) });
    const definition = registerResource(cogs)({
      name: "local-react-items",
      schema,
      key: "id",
      source: cogs.local(),
    });
    const resource = cogs.resource(definition);

    function View() {
      const current = useResource(resource);
      return createElement(
        "span",
        null,
        current
          .all()
          .map((item) => item.name)
          .join(","),
      );
    }

    render(createElement(StrictMode, null, createElement(View)));
    act(() => resource.cache.add({ id: 1, name: "First" }));
    expect(screen.getByText("First")).toBeDefined();
    act(() => resource.cache.upsert({ id: 1, name: "Updated" }));
    expect(screen.getByText("Updated")).toBeDefined();
  });

  it("rerenders resources after live cache mutations", async () => {
    const live: LiveSource<void> = {
      open: async ({ signal }) => ({
        status: 200,
        frames: {
          async *[Symbol.asyncIterator]() {
            await new Promise((resolve) => setTimeout(resolve, 0));
            yield {
              kind: "event" as const,
              event: { type: "live-react-items", data: '{"id":1,"name":"Live"}' },
            };
            await new Promise<void>((resolve) =>
              signal.addEventListener("abort", () => resolve(), { once: true }),
            );
          },
        },
      }),
    };
    const cogs = createUiCogs({ context: undefined, live });
    const schema = defineSchema({ id: fields.ID(), name: fields.Str() });
    const Items = registerResource(cogs)({
      name: "live-react-items",
      url: "items/",
      schema,
      key: "id",
    });
    const resource = cogs.resource(Items);
    function View() {
      const current = useResource(resource);
      return createElement(
        "span",
        null,
        current
          .all()
          .map((item) => item.name)
          .join(),
      );
    }
    render(createElement(View));
    await vi.waitFor(() => expect(screen.getByText("Live")).toBeDefined());
    cogs.dispose();
  });
});
