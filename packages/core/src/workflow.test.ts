import { defineSchema, registerResource } from "./test-utils.js";

import { describe, expect, it } from "vitest";
import { durableCache, memoryCache } from "./cache.js";
import { createUiCogs } from "./factory.js";
import { fields } from "./field.js";
import { operation } from "./resource.js";
import { EventBus } from "./store.js";
import {
  pagination,
  type ErrorAdapter,
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
