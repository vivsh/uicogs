import {
  createUiCogs,
  fields,
  operation,
  pagination,
  resource,
  schema,
  type TransportRequest,
} from "@uicogs/core";
import { createApp, effectScope } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it, vi } from "vitest";
import {
  cursorRoutePagination,
  useRouteCollection,
  useRouteForm,
  useRouteResource,
  useRouteState,
  type RoutePaginationCodec,
} from "./route-state.js";

const Filters = schema({ status: fields.Str() });
const Tasks = resource({
  name: "tasks",
  url: "tasks",
  key: "id",
  schema: schema({ id: fields.Int({ required: true }), title: fields.Str() }),
  operations: { list: operation.list({ input: Filters, pagination: pagination.cursor() }) },
});
const token = (batch: number) => `batch/${batch}+=`;

async function harness(initial = "/tasks?page_size=2", codec = cursorRoutePagination) {
  const app = createApp({ render: () => null });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/tasks/:id?", name: "tasks", component: { render: () => null } }],
  });
  app.use(router);
  await router.push(initial);
  const request = vi.fn(async (request: TransportRequest) => {
    const cursor = request.query?.cursor;
    const batch = cursor === undefined ? 1 : [1, 2, 3].find((value) => token(value) === cursor);
    if (!batch) return { status: 410, data: { message: "Cursor expired" } };
    return {
      status: 200,
      data: {
        results: [batch * 2 - 1, batch * 2].map((id) => ({ id, title: `Task ${id}` })),
        next: batch < 3 ? token(batch + 1) : null,
        previous: batch > 1 ? token(batch - 1) : null,
      },
    };
  });
  const api = createUiCogs({ resources: [Tasks], transport: { request } });
  const source = api.resource(Tasks).accumulate();
  const scope = effectScope();
  const bound = app.runWithContext(() =>
    scope.run(() => {
      const route = useRouteState({ route: "tasks", query: Filters });
      return {
        route,
        form: useRouteForm({ route, schema: Filters, pagination: codec }),
        collection: useRouteCollection({
          route,
          collection: source,
          pagination: codec,
        }),
      };
    }),
  )!;
  return {
    ...bound,
    router,
    source,
    request,
    dispose: () => {
      scope.stop();
      api.dispose();
    },
  };
}

describe("route cursor pagination", () => {
  it("cleans conflicting page input before loading the cursor batch", async () => {
    const h = await harness(
      `/tasks?cursor=${encodeURIComponent(token(2))}&page=9&page_size=2&foreign=keep`,
    );
    try {
      await h.collection.load();
      expect(h.router.currentRoute.value.query).toEqual({
        cursor: token(2),
        page_size: "2",
        foreign: "keep",
      });
      expect(h.source.all().map(({ id }) => id)).toEqual([3, 4]);
      expect(h.request).toHaveBeenCalledTimes(1);
      expect(h.request.mock.calls[0]?.[0].query).toEqual({ cursor: token(2), page_size: 2 });
    } finally {
      h.dispose();
    }
  });

  it("cleans an unchanged cursor location without reloading or self-joining", async () => {
    const h = await harness();
    try {
      await h.collection.load();
      await h.collection.nextPage();
      const calls = h.request.mock.calls.length;
      await h.router.push({ query: { ...h.router.currentRoute.value.query, page: "9" } });
      await h.collection.load();
      expect(h.router.currentRoute.value.query).toEqual({ cursor: token(2), page_size: "2" });
      expect(h.request).toHaveBeenCalledTimes(calls);
      expect(h.source.all().map(({ id }) => id)).toEqual([1, 2, 3, 4]);
    } finally {
      h.dispose();
    }
  });

  it("supports a custom cursor URL convention using the same controller", async () => {
    const codec: RoutePaginationCodec = {
      mode: "cursor",
      keys: ["after", "limit", "sort"],
      read: (query) =>
        cursorRoutePagination.read({
          cursor: query.after,
          page_size: query.limit,
          ordering: query.sort,
        }),
      write: (state) => {
        const query = cursorRoutePagination.write(state);
        return {
          after: query.cursor,
          limit: query.page_size,
          sort: query.ordering,
        };
      },
    };
    const h = await harness("/tasks?limit=2&foreign=keep", codec);
    try {
      await h.collection.load();
      await h.collection.nextPage();
      expect(h.router.currentRoute.value.query).toEqual({
        after: token(2),
        limit: "2",
        foreign: "keep",
      });
      expect(h.request.mock.calls.at(-1)?.[0].query).toEqual({ cursor: token(2), page_size: 2 });
      h.form.set("status", "open");
      await h.form.submit();
      await h.collection.load();
      expect(h.router.currentRoute.value.query).toEqual({
        limit: "2",
        foreign: "keep",
        status: "open",
      });
    } finally {
      h.dispose();
    }
  });
  it("navigates using response tokens and accumulates without duplicate batches", async () => {
    const h = await harness();
    try {
      await h.collection.load();
      await h.collection.nextPage();
      expect(h.router.currentRoute.value.query).toEqual({ cursor: token(2), page_size: "2" });
      expect(h.source.pageInfo).not.toHaveProperty("index");
      expect(h.request.mock.calls.at(-1)?.[0].query).toEqual({ cursor: token(2), page_size: 2 });
      expect(h.source.all().map(({ id }) => id)).toEqual([1, 2, 3, 4]);
      await h.collection.nextPage();
      expect(h.source.all().map(({ id }) => id)).toEqual([1, 2, 3, 4, 5, 6]);
      await h.collection.nextPage();
      expect(h.request).toHaveBeenCalledTimes(3);
      await h.collection.previousPage();
      expect(h.router.currentRoute.value.query.cursor).toBe(token(2));
      await h.collection.previousPage();
      expect(h.router.currentRoute.value.query.cursor).toBe(token(1));
      expect(h.source.all().map(({ id }) => id)).toEqual([1, 2, 3, 4, 5, 6]);
      const count = h.request.mock.calls.length;
      await h.collection.previousPage();
      expect(h.request).toHaveBeenCalledTimes(count);
    } finally {
      h.dispose();
    }
  });

  it("restores a cursor from a direct URL without fetching earlier batches", async () => {
    const h = await harness(`/tasks?cursor=${encodeURIComponent(token(3))}&page_size=2`);
    try {
      await h.collection.load();
      expect(h.source.all().map(({ id }) => id)).toEqual([5, 6]);
      expect(h.request).toHaveBeenCalledTimes(1);
      await h.collection.previousPage();
      expect(h.router.currentRoute.value.query.cursor).toBe(token(2));
      expect(h.source.all().map(({ id }) => id)).toEqual([5, 6, 3, 4]);
    } finally {
      h.dispose();
    }
  });

  it("restores cursors through history, including history across a filter reset", async () => {
    const h = await harness("/tasks/42?page_size=2&foreign=keep");
    try {
      await h.collection.load();
      await h.collection.nextPage();
      h.router.back();
      await vi.waitFor(() => expect(h.router.currentRoute.value.query.cursor).toBeUndefined());
      await h.collection.load();
      expect(h.source.all().map(({ id }) => id)).toEqual([1, 2, 3, 4]);
      h.router.forward();
      await vi.waitFor(() => expect(h.router.currentRoute.value.query.cursor).toBe(token(2)));
      await h.collection.load();
      expect(h.source.all().map(({ id }) => id)).toEqual([1, 2, 3, 4]);
      const push = vi.spyOn(h.router, "push");
      h.form.set("status", "open");
      expect((await h.form.submit()).success).toBe(true);
      await h.collection.load();
      expect(push).toHaveBeenCalledTimes(1);
      expect(h.router.currentRoute.value.query).toEqual({
        page_size: "2",
        foreign: "keep",
        status: "open",
      });
      expect(h.router.currentRoute.value.params.id).toBe("42");
      expect(h.request.mock.calls.at(-1)?.[0].query).toEqual({ page_size: 2, status: "open" });
      expect(h.source.all().map(({ id }) => id)).toEqual([1, 2]);
      h.router.back();
      await vi.waitFor(() => expect(h.router.currentRoute.value.query.cursor).toBe(token(2)));
      await h.collection.load();
      expect(h.router.currentRoute.value.query.status).toBeUndefined();
      expect(h.source.all().map(({ id }) => id)).toEqual([3, 4]);
    } finally {
      h.dispose();
    }
  });

  it("resets cursors for sorting and resizing but ignores unchanged sorting", async () => {
    const h = await harness();
    try {
      await h.collection.load();
      await h.collection.nextPage();
      const calls = h.request.mock.calls.length;
      await h.collection.sort(undefined);
      expect(h.request).toHaveBeenCalledTimes(calls);
      expect(h.router.currentRoute.value.query.cursor).toBe(token(2));
      await h.collection.sort("title", true);
      expect(h.router.currentRoute.value.query.cursor).toBeUndefined();
      expect(h.router.currentRoute.value.query.ordering).toBe("-title");
      expect(h.source.all().map(({ id }) => id)).toEqual([1, 2]);
      await h.collection.nextPage();
      await h.collection.page({ size: 3, token: token(2) });
      expect(h.router.currentRoute.value.query).toEqual({ page_size: "3", ordering: "-title" });
      expect(h.request.mock.calls.at(-1)?.[0].query).toEqual({ page_size: 3, ordering: "-title" });
    } finally {
      h.dispose();
    }
  });

  it("loads changed tokens and rejects numbered cursor positions", async () => {
    const h = await harness();
    try {
      await h.collection.load();
      await h.collection.page({ size: 2, token: token(2) });
      expect(h.request.mock.calls.at(-1)?.[0].query?.cursor).toBe(token(2));
      const calls = h.request.mock.calls.length;
      await expect(h.collection.page({ index: 3, size: 2 })).rejects.toThrow(
        "does not accept an index",
      );
      await expect(h.collection.page({ size: 2, token: { after: 2 } })).rejects.toThrow(
        "custom codec",
      );
      expect(h.request).toHaveBeenCalledTimes(calls);
      expect(h.router.currentRoute.value.query.cursor).toBe(token(2));
    } finally {
      h.dispose();
    }
  });

  it("shows expired-cursor failure and lets the caller explicitly return to the first batch", async () => {
    const h = await harness("/tasks?cursor=expired&page_size=2&foreign=keep");
    try {
      await expect(h.collection.load()).rejects.toBeDefined();
      expect(h.source.error).toBeDefined();
      expect(h.router.currentRoute.value.query.cursor).toBe("expired");
      await h.collection.page({ size: 2 });
      expect(h.source.error).toBeUndefined();
      expect(h.source.all().map(({ id }) => id)).toEqual([1, 2]);
      expect(h.router.currentRoute.value.query).toEqual({ page_size: "2", foreign: "keep" });
    } finally {
      h.dispose();
    }
  });

  it("does not silently request the first batch when next-page metadata omits its cursor", async () => {
    const h = await harness();
    try {
      await h.collection.load();
      vi.spyOn(h.source, "pageInfo", "get").mockReturnValue({ hasNext: true, hasPrevious: true });
      await expect(h.collection.nextPage()).rejects.toThrow("without a nextToken");
      await expect(h.collection.previousPage()).rejects.toThrow("without a previousToken");
      expect(h.request).toHaveBeenCalledTimes(1);
    } finally {
      h.dispose();
    }
  });

  it("passes the cursor codec to the generated route-resource filter form", async () => {
    const app = createApp({ render: () => null });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/tasks/:id?", name: "tasks", component: { render: () => null } }],
    });
    app.use(router);
    await router.push(`/tasks?cursor=${encodeURIComponent(token(2))}&page=2`);
    const request = vi.fn(async () => ({
      status: 200,
      data: { results: [], next: null, previous: null },
    }));
    const api = createUiCogs({ resources: [Tasks], transport: { request } });
    const scope = effectScope();
    try {
      const page = app.runWithContext(() =>
        scope.run(() =>
          useRouteResource({
            route: "tasks",
            resource: api.resource(Tasks),
            filters: Filters,
            pagination: cursorRoutePagination,
          }),
        ),
      )!;
      await page.collection.load();
      page.filterForm.set("status", "open");
      expect((await page.filterForm.submit()).success).toBe(true);
      await page.collection.load();
      expect(router.currentRoute.value.query).toEqual({ status: "open" });
    } finally {
      scope.stop();
      api.dispose();
    }
  });
});
