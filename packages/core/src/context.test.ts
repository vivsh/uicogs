import { describe, expect, it } from "vitest";
import { createUiCogs } from "./factory.js";
import { fields } from "./field.js";
import { schema } from "./schema.js";
import { ContextStoreController, type ContextParser } from "./context.js";
import type { DeepReadonly } from "./utils.js";
import type { PersistenceBackend, PersistenceOptions } from "./persistence.js";

interface TestContextAdapter<T> {
  read(): Promise<unknown | undefined>;
  write(value: DeepReadonly<T>): Promise<void>;
  clear(): Promise<void>;
  readonly schema?: ContextParser<T>;
}

describe("runtime context store", () => {
  it("publishes immutable application context through set and update", () => {
    const initial = { locale: "en", preferences: { compact: false } };
    const api = createUiCogs({ context: initial });
    const first = api.context.value;
    let publications = 0;
    const unsubscribe = api.context.subscribe(() => {
      publications += 1;
    });

    expect(first).not.toBe(initial);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.preferences)).toBe(true);
    api.context.update({ locale: "fr" });
    expect(api.context.value).toEqual({ locale: "fr", preferences: { compact: false } });
    expect(first.locale).toBe("en");
    api.context.set({ locale: "de", preferences: { compact: true } });
    expect(api.context.value.preferences.compact).toBe(true);
    expect(publications).toBe(2);

    unsubscribe();
    api.dispose();
  });

  it("hydrates persisted context and optionally parses it through a schema", async () => {
    const PersistedContext = schema({ locale: fields.Str({ required: true }) });
    const writes: unknown[] = [];
    const persistence: TestContextAdapter<{ locale: string }> = {
      schema: PersistedContext,
      read: async () => ({ locale: "fr" }),
      write: async (value) => {
        writes.push(value);
      },
      clear: async () => undefined,
    };
    const api = createUiCogs({
      context: { locale: "en" },
      persistence: testPersistence(persistence),
    });

    expect(api.context.value.locale).toBe("en");
    expect(api.context.persistenceStatus).toBe("loading");
    await eventually(() => api.context.persistenceStatus === "ready");
    expect(api.context.value.locale).toBe("fr");
    api.context.update({ locale: "de" });
    await eventually(() => writes.length === 1);
    expect(writes).toEqual([{ locale: "de" }]);

    await api.context.reset();
    expect(api.context.value.locale).toBe("en");
    api.dispose();
  });

  it("keeps a newer local update when persistence finishes late", async () => {
    let resolveRead: ((value: unknown) => void) | undefined;
    const persistence: TestContextAdapter<{ locale: string }> = {
      read: () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
      write: async () => undefined,
      clear: async () => undefined,
    };
    const api = createUiCogs({
      context: { locale: "en" },
      persistence: testPersistence(persistence),
    });

    await eventually(() => resolveRead !== undefined);
    api.context.update({ locale: "de" });
    resolveRead?.({ locale: "fr" });
    await eventually(() => api.context.persistenceStatus === "ready");
    expect(api.context.value.locale).toBe("de");
    api.dispose();
  });

  it("coalesces queued persistence writes and reports storage failures", async () => {
    const writes: unknown[] = [];
    let releaseFirst: (() => void) | undefined;
    const persistence: TestContextAdapter<{ count: number }> = {
      read: async () => undefined,
      write: (value) => {
        writes.push(value);
        if (writes.length === 1)
          return new Promise<void>((resolve) => {
            releaseFirst = resolve;
          });
        return Promise.reject(new Error("Storage unavailable"));
      },
      clear: async () => undefined,
    };
    const api = createUiCogs({ context: { count: 0 }, persistence: testPersistence(persistence) });
    await eventually(() => api.context.persistenceStatus === "ready");

    api.context.update({ count: 1 });
    api.context.update({ count: 2 });
    api.context.update({ count: 3 });
    expect(writes).toEqual([{ count: 1 }]);
    releaseFirst?.();
    await eventually(() => api.context.persistenceStatus === "error");
    expect(writes).toEqual([{ count: 1 }, { count: 3 }]);
    expect(api.context.persistenceError).toBe("Storage unavailable");
    expect(api.context.value.count).toBe(3);
    api.dispose();
  });

  it("rejects the reserved auth property and disposed updates", () => {
    expect(() => createUiCogs({ context: { auth: "forged" } } as never)).toThrow(
      "reserved auth property",
    );
    const api = createUiCogs({ context: { locale: "en" } });
    api.dispose();
    expect(() => api.context.update({ locale: "fr" })).toThrowError(
      expect.objectContaining({ name: "AbortError" }),
    );
  });

  it("reports invalid persisted values without replacing the initial context", async () => {
    const persistence: TestContextAdapter<{ locale: string }> = {
      read: async () => "invalid",
      write: async () => undefined,
      clear: async () => undefined,
    };
    const api = createUiCogs({
      context: { locale: "en" },
      persistence: testPersistence(persistence),
    });

    await eventually(() => api.context.persistenceStatus === "error");
    expect(api.context.persistenceError).toBe("Persisted context must be an object");
    expect(api.context.value.locale).toBe("en");
    api.dispose();
  });

  it("reports read and clear failures while preserving the in-memory value", async () => {
    let failRead = true;
    const persistence: TestContextAdapter<{ locale: string }> = {
      read: async () => {
        if (failRead) throw "read failed";
        return undefined;
      },
      write: async () => undefined,
      clear: async () => {
        throw new Error("Clear failed");
      },
    };
    const api = createUiCogs({
      context: { locale: "en" },
      persistence: testPersistence(persistence),
    });

    await eventually(() => api.context.persistenceStatus === "error");
    expect(api.context.persistenceError).toBe("Context persistence failed");
    failRead = false;
    api.context.update({ locale: "fr" });
    await eventually(() => api.context.persistenceStatus === "ready");
    await api.context.reset();
    expect(api.context.value.locale).toBe("en");
    expect(api.context.persistenceStatus).toBe("error");
    expect(api.context.persistenceError).toBe("Clear failed");
    api.dispose();
  });

  it("does not publish late persistence work after disposal", async () => {
    let resolveRead: ((value: unknown) => void) | undefined;
    let resolveWrite: (() => void) | undefined;
    const persistence: TestContextAdapter<{ locale: string }> = {
      read: () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
      write: () =>
        new Promise<void>((resolve) => {
          resolveWrite = resolve;
        }),
      clear: async () => undefined,
    };
    const reading = createUiCogs({
      context: { locale: "en" },
      persistence: testPersistence(persistence),
    });
    await eventually(() => resolveRead !== undefined);
    reading.dispose();
    resolveRead?.({ locale: "fr" });
    await Promise.resolve();
    expect(reading.context.value.locale).toBe("en");

    resolveRead = undefined;
    const writing = createUiCogs({
      context: { locale: "en" },
      persistence: testPersistence(persistence),
    });
    await eventually(() => resolveRead !== undefined);
    if (!resolveRead) throw new Error("Read did not start");
    (resolveRead as (value: unknown) => void)(undefined);
    await eventually(() => writing.context.persistenceStatus === "ready");
    writing.context.update({ locale: "fr" });
    await eventually(() => resolveWrite !== undefined);
    const revision = writing.context.getSnapshot().revision;
    writing.dispose();
    resolveWrite?.();
    await Promise.resolve();
    expect(writing.context.getSnapshot().revision).toBe(revision);
  });

  it("covers internal auth composition and non-object update guards", async () => {
    const auth = Object.freeze({ status: "anonymous" });
    const controller = new ContextStoreController(
      { locale: "en", values: [1, { nested: true }] },
      undefined,
      (application, snapshot) => Object.freeze({ ...application, auth: snapshot }),
      auth,
    );

    expect(controller.getSnapshot().value.auth).toBe(auth);
    expect(Object.isFrozen(controller.value.values)).toBe(true);
    controller.setAuthSnapshot(auth);
    const nextAuth = Object.freeze({ status: "authenticated" });
    controller.setAuthSnapshot(nextAuth);
    expect(controller.value.auth).toBe(nextAuth);
    await controller.reset();
    controller.dispose();
    controller.setAuthSnapshot(auth);

    const scalar = new ContextStoreController("en", undefined, (value) => value);
    expect(() => scalar.update({} as never)).toThrow("object context and object patch");
    scalar.dispose();

    const object = new ContextStoreController({ locale: "en" }, undefined, (value) => value);
    expect(() => object.update(null as never)).toThrow("object context and object patch");
    object.dispose();
  });
});

async function eventually(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Condition was not reached");
}

function testPersistence<T>(adapter: TestContextAdapter<T>): PersistenceOptions<T> {
  const backend: PersistenceBackend = {
    read: () => adapter.read(),
    write: (_key, value) => adapter.write(value as DeepReadonly<T>),
    remove: () => adapter.clear(),
  };
  return {
    backend,
    context: adapter.schema ? { schema: adapter.schema } : true,
    cache: false,
  };
}
