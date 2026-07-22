import { describe, expect, it, vi } from "vitest";
import {
  MemoryCache,
  durableCache,
  mergeEntity,
  memoryCache,
  tombstoneEntity,
  type CollectionEntry,
  type EntityEntry,
} from "./cache.js";

const address = { scope: "subject:1", resource: "tasks" } as const;

describe("normalized cache", () => {
  it("stores, invalidates, removes, and publishes entity and collection changes", () => {
    const cache = memoryCache();
    const entityEvents = vi.fn();
    const collectionEvents = vi.fn();
    const unsubscribeEntity = cache.subscribeEntity(address, 1, entityEvents);
    const unsubscribeCollection = cache.subscribeCollection(address, "active", collectionEvents);
    cache.setEntity(address, entity(1));
    cache.invalidateEntity(address, 1);
    expect(cache.entity(address, 1)?.staleAt).toBe(0);
    cache.setCollection(address, collection("active", [1]));
    cache.removeCollection(address, "active");
    expect(cache.collection(address, "active")).toBeUndefined();
    expect(entityEvents).toHaveBeenCalledTimes(2);
    expect(collectionEvents).toHaveBeenCalledTimes(2);

    unsubscribeEntity();
    unsubscribeCollection();
    cache.setEntity(address, entity(1, { title: "silent" }));
    cache.setCollection(address, collection("active", [1]));
    expect(entityEvents).toHaveBeenCalledTimes(2);
    expect(collectionEvents).toHaveBeenCalledTimes(2);
  });

  it("invalidates only collections for one resource", () => {
    const cache = memoryCache();
    const other = { scope: address.scope, resource: "projects" };
    cache.setEntity(address, entity(1));
    cache.setCollection(address, collection("active", [1]));
    cache.setCollection(other, collection("active", [2]));
    cache.invalidateResource(address);
    expect(cache.entity(address, 1)).toBeDefined();
    expect(cache.collection(address, "active")).toBeUndefined();
    expect(cache.collection(other, "active")).toBeDefined();
  });

  it("clears one authentication scope without crossing into another", () => {
    const cache = memoryCache();
    const first = { scope: "subject:1", resource: "tasks" };
    const second = { scope: "subject:2", resource: "tasks" };
    cache.setEntity(first, entity(1));
    cache.setCollection(first, collection("all", [1]));
    cache.setEntity(second, entity(1, { title: "second" }));
    cache.setCollection(second, collection("all", [1]));
    cache.clearScope(first.scope);
    expect(cache.entity(first, 1)).toBeUndefined();
    expect(cache.collection(first, "all")).toBeUndefined();
    expect(cache.entity(second, 1)?.data.title).toBe("second");
    expect(cache.collection(second, "all")).toBeDefined();
  });

  it("dumps and restores only matching scoped identities", () => {
    const source = memoryCache();
    source.setEntity(address, entity(1));
    source.setCollection(address, collection("all", [1]));
    source.setEntity({ scope: "subject:2", resource: "tasks" }, entity(2));
    const dump = source.dump(address.scope);
    expect(dump.entities).toHaveLength(1);
    expect(dump.collections).toHaveLength(1);

    const restored = new MemoryCache();
    restored.restore({
      ...dump,
      entities: [...dump.entities, ["9:untrusted|identity", entity(9)] as const],
      collections: [
        ...dump.collections,
        ["9:untrusted|collection", collection("bad", [])] as const,
      ],
    });
    const entry = restored.entity(address, 1);
    expect(entry?.knownFields).toEqual(new Set(["id", "title"]));
    expect(restored.collection(address, "all")?.keys).toEqual([1]);
    expect(restored.entity(address, 9)).toBeUndefined();
  });

  it("does nothing when invalidating a missing entity", () => {
    const cache = memoryCache();
    const listener = vi.fn();
    cache.subscribeEntity(address, 99, listener);
    cache.invalidateEntity(address, 99);
    expect(listener).not.toHaveBeenCalled();
  });

  it("publishes over a listener snapshot when a controller rebinds", () => {
    const cache = memoryCache();
    const listener = vi.fn();
    let unsubscribe: () => void = () => undefined;
    const rebind = () => {
      listener();
      unsubscribe();
      unsubscribe = cache.subscribeCollection(address, "all", rebind);
    };
    unsubscribe = cache.subscribeCollection(address, "all", rebind);

    cache.setCollection(address, collection("all", [1]));
    expect(listener).toHaveBeenCalledOnce();
    cache.setCollection(address, collection("all", [1, 2]));
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});

describe("persistent cache", () => {
  it("restores, batches writes, reports status, and removes scopes", async () => {
    const backend = new TestBackend();
    const cache = durableCache(backend);
    await cache.activateScope(address.scope);
    cache.setEntity(address, entity(1, { title: "restored" }));
    cache.setEntity(address, entity(2));
    cache.setCollection(address, collection("all", [1, 2]));
    cache.invalidateEntity(address, 2);
    cache.removeCollection(address, "all");
    cache.setCollection(address, collection("all", [1, 2]));
    cache.invalidateResource(address);
    await eventually(() => backend.writes.length === 1);
    expect(cache.persistenceStatus).toBe("ready");

    const hydrated = durableCache(backend);
    await hydrated.activateScope(address.scope);
    expect(hydrated.entity(address, 1)?.data.title).toBe("restored");
    expect(hydrated.entity(address, 1)?.snapshot).toBeUndefined();
    cache.clearScope(address.scope);
    await cache.removePersistentScope(address.scope);
    expect(backend.removals).toEqual(["cache/subject%3A1"]);
    expect(cache.entity(address, 1)).toBeUndefined();
  });

  it("forwards subscriptions through the memory layer", () => {
    const cache = durableCache(new TestBackend());
    const entityListener = vi.fn();
    const collectionListener = vi.fn();
    cache.subscribeEntity(address, 1, entityListener);
    cache.subscribeCollection(address, "all", collectionListener);
    cache.setEntity(address, entity(1));
    cache.setCollection(address, collection("all", [1]));
    expect(entityListener).toHaveBeenCalledOnce();
    expect(collectionListener).toHaveBeenCalledOnce();
  });

  it("drops dangling collection keys and marks the restored collection stale", async () => {
    const backend = new TestBackend();
    backend.values.set("cache/subject%3A1", {
      format: "uicogs-cache",
      version: 1,
      scope: address.scope,
      entities: [[entityIdentity(1), persistedEntity(1)]],
      collections: [
        [
          collectionIdentity("all"),
          {
            identity: "all",
            keys: [1, 2],
            updatedAt: 10,
            staleAt: 110,
          },
        ],
      ],
    });

    const cache = durableCache(backend);
    await cache.activateScope(address.scope);

    expect(cache.collection(address, "all")).toMatchObject({
      keys: [1],
      staleAt: 0,
    });
  });

  it("does not replace a memory mutation that completes during hydration", async () => {
    const backend = new DeferredReadBackend({
      format: "uicogs-cache",
      version: 1,
      scope: address.scope,
      entities: [[entityIdentity(1), persistedEntity(1, "persisted", 10)]],
      collections: [],
    });
    const cache = durableCache(backend);
    const hydration = cache.activateScope(address.scope);

    cache.setEntity(address, entity(1, { title: "memory" }, 20));
    backend.resolveRead();
    await hydration;

    expect(cache.entity(address, 1)?.data.title).toBe("memory");
    await eventually(() => backend.writes.length === 1);
  });

  it("reports corrupt records and write failures without losing memory state", async () => {
    const corrupt = new TestBackend();
    corrupt.values.set("cache/subject%3A1", { format: "other" });
    const corruptCache = durableCache(corrupt);
    await corruptCache.activateScope(address.scope);
    expect(corruptCache.persistenceStatus).toBe("error");
    expect(corruptCache.persistenceError).toMatch(/invalid or unsupported/);

    const failing = new TestBackend();
    failing.writeError = new Error("quota unavailable");
    const cache = durableCache(failing);
    await cache.activateScope(address.scope);
    cache.setEntity(address, entity(1));
    await eventually(() => cache.persistenceStatus === "error");
    expect(cache.persistenceError).toBe("quota unavailable");
    expect(cache.entity(address, 1)?.data.title).toBe("Task 1");
  });

  it("reports durable scope removal failures", async () => {
    const backend = new TestBackend();
    backend.removeError = new Error("delete unavailable");
    const cache = durableCache(backend);
    await cache.activateScope(address.scope);

    await cache.removePersistentScope(address.scope);

    expect(cache.persistenceStatus).toBe("error");
    expect(cache.persistenceError).toBe("delete unavailable");
  });

  it("does not write pending changes after disposal", async () => {
    const backend = new TestBackend();
    const cache = durableCache(backend);
    await cache.activateScope(address.scope);
    cache.dispose();
    cache.setEntity(address, entity(1));
    await Promise.resolve();
    expect(backend.writes).toHaveLength(0);
    expect(cache.entity(address, 1)?.data.title).toBe("Task 1");
  });
});

class TestBackend {
  readonly values = new Map<string, unknown>();
  readonly writes: string[] = [];
  readonly removals: string[] = [];
  writeError: Error | undefined;
  removeError: Error | undefined;

  async read(key: string): Promise<unknown | undefined> {
    return this.values.get(key);
  }
  async write(key: string, value: unknown): Promise<void> {
    if (this.writeError) throw this.writeError;
    this.writes.push(key);
    this.values.set(key, value);
  }
  async remove(key: string): Promise<void> {
    if (this.removeError) throw this.removeError;
    this.removals.push(key);
    this.values.delete(key);
  }
}

class DeferredReadBackend extends TestBackend {
  private resolve!: (value: unknown) => void;
  private readonly readPromise = new Promise<unknown>((resolve) => {
    this.resolve = resolve;
  });

  constructor(private readonly restored: unknown) {
    super();
  }

  override async read(): Promise<unknown> {
    return this.readPromise;
  }

  resolveRead(): void {
    this.resolve(this.restored);
  }
}

async function eventually(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Condition was not reached");
}

describe("entity merging", () => {
  it("merges partial fields, tracks known values, and preserves snapshots", () => {
    const current = {
      ...entity(1),
      snapshot: Object.freeze({ id: 1, title: "old" }),
    };
    const merged = mergeEntity(current, 1, { title: null, note: "new" }, { ttl: 50, now: 100 });
    expect(merged.data).toEqual({ id: 1, title: null, note: "new" });
    expect(merged.knownFields).toEqual(new Set(["id", "title", "note"]));
    expect(merged.snapshot).toBe(current.snapshot);
    expect(merged).toMatchObject({
      version: 2,
      updatedAt: 100,
      staleAt: 150,
      tombstone: false,
    });
    expect(Object.isFrozen(merged.data)).toBe(true);
  });

  it("suppresses responses older than the current mutation", () => {
    const current = entity(1, { title: "mutation" }, 200);
    expect(
      mergeEntity(
        current,
        1,
        { title: "stale response" },
        {
          ttl: 50,
          now: 300,
          requestStartedAt: 199,
        },
      ),
    ).toBe(current);
  });

  it("creates and advances tombstones with or without prior data", () => {
    const current = entity(1);
    const existing = tombstoneEntity(current, 1);
    const missing = tombstoneEntity(undefined, 2);
    expect(existing).toMatchObject({
      key: 1,
      data: current.data,
      version: 2,
      tombstone: true,
    });
    expect(missing).toMatchObject({
      key: 2,
      data: {},
      version: 1,
      tombstone: true,
    });
  });
});

function entity(
  key: number,
  data: Readonly<Record<string, unknown>> = { id: key, title: `Task ${key}` },
  updatedAt = 10,
): EntityEntry {
  return Object.freeze({
    key,
    data: Object.freeze({ id: key, ...data }),
    knownFields: new Set(["id", ...Object.keys(data)]),
    version: 1,
    updatedAt,
    staleAt: updatedAt + 100,
    tombstone: false,
  });
}

function collection(identity: string, keys: readonly number[]): CollectionEntry {
  return Object.freeze({
    identity,
    keys: Object.freeze([...keys]),
    pageInfo: Object.freeze({ count: keys.length }),
    updatedAt: 10,
    staleAt: 110,
  });
}

function entityIdentity(key: number): string {
  return `9:subject:1|5:tasks|entity|${String(key).length}:${key}`;
}

function collectionIdentity(identity: string): string {
  return `9:subject:1|5:tasks|collection|${identity.length}:${identity}`;
}

function persistedEntity(key: number, title = `Task ${key}`, updatedAt = 10): unknown {
  return {
    key,
    data: { id: key, title },
    knownFields: ["id", "title"],
    version: 1,
    updatedAt,
    staleAt: updatedAt + 100,
    tombstone: false,
  };
}
