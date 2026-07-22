import { describe, expect, it, vi } from "vitest";
import {
  MemoryCache,
  durableCache,
  mergeEntity,
  tombstoneEntity,
  type CacheAddress,
  type CollectionEntry,
} from "./cache.js";
import { fields } from "./field.js";
import { applyTransportMiddleware, multipartAdapter } from "./default-http.js";
import { ParseError, RequestError, clientIssue, normalizeFailure, parseIssue } from "./issues.js";
import { Schema } from "./schema.js";
import { struct } from "./struct.js";
import { TransportExecutionError } from "./transport.js";
import type { TransportRequest, TransportResponse } from "./transport.js";

const address: CacheAddress = { scope: "subject:1", resource: "tasks" };

describe("production cache invariants", () => {
  it("isolates scopes, snapshots listeners, and restores only matching identities", () => {
    const cache = new MemoryCache();
    const other: CacheAddress = { scope: "subject:2", resource: "tasks" };
    const entity = mergeEntity(undefined, 1, { id: 1, name: "One" }, { ttl: 100, now: 10 });
    const collection = collectionEntry("list", [1]);
    const calls: string[] = [];
    let unsubscribeSecond: () => void = () => undefined;
    cache.subscribeEntity(address, 1, () => {
      calls.push("first");
      unsubscribeSecond();
    });
    unsubscribeSecond = cache.subscribeEntity(address, 1, () => calls.push("second"));

    cache.setEntity(address, entity);
    cache.setCollection(address, collection);
    cache.setCollection(other, collectionEntry("other", [2]));
    expect(calls).toEqual(["first", "second"]);
    expect(cache.collectionEntries(address)).toEqual([collection]);

    cache.invalidateEntity(address, 99);
    cache.removeEntityFromCollections(address, 99);
    cache.removeEntityFromCollections(address, 1);
    expect(cache.collection(address, "list")?.keys).toEqual([]);
    cache.markResourceStale(address);
    expect(cache.collection(address, "list")?.staleAt).toBe(0);

    const dump = cache.dump(address.scope);
    const restored = new MemoryCache();
    restored.restore({
      ...dump,
      entities: [...dump.entities, ["foreign", entity]],
      collections: [...dump.collections, ["foreign", collection]],
    });
    expect(restored.entity(address, 1)?.data.name).toBe("One");
    expect(restored.collection(address, "list")?.keys).toEqual([]);
    restored.invalidateResource(address);
    expect(restored.collection(address, "list")).toBeUndefined();

    cache.clearScope(address.scope);
    expect(cache.entity(address, 1)).toBeUndefined();
    expect(cache.collection(other, "other")).toBeDefined();
  });

  it("persists wrapper mutations once per microtask and initializes existing state", async () => {
    const values = new Map<string, unknown>();
    const backend = {
      read: vi.fn(async (key: string) => values.get(key)),
      write: vi.fn(async (key: string, value: unknown) => {
        values.set(key, value);
      }),
      remove: vi.fn(async (key: string) => void values.delete(key)),
    };
    const cache = durableCache(backend);
    await cache.activateScope(address.scope);
    cache.setEntity(address, mergeEntity(undefined, 1, { id: 1 }, { ttl: 100, now: 1 }));
    cache.invalidateEntity(address, 1);
    cache.setCollection(address, collectionEntry("list", [1]));
    cache.markResourceStale(address);
    cache.removeEntityFromCollections(address, 1);
    cache.removeCollection(address, "list");
    cache.invalidateResource(address);
    await Promise.resolve();
    await Promise.resolve();
    expect(backend.write).toHaveBeenCalledOnce();

    const hydrated = durableCache(backend);
    await hydrated.activateScope(address.scope);
    expect(hydrated.entity(address, 1)).toBeDefined();
    const unsubscribeEntity = hydrated.subscribeEntity(address, 1, () => undefined);
    const unsubscribeCollection = hydrated.subscribeCollection(address, "list", () => undefined);
    unsubscribeEntity();
    unsubscribeCollection();
    hydrated.clearScope(address.scope);
    await hydrated.removePersistentScope(address.scope);
    expect(backend.remove).toHaveBeenCalledWith("cache/subject%3A1");
  });

  it("suppresses stale writes and rejects incompatible live versions", () => {
    const first = mergeEntity(undefined, 1, { id: 1 }, { ttl: 10, now: 20, sourceVersion: 2 });
    expect(
      mergeEntity(first, 1, { name: "stale" }, { ttl: 10, now: 30, requestStartedAt: 10 }),
    ).toBe(first);
    expect(mergeEntity(first, 1, { name: "equal" }, { ttl: 10, now: 30, sourceVersion: 2 })).toBe(
      first,
    );
    expect(() => mergeEntity(first, 1, {}, { ttl: 10, now: 30, sourceVersion: "3" })).toThrow(
      "version type changed",
    );
    expect(tombstoneEntity(first, 1, 2)).toBe(first);
    expect(() => tombstoneEntity(first, 1, "3")).toThrow("version type changed");

    const tombstone = tombstoneEntity(undefined, "new", "v1");
    expect(tombstone).toMatchObject({ key: "new", tombstone: true, sourceVersion: "v1" });
  });
});

describe("production failure normalization", () => {
  it("normalizes every structured transport category without leaking causes", () => {
    expect(normalizeFailure(new TransportExecutionError("network", "Offline", true))).toMatchObject(
      { kind: "network", retryable: true },
    );
    expect(
      normalizeFailure(new TransportExecutionError("timeout", "Timed out", true)),
    ).toMatchObject({ kind: "network" });
    expect(
      normalizeFailure(
        new TransportExecutionError("protocol", "Invalid JSON", false, { status: 200 }),
      ),
    ).toMatchObject({ kind: "server", status: 200 });
    expect(
      normalizeFailure(new TransportExecutionError("protocol", "Invalid response", false)),
    ).toMatchObject({ kind: "unknown" });

    const requestFailure = { kind: "conflict" as const, issues: [], retryable: false };
    expect(normalizeFailure(new RequestError(requestFailure))).toBe(requestFailure);
    expect(normalizeFailure(new ParseError([parseIssue([], "Invalid")]))).toMatchObject({
      kind: "validation",
    });
    expect(normalizeFailure(new DOMException("Cancelled", "AbortError"))).toMatchObject({
      kind: "network",
      retryable: false,
    });
    expect(normalizeFailure(new Error("Unexpected"))).toMatchObject({
      kind: "unknown",
      retryable: true,
    });
    expect(normalizeFailure("unknown")).toEqual({ kind: "unknown", issues: [], retryable: false });
  });
});

describe("production transport middleware boundaries", () => {
  it("supports request-only transports and middleware that passes streams through", async () => {
    expect(multipartAdapter.brackets().path([])).toBe("");
    const request = vi.fn(async () => ({ status: 200, data: "ok" }));
    const middleware = {
      request: vi.fn(
        (
          value: TransportRequest,
          next: (request: TransportRequest) => Promise<TransportResponse<unknown>>,
        ) => next(value),
      ),
    };
    const wrapped = applyTransportMiddleware({ request }, [middleware]);
    const transportRequest = basicRequest();
    await expect(wrapped.request(transportRequest)).resolves.toMatchObject({ data: "ok" });
    expect(wrapped.capabilities).toBeUndefined();
    expect(wrapped.openStream).toBeUndefined();

    const openStream = vi.fn(async () => ({
      status: 204,
      body: { async *[Symbol.asyncIterator]() {} },
    }));
    const streaming = applyTransportMiddleware({ request, openStream }, [middleware]);
    await expect(streaming.openStream?.(transportRequest)).resolves.toMatchObject({ status: 204 });
    expect(openStream).toHaveBeenCalledOnce();
  });
});

describe("production schema boundaries", () => {
  it("handles validator result forms, cancellation, and write access branches", async () => {
    const warning = clientIssue([], "Warning", "warning", "warning");
    const schema = new Schema(
      {
        visible: fields.Str(),
        hidden: fields.Str({ writableWhen: () => false }),
        computed: fields.Computed({ dependsOn: ["visible"], get: (value) => value.visible }),
      },
      {
        validate: [
          () => undefined,
          () => true,
          () => false,
          () => "Invalid string",
          () => [warning],
          () => warning,
        ],
      },
    );
    const value = schema.parse({ visible: "value", hidden: "secret" });
    const result = await schema.validate(value);
    expect(result.issues).toHaveLength(4);
    expect(schema.canMaterialize({})).toBe(true);
    expect(schema.materialize({})).toEqual({});
    expect(schema.format(value)).toBe("[object Object]");
    expect(schema.write(value)).toEqual({ visible: "value" });
    expect(schema.writePartial({ visible: undefined, hidden: "secret" })).toEqual({});

    const required = schema.required();
    expect(required.canMaterialize({})).toBe(false);
    expect(required.canMaterialize({ visible: "value", hidden: "secret" })).toBe(true);
    expect(schema.partial().shape.computed).toBe(schema.shape.computed);
    const formatted = new Schema({ value: fields.Str() }, { format: ({ value }) => value ?? "" });
    expect(formatted.format(formatted.parse({ value: "formatted" }))).toBe("formatted");
    expect(new Schema({}).parse({ ignored: true })).toEqual({});
    expect(
      new Schema({ value: fields.Str() }, { unknownKeys: "passthrough" }).parse({
        value: "kept",
        extra: true,
      }),
    ).toEqual({ value: "kept", extra: true });
    expect(schema.toQuery({ hidden: "" })).toEqual({});
    const nullable = new Schema({ value: fields.Str({ nullable: true }) });
    expect(nullable.toQuery({ value: null })).toEqual({});
    expect(schema.toQuery({ visible: "value" })).toEqual({ visible: "value" });
    expect(schema.toQuery().shape.visible.options.required).toBe(false);
    const customForm = schema.toForm({
      mode: "create",
      encoding: "json",
      multipart: { name: "test", path: (path) => path.join(".") },
      write: ({ visible }) => ({ visible }),
      validate: () => undefined,
    });
    expect(customForm.encoding).toBe("json");
    expect(customForm.multipart?.name).toBe("test");
    expect(customForm.writeValue(value)).toEqual({ visible: "value" });
    const patchForm = schema.toForm();
    expect(patchForm.writeValue(value)).toEqual({ visible: "value" });
    expect(patchForm.writeValue(value, new Set(["visible"]))).toEqual({ visible: "value" });
    expect(schema.toForm({ mode: "create" }).writeValue(value)).toEqual({ visible: "value" });

    const controller = new AbortController();
    controller.abort();
    expect((await schema.validate(value, { signal: controller.signal })).issues).toEqual([]);
    expect(() => schema.writeInput(null)).toThrow(ParseError);
    expect(schema.writeInput({}, { partial: true })).toEqual({});
  });

  it("covers class decorator factories for nested and relation declarations", () => {
    const child = new Schema({ id: fields.ID() });
    class Model {}
    struct.Object(child)(Model.prototype, "child");
    struct.ObjectList(child)(Model.prototype, "children");
    const schema = struct.toSchema(Model);
    expect(schema.shape).toHaveProperty("child");
    expect(schema.shape).toHaveProperty("children");
    expect(Object.getPrototypeOf(schema.parse({ child: { id: 1 }, children: [] }))).toBe(
      Model.prototype,
    );
  });
});

function collectionEntry(identity: string, keys: readonly (string | number)[]): CollectionEntry {
  return Object.freeze({ identity, keys: Object.freeze([...keys]), updatedAt: 1, staleAt: 2 });
}

function basicRequest(): TransportRequest {
  return {
    method: "GET",
    url: "/tasks/",
    signal: new AbortController().signal,
  };
}
