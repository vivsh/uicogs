import { describe, expect, it } from "vitest";
import {
  createUiCogs,
  fields,
  operation,
  pagination,
  resource,
  schema,
  type PageState,
  type TransportRequest,
} from "./index.js";

describe("complete pagination state", () => {
  it("applies, replaces, and clears cursor tokens while preserving accumulation", async () => {
    const requests: TransportRequest[] = [];
    const Tasks = resource({
      name: "tasks",
      url: "tasks",
      key: "id",
      schema: schema({ id: fields.Int({ required: true }) }),
      operations: { list: operation.list({ pagination: pagination.cursor() }) },
    });
    const api = createUiCogs({
      resources: [Tasks],
      cachePolicy: "network-only",
      transport: {
        request: async (request) => {
          requests.push(request);
          const second = request.query?.cursor === "next";
          return {
            status: 200,
            data: {
              results: [{ id: second ? 2 : 1 }],
              next: second ? null : "next",
              previous: second ? "first" : null,
            },
          };
        },
      },
    });
    try {
      const tasks = api.resource(Tasks).accumulate();
      await tasks.load();
      expect(requests.at(-1)?.query).toEqual({ page_size: 25 });
      const state = Object.freeze({ size: 1 });
      expect(tasks.page(state)).toBe(tasks);
      await tasks.load();
      expect(tasks.pageInfo).not.toHaveProperty("index");
      expect(() => tasks.page({ index: 1, size: 1 })).toThrow("does not accept an index");
      expect(() =>
        tasks.page({ index: 1, size: 1, token: "next" } as unknown as PageState),
      ).toThrow("does not accept an index");
      await tasks.nextPage().load();
      expect(requests.at(-1)?.query).toEqual({ cursor: "next", page_size: 1 });
      expect(tasks.all().map(({ id }) => id)).toEqual([1, 2]);
      await tasks.previousPage().load();
      expect(requests.at(-1)?.query).toEqual({ cursor: "first", page_size: 1 });
      await tasks.page({ size: 1, token: "next" }).load();
      expect(requests.at(-1)?.query?.cursor).toBe("next");
      await tasks.page(state).load();
      expect(requests.at(-1)?.query).toEqual({ page_size: 1 });
      expect(tasks.all().map(({ id }) => id)).toEqual([1, 2]);
      expect(state).toEqual({ size: 1 });
      await tasks.nextPage().load();
      await tasks.filter({}).load();
      expect(requests.at(-1)?.query).toEqual({ page_size: 1 });
      expect(tasks.all().map(({ id }) => id)).toEqual([1]);
      await tasks.reset().load();
      expect(requests.at(-1)?.query).toEqual({ page_size: 1 });
    } finally {
      api.dispose();
    }
  });

  it("rejects cursor arguments for numbered collections without changing their position", async () => {
    const Tasks = resource({
      name: "tasks",
      url: "tasks",
      key: "id",
      schema: schema({ id: fields.Int({ required: true }) }),
    });
    const requests: TransportRequest[] = [];
    const api = createUiCogs({
      resources: [Tasks],
      transport: {
        request: async (request) => {
          requests.push(request);
          return { status: 200, data: { results: [], next: null } };
        },
      },
    });
    try {
      const tasks = api.resource(Tasks).page({ index: 3, size: 10 });
      expect(() => tasks.page({ size: 10 })).toThrow("requires an index");
      expect(() => tasks.page({ size: 10, token: "next" })).toThrow("requires an index");
      expect(() =>
        tasks.page({ index: 4, size: 10, token: "next" } as unknown as PageState),
      ).toThrow("does not accept a token");
      expect(requests).toHaveLength(0);
      await tasks.load();
      expect(requests[0]?.query).toEqual({ page: 3, page_size: 10 });
    } finally {
      api.dispose();
    }
  });
});
