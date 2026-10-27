import { afterEach, describe, expect, it, vi } from "vitest";
import { indexedDb, local, session } from "./index.js";

describe("shared persistence backends", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads, writes, and removes namespaced local values", async () => {
    const backing = new MemoryStorage();
    const persistence = local({ namespace: "application", storage: backing });

    expect(await persistence.read("context")).toBeUndefined();
    await persistence.write("context", { locale: "en" });
    await persistence.write("cache/anonymous", { entities: [] });
    expect(await persistence.read("context")).toEqual({ locale: "en" });
    expect(await persistence.read("cache/anonymous")).toEqual({ entities: [] });
    expect(backing.getItem("application/context")).not.toBeNull();
    expect(backing.getItem("application/cache/anonymous")).not.toBeNull();
    await persistence.remove("context");
    expect(await persistence.read("context")).toBeUndefined();
    expect(await persistence.read("cache/anonymous")).toEqual({ entities: [] });
  });

  it("supports an independent session storage backend", async () => {
    const backing = new MemoryStorage();
    const persistence = session({ namespace: "application", storage: backing });

    await persistence.write("context", { locale: "fr" });
    expect(await persistence.read("context")).toEqual({ locale: "fr" });
  });

  it("rejects unsupported JSON values and unavailable browser storage", async () => {
    const backing = new MemoryStorage();
    const persistence = local({ namespace: "application", storage: backing });
    await expect(persistence.write("context", undefined)).rejects.toThrow("not JSON serializable");

    const unavailable = local({ namespace: "application" });
    await expect(unavailable.read("context")).rejects.toThrow("localStorage is unavailable");
  });

  it("resolves IndexedDB lazily and reports an unavailable runtime", async () => {
    const persistence = indexedDb({
      database: "application",
      store: "context",
      namespace: "main-api",
      indexedDB: undefined,
    });
    await expect(persistence.read("context")).rejects.toThrow("IndexedDB is unavailable");
  });

  it("resolves native web storage globals lazily", async () => {
    const localBacking = new MemoryStorage();
    const sessionBacking = new MemoryStorage();
    vi.stubGlobal("localStorage", localBacking);
    vi.stubGlobal("sessionStorage", sessionBacking);

    const localPersistence = local({ namespace: "application" });
    const sessionPersistence = session({ namespace: "application" });
    await localPersistence.write("context", { locale: "en" });
    await sessionPersistence.write("context", { locale: "fr" });

    expect(await localPersistence.read("context")).toEqual({ locale: "en" });
    expect(await sessionPersistence.read("context")).toEqual({ locale: "fr" });
    await localPersistence.remove("context");
    await sessionPersistence.remove("context");
  });

  it("reports unavailable native session storage", async () => {
    vi.stubGlobal("sessionStorage", undefined);
    const persistence = session({ namespace: "application" });
    await expect(persistence.read("context")).rejects.toThrow("sessionStorage is unavailable");
  });

  it("reads, writes, and clears one IndexedDB record", async () => {
    const factory = new MemoryIndexedDb();
    const persistence = indexedDb({
      database: "application",
      store: "context",
      namespace: "main-api",
      indexedDB: factory as unknown as IDBFactory,
    });

    expect(await persistence.read("context")).toBeUndefined();
    await persistence.write("context", { locale: "en" });
    expect(await persistence.read("context")).toEqual({ locale: "en" });
    await persistence.remove("context");
    expect(await persistence.read("context")).toBeUndefined();
  });

  it("uses a configured IndexedDB version and an existing object store", async () => {
    const factory = new MemoryIndexedDb(true);
    vi.stubGlobal("indexedDB", factory);
    const persistence = indexedDb({
      database: "application",
      store: "context",
      namespace: "main-api",
      version: 3,
    });

    await persistence.write("context", { locale: "en" });
    expect(await persistence.read("context")).toEqual({ locale: "en" });
    expect(factory.lastVersion).toBe(3);
    expect(factory.createdStores).toBe(0);
  });

  it.each([
    ["open", "IndexedDB open failed"],
    ["blocked", "IndexedDB open was blocked"],
    ["request", "IndexedDB request failed"],
    ["transaction", "IndexedDB transaction failed"],
    ["abort", "IndexedDB transaction was aborted"],
  ] as const)("reports %s IndexedDB failures", async (failure, message) => {
    const persistence = indexedDb({
      database: "application",
      store: "context",
      namespace: "main-api",
      indexedDB: new FailingIndexedDb(failure) as unknown as IDBFactory,
    });

    await expect(persistence.read("context")).rejects.toThrow(message);
  });
});

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

class MemoryIndexedDb {
  private readonly values = new Map<IDBValidKey, unknown>();
  private readonly stores = new Set<string>();
  lastVersion: number | undefined;
  createdStores = 0;

  constructor(existingStore = false) {
    if (existingStore) this.stores.add("context");
  }

  open(_database?: string, version?: number): IDBOpenDBRequest {
    this.lastVersion = version;
    const request = {} as IDBOpenDBRequest;
    const database = {
      objectStoreNames: { contains: (name: string) => this.stores.has(name) },
      createObjectStore: (name: string) => {
        this.stores.add(name);
        this.createdStores += 1;
        return {} as IDBObjectStore;
      },
      transaction: () => this.transaction(),
      close: () => undefined,
    } as unknown as IDBDatabase;
    Object.defineProperty(request, "result", { value: database });
    queueMicrotask(() => {
      request.onupgradeneeded?.(new Event("upgradeneeded") as IDBVersionChangeEvent);
      request.onsuccess?.(new Event("success"));
    });
    return request;
  }

  private transaction(): IDBTransaction {
    const transaction = {} as IDBTransaction;
    const complete = (): void => {
      queueMicrotask(() => transaction.oncomplete?.(new Event("complete")));
    };
    const objectStore = {
      get: (key: IDBValidKey) => this.request(this.values.get(key), complete),
      put: (value: unknown, key: IDBValidKey) => {
        this.values.set(key, value);
        return this.request(key, complete);
      },
      delete: (key: IDBValidKey) => {
        this.values.delete(key);
        return this.request(undefined, complete);
      },
    } as unknown as IDBObjectStore;
    Object.defineProperty(transaction, "objectStore", { value: () => objectStore });
    return transaction;
  }

  private request<T>(value: T, complete: () => void): IDBRequest<T> {
    const request = {} as IDBRequest<T>;
    Object.defineProperty(request, "result", { value });
    queueMicrotask(() => {
      request.onsuccess?.(new Event("success"));
      complete();
    });
    return request;
  }
}

class FailingIndexedDb {
  constructor(private readonly failure: "open" | "blocked" | "request" | "transaction" | "abort") {}

  open(): IDBOpenDBRequest {
    const request = {} as IDBOpenDBRequest;
    const transaction = {} as IDBTransaction;
    const operation = {} as IDBRequest<unknown>;
    const database = {
      objectStoreNames: { contains: () => true },
      transaction: () => transaction,
      close: () => undefined,
    } as unknown as IDBDatabase;
    const store = { get: () => operation } as unknown as IDBObjectStore;
    Object.defineProperty(request, "result", { value: database });
    Object.defineProperty(transaction, "objectStore", { value: () => store });

    queueMicrotask(() => {
      if (this.failure === "open") request.onerror?.(new Event("error"));
      else if (this.failure === "blocked")
        request.onblocked?.(new Event("blocked") as IDBVersionChangeEvent);
      else {
        request.onsuccess?.(new Event("success"));
        queueMicrotask(() => {
          if (this.failure === "request") operation.onerror?.(new Event("error"));
          else operation.onsuccess?.(new Event("success"));
          queueMicrotask(() => {
            if (this.failure === "transaction") transaction.onerror?.(new Event("error"));
            else if (this.failure === "abort") transaction.onabort?.(new Event("abort"));
            else transaction.oncomplete?.(new Event("complete"));
          });
        });
      }
    });
    return request;
  }
}
