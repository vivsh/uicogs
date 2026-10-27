import {
  createUiCogs,
  fields,
  operation,
  pagination,
  resource,
  schema,
  type JsonValue,
  type TransportRequest,
  type TransportResponse,
} from "@uicogs/core";
import { createApp, defineComponent, effectScope, nextTick } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it, vi } from "vitest";
import { useRouteCollection, useRouteState } from "./route-state.js";

const Filters = schema({
  status: fields.Str({ wireName: "state" }),
  payload: fields.JSON({
    parse: (input) => (typeof input === "string" ? JSON.parse(input) : input) as JsonValue,
  }),
  at: fields.Date(),
});
const Tasks = resource({
  name: "tasks",
  url: "tasks",
  schema: schema({
    id: fields.Int({ required: true }),
    title: fields.Str(),
    status: fields.Str({ wireName: "state" }),
  }),
  key: "id",
  operations: { list: operation.list({ input: Filters, pagination: pagination.page() }) },
});

function pageResponse(request: TransportRequest): TransportResponse<unknown> {
  const index = Number(request.query?.page ?? 1);
  const size = Number(request.query?.page_size ?? 2);
  const offset = (request.query?.state ? 100 : 0) + (request.query?.ordering ? 200 : 0);
  return {
    status: 200,
    data: {
      count: 6,
      next: index * size < 6 ? index + 1 : null,
      previous: index > 1 ? index - 1 : null,
      results: Array.from({ length: Math.min(size, 6 - (index - 1) * size) }, (_, position) => ({
        id: offset + (index - 1) * size + position + 1,
        title: `Task ${position + 1}`,
      })),
    },
  };
}

async function harness(
  request: (request: TransportRequest) => Promise<TransportResponse<unknown>> = async (value) =>
    pageResponse(value),
  initial = "/tasks?page_size=2",
) {
  const app = createApp(defineComponent({ setup: () => () => null }));
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ name: "tasks", path: "/tasks/:id?", component: { render: () => null } }],
  });
  app.use(router);
  await router.push(initial);
  const send = vi.fn(request);
  const api = createUiCogs({ resources: [Tasks], transport: { request: send } });
  const source = api.resource(Tasks).accumulate();
  const filter = vi.spyOn(source, "filter");
  const sort = vi.spyOn(source, "sort");
  const page = vi.spyOn(source, "page");
  const scope = effectScope();
  const bound = app.runWithContext(() =>
    scope.run(() => {
      const route = useRouteState({ route: "tasks", query: Filters });
      return { route, collection: useRouteCollection({ route, collection: source }) };
    }),
  )!;
  return {
    ...bound,
    router,
    source,
    send,
    filter,
    sort,
    page,
    ids: () => source.all().map((value) => value.id),
    dispose: () => {
      scope.stop();
      api.dispose();
    },
  };
}

describe("route collection accumulation", () => {
  it("retains pages through nextPage, history navigation, and page-size changes", async () => {
    const h = await harness();
    try {
      await h.collection.load();
      expect(h.ids()).toEqual([1, 2]);
      await h.collection.nextPage();
      await h.collection.load();
      expect(h.ids()).toEqual([1, 2, 3, 4]);
      expect(h.send).toHaveBeenCalledTimes(2);
      h.router.back();
      await vi.waitFor(() => expect(h.router.currentRoute.value.query.page).toBeUndefined());
      await h.collection.load();
      expect(h.ids()).toEqual([1, 2, 3, 4]);
      h.router.forward();
      await vi.waitFor(() => expect(h.router.currentRoute.value.query.page).toBe("2"));
      await h.collection.load();
      expect(h.ids()).toEqual([1, 2, 3, 4]);
      await h.collection.page({ index: 2, size: 3 });
      await h.collection.load();
      expect(h.ids()).toEqual([1, 2, 3, 4, 5, 6]);
      expect(h.filter).toHaveBeenCalledTimes(1);
      expect(h.sort).toHaveBeenCalledTimes(1);
    } finally {
      h.dispose();
    }
  });

  it("clears accumulated pages for filters and restores an unchanged requested page", async () => {
    const h = await harness();
    try {
      await h.collection.load();
      await h.collection.nextPage();
      await h.collection.load();
      await h.route.push({ query: { status: "open" } });
      await h.collection.load();
      expect(h.router.currentRoute.value.query.page).toBe("2");
      expect(h.page).toHaveBeenLastCalledWith(expect.objectContaining({ index: 2, size: 2 }));
      expect(h.ids()).toEqual([103, 104]);
      expect(h.filter).toHaveBeenCalledTimes(2);
      expect(h.sort).toHaveBeenCalledTimes(1);
    } finally {
      h.dispose();
    }
  });

  it("clears accumulated pages for ordering and supports explicit and generated page selection", async () => {
    const h = await harness();
    try {
      await h.collection.load();
      await h.collection.nextPage();
      await h.collection.load();
      await h.router.push("/tasks?page_size=2&page=2&ordering=-title");
      await h.collection.load();
      expect(h.ids()).toEqual([203, 204]);
      expect(h.page).toHaveBeenLastCalledWith(expect.objectContaining({ index: 2, size: 2 }));
      await h.collection.sort("title");
      await h.collection.load();
      expect(h.router.currentRoute.value.query.page).toBeUndefined();
      expect(h.ids()).toEqual([201, 202]);
      expect(h.filter).toHaveBeenCalledTimes(1);
      expect(h.sort).toHaveBeenCalledTimes(3);
    } finally {
      h.dispose();
    }
  });

  it("does not reload or reset for identical inputs, details, foreign queries, or hashes", async () => {
    const h = await harness();
    try {
      await h.collection.load();
      await h.router.push("/tasks?page_size=2");
      await h.router.push("/tasks/1?page_size=2&foreign=keep#detail");
      await h.router.push("/tasks?foreign=keep&page_size=2&page=1");
      await nextTick();
      expect(h.send).toHaveBeenCalledTimes(1);
      expect(h.filter).toHaveBeenCalledTimes(1);
      expect(h.sort).toHaveBeenCalledTimes(1);
      expect(h.page).toHaveBeenCalledTimes(1);
      expect(h.ids()).toEqual([1, 2]);
    } finally {
      h.dispose();
    }
  });

  it("matches direct collection accumulation without prefetching earlier pages", async () => {
    const h = await harness();
    const api = createUiCogs({
      resources: [Tasks],
      transport: { request: async (r) => pageResponse(r) },
    });
    try {
      const direct = api.resource(Tasks).accumulate().page({ index: 1, size: 2 });
      await direct.load();
      await direct.nextPage().load();
      await h.collection.load();
      await h.collection.nextPage();
      await h.collection.load();
      expect(h.source.all()).toEqual(direct.all());
      await h.collection.page({ index: 3, size: 2 });
      await h.collection.load();
      expect(h.ids()).toEqual([1, 2, 3, 4, 5, 6]);
    } finally {
      h.dispose();
      api.dispose();
    }
  });

  it("loads only the requested page on direct navigation", async () => {
    const h = await harness(undefined, "/tasks?page_size=2&page=3");
    try {
      await h.collection.load();
      expect(h.ids()).toEqual([5, 6]);
      expect(h.send).toHaveBeenCalledTimes(1);
      expect(h.send.mock.calls[0]?.[0].query).toMatchObject({ page: 3, page_size: 2 });
    } finally {
      h.dispose();
    }
  });

  it("normalizes nested object keys and dates while preserving array order", async () => {
    const h = await harness();
    try {
      await h.collection.load();
      await h.router.push({
        name: "tasks",
        query: {
          page_size: "2",
          payload: '{"nested":{"a":1,"b":2},"items":[1,2]}',
          at: "2026-09-15",
        },
      });
      await h.collection.load();
      const calls = h.send.mock.calls.length;
      await h.router.push({
        name: "tasks",
        query: {
          page_size: "2",
          payload: '{"items":[1,2],"nested":{"b":2,"a":1}}',
          at: "2026-09-15T00:00:00.000Z",
        },
      });
      await nextTick();
      expect(h.send).toHaveBeenCalledTimes(calls);
      expect(h.filter).toHaveBeenCalledTimes(2);
      await h.router.push({
        name: "tasks",
        query: {
          page_size: "2",
          payload: '{"items":[2,1],"nested":{"b":2,"a":1}}',
          at: "2026-09-15",
        },
      });
      await h.collection.load();
      expect(h.filter).toHaveBeenCalledTimes(3);
    } finally {
      h.dispose();
    }
  });

  it("retries a failed load without reapplying filters or ordering", async () => {
    let failing = true;
    const h = await harness(async (request) => {
      if (failing) return { status: 503, data: { message: "Unavailable" } };
      return pageResponse(request);
    });
    try {
      await expect(h.collection.load()).rejects.toBeDefined();
      await nextTick();
      failing = false;
      await h.collection.load();
      expect(h.ids()).toEqual([1, 2]);
      expect(h.filter).toHaveBeenCalledTimes(1);
      expect(h.sort).toHaveBeenCalledTimes(1);
    } finally {
      h.dispose();
    }
  });

  it("does not let an older load clear the current in-flight application", async () => {
    const h = await harness();
    try {
      await h.collection.load();
      let finishFirst!: () => void;
      let finishSecond!: () => void;
      const first = new Promise<void>((resolve) => {
        finishFirst = resolve;
      });
      const second = new Promise<void>((resolve) => {
        finishSecond = resolve;
      });
      const load = vi
        .spyOn(h.source, "load")
        .mockImplementationOnce(async () => {
          await first;
          return [];
        })
        .mockImplementationOnce(async () => {
          await second;
          return [];
        });
      const navigationFirst = h.collection.page({ index: 2, size: 2 });
      await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
      const navigationSecond = h.collection.page({ index: 3, size: 2 });
      await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
      finishFirst();
      await nextTick();
      let completed = false;
      const pending = h.collection.load().then(() => {
        completed = true;
      });
      await nextTick();
      expect(completed).toBe(false);
      expect(load).toHaveBeenCalledTimes(2);
      finishSecond();
      await pending;
      await Promise.all([navigationFirst, navigationSecond]);
      expect(completed).toBe(true);
    } finally {
      h.dispose();
    }
  });
});
