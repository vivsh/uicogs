import type { PersistenceBackend } from "@uicogs/core";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface WebStorageOptions {
  readonly namespace: string;
  readonly storage?: StorageLike;
}

export interface IndexedDbStorageOptions {
  readonly database: string;
  readonly store: string;
  readonly namespace: string;
  readonly version?: number;
  readonly indexedDB?: IDBFactory;
}

export function local(options: WebStorageOptions): PersistenceBackend {
  return webStorage(options, () => {
    if (typeof globalThis.localStorage === "undefined")
      throw new Error("localStorage is unavailable in this runtime");
    return globalThis.localStorage;
  });
}

export function session(options: WebStorageOptions): PersistenceBackend {
  return webStorage(options, () => {
    if (typeof globalThis.sessionStorage === "undefined")
      throw new Error("sessionStorage is unavailable in this runtime");
    return globalThis.sessionStorage;
  });
}

export function indexedDb(options: IndexedDbStorageOptions): PersistenceBackend {
  return Object.freeze({
    async read(key: string) {
      return withStore(options, "readonly", (store) =>
        requestResult(store.get(storageKey(options, key))),
      );
    },
    async write(key: string, value: unknown) {
      await withStore(options, "readwrite", async (store) => {
        await requestResult(store.put(value, storageKey(options, key)));
      });
    },
    async remove(key: string) {
      await withStore(options, "readwrite", async (store) => {
        await requestResult(store.delete(storageKey(options, key)));
      });
    },
  });
}

export const storage = Object.freeze({ local, session, indexedDb });

function webStorage(options: WebStorageOptions, fallback: () => StorageLike): PersistenceBackend {
  const resolve = (): StorageLike => options.storage ?? fallback();
  return Object.freeze({
    async read(key: string) {
      const value = resolve().getItem(storageKey(options, key));
      return value === null ? undefined : (JSON.parse(value) as unknown);
    },
    async write(key: string, value: unknown) {
      const serialized = JSON.stringify(value);
      if (serialized === undefined)
        throw new TypeError("Persistence value is not JSON serializable");
      resolve().setItem(storageKey(options, key), serialized);
    },
    async remove(key: string) {
      resolve().removeItem(storageKey(options, key));
    },
  });
}

function storageKey(options: { readonly namespace: string }, key: string): string {
  return `${options.namespace}/${key}`;
}

async function withStore<T>(
  options: IndexedDbStorageOptions,
  mode: IDBTransactionMode,
  execute: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const database = await openDatabase(options);
  try {
    const transaction = database.transaction(options.store, mode);
    const completion = transactionCompletion(transaction);
    const result = await execute(transaction.objectStore(options.store));
    await completion;
    return result;
  } finally {
    database.close();
  }
}

function openDatabase(options: IndexedDbStorageOptions): Promise<IDBDatabase> {
  const factory = options.indexedDB ?? globalThis.indexedDB;
  if (!factory) return Promise.reject(new Error("IndexedDB is unavailable in this runtime"));
  return new Promise((resolve, reject) => {
    const request =
      options.version === undefined
        ? factory.open(options.database)
        : factory.open(options.database, options.version);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(options.store))
        request.result.createObjectStore(options.store);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    request.onblocked = () => reject(new Error("IndexedDB open was blocked"));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionCompletion(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction was aborted"));
  });
}
