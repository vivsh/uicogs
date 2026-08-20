import { defineSchema, registerResource } from "./test-utils.js";

import { describe, expect, it } from "vitest";
import { durableCache, memoryCache } from "./cache.js";
import { createUiCogs } from "./factory.js";
import { fields } from "./field.js";
import { operation } from "./resource.js";
import { EventBus } from "./store.js";
import {
  pagination,
  responseAdapters,
  type ErrorAdapter,
  type ResponseAdapter,
  type Transport,
  type TransportRequest,
} from "./transport.js";

describe("workflow contracts", () => {
  it("memoizes objects locally while preserving cross-resource isolation", () => {
    const cogs = createUiCogs({ context: undefined, transport: emptyTransport() });
    const schema = defineSchema({ id: fields.ID(), name: fields.Str({ required: true }) });
    const definition = registerResource(cogs)({
      name: "projects",
      url: "projects/",
      schema,
      key: "id",
    });
    const first = cogs.resource(definition);
    const second = cogs.resource(definition);

    expect(first.get(1)).toBe(first.get(1));
    expect(first.get(1)).not.toBe(second.get(1));
  });

  it("runs field writers before create and patch operations", async () => {
    const requests: TransportRequest[] = [];
    const transport: Transport = {
      request: async (request) => {
        requests.push(request);
        const body = request.body as Readonly<Record<string, unknown>>;
        return { status: 200, data: { id: 1, title: body.task_title } };
      },
    };
    const cogs = createUiCogs({ context: undefined, transport });
    const schema = defineSchema({
      id: fields.ID({ readonly: true }),
      title: fields.Str({
        required: true,
        wireName: "task_title",
        write: (value) => value.trim(),
      }),
    });
    const definition = registerResource(cogs)({
      name: "tasks",
      url: "tasks/",
      schema,
      key: "id",
      operations: { create: operation.create(), update: operation.patch() },
    });
    const resource = cogs.resource(definition);

    await resource.create({ title: " New " });
    await resource.update(1, { title: " Changed " });
    expect(requests.map((request) => request.body)).toEqual([
      { task_title: "New" },
      { task_title: "Changed" },
    ]);
  });

  it("uses operation error adapters before resource adapters", async () => {
    const operationAdapter = messageAdapter("operation");
    const resourceAdapter = messageAdapter("resource");
    const cogs = createUiCogs({
      context: undefined,
      transport: { request: async () => ({ status: 400, data: {} }) },
    });
    const schema = defineSchema({ id: fields.ID(), name: fields.Str() });
    const definition = registerResource(cogs)({
      name: "items",
      url: "items/",
      schema,
      key: "id",
      errorAdapters: [resourceAdapter],
      operations: { update: operation.patch({ errorAdapters: [operationAdapter] }) },
    });

    await expect(cogs.resource(definition).update(1, { name: "Changed" })).rejects.toMatchObject({
      failure: { message: "operation" },
    });
  });

  it("uses a central response profile for success decoding, pagination, and failures", async () => {
    const requests: TransportRequest[] = [];
    const profile = responseAdapters.custom({
      name: "enveloped",
      decode: (response, context) =>
        context.kind === "entity"
          ? (response.data as Readonly<Record<string, unknown>>).payload
          : response.data,
      pagination: pagination.page({ resultsKey: "items", countKey: "total" }),
      errorAdapter: messageAdapter("profile"),
    });
    const cogs = createUiCogs({
      context: undefined,
      responseAdapter: profile,
      transport: {
        request: async (request) => {
          requests.push(request);
          if (request.url.endsWith("1/"))
            return { status: 200, data: { payload: { id: 1, name: "One" } } };
          if (request.url.endsWith("2/")) return { status: 422, data: {} };
          return { status: 200, data: { total: 1, items: [{ id: 1, name: "One" }] } };
        },
      },
    });
    const schema = defineSchema({ id: fields.ID(), name: fields.Str() });
    const definition = registerResource(cogs)({
      name: "profiled",
      url: "profiled/",
      schema,
      key: "id",
    });
    const resource = cogs.resource(definition).page(2, 10);

    await resource.load();
    expect(requests[0]?.query).toMatchObject({ page: 2, page_size: 10 });
    expect(resource.all()[0]?.name).toBe("One");
    expect((await resource.get(1).load())?.name).toBe("One");
    await expect(resource.get(2).load()).rejects.toMatchObject({
      failure: { message: "profile" },
    });
  });

  it("resolves scoped response profiles nearest-first while keeping explicit overrides", async () => {
    const requests: TransportRequest[] = [];
    const named = (name: string, parameter: string): ResponseAdapter => ({
      name,
      pagination: pagination.page({ pageParam: parameter }),
      errorAdapter: messageAdapter(name),
    });
    const explicitError = messageAdapter("explicit");
    const cogs = createUiCogs({
      context: undefined,
      responseAdapter: named("runtime", "runtime_page"),
      transport: {
        request: async (request) => {
          requests.push(request);
          return request.url.includes("failed")
            ? { status: 400, data: {} }
            : { status: 200, data: [] };
        },
      },
    });
    const schema = defineSchema({ id: fields.ID(), name: fields.Str() });
    const input = defineSchema({ search: fields.Str() });
    const definition = registerResource(cogs)({
      name: "scoped",
      url: "scoped/",
      schema,
      key: "id",
      responseAdapter: named("resource", "resource_page"),
      queries: {
        nearest: { input, responseAdapter: named("query", "query_page") },
        explicit: {
          input,
          responseAdapter: named("ignored", "profile_page"),
          pagination: pagination.page({ pageParam: "explicit_page" }),
        },
        failed: { input, path: "failed/", errorAdapters: [explicitError] },
      },
    });

    await cogs.resource(definition).load({ policy: "network-only" });
    await cogs.resource(definition).query("nearest", {}).load({ policy: "network-only" });
    await cogs.resource(definition).query("explicit", {}).load({ policy: "network-only" });
    await expect(cogs.resource(definition).query("failed", {}).load()).rejects.toMatchObject({
      failure: { message: "explicit" },
    });
    expect(
      requests.map((request) =>
        Object.keys(request.query ?? {}).find((key) => key.endsWith("page")),
      ),
    ).toEqual(["resource_page", "query_page", "explicit_page", "resource_page"]);
  });

  it("uses an operation response profile before its resource profile", async () => {
    const wrapped = (name: string, key: string): ResponseAdapter => ({
      name,
      decode: (response) => (response.data as Readonly<Record<string, unknown>>)[key],
    });
    const cogs = createUiCogs({
      context: undefined,
      transport: {
        request: async () => ({
          status: 200,
          data: {
            resource: { id: 1, name: "Resource" },
            operation: { id: 2, name: "Operation" },
          },
        }),
      },
    });
    const schema = defineSchema({ id: fields.ID(), name: fields.Str() });
    const definition = registerResource(cogs)({
      name: "decoded-actions",
      url: "decoded-actions/",
      schema,
      key: "id",
      responseAdapter: wrapped("resource", "resource"),
      operations: {
        publish: operation.action({
          output: schema,
          responseAdapter: wrapped("operation", "operation"),
        }),
      },
    });

    await expect(cogs.resource(definition).action("publish", undefined)).resolves.toEqual({
      id: 2,
      name: "Operation",
    });
  });

  it("does not infer response envelopes without an explicit profile", async () => {
    const cogs = createUiCogs({
      context: undefined,
      transport: { request: async () => ({ status: 200, data: { data: [{ id: 1 }] } }) },
    });
    const schema = defineSchema({ id: fields.ID() });
    const definition = registerResource(cogs)({
      name: "plain",
      url: "plain/",
      schema,
      key: "id",
    });

    await cogs.resource(definition).load();
    expect(cogs.resource(definition).all()).toEqual([]);
  });

  it("supports automatic client pagination and accumulation", async () => {
    const cogs = createUiCogs({
      context: undefined,
      transport: {
        request: async () => ({
          status: 200,
          data: [
            { id: 1, name: "One" },
            { id: 2, name: "Two" },
            { id: 3, name: "Three" },
          ],
        }),
      },
    });
    const schema = defineSchema({ id: fields.ID(), name: fields.Str({ required: true }) });
    const definition = registerResource(cogs)({
      name: "entries",
      url: "entries/",
      schema,
      key: "id",
      pagination: pagination.client(),
    });
    const resource = cogs.resource(definition).page(1, 2).accumulate();

    await resource.load();
    expect(resource.all().map((item) => item.id)).toEqual([1, 2]);
    expect(resource.hasMore()).toBe(true);
    resource.nextPage();
    await resource.load();
    expect(resource.all().map((item) => item.id)).toEqual([1, 2, 3]);
  });

  it("persists only normalized scoped cache data", async () => {
    const writes: unknown[] = [];
    const cache = durableCache({
      read: async () => undefined,
      write: async (_key, dump) => void writes.push(dump),
      remove: async () => undefined,
    });
    await cache.activateScope("subject:1");
    const entry = {
      key: 1,
      data: Object.freeze({ id: 1, name: "Cached" }),
      knownFields: new Set(["id", "name"]),
      version: 1,
      updatedAt: 1,
      staleAt: 2,
      tombstone: false,
    } as const;
    cache.setEntity({ scope: "subject:1", resource: "items" }, entry);
    await Promise.resolve();
    await Promise.resolve();

    expect(writes).toHaveLength(1);
    expect(JSON.stringify(writes[0])).not.toContain("loading");
    expect(JSON.stringify(writes[0])).not.toContain("error");
  });

  it("supports once-only typed events", () => {
    const events = new EventBus<{ saved: { readonly id: number } }>();
    const received: number[] = [];
    events.once("saved", ({ id }) => received.push(id));
    events.emit("saved", { id: 1 });
    events.emit("saved", { id: 2 });
    expect(received).toEqual([1]);
  });

  it("merges partial entities without erasing missing values", () => {
    const cache = memoryCache();
    const address = { scope: "anonymous", resource: "items" };
    cache.setEntity(address, {
      key: 1,
      data: Object.freeze({ id: 1, name: "First", note: "Keep" }),
      knownFields: new Set(["id", "name", "note"]),
      version: 1,
      updatedAt: 1,
      staleAt: 2,
      tombstone: false,
    });
    const current = cache.entity(address, 1)!;
    const next = {
      ...current,
      data: Object.freeze({ ...current.data, name: "Second", note: null }),
      knownFields: new Set(current.knownFields),
      version: 2,
    };
    cache.setEntity(address, next);
    expect(cache.entity(address, 1)?.data).toEqual({ id: 1, name: "Second", note: null });
  });
});

function emptyTransport(): Transport {
  return { request: async () => ({ status: 200, data: [] }) };
}

function messageAdapter(message: string): ErrorAdapter {
  return {
    adapt: () => ({ kind: "validation", message, issues: [], retryable: false }),
  };
}
