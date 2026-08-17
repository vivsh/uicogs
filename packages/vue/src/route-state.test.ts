import {
  Store,
  createUiCogs,
  fields,
  schema,
  type TransportRequest,
  type TransportResponse,
} from "@uicogs/core";
import { createApp, defineComponent, effectScope, nextTick } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it, vi } from "vitest";
import {
  useRouteCollection,
  useRouteForm,
  useRouteResource,
  useRouteState,
  withVue,
  type RouteCollectionSource,
} from "./index.js";

const TaskFilters = schema({
  status: fields.Str({ wireName: "state" }),
  owner: fields.Int({ wireName: "owner_id" }),
});
const TaskParams = schema({ id: fields.ID() });
const Task = schema({ id: fields.ID(), title: fields.Str({ required: true }) });

function routeHarness(options: { readonly authenticated?: boolean } = {}) {
  const app = createApp(defineComponent({ setup: () => () => null }));
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        name: "tasks",
        path: "/tasks/:id?",
        component: defineComponent({ setup: () => () => null }),
        ...(options.authenticated ? { meta: { uicogs: { scopes: [] } } } : {}),
      },
    ],
  });
  app.use(router);
  return { app, router };
}

function authHarness() {
  const store = new Store({
    status: "anonymous",
    scopes: new Set<string>(),
    sessionGeneration: 0,
  });
  const controller = {
    get value() {
      return store.getSnapshot();
    },
    get status() {
      return store.getSnapshot().status;
    },
    get scopes() {
      return store.getSnapshot().scopes;
    },
    get sessionGeneration() {
      return store.getSnapshot().sessionGeneration;
    },
    getSnapshot: () => store.getSnapshot(),
    subscribe: (listener: () => void) => store.subscribe(listener),
    middleware: () => ({
      request: async (
        request: TransportRequest,
        next: (value: TransportRequest) => Promise<TransportResponse<unknown>>,
      ) => next(request),
    }),
    attach: () => undefined,
    initialize: async () => undefined,
    cacheScope: () => "anonymous",
    subscribeLogout: () => () => undefined,
    dispose: () => undefined,
    authenticate: (scopes: readonly string[]) =>
      store.setSnapshot({
        status: "authenticated",
        scopes: new Set(scopes),
        sessionGeneration: store.getSnapshot().sessionGeneration + 1,
      }),
  };
  return {
    controller,
    strategy: {
      kind: "uicogs-auth-strategy" as const,
      operations: [],
      create: () => controller,
    },
  };
}

async function settle(): Promise<void> {
  await nextTick();
  await Promise.resolve();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await nextTick();
}

class TestCollection implements RouteCollectionSource {
  readonly resource = { name: "tasks", key: "id", schema: Task };
  readonly store = new Store({ revision: 0 });
  readonly calls: Array<readonly [string, unknown]> = [];
  loading = false;
  pageInfo = undefined;

  getSnapshot() {
    return this.store.getSnapshot();
  }

  subscribe(listener: () => void) {
    return this.store.subscribe(listener);
  }

  all(): readonly Readonly<Record<string, unknown>>[] {
    return [];
  }

  async load(): Promise<unknown> {
    this.calls.push(["load", undefined]);
    return undefined;
  }

  async refresh(): Promise<unknown> {
    return this.load();
  }

  filter(values: Readonly<Record<string, unknown>>): this {
    this.calls.push(["filter", values]);
    return this;
  }

  sort(field?: string, descending = false): this {
    this.calls.push(["sort", { field, descending }]);
    return this;
  }

  page(index: number, size?: number): this {
    this.calls.push(["page", { index, size }]);
    return this;
  }

  nextPage(): this {
    this.calls.push(["nextPage", undefined]);
    return this;
  }

  hasMore(): boolean {
    return true;
  }
}

describe("Vue route state", () => {
  it("hydrates valid values, retains foreign query values, and replaces malformed owned values", async () => {
    const { app, router } = routeHarness();
    await router.push({
      name: "tasks",
      params: { id: "7" },
      query: { state: "open", owner_id: "not-a-number", foreign: "kept" },
    });
    const scope = effectScope();
    const state = app.runWithContext(() =>
      scope.run(() => useRouteState({ route: "tasks", query: TaskFilters, params: TaskParams })),
    );

    await settle();
    expect(state?.query.value).toEqual({ status: "open" });
    expect(state?.params.value).toEqual({ id: 7 });
    expect(state?.issues.value).toEqual([]);
    expect(router.currentRoute.value.query).toEqual({ state: "open", foreign: "kept" });
    scope.stop();
  });

  it("submits filters through one pushed canonical location", async () => {
    const { app, router } = routeHarness();
    await router.push({ name: "tasks", query: { state: "open", page: "2", foreign: "kept" } });
    const scope = effectScope();
    const result = app.runWithContext(() =>
      scope.run(() => {
        const route = useRouteState({ route: "tasks", query: TaskFilters });
        return { route, form: useRouteForm({ route, schema: TaskFilters }) };
      }),
    );
    const push = vi.spyOn(router, "push");
    result?.form.set("status", "closed");
    await result?.form.submit();

    expect(push).toHaveBeenCalledTimes(1);
    expect(router.currentRoute.value.query).toEqual({
      state: "closed",
      page: "2",
      foreign: "kept",
    });
    router.back();
    await settle();
    expect(router.currentRoute.value.query).toEqual({ state: "open", page: "2", foreign: "kept" });
    expect(result?.form.values.status).toBe("open");
    scope.stop();
  });

  it("writes page and ordering through the URL before a collection load", async () => {
    const { app, router } = routeHarness();
    await router.push({ name: "tasks", query: { state: "open", page: "2", page_size: "10" } });
    const source = new TestCollection();
    const scope = effectScope();
    const collection = app.runWithContext(() =>
      scope.run(() => {
        const route = useRouteState({ route: "tasks", query: TaskFilters });
        return useRouteCollection({ route, collection: source, filters: TaskFilters });
      }),
    );

    await settle();
    expect(source.calls).toContainEqual(["filter", { status: "open" }]);
    expect(source.calls).toContainEqual(["page", { index: 2, size: 10 }]);
    await collection?.sort("title", true);
    await settle();
    expect(router.currentRoute.value.query).toEqual({
      state: "open",
      page_size: "10",
      ordering: "-title",
    });
    expect(source.calls.at(-1)).toEqual(["load", undefined]);
    scope.stop();
  });

  it("reports URL-driven collection load failures without an unhandled watcher rejection", async () => {
    const { app } = routeHarness();
    const source = new TestCollection();
    const failure = new Error("Network request failed");
    const onFailure = vi.fn();
    vi.spyOn(source, "load").mockRejectedValue(failure);
    const scope = effectScope();

    app.runWithContext(() =>
      scope.run(() => {
        const route = useRouteState({ route: "tasks", query: TaskFilters });
        useRouteCollection({ route, collection: source, filters: TaskFilters, onFailure });
      }),
    );
    await settle();

    expect(onFailure).toHaveBeenCalledWith(failure);
    scope.stop();
  });

  it("opens and closes a detail parameter without disturbing list query state", async () => {
    const { app, router } = routeHarness();
    await router.push({ name: "tasks", query: { state: "open", page: "2" } });
    const source = new TestCollection();
    const resource = Object.assign(source, {
      definition: { name: "tasks", key: "id", schema: Task },
      get: (key: number) => ({
        key,
        loading: false,
        value: undefined,
        load: async () => undefined,
      }),
    });
    const scope = effectScope();
    const page = app.runWithContext(() =>
      scope.run(() =>
        useRouteResource({
          route: "tasks",
          resource,
          filters: TaskFilters,
        }),
      ),
    );

    await page?.open(4);
    expect(router.currentRoute.value.params).toEqual({ id: "4" });
    expect(router.currentRoute.value.query).toEqual({ state: "open", page: "2" });
    await page?.close();
    expect(router.currentRoute.value.params).toEqual({});
    expect(router.currentRoute.value.query).toEqual({ state: "open", page: "2" });
    router.back();
    await settle();
    expect(router.currentRoute.value.params).toEqual({ id: "4" });
    expect(page?.activeKey.value).toBe(4);
    scope.stop();
  });

  it("treats an empty optional detail parameter as no active key", async () => {
    const { app, router } = routeHarness();
    await router.push({ name: "tasks", params: { id: "" } });
    expect(router.currentRoute.value.params.id).toBe("");

    const source = new TestCollection();
    const parseKey = vi.fn((value: string) => Number(value));
    const resource = Object.assign(source, {
      definition: { name: "tasks", key: () => 1, schema: Task },
      get: (key: number) => ({
        key,
        loading: false,
        value: undefined,
        load: async () => undefined,
      }),
    });
    const scope = effectScope();
    const page = app.runWithContext(() =>
      scope.run(() =>
        useRouteResource({
          route: "tasks",
          resource,
          filters: TaskFilters,
          key: { parseKey, formatKey: (key) => String(key) },
        }),
      ),
    );

    expect(page?.activeKey.value).toBeUndefined();
    expect(parseKey).not.toHaveBeenCalled();
    scope.stop();
  });

  it("uses a reserved new segment for create mode and keeps zero as a valid detail key", async () => {
    const { app, router } = routeHarness();
    await router.push({ name: "tasks", query: { state: "open" } });
    const source = new TestCollection();
    const resource = Object.assign(source, {
      definition: { name: "tasks", key: "id", schema: Task },
      get: (key: number) => ({
        key,
        loading: false,
        value: undefined,
        load: async () => undefined,
      }),
    });
    const scope = effectScope();
    const page = app.runWithContext(() =>
      scope.run(() =>
        useRouteResource({
          route: "tasks",
          resource,
          filters: TaskFilters,
        }),
      ),
    );

    await page?.create();
    expect(router.currentRoute.value.name).toBe("tasks");
    expect(router.currentRoute.value.params).toEqual({ id: "new" });
    expect(page?.creating.value).toBe(true);
    expect(router.currentRoute.value.query).toEqual({ state: "open" });
    page!.activeKey.value = 0;
    await settle();
    expect(router.currentRoute.value.name).toBe("tasks");
    expect(router.currentRoute.value.params).toEqual({ id: "0" });
    await page?.close();
    expect(router.currentRoute.value.name).toBe("tasks");
    expect(router.currentRoute.value.params).toEqual({});
    scope.stop();
  });

  it("replaces a denied detail location without loading its active resource", async () => {
    const { app, router } = routeHarness();
    await router.push({ name: "tasks", params: { id: "7" }, query: { state: "open" } });
    const source = new TestCollection();
    const load = vi.fn(async () => undefined);
    const resource = Object.assign(source, {
      definition: { name: "tasks", key: "id", schema: Task },
      get: (key: number) => ({ key, loading: false, value: undefined, load }),
    });
    const permits: Array<readonly [string, number | undefined]> = [];
    const scope = effectScope();
    const page = app.runWithContext(() =>
      scope.run(() =>
        useRouteResource({
          route: "tasks",
          resource,
          filters: TaskFilters,
          permit: ({ action, key }) => {
            permits.push([action, key]);
            return action !== "view";
          },
        }),
      ),
    );

    await settle();
    expect(page?.can("view", { key: 7 })).toBe(false);
    expect(permits).toContainEqual(["view", 7]);
    expect(load).not.toHaveBeenCalled();
    expect(router.currentRoute.value.params).toEqual({});
    expect(router.currentRoute.value.query).toEqual({ state: "open" });
    scope.stop();
  });

  it("replaces a denied create location while retaining route query state", async () => {
    const { app, router } = routeHarness();
    await router.push({ name: "tasks", params: { id: "new" }, query: { state: "open" } });
    const source = new TestCollection();
    const resource = Object.assign(source, {
      definition: { name: "tasks", key: "id", schema: Task },
      get: (key: number) => ({
        key,
        loading: false,
        value: undefined,
        load: async () => undefined,
      }),
    });
    const scope = effectScope();
    const page = app.runWithContext(() =>
      scope.run(() =>
        useRouteResource({
          route: "tasks",
          resource,
          filters: TaskFilters,
          scopes: { create: [] },
        }),
      ),
    );

    await settle();
    expect(page?.can("create")).toBe(false);
    expect(router.currentRoute.value.params).toEqual({});
    expect(router.currentRoute.value.query).toEqual({ state: "open" });
    scope.stop();
  });

  it("reacts to authenticated scope changes before permitting route-resource creation", async () => {
    const { app, router } = routeHarness({ authenticated: true });
    const auth = authHarness();
    const binding = await withVue(createUiCogs({ auth: auth.strategy }));
    app.use(binding.uiCogs);
    const source = new TestCollection();
    const resource = Object.assign(source, {
      definition: { name: "tasks", key: "id", schema: Task },
      get: (key: number) => ({
        key,
        loading: false,
        value: undefined,
        load: async () => undefined,
      }),
    });
    const scope = effectScope();
    const page = app.runWithContext(() =>
      scope.run(() =>
        useRouteResource({
          route: "tasks",
          resource,
          filters: TaskFilters,
          scopes: { create: ["tasks.create"] },
        }),
      ),
    );

    expect(page?.can("create")).toBe(false);
    auth.controller.authenticate(["tasks.create"]);
    await settle();
    expect(page?.can("create")).toBe(true);
    expect(page?.access.state.value.authenticated).toBe(true);
    await page?.create();
    expect(router.currentRoute.value.params).toEqual({ id: "new" });
    scope.stop();
  });

  it("fails closed and reports once when a permit callback throws", async () => {
    const { app, router } = routeHarness();
    await router.push({ name: "tasks", params: { id: "9" } });
    const source = new TestCollection();
    const resource = Object.assign(source, {
      definition: { name: "tasks", key: "id", schema: Task },
      get: (key: number) => ({
        key,
        loading: false,
        value: undefined,
        load: async () => undefined,
      }),
    });
    const report = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const scope = effectScope();
    app.runWithContext(() =>
      scope.run(() =>
        useRouteResource({
          route: "tasks",
          resource,
          filters: TaskFilters,
          permit: () => {
            throw new Error("Unexpected policy failure");
          },
        }),
      ),
    );

    await settle();
    expect(router.currentRoute.value.params).toEqual({});
    expect(report).toHaveBeenCalledOnce();
    report.mockRestore();
    scope.stop();
  });

  it("requires explicit codecs for a functional resource key", () => {
    const { app } = routeHarness();
    const source = new TestCollection();
    const resource = Object.assign(source, {
      definition: { name: "tasks", key: () => 1, schema: Task },
      get: (key: number) => ({
        key,
        loading: false,
        value: undefined,
        load: async () => undefined,
      }),
    });
    const scope = effectScope();

    expect(() =>
      app.runWithContext(() =>
        scope.run(() =>
          useRouteResource({
            route: "tasks",
            resource,
            filters: TaskFilters,
          }),
        ),
      ),
    ).toThrow("key.parseKey");
    scope.stop();
  });
});
